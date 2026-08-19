import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST() {
  try {
    const tasksToPause = await prisma.task.findMany({
      where: { state: { in: ['RUNNING', 'BACKLOG'] } },
      select: { id: true, title: true },
    });

    const taskIds = tasksToPause.map((t) => t.id);

    // 1. Pausar todas las tareas activas marcando el motivo
    if (taskIds.length > 0) {
      await prisma.task.updateMany({
        where: { id: { in: taskIds } },
        data: { state: 'PAUSED', lastError: 'EMERGENCY_STOP_PAUSE' },
      });
    }

    // 2. Marcar workers como OFFLINE
    await prisma.workerStatus.updateMany({
      data: { status: 'OFFLINE' },
    });

    // 3. Registrar en ActivityLog con detalle de IDs
    await prisma.activityLog.create({
      data: {
        agent: 'SYSTEM',
        action: 'EMERGENCY_STOP_TRIGGERED',
        details: `Parada de emergencia ejecutada. ${taskIds.length} tareas pausadas (${taskIds.slice(0, 5).join(', ')}${taskIds.length > 5 ? '...' : ''}).`,
      },
    });

    return NextResponse.json({
      ok: true,
      status: 'SYSTEM_PAUSED',
      message: `Emergency Stop ejecutado. ${taskIds.length} tareas pausadas sin pérdida de datos.`,
      affectedTaskIds: taskIds,
      affectedTasks: taskIds.length,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
