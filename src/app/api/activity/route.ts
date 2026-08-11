import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/** GET /api/activity — Get recent activity log entries */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const entries = await prisma.activityLog.findMany({
      take: Math.min(limit, 200),
      orderBy: { timestamp: 'desc' },
    });

    return NextResponse.json(entries);
  } catch (error) {
    console.error('[GET /api/activity]', error);
    return NextResponse.json({ error: 'Failed to fetch activity' }, { status: 500 });
  }
}

/** POST /api/activity — Log an agent action */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { agent, action, taskId, details } = body;

    if (!agent || !action) {
      return NextResponse.json(
        { error: 'agent and action are required' },
        { status: 400 }
      );
    }

    const entry = await prisma.activityLog.create({
      data: { agent, action, taskId, details },
    });

    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    console.error('[POST /api/activity]', error);
    return NextResponse.json({ error: 'Failed to log activity' }, { status: 500 });
  }
}
