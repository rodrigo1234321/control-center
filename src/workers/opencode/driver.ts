import 'dotenv/config';
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { mkdir } from 'node:fs/promises';
import { prisma } from '../../lib/prisma';
import { transitionTask } from '../../lib/transition';
import { EnvironmentValidator } from '../../lib/env-validator';

const AGENT_NAME = 'OpenCode';
const WORKER_ID = `opencode-${os.hostname()}-${process.pid}`;
const POLL_INTERVAL_MS = 5000;
const TIMEOUT_MS = 180_000;
let isRunning = true;

function resolveOpenCodeBin(): string {
  if (process.env.OPENCODE_BIN && !process.env.OPENCODE_BIN.endsWith('.cmd') && !process.env.OPENCODE_BIN.endsWith('.bat')) {
    return process.env.OPENCODE_BIN;
  }
  const directExe = path.join(os.homedir(), 'AppData', 'Roaming', 'npm', 'node_modules', 'opencode-ai', 'bin', 'opencode.exe');
  return directExe;
}

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

async function checkControlMessage(taskId: string): Promise<'PAUSE' | 'STOP' | null> {
  try {
    const msg = await prisma.agentMessage.findFirst({
      where: {
        taskId,
        type: 'CONTROL',
        content: { in: [`STOP_TASK:${taskId}`, `PAUSE_TASK:${taskId}`, 'STOP_ALL', 'PAUSE_ALL'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!msg) return null;
    if (msg.content.startsWith('PAUSE')) return 'PAUSE';
    return 'STOP';
  } catch {
    return null;
  }
}

async function executeOpenCode(cwd: string, prompt: string): Promise<{ exitCode: number | null; stdout: string; stderr: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    const bin = resolveOpenCodeBin();
    const configPath = path.resolve('configs', 'agent-opencode.json');
    const model = process.env.OPENCODE_MODEL ?? 'opencode/deepseek-v4-flash-free';

    const env = {
      ...process.env,
      OPENCODE_CONFIG: configPath,
      OPENCODE_DISABLE_AUTOUPDATE: '1',
    };

    const args = ['run', prompt, '--model', model, '--auto'];

    const child = spawn(bin, args, {
      cwd,
      env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      if (child.pid && process.platform === 'win32') {
        spawn('taskkill', ['/pid', child.pid.toString(), '/t', '/f'], { stdio: 'ignore' });
      } else {
        child.kill('SIGKILL');
      }
    }, TIMEOUT_MS);

    child.stdout?.on('data', (d) => { stdout += d.toString(); });
    child.stderr?.on('data', (d) => { stderr += d.toString(); });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ exitCode: code, stdout, stderr, timedOut });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      stderr += `\n[spawn error] ${err.message}`;
      resolve({ exitCode: null, stdout, stderr, timedOut: false });
    });
  });
}

async function processNextTask() {
  const candidate = await prisma.task.findFirst({
    where: {
      agent: AGENT_NAME,
      state: 'BACKLOG',
    },
    include: { project: true, goal: true },
    orderBy: { createdAt: 'asc' },
  });

  if (!candidate) return;

  const jobId = `job-oc-${candidate.id.slice(0, 8)}-${Date.now()}`;

  // Reclamo atómico para evitar race conditions / doble claim (#5)
  const claim = await prisma.task.updateMany({
    where: { id: candidate.id, state: 'BACKLOG' },
    data: {
      state: 'RUNNING',
      jobId,
      workerId: WORKER_ID,
      lastStartedAt: new Date(),
      lastError: null,
    },
  });

  if (claim.count === 0) return;

  const task = await prisma.task.findUnique({
    where: { id: candidate.id },
    include: { project: true, goal: true },
  });
  if (!task || !task.project) return;

  console.log(`[${AGENT_NAME}] Reclamando tarea: ${task.title} (TaskID: ${task.id}, JobID: ${jobId})`);
  await updateHeartbeat('BUSY');
  await logActivity(task.id, task.projectId, 'CLAIMED_TASK', `Iniciando codificación para ${task.title} (Worker: ${WORKER_ID})`);

  // Chequeo de comandos de control (#10)
  const ctrl = await checkControlMessage(task.id);
  if (ctrl) {
    const targetState = ctrl === 'PAUSE' ? 'PAUSED' : 'FAILED';
    await transitionTask(task.id, targetState, `Detenido por comando ${ctrl}`);
    await logActivity(task.id, task.projectId, `TASK_${ctrl}ED`, `Comando ${ctrl} recibido`);
    return;
  }

  const repoPath = task.project.repoPath || path.join(process.cwd(), 'temp-repos', task.project.slug);
  await mkdir(repoPath, { recursive: true });

  const prompt = [
    `Sos el agente ejecutor OpenCode para el proyecto ${task.project.name}.`,
    `Tarea: ${task.title}`,
    `JobID: ${jobId}`,
    `Descripción: ${task.description ?? 'Construir o modificar los archivos requeridos según los requerimientos del proyecto.'}`,
    `Directorio de trabajo: ${repoPath}`,
    `Completá la tarea paso a paso implementando los archivos necesarios. Asegurate de que el código quede completo y funcional.`,
  ].join('\n');

  try {
    const { exitCode, stdout, stderr, timedOut } = await executeOpenCode(repoPath, prompt);
    console.log(`[${AGENT_NAME}] Tarea finalizada con código de salida ${exitCode}, timedOut: ${timedOut}`);

    // Solo exitCode === 0 sin timeout es éxito real (#2)
    const isSuccess = exitCode === 0 && !timedOut;

    const errorDetails = timedOut
      ? 'Timeout de ejecución superado (180s)'
      : exitCode !== 0
        ? (stderr || stdout || `Error de ejecución con código ${exitCode}`)
        : null;

    await prisma.task.update({
      where: { id: task.id },
      data: {
        lastFinishedAt: new Date(),
        lastError: errorDetails,
      },
    });

    if (isSuccess) {
      const summary = `OpenCode completó la tarea ${task.title}. ${stdout.slice(-300).trim()}`;
      await transitionTask(task.id, 'DONE', summary);
      await logActivity(task.id, task.projectId, 'COMPLETED_TASK', summary);
    } else {
      const errSummary = timedOut
        ? `Fallo en OpenCode: Timeout de ejecución alcanzado (180s)`
        : `Fallo en OpenCode (código ${exitCode}): ${(stderr || stdout).slice(-300).trim()}`;
      await transitionTask(task.id, 'FAILED', errSummary);
      await logActivity(task.id, task.projectId, 'TASK_FAILED', errSummary);
    }
  } catch (err: any) {
    console.error(`[${AGENT_NAME}] Error en ejecución de tarea ${task.id}:`, err.message);
    await prisma.task.update({
      where: { id: task.id },
      data: {
        lastFinishedAt: new Date(),
        lastError: err.message,
      },
    });
    try {
      await transitionTask(task.id, 'FAILED', err.message);
    } catch {}
  } finally {
    await updateHeartbeat('ONLINE');
  }
}

export async function startOpenCodeDriver() {
  EnvironmentValidator.validateWorker(AGENT_NAME);
  console.log(`[${AGENT_NAME}] Driver iniciado (WorkerID: ${WORKER_ID}, Modelo: ${process.env.OPENCODE_MODEL ?? 'opencode/deepseek-v4-flash-free'}). Monitoreando tareas...`);
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
  startOpenCodeDriver().catch(console.error);
}
