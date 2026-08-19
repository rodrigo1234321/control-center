import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST() {
  try {
    // 1. Pausar todas las tareas RUNNING o BACKLOG
    const affectedTasks = await prisma.task.updateMany({
      where: { state: { in: ['RUNNING', 'BACKLOG'] } },
      data: { state: 'PAUSED' },
    });

    // 2. Marcar workers como OFFLINE
    await prisma.workerStatus.updateMany({
      data: { status: 'OFFLINE' },
    });

    // 3. Registrar en ActivityLog
    await prisma.activityLog.create({
      data: {
        agent: 'SYSTEM',
        action: 'EMERGENCY_STOP_TRIGGERED',
        details: `Parada de emergencia ejecutada. ${affectedTasks.count} tareas pausadas.`,
      },
    });

    return NextResponse.json({
      ok: true,
      status: 'SYSTEM_PAUSED',
      message: `Emergency Stop ejecutado. ${affectedTasks.count} tareas pausadas sin pérdida de datos.`,
      affectedTasks: affectedTasks.count,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
