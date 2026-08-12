import { prisma } from '@/lib/prisma';
import { TASK_STATES, isValidTransition, type TaskState } from '@/lib/types';
import { processHandoffs } from './handoff';

export async function transitionTask(
  id: string, 
  state?: TaskState, 
  result?: string,
  client: any = prisma
) {
  const existing = await client.task.findUnique({ where: { id } });
  if (!existing) {
    throw new Error('Task not found');
  }

  const updateData: Record<string, unknown> = {};
  if (result !== undefined) updateData.result = result;

  let finalState = state;

  if (state && TASK_STATES.includes(state)) {
    if (!isValidTransition(existing.state as TaskState, state)) {
      throw new Error(`Invalid transition: ${existing.state} → ${state}`);
    }

    if (state === 'DONE' && existing.requiresApproval && existing.state !== 'REVIEW') {
      finalState = 'REVIEW';

      await client.approval.create({
        data: {
          taskId: id,
          actionType: 'DEPLOY',
          description: `Approval required for: ${existing.title}`,
        },
      });

      await client.activityLog.create({
        data: {
          taskId: id,
          agent: existing.agent,
          action: `Task moved to REVIEW (approval required): ${existing.title}`,
        },
      });
    } else {
      finalState = state;
      if (state === 'DONE' || state === 'FAILED') {
        updateData.finishedAt = new Date();
      }
    }
    updateData.state = finalState;
  }

  const updated = await client.task.update({
    where: { id },
    data: updateData,
    include: {
      project: { select: { name: true, slug: true } },
      approvals: true,
    },
  });

  if (finalState && existing.state !== finalState) {
    await client.activityLog.create({
      data: {
        taskId: id,
        agent: existing.agent,
        action: `Task ${existing.title}: ${existing.state} → ${finalState}`,
      },
    });

    // Automatically process handoffs immediately if it reached a terminal state
    if (finalState === 'DONE' || finalState === 'FAILED') {
      await processHandoffs(id, client);
    }
  }

  return updated;
}
