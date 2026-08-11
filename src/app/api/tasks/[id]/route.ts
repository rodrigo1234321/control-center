import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { TASK_STATES, isValidTransition, type TaskState } from '@/lib/types';

/** GET /api/tasks/:id — Get task detail */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const task = await prisma.task.findUnique({
      where: { id },
      include: {
        project: true,
        approvals: { orderBy: { requestedAt: 'desc' } },
      },
    });

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json(task);
  } catch (error) {
    console.error('[GET /api/tasks/:id]', error);
    return NextResponse.json({ error: 'Failed to fetch task' }, { status: 500 });
  }
}

/** PATCH /api/tasks/:id — Update task state/result */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { state, result } = body;

    const existing = await prisma.task.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (result !== undefined) updateData.result = result;

    if (state && TASK_STATES.includes(state as TaskState)) {
      // Validate transition
      if (!isValidTransition(existing.state as TaskState, state as TaskState)) {
        return NextResponse.json(
          { error: `Invalid transition: ${existing.state} → ${state}` },
          { status: 422 }
        );
      }

      // If task requires approval and is being marked DONE, redirect to REVIEW
      if (state === 'DONE' && existing.requiresApproval && existing.state !== 'REVIEW') {
        updateData.state = 'REVIEW';

        // Auto-create an approval
        await prisma.approval.create({
          data: {
            taskId: id,
            actionType: 'DEPLOY',
            description: `Approval required for: ${existing.title}`,
          },
        });

        await prisma.activityLog.create({
          data: {
            taskId: id,
            agent: existing.agent,
            action: `Task moved to REVIEW (approval required): ${existing.title}`,
          },
        });
      } else {
        updateData.state = state;
        if (state === 'DONE' || state === 'FAILED') {
          updateData.finishedAt = new Date();
        }
      }
    }

    const updated = await prisma.task.update({
      where: { id },
      data: updateData,
      include: {
        project: { select: { name: true, slug: true } },
        approvals: true,
      },
    });

    // Log the state change
    if (state) {
      await prisma.activityLog.create({
        data: {
          taskId: id,
          agent: existing.agent,
          action: `Task ${existing.title}: ${existing.state} → ${updateData.state || state}`,
        },
      });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('[PATCH /api/tasks/:id]', error);
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
  }
}
