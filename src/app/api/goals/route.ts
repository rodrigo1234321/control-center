import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    
    const where = projectId ? { projectId } : {};

    const goals = await prisma.goal.findMany({
      where,
      include: {
        project: true,
        tasks: {
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });
    
    // Calculate progress for each goal
    const goalsWithProgress = goals.map((goal) => {
      const totalTasks = goal.tasks.length;
      const completedTasks = goal.tasks.filter(t => t.state === 'DONE').length;
      const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
      
      return {
        ...goal,
        progress,
      };
    });
    
    return NextResponse.json(goalsWithProgress);
  } catch (error) {
    console.error('Failed to fetch goals:', error);
    return NextResponse.json({ error: 'Failed to fetch goals' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, description, projectId, agent } = body;

    if (!title || !projectId) {
      return NextResponse.json({ error: 'Title and projectId are required' }, { status: 400 });
    }

    const goal = await prisma.goal.create({
      data: {
        title,
        description,
        projectId,
        status: 'ACTIVE',
      },
    });

    await prisma.activityLog.create({
      data: {
        agent: 'System',
        action: `Goal created: ${title}`,
      },
    });

    // If an agent is specified, create an initial planning task for them
    if (agent) {
      const task = await prisma.task.create({
        data: {
          title: `Planning: ${title}`,
          description: `Automatically created planning task for goal: ${title}`,
          projectId,
          goalId: goal.id,
          agent,
          state: 'BACKLOG',
        },
      });

      // Also create a REQUEST message
      await prisma.agentMessage.create({
        data: {
          goalId: goal.id,
          taskId: task.id,
          fromAgent: 'USER',
          toAgent: agent,
          type: 'REQUEST',
          content: `ACTION REQUIRED: You have been assigned Task ${task.id} ("${task.title}").\n\nGoal: ${title}\nDescription: ${description || 'No description provided.'}\n\nPlease decompose this goal into a sequence of executable tasks.`,
        },
      });
    }

    return NextResponse.json(goal, { status: 201 });
  } catch (error: any) {
    console.error('Failed to create goal:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
