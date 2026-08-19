import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { TASK_STATES, type TaskState } from '@/lib/types';

import { CreateTaskSchema } from '@/lib/schemas';

/** GET /api/tasks — List tasks with optional filters */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const state = searchParams.get('state');
    const projectId = searchParams.get('projectId');
    const agent = searchParams.get('agent');

    const where: Record<string, unknown> = {};
    if (state && TASK_STATES.includes(state as TaskState)) where.state = state;
    if (projectId) where.projectId = projectId;
    if (agent) where.agent = agent;

    const tasks = await prisma.task.findMany({
      where,
      include: {
        project: { select: { name: true, slug: true } },
        _count: { select: { approvals: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(tasks);
  } catch (error) {
    console.error('[GET /api/tasks]', error);
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
  }
}

/** POST /api/tasks — Create a new task */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = CreateTaskSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validación fallida', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { title, description, projectId, goalId, agent, state, requiresApproval, nextAgent, onFailureAgent } = parsed.data;
    const notify = body.notify ?? false;

    const task = await prisma.task.create({
      data: {
        title,
        description,
        projectId,
        goalId,
        agent,
        state: state ?? 'BACKLOG',
        requiresApproval: requiresApproval ?? false,
        nextAgent,
        onFailureAgent,
      },
      include: {
        project: { select: { name: true, slug: true } },
      },
    });

    // Log the creation
    await prisma.activityLog.create({
      data: {
        taskId: task.id,
        agent,
        action: `Created task: ${title}`,
      },
    });

    // If notify is set, dispatch a REQUEST message so the agent's worker picks it up
    if (notify) {
      await prisma.agentMessage.create({
        data: {
          taskId: task.id,
          fromAgent: 'USER',
          toAgent: agent,
          type: 'REQUEST',
          content: `ACTION REQUIRED: You have been assigned Task ${task.id} ("${title}").\n\nDescription: ${description || 'No description provided.'}\n\nPlease pick up this task and execute it.`,
        },
      });
    }

    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    console.error('[POST /api/tasks]', error);
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
  }
}
