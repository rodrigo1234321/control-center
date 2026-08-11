import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/** GET /api/approvals — List pending approvals */
export async function GET() {
  try {
    const approvals = await prisma.approval.findMany({
      where: { status: 'PENDING' },
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
