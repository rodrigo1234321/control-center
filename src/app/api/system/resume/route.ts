import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST() {
  try {
    // Reanudar tareas pausadas
    const resumedTasks = await prisma.task.updateMany({
      where: { state: 'PAUSED' },
      data: { state: 'BACKLOG' },
    });

    await prisma.activityLog.create({
      data: {
        agent: 'SYSTEM',
        action: 'SYSTEM_RESUMED',
        details: `Reanudación del sistema. ${resumedTasks.count} tareas reingresadas al backlog.`,
      },
    });

    return NextResponse.json({
      ok: true,
      status: 'SYSTEM_ACTIVE',
      message: `Sistema reanudado. ${resumedTasks.count} tareas devueltas al backlog.`,
      resumedTasks: resumedTasks.count,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
