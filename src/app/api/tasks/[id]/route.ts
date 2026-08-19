import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { TASK_STATES, type TaskState } from '@/lib/types';
import { transitionTask } from '@/lib/transition';

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

    if (state !== undefined && !TASK_STATES.includes(state)) {
      return NextResponse.json(
        { error: `Invalid task state '${state}'. Valid states are: ${TASK_STATES.join(', ')}` },
        { status: 400 }
      );
    }

    const updated = await transitionTask(id, state as TaskState, result);

    return NextResponse.json(updated);
  } catch (error) {
    console.error('[PATCH /api/tasks/:id]', error);
    const message = error instanceof Error ? error.message : 'Failed to update task';
    if (message.includes('Invalid transition') || message.includes('not found')) {
      return NextResponse.json({ error: message }, { status: 422 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
