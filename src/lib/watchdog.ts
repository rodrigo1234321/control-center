import { prisma } from '@/lib/prisma';
import type { DbClient } from '@/lib/types';
import { transitionTask } from './transition';

/**
 * Watchdog: reap stale RUNNING tasks.
 */
const STALE_RUNNING_MINUTES = 15; // 15 min — las sesiones LLM legítimas pueden tardar; el heartbeat refresca updatedAt

export async function reapStaleRunningTasks(client: DbClient = prisma): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_RUNNING_MINUTES * 60 * 1000);

  const stale = await client.task.findMany({
    where: { state: 'RUNNING', updatedAt: { lt: cutoff } },
  });

  for (const task of stale) {
    console.log(
      `[watchdog] Task ${task.id} ("${task.title}") atascada en RUNNING desde ${task.updatedAt.toISOString()} — se libera.`
    );
    await transitionTask(
      task.id,
      'FAILED',
      `Watchdog: la sesión terminó sin llamar a complete_task/fail_task (timeout ${STALE_RUNNING_MINUTES}min). Task reclamada y liberada automáticamente.`,
      client
    );
  }

  return stale.length;
}
