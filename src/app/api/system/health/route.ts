import { NextResponse } from 'next/server';
import os from 'node:os';
import { prisma } from '@/lib/prisma';
import { quotaGuard } from '@/workers/quota-guard';

export async function GET() {
  try {
    const workers = await prisma.workerStatus.findMany();
    const activeGoals = await prisma.goal.count({ where: { status: 'ACTIVE' } });
    const runningTasks = await prisma.task.count({ where: { state: 'RUNNING' } });
    const pendingApprovals = await prisma.approval.count({ where: { status: 'PENDING' } });
    const openCircuits = await prisma.task.count({ where: { circuitOpenedAt: { not: null } } });

    const now = Date.now();
    const workerSummary = workers.map((w) => {
      const isAlive = now - new Date(w.lastSeenAt).getTime() < 30_000;
      return {
        agent: w.agent,
        status: isAlive ? w.status : 'OFFLINE',
        lastSeenAt: w.lastSeenAt,
      };
    });

    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      system: {
        controlCenter: 'ONLINE',
        nodeVersion: process.version,
        platform: process.platform,
        freeMemMB: Math.round(os.freemem() / (1024 * 1024)),
      },
      stats: {
        activeGoals,
        runningTasks,
        pendingApprovals,
        openCircuits,
      },
      quota: quotaGuard.metrics,
      workers: workerSummary,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
