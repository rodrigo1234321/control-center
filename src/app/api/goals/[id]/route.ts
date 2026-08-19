import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@/generated/prisma/client';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: goalId } = await params;
    const goal = await prisma.goal.findUnique({
      where: { id: goalId },
      include: {
        project: true,
        tasks: {
          orderBy: { createdAt: 'asc' },
          include: {
            approvals: true,
          }
        },
        agentMessages: {
          orderBy: { createdAt: 'asc' },
        }
      },
    });

    if (!goal) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }

    // Calculate advanced progress metrics
    const totalTasks = goal.tasks.length;
    const completedTasks = goal.tasks.filter(t => t.state === 'DONE').length;
    const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    
    const blockedTasks = goal.tasks.filter(t => t.state === 'BLOCKED').length;
    const failedTasks = goal.tasks.filter(t => t.state === 'FAILED').length;
    const pendingApprovals = goal.tasks.flatMap(t => t.approvals).filter(a => a.status === 'PENDING').length;
    const activeTask = goal.tasks.find(t => t.state === 'RUNNING');

    const result = {
      ...goal,
      progress,
      metrics: {
        totalTasks,
        completedTasks,
        blockedTasks,
        failedTasks,
        pendingApprovals,
      },
      currentAgent: activeTask ? activeTask.agent : null,
      currentTaskTitle: activeTask ? activeTask.title : null,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to fetch goal:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to fetch goal' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: goalId } = await params;
    const body = await req.json();
    
    const VALID_GOAL_STATUSES = ['ACTIVE', 'COMPLETED', 'FAILED'] as const;
    if (body.status && !VALID_GOAL_STATUSES.includes(body.status)) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_GOAL_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }

    // Allow updating status, title, description
    const updateData: Prisma.GoalUpdateInput = {};
    if (body.status) updateData.status = body.status;
    if (body.title) updateData.title = body.title;
    if (body.description) updateData.description = body.description;

    const goal = await prisma.goal.update({
      where: { id: goalId },
      data: updateData,
    });

    return NextResponse.json(goal);
  } catch (error) {
    console.error('Failed to update goal:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update goal' }, { status: 500 });
  }
}
