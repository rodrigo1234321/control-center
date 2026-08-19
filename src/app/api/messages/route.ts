import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { MESSAGE_TYPES } from '@/lib/types';
import type { Prisma } from '@/generated/prisma/client';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const toAgent = searchParams.get('toAgent');
    const goalId = searchParams.get('goalId');
    const status = searchParams.get('status');
    const projectId = searchParams.get('projectId');

    const where: Prisma.AgentMessageWhereInput = {};
    if (toAgent) where.toAgent = toAgent;
    if (goalId) where.goalId = goalId;
    if (status) where.status = status;
    if (projectId) where.goal = { projectId };

    const messages = await prisma.agentMessage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        goal: { select: { title: true } },
        task: { select: { title: true, state: true } },
      }
    });

    return NextResponse.json(messages);
  } catch (error) {
    console.error('Failed to fetch messages:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to fetch messages' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { fromAgent, toAgent, goalId, taskId, type, content } = body;

    if (!fromAgent || !toAgent || !type || !content) {
      return NextResponse.json(
        { error: 'fromAgent, toAgent, type, and content are required' }, 
        { status: 400 }
      );
    }

    if (!MESSAGE_TYPES.includes(type)) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: ${MESSAGE_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    const message = await prisma.agentMessage.create({
      data: {
        fromAgent,
        toAgent,
        goalId,
        taskId,
        type,
        content,
        status: 'UNREAD',
      },
    });

    return NextResponse.json(message, { status: 201 });
  } catch (error) {
    console.error('Failed to create message:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to create message' }, { status: 500 });
  }
}
