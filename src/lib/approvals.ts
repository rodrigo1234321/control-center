import { prisma } from '@/lib/prisma';
import { APPROVAL_STATUSES, type ApprovalStatus, type DbClient, type TaskState } from '@/lib/types';
import { transitionTask } from '@/lib/transition';
import { processHandoffs } from '@/lib/handoff';

/**
 * Resolve a pending approval (APPROVED / REJECTED) applying the same
 * state-machine mapping used by PATCH /api/approvals/[id]:
 * REVIEW → DONE/FAILED · FAILED|BLOCKED → BACKLOG/FAILED · else → DONE/FAILED.
 * Shared by the HTTP API and the MCP server so both behave identically.
 */
export async function resolveApproval(
  id: string,
  status: ApprovalStatus,
  resolvedNote?: string,
  client: DbClient = prisma
) {
  if (!status || !APPROVAL_STATUSES.includes(status)) {
    throw new Error(`status must be one of: ${APPROVAL_STATUSES.join(', ')}`);
  }

  if (status === 'PENDING') {
    throw new Error('Cannot set status back to PENDING');
  }

  const existing = await client.approval.findUnique({
    where: { id },
    include: { task: true },
  });

  if (!existing) throw new Error('Approval not found');
  if (!existing.task) throw new Error('Associated task not found');
  if (existing.status !== 'PENDING') throw new Error('Approval already resolved');

  const isApproved = status === 'APPROVED';
  const currentTaskState = existing.task.state as TaskState;

  let newTaskState: TaskState;
  if (currentTaskState === 'REVIEW') {
    newTaskState = isApproved ? 'DONE' : 'FAILED';
  } else if (currentTaskState === 'FAILED' || currentTaskState === 'BLOCKED') {
    newTaskState = isApproved ? 'BACKLOG' : 'FAILED';
  } else {
    newTaskState = isApproved ? 'DONE' : 'FAILED';
  }

  const resultNote = isApproved ? undefined : resolvedNote || 'Rejected by Human';

  const approval = await client.$transaction(async (tx) => {
    const updatedApproval = await tx.approval.update({
      where: { id },
      data: {
        status,
        resolvedNote,
        resolvedAt: new Date(),
      },
    });

    await tx.activityLog.create({
      data: {
        taskId: existing.taskId,
        agent: 'Human',
        action: `${isApproved ? 'Approved' : 'Rejected'}: ${existing.task.title}${resolvedNote ? ` — ${resolvedNote}` : ''}`,
      },
    });

    if (isApproved && (currentTaskState === 'FAILED' || currentTaskState === 'BLOCKED')) {
      await tx.task.update({
        where: { id: existing.taskId },
        data: {
          retryCount: 0,
          handedOff: false,
        },
      });
    }

    if (currentTaskState === newTaskState) {
      await tx.task.update({
        where: { id: existing.taskId },
        data: { handedOff: true },
      });
      if (existing.task.goalId) {
        await processHandoffs(existing.taskId, tx);
      }
    } else {
      await transitionTask(existing.taskId, newTaskState, resultNote, tx);
    }

    return updatedApproval;
  });

  return { approval, action: isApproved ? 'APPROVED' : 'REJECTED' };
}