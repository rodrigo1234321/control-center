import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@/generated/prisma/client';

/** GET /api/approvals — List pending approvals */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');

    const where: Prisma.ApprovalWhereInput = { status: 'PENDING' };
    if (projectId) where.task = { projectId };

    const approvals = await prisma.approval.findMany({
      where,
      include: {
        task: {
          include: {
            project: { select: { name: true, slug: true } },
          },
        },
      },
      orderBy: { requestedAt: 'desc' },
    });

    return NextResponse.json(approvals);
  } catch (error) {
    console.error('[GET /api/approvals]', error);
    return NextResponse.json({ error: 'Failed to fetch approvals' }, { status: 500 });
  }
}
