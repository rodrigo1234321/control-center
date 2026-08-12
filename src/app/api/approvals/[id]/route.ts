import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { APPROVAL_STATUSES, type ApprovalStatus, type TaskState } from '@/lib/types';
import { transitionTask } from '@/lib/transition';

/** PATCH /api/approvals/:id — Approve or reject */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status, resolvedNote } = body;

    if (!status || !APPROVAL_STATUSES.includes(status as ApprovalStatus)) {
      return NextResponse.json(
        { error: `status must be one of: ${APPROVAL_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }

    if (status === 'PENDING') {
      return NextResponse.json(
        { error: 'Cannot set status back to PENDING' },
        { status: 422 }
      );
    }

    const existing = await prisma.approval.findUnique({
      where: { id },
      include: { task: true },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Approval not found' }, { status: 404 });
    }

    if (!existing.task) {
      return NextResponse.json({ error: 'Associated task not found' }, { status: 404 });
    }

    if (existing.status !== 'PENDING') {
      return NextResponse.json(
        { error: 'Approval already resolved' },
        { status: 409 }
      );
    }

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

    const approval = await prisma.$transaction(async (tx) => {
      // 1. Update approval status
      const updatedApproval = await tx.approval.update({
        where: { id },
        data: {
          status,
          resolvedNote,
          resolvedAt: new Date(),
        },
      });

      // 2. Log activity for Human approval/rejection
      await tx.activityLog.create({
        data: {
          taskId: existing.taskId,
          agent: 'Human',
          action: `${isApproved ? 'Approved' : 'Rejected'}: ${existing.task.title}${resolvedNote ? ` — ${resolvedNote}` : ''}`,
        },
      });

      // 3. If approving a FAILED or BLOCKED task back to BACKLOG: reset retryCount: 0 and handedOff: false on the task
      if (isApproved && (currentTaskState === 'FAILED' || currentTaskState === 'BLOCKED')) {
        await tx.task.update({
          where: { id: existing.taskId },
          data: {
            retryCount: 0,
            handedOff: false,
          },
        });
      }

      // 4. Call transitionTask if state changes or is valid transition
      if (currentTaskState === newTaskState) {
        // If currentState === newTaskState e.g. rejecting FAILED task, skip transitionTask call
        // to avoid "Invalid transition: FAILED → FAILED" exception, but set handedOff: true on the task
        // so handoff engine does not loop
        await tx.task.update({
          where: { id: existing.taskId },
          data: { handedOff: true },
        });
      } else {
        await transitionTask(existing.taskId, newTaskState, resultNote, tx);
      }

      return updatedApproval;
    });

    return NextResponse.json(approval);
  } catch (error) {
    console.error('[PATCH /api/approvals/:id]', error);
    return NextResponse.json({ error: 'Failed to resolve approval' }, { status: 500 });
  }
}
