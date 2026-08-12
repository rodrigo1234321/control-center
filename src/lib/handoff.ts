import { prisma } from '@/lib/prisma';

const MAX_RETRIES = 3;

export async function processHandoffs(specificTaskId?: string, client: any = prisma) {
  // If specificTaskId is provided, only process that task, otherwise process all unhanded-off tasks.
  const baseWhere = { handedOff: false };
  const doneWhere = specificTaskId ? { ...baseWhere, id: specificTaskId, state: 'DONE' } : { ...baseWhere, state: 'DONE' };
  
  // 1. Process DONE tasks
  const tasksToHandoff = await client.task.findMany({
    where: {
      ...doneWhere,
      nextAgent: { not: null },
    },
  });

  for (const task of tasksToHandoff) {
    if (!task.nextAgent) continue;

    console.log(`[Handoff] Handoff from ${task.agent} to ${task.nextAgent} (Task ID: ${task.id})`);

    // Check if there is already a pre-planned task in BACKLOG for this goal and nextAgent
    let nextTask = await client.task.findFirst({
      where: {
        goalId: task.goalId,
        agent: task.nextAgent,
        state: 'BACKLOG'
      },
      orderBy: { createdAt: 'asc' }
    });

    if (!nextTask) {
      nextTask = await client.task.create({
        data: {
          projectId: task.projectId,
          goalId: task.goalId,
          title: `[Handoff from ${task.agent}] ${task.title}`,
          description: task.result ? `Previous context / result:\n${task.result}` : undefined,
          agent: task.nextAgent,
          state: 'BACKLOG',
        },
      });
    }

    await client.agentMessage.create({
      data: {
        fromAgent: task.agent,
        toAgent: task.nextAgent,
        goalId: task.goalId,
        taskId: nextTask.id,
        type: 'HANDOFF',
        content: `ACTION REQUIRED: You have been assigned Task ${nextTask.id} ("${nextTask.title}").\n\nContext: I have just completed Task ${task.id} ("${task.title}").\n\nPrevious Result:\n${task.result || 'No result provided.'}`,
      },
    });

    await client.task.update({
      where: { id: task.id },
      data: { handedOff: true },
    });

    await client.activityLog.create({
      data: {
        taskId: task.id,
        agent: 'System',
        action: `Handed off task to ${task.nextAgent} -> Handed off to Task ${nextTask.id} and Message`,
      },
    });
  }

  // 2. Process FAILED tasks
  const failedWhere = specificTaskId ? { ...baseWhere, id: specificTaskId, state: 'FAILED' } : { ...baseWhere, state: 'FAILED' };
  const failedTasks = await client.task.findMany({
    where: {
      ...failedWhere,
      onFailureAgent: { not: null },
    },
  });

  for (const task of failedTasks) {
    if (!task.onFailureAgent) continue;

    if (task.retryCount < MAX_RETRIES) {
      console.log(`[Handoff] Failure fix from ${task.agent} to ${task.onFailureAgent} (Task ID: ${task.id}, Retry: ${task.retryCount + 1})`);

      const newTask = await client.task.create({
        data: {
          projectId: task.projectId,
          goalId: task.goalId,
          title: `[FIX] ${task.title}`,
          description: task.result ? `Error context:\n${task.result}` : undefined,
          agent: task.onFailureAgent,
          state: 'BACKLOG',
          retryCount: task.retryCount + 1,
          nextAgent: task.agent,
        },
      });

      await client.agentMessage.create({
        data: {
          fromAgent: task.agent,
          toAgent: task.onFailureAgent,
          goalId: task.goalId,
          taskId: newTask.id,
          type: 'FIX_REQUEST',
          content: `URGENT FIX REQUIRED: You have been assigned Task ${newTask.id} ("${newTask.title}") to fix a failure.\n\nContext: Task ${task.id} ("${task.title}") has failed.\n\nError Log / Output:\n${task.result || 'Unknown error.'}`,
        },
      });

      await client.task.update({
        where: { id: task.id },
        data: { handedOff: true },
      });

      await client.activityLog.create({
        data: {
          taskId: task.id,
          agent: 'System',
          action: `Auto-fix assigned to ${task.onFailureAgent} -> Created Task ${newTask.id} (Retry ${task.retryCount + 1}/${MAX_RETRIES})`,
        },
      });
    } else {
      console.log(`[Handoff] Max retries reached for Task ID: ${task.id}. Requesting human approval.`);
      
      await client.approval.create({
        data: {
          taskId: task.id,
          actionType: 'CLIENT_ACTION',
          description: `Max retries (${MAX_RETRIES}) reached for: ${task.title}. Intervention required.`,
        },
      });

      await client.agentMessage.create({
        data: {
          fromAgent: 'System',
          toAgent: task.agent,
          goalId: task.goalId,
          taskId: task.id,
          type: 'ERROR',
          content: `Max retries reached for task. Waiting for human intervention.`,
        },
      });

      await client.task.update({
        where: { id: task.id },
        data: { handedOff: true },
      });

      await client.activityLog.create({
        data: {
          taskId: task.id,
          agent: 'System',
          action: `Max retries reached. Created manual approval requirement for Task ${task.id}`,
        },
      });
    }
  }

  // 3. Process Goal completion
  const activeGoals = await client.goal.findMany({
    where: { status: 'ACTIVE' },
    include: { tasks: true },
  });

  for (const goal of activeGoals) {
    if (goal.tasks.length === 0) continue;

    const activeOrPendingTasks = goal.tasks.filter((t: any) => 
      ['BACKLOG', 'RUNNING', 'REVIEW', 'PAUSED', 'BLOCKED'].includes(t.state)
    );
    const pendingHandoffs = goal.tasks.filter((t: any) => 
      (t.state === 'DONE' && t.nextAgent && !t.handedOff) || 
      (t.state === 'FAILED' && t.onFailureAgent && !t.handedOff)
    );
    
    const hasTerminalFailures = goal.tasks.some((t: any) => 
      t.state === 'FAILED' && (!t.onFailureAgent || (t.handedOff && t.retryCount >= MAX_RETRIES))
    );

    if (activeOrPendingTasks.length === 0 && pendingHandoffs.length === 0 && !hasTerminalFailures) {
      console.log(`[Handoff] Goal completed: ${goal.title} (Goal ID: ${goal.id})`);
      
      await client.goal.update({
        where: { id: goal.id },
        data: { status: 'COMPLETED' },
      });

      await client.activityLog.create({
        data: {
          agent: 'System',
          action: `Goal COMPLETED: ${goal.title}`,
        },
      });
    }
  }
}
