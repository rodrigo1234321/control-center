import { prisma } from '@/lib/prisma';
import { TASK_STATES, isValidTransition, type DbClient, type TaskState } from '@/lib/types';
import { processHandoffs } from './handoff';
import { snapshotRepo } from './repo-snapshot';

export async function transitionTask(
  id: string,
  state?: TaskState,
  result?: string,
  client: DbClient = prisma
) {
  const existing = await client.task.findUnique({
    where: { id },
    include: { project: { select: { repoPath: true } } },
  });
  if (!existing) {
    throw new Error('Task not found');
  }

  const updateData: Record<string, unknown> = {};
  if (result !== undefined) updateData.result = result;

  let finalState = state;
  let diskCheckFailure: string | null = null;

  if (state && TASK_STATES.includes(state)) {
    if (!isValidTransition(existing.state as TaskState, state)) {
      throw new Error(`Invalid transition: ${existing.state} → ${state}`);
    }

    // Snapshot al reclamar la tarea (RUNNING) — línea de base contra la que se compara en DONE
    if (state === 'RUNNING' && existing.project?.repoPath) {
      updateData.claimSnapshot = await snapshotRepo(existing.project.repoPath);
    }

    // Verificación de disco en DONE:
    // Aplica a tareas productivas (Scaffold, Design, Build, Fix) con repoPath y snapshot.
    // Se exceptúan tareas explícitamente de solo lectura (Planning, Verify, QA, Review, Audit).
    const isReadOnlyTask = /^(planning|verify|qa|review|audit)/i.test(existing.title) ||
      existing.title.toLowerCase().includes('verify') ||
      existing.title.toLowerCase().includes('planning');

    if (
      state === 'DONE' &&
      !isReadOnlyTask &&
      existing.project?.repoPath &&
      existing.claimSnapshot
    ) {
      const freshSnapshot = await snapshotRepo(existing.project.repoPath);
      if (freshSnapshot === existing.claimSnapshot) {
        diskCheckFailure =
          `No se detectaron cambios en "${existing.project.repoPath}" desde que se reclamó la tarea. ` +
          `Probable no-op silencioso del agente (permiso headless denegado, hook mockeado, o sesión que ` +
          `nunca llegó a ejecutar). Se rechaza el DONE.`;
      }
    }

    if (diskCheckFailure) {
      finalState = 'FAILED';
      updateData.result = diskCheckFailure;
      updateData.finishedAt = new Date();
    } else if (state === 'DONE' && existing.requiresApproval && existing.state !== 'REVIEW') {
      finalState = 'REVIEW';

      // F5: actionType dinámico basado en el tipo de tarea
      const actionType = existing.title.toLowerCase().includes('delete') ? 'DELETE'
        : existing.title.toLowerCase().includes('fix') ? 'CLIENT_ACTION'
        : 'DEPLOY';

      await client.approval.create({
        data: {
          taskId: id,
          actionType,
          description: `Approval required for: ${existing.title}`,
        },
      });

      await client.activityLog.create({
        data: {
          taskId: id,
          agent: existing.agent,
          action: `Task moved to REVIEW (approval required): ${existing.title}`,
        },
      });
    } else {
      finalState = state;
      if (state === 'DONE' || state === 'FAILED') {
        updateData.finishedAt = new Date();
      }
    }
    updateData.state = finalState;
  }

  const updated = await client.task.update({
    where: { id },
    data: updateData,
    include: {
      project: { select: { name: true, slug: true } },
      approvals: true,
    },
  });

  if (finalState && existing.state !== finalState) {
    await client.activityLog.create({
      data: {
        taskId: id,
        agent: existing.agent,
        action: diskCheckFailure
          ? `Task ${existing.title}: DONE rechazado por disk-check → FAILED (sin cambios en repoPath)`
          : `Task ${existing.title}: ${existing.state} → ${finalState}`,
      },
    });

    // Automatically process handoffs immediately if it reached a terminal state
    if (finalState === 'DONE' || finalState === 'FAILED') {
      await processHandoffs(id, client);
    }
  }

  return updated;
}
