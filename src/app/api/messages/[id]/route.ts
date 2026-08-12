import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status } = body;

    if (!status || !['UNREAD', 'READ', 'RESOLVED'].includes(status)) {
      return NextResponse.json(
        { error: 'status must be one of: UNREAD, READ, RESOLVED' },
        { status: 400 }
      );
    }

    const message = await prisma.agentMessage.update({
      where: { id },
      data: {
        status,
        readAt: status !== 'UNREAD' ? new Date() : null,
      },
    });

    return NextResponse.json(message);
  } catch (error) {
    console.error('[PATCH /api/messages/:id]', error);
    return NextResponse.json({ error: 'Failed to update message' }, { status: 500 });
  }
}
