import 'dotenv/config';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { prisma } from '../../lib/prisma';
import { runAntigravityWithCircuitBreaker } from './index';
import { createJobWorkspace, destroyJobWorkspace, archiveJobEvidence } from './workspace-manager';
import { transitionTask } from '../../lib/transition';
import { processHandoffs } from '../../lib/handoff';
import { EnvironmentValidator } from '../../lib/env-validator';

const AGENT_NAME = 'Antigravity';
const WORKER_ID = `agy-${os.hostname()}-${process.pid}`;
const POLL_INTERVAL_MS = 5000;
let isRunning = true;

async function updateHeartbeat(status = 'ONLINE') {
  try {
    await prisma.workerStatus.upsert({
      where: { agent: AGENT_NAME },
      update: { status, lastSeenAt: new Date() },
      create: { agent: AGENT_NAME, status, lastSeenAt: new Date() },
    });
  } catch (err: any) {
    console.error(`[${AGENT_NAME} Heartbeat Error]:`, err.message);
  }
}

async function logActivity(taskId: string, projectId: string, action: string, details?: string) {
  try {
    await prisma.activityLog.create({
      data: { taskId, projectId, agent: AGENT_NAME, action, details },
    });
  } catch {}
}

async function processNextTask() {
  const task = await prisma.task.findFirst({
    where: {
      agent: AGENT_NAME,
      state: 'BACKLOG',
    },
    include: { project: true, goal: true },
    orderBy: { createdAt: 'asc' },
  });

  if (!task) return;

  const jobId = `job-${task.id.slice(0, 8)}-${Date.now()}`;
  console.log(`[${AGENT_NAME}] Reclamando tarea: ${task.title} (TaskID: ${task.id}, JobID: ${jobId})`);
  await updateHeartbeat('BUSY');

  // Actualizar metadata de inicio de ejecución en la tarea
  await prisma.task.update({
    where: { id: task.id },
    data: {
      jobId,
      workerId: WORKER_ID,
      lastStartedAt: new Date(),
      lastError: null,
    },
  });

  await transitionTask(task.id, 'RUNNING');
  await logActivity(task.id, task.projectId, 'CLAIMED_TASK', `Iniciando trabajo en ${task.title} (Worker: ${WORKER_ID})`);

  const repoPath = task.project.repoPath || path.join(process.cwd(), 'temp-repos', task.project.slug);
  await mkdir(repoPath, { recursive: true });

  let workspacePath = repoPath;
  let isIsolatedWorkspace = false;

  try {
    workspacePath = await createJobWorkspace(jobId, repoPath, 'main');
    isIsolatedWorkspace = true;
  } catch {
    workspacePath = repoPath;
    await mkdir(workspacePath, { recursive: true });
  }

  const isPlanning = task.title.toLowerCase().includes('plan') || task.title.toLowerCase().includes('research');
  const role = isPlanning ? 'PLANNER' : 'QA_VERIFIER';
  const expectedFiles = isPlanning ? ['research.md'] : [];

  const taskContent = [
    `# Tarea: ${task.title}`,
    `**Proyecto:** ${task.project.name} (${task.project.slug})`,
    `**Goal:** ${task.goal?.title ?? 'Sin goal específico'}`,
    `**JobID:** ${jobId}`,
    `\n## Descripción y Requerimientos:\n${task.description ?? 'Completar la tarea según los estándares de ingeniería.'}`,
    `\n## Instrucciones para Antigravity:`,
    `- Trabajá en los archivos dentro de este directorio.`,
    isPlanning
      ? `- Escribí tus hallazgos, arquitectura o plan en 'research.md'.`
      : `- Verificá la calidad de código, pruebas y estructura generada.`,
    `- Al finalizar, creá RESULT.json con {"status": "ok" | "error", "summary": "...", "filesChanged": [...]}.`,
  ].join('\n');

  await writeFile(path.join(workspacePath, 'TASK.md'), taskContent, 'utf-8');

  try {
    const result = await runAntigravityWithCircuitBreaker({
      jobId,
      taskId: task.id,
      goalId: task.goalId ?? 'general',
      role,
      workspacePath,
      expectedFiles,
    });

    console.log(`[${AGENT_NAME}] Resultado de tarea ${task.id}: ${result.status}`);

    // Archivar evidencia de forma permanente
    await archiveJobEvidence(jobId, {
      metadata: {
        jobId,
        taskId: task.id,
        workerId: WORKER_ID,
        role,
        status: result.status,
        startedAt: result.startedAt,
        finishedAt: result.finishedAt,
        exitCode: result.exitCode,
      },
      resultJson: result.resultFileContent,
      stderr: result.stderr,
      gitDiffPatch: result.gitDiffSummary ?? undefined,
      summary: result.failureReason ?? 'Completed successfully',
    });

    await prisma.task.update({
      where: { id: task.id },
      data: {
        lastFinishedAt: new Date(),
        lastError: result.failureReason ?? null,
      },
    });

    if (result.status === 'COMPLETED') {
      const summaryText = typeof result.resultFileContent === 'object' && result.resultFileContent !== null
        ? JSON.stringify(result.resultFileContent)
        : `Tarea completada exitosamente. Diff: ${result.gitDiffSummary ?? 'archivos modificados'}`;

      await transitionTask(task.id, 'DONE', summaryText);
      await logActivity(task.id, task.projectId, 'COMPLETED_TASK', summaryText);
    } else if (result.status === 'NEEDS_APPROVAL') {
      await transitionTask(task.id, 'REVIEW', result.failureReason);
      await logActivity(task.id, task.projectId, 'CIRCUIT_OPENED', result.failureReason);
    } else {
      await transitionTask(task.id, 'FAILED', result.failureReason ?? 'Ejecución fallida');
      await logActivity(task.id, task.projectId, 'TASK_FAILED', result.failureReason);
    }
  } catch (err: any) {
    console.error(`[${AGENT_NAME}] Error ejecutando tarea ${task.id}:`, err.message);
    await prisma.task.update({
      where: { id: task.id },
      data: {
        lastFinishedAt: new Date(),
        lastError: err.message,
      },
    });
    try {
      await transitionTask(task.id, 'FAILED', `Error de ejecución: ${err.message}`);
    } catch {}
  } finally {
    if (isIsolatedWorkspace) {
      try {
        await destroyJobWorkspace(jobId);
      } catch {}
    }
    await updateHeartbeat('ONLINE');
  }
}

export async function startAntigravityDriver() {
  EnvironmentValidator.validateWorker(AGENT_NAME);
  console.log(`[${AGENT_NAME}] Driver iniciado (WorkerID: ${WORKER_ID}). Monitoreando tareas...`);
  await updateHeartbeat('ONLINE');

  const shutdown = async () => {
    console.log(`\n[${AGENT_NAME}] Apagando driver...`);
    isRunning = false;
    await updateHeartbeat('OFFLINE');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  while (isRunning) {
    try {
      await updateHeartbeat('ONLINE');
      await processNextTask();
    } catch (err: any) {
      console.error(`[${AGENT_NAME} Loop Error]:`, err.message);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

if (require.main === module || process.argv[1]?.endsWith('driver.ts')) {
  startAntigravityDriver().catch(console.error);
}
