import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST() {
  try {
    // Buscar tareas pausadas por parada de emergencia
    const tasksToResume = await prisma.task.findMany({
      where: { state: 'PAUSED', lastError: 'EMERGENCY_STOP_PAUSE' },
      select: { id: true, title: true },
    });

    const taskIds = tasksToResume.length > 0
      ? tasksToResume.map((t) => t.id)
      : (await prisma.task.findMany({ where: { state: 'PAUSED' }, select: { id: true } })).map((t) => t.id);

    if (taskIds.length > 0) {
      await prisma.task.updateMany({
        where: { id: { in: taskIds } },
        data: { state: 'BACKLOG', lastError: null },
      });
    }

    await prisma.activityLog.create({
      data: {
        agent: 'SYSTEM',
        action: 'SYSTEM_RESUMED',
        details: `Reanudación del sistema. ${taskIds.length} tareas reingresadas al backlog (${taskIds.slice(0, 5).join(', ')}${taskIds.length > 5 ? '...' : ''}).`,
      },
    });

    return NextResponse.json({
      ok: true,
      status: 'SYSTEM_ACTIVE',
      message: `Sistema reanudado. ${taskIds.length} tareas devueltas al backlog.`,
      resumedTaskIds: taskIds,
      resumedTasks: taskIds.length,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
