import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { APPROVAL_STATUSES, type ApprovalStatus } from '@/lib/types';

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

    if (existing.status !== 'PENDING') {
      return NextResponse.json(
        { error: 'Approval already resolved' },
        { status: 409 }
      );
    }

    // Update approval
    const approval = await prisma.approval.update({
      where: { id },
      data: {
        status,
        resolvedNote,
        resolvedAt: new Date(),
      },
    });

    // Update the associated task
    const newTaskState = status === 'APPROVED' ? 'DONE' : 'FAILED';
    await prisma.task.update({
      where: { id: existing.taskId },
      data: {
        state: newTaskState,
        finishedAt: new Date(),
      },
    });

    // Log the action
    await prisma.activityLog.create({
      data: {
        taskId: existing.taskId,
        agent: 'Human',
        action: `${status === 'APPROVED' ? 'Approved' : 'Rejected'}: ${existing.task.title}${resolvedNote ? ` — ${resolvedNote}` : ''}`,
      },
    });

    return NextResponse.json(approval);
  } catch (error) {
    console.error('[PATCH /api/approvals/:id]', error);
    return NextResponse.json({ error: 'Failed to resolve approval' }, { status: 500 });
  }
}
