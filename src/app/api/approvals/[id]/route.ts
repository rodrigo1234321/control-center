import { NextRequest, NextResponse } from 'next/server';
import { resolveApproval } from '@/lib/approvals';
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

    const { approval } = await resolveApproval(id, status as ApprovalStatus, resolvedNote);
    return NextResponse.json(approval);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to resolve approval';
    const status =
      message === 'Approval not found' || message === 'Associated task not found'
        ? 404
        : message === 'Approval already resolved'
          ? 409
          : message === 'Cannot set status back to PENDING'
            ? 422
            : 500;
    return NextResponse.json({ error: message }, { status });
  }
}