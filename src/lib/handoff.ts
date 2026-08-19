import { prisma } from '@/lib/prisma';
import type { DbClient } from '@/lib/types';
import { RetryPolicy } from '@/workers/policies/retry-policy';

const MAX_RETRIES = 3;

export async function processHandoffs(specificTaskId?: string, client: DbClient = prisma) {
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
    } else if (task.result) {
      // F4: Enriquecer la tarea pre-planeada con el resultado del predecesor
      // para que el agente tenga contexto aun si no lee los mensajes.
      await client.task.update({
        where: { id: nextTask.id },
        data: {
          description: nextTask.description
            ? `${nextTask.description}\n\n---\nPrevious agent result:\n${task.result}`
            : `Previous context / result:\n${task.result}`,
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

  // 2. Process FAILED tasks (con gobierno estricto de RetryPolicy y FailureClassifier)
  const failedWhere = specificTaskId ? { ...baseWhere, id: specificTaskId, state: 'FAILED' } : { ...baseWhere, state: 'FAILED' };
  const failedTasks = await client.task.findMany({
    where: {
      ...failedWhere,
      onFailureAgent: { not: null },
    },
  });

  for (const task of failedTasks) {
    if (!task.onFailureAgent) continue;

    // Evaluar con RetryPolicy antes de cualquier reintento automático
    const decision = RetryPolicy.evaluate(task.result, task.retryCount);

    if (decision.shouldRetry) {
      console.log(`[Handoff] Failure fix from ${task.agent} to ${task.onFailureAgent} (Task ID: ${task.id}, Retry: ${task.retryCount + 1}): ${decision.description}`);

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
          action: `Auto-fix assigned to ${task.onFailureAgent} -> Created Task ${newTask.id} (${decision.description})`,
        },
      });
    } else {
      console.log(`[Handoff] Retry blocked by policy for Task ID: ${task.id} (${decision.classification.category}): ${decision.description}`);

      if (decision.openCircuit) {
        await client.task.update({
          where: { id: task.id },
          data: {
            circuitOpenedAt: new Date(),
            lastError: decision.description,
          },
        });
      }

      await client.approval.create({
        data: {
          taskId: task.id,
          actionType: 'CLIENT_ACTION',
          description: `Bloqueo de reintento (${decision.classification.category}): ${decision.description}`,
        },
      });

      await client.agentMessage.create({
        data: {
          fromAgent: 'System',
          toAgent: task.agent,
          goalId: task.goalId,
          taskId: task.id,
          type: 'ERROR',
          content: `Reintentos detenidos (${decision.classification.category}): ${decision.description}. Esperando intervención humana.`,
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
          action: `Retry blocked (${decision.classification.category}). Created approval for Task ${task.id}`,
        },
      });
    }
  }

  // 2b. Process FAILED tasks SIN onFailureAgent
  const deadEndWhere = specificTaskId
    ? { ...baseWhere, id: specificTaskId, state: 'FAILED' as const }
    : { ...baseWhere, state: 'FAILED' as const };
  const deadEndTasks = await client.task.findMany({
    where: { ...deadEndWhere, onFailureAgent: null },
  });

  for (const task of deadEndTasks) {
    console.log(`[Handoff] Task ${task.id} failed with no onFailureAgent — requesting human approval directly.`);

    await client.approval.create({
      data: {
        taskId: task.id,
        actionType: 'CLIENT_ACTION',
        description: `Task failed with no recovery agent configured: ${task.title}.`,
      },
    });

    await client.agentMessage.create({
      data: {
        fromAgent: 'System',
        toAgent: task.agent,
        goalId: task.goalId,
        taskId: task.id,
        type: 'ERROR',
        content: `Task failed and has no onFailureAgent configured. Waiting for human intervention.\n\nError:\n${task.result || 'Unknown error.'}`,
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
        action: `No recovery agent configured. Created manual approval requirement for Task ${task.id}`,
      },
    });
  }

  // 3. Process Goal completion
  const activeGoals = await client.goal.findMany({
    where: { status: 'ACTIVE' },
    include: { tasks: true },
  });

  for (const goal of activeGoals) {
    if (goal.tasks.length === 0) continue;

    const activeOrPendingTasks = goal.tasks.filter((t) => 
      ['BACKLOG', 'RUNNING', 'REVIEW', 'PAUSED', 'BLOCKED'].includes(t.state)
    );
    const pendingHandoffs = goal.tasks.filter((t) => 
      (t.state === 'DONE' && t.nextAgent && !t.handedOff) || 
      (t.state === 'FAILED' && t.onFailureAgent && !t.handedOff)
    );
    
    const hasTerminalFailures = goal.tasks.some((t) => 
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

    // F2: Si todas las tareas terminaron y solo quedan terminal failures (ya escaladas),
    // el goal no debe quedarse ACTIVE para siempre — marcarlo FAILED.
    const allTerminalFailuresHandedOff = hasTerminalFailures && goal.tasks
      .filter((t) => t.state === 'FAILED' && (!t.onFailureAgent || (t.handedOff && t.retryCount >= MAX_RETRIES)))
      .every((t) => t.handedOff);
    
    if (
      activeOrPendingTasks.length === 0 &&
      pendingHandoffs.length === 0 &&
      hasTerminalFailures &&
      allTerminalFailuresHandedOff
    ) {
      // Check if there are any PENDING approvals for this goal's tasks — if so, wait for human.
      const pendingGoalApprovals = await client.approval.findFirst({
        where: {
          status: 'PENDING',
          taskId: { in: goal.tasks.map((t) => t.id) },
        },
      });

      if (!pendingGoalApprovals) {
        console.log(`[Handoff] Goal FAILED (unrecoverable terminal failures): ${goal.title} (Goal ID: ${goal.id})`);

        await client.goal.update({
          where: { id: goal.id },
          data: { status: 'FAILED' },
        });

        await client.activityLog.create({
          data: {
            agent: 'System',
            action: `Goal FAILED (terminal failures, no pending approvals): ${goal.title}`,
          },
        });
      }
    }
  }
}
