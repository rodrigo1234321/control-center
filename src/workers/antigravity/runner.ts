import { access, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { AntigravityJobInput, AntigravityJobResult, JobStatus } from './types';
import { quotaGuard } from '../quota-guard';
import { defaultRuntime } from '../runtime';
import { validateWorkspace } from './validator';

const DEFAULT_TIMEOUT_MS = 240_000;
const DEFAULT_RESULT_FILE = 'RESULT.json';
const DEFAULT_TASK_FILE = 'TASK.md';

function resolveAgyExecutable(): string {
  if (process.env.AGY_EXECUTABLE) {
    return process.env.AGY_EXECUTABLE;
  }
  const localAgyExe = path.join(os.homedir(), 'AppData', 'Local', 'agy', 'bin', 'agy.exe');
  return localAgyExe;
}

/**
 * Ejecuta un job de Antigravity (`agy`) en modo headless con permisos automáticos.
 */
export async function runAntigravityJob(input: AntigravityJobInput): Promise<AntigravityJobResult> {
  return quotaGuard.runWithGuard(() => executeJob(input));
}

async function executeJob(input: AntigravityJobInput): Promise<AntigravityJobResult> {
  const startedAt = new Date().toISOString();
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const taskFile = input.taskFileName ?? DEFAULT_TASK_FILE;
  const resultFile = input.resultFileName ?? DEFAULT_RESULT_FILE;
  const mode = input.permissionMode ?? (process.env.AGY_PERMISSION_MODE as any) ?? 'dangerously-skip-permissions';

  await assertFileExists(
    path.join(input.workspacePath, taskFile),
    `Falta ${taskFile} en ${input.workspacePath} — escribilo ANTES de llamar a runAntigravityJob.`
  );

  const prompt =
    `Lee el archivo ${taskFile} en el directorio actual y completá la tarea paso a paso, ` +
    `siguiendo esas instrucciones exactamente. Cuando termines -haya salido bien o mal- ` +
    `escribí un archivo ${resultFile} en el directorio actual con este JSON exacto: ` +
    `{"status": "ok" | "error", "summary": "string", "filesChanged": ["string"]}. ` +
    `No asumas que tu respuesta de texto en la terminal va a ser leída por nadie: ` +
    `${resultFile} es la única forma en que el sistema sabe qué hiciste.`;

  const args = [
    '--print', prompt,
    '--print-timeout', `${Math.ceil(timeoutMs / 1000)}s`,
    '--output-format', 'json',
  ];

  // En modo headless autónomo, siempre usamos skip-permissions para evitar bloqueo de herramientas
  if (mode === 'accept-edits') {
    args.push('--mode', 'accept-edits');
  } else {
    args.push('--dangerously-skip-permissions');
  }

  const executable = resolveAgyExecutable();

  const { exitCode, stdout, stderr, timedOut } = await defaultRuntime.execute({
    executable,
    args,
    cwd: input.workspacePath,
    timeoutMs,
  });

  let validation = await validateWorkspace(input.workspacePath, {
    resultFileName: resultFile,
    expectedFiles: input.expectedFiles ?? [],
  });

  // Si agy respondió con éxito (exitCode 0) y generó texto pero olvidó escribir RESULT.json,
  // sintetizamos el archivo RESULT.json para que tareas conversacionales o de planning no fallen falsamente
  if (exitCode === 0 && !timedOut && !validation.resultFilePresent && stdout.trim().length > 0) {
    try {
      let parsedOutput: string = stdout.trim();
      try {
        const jsonOut = JSON.parse(stdout);
        parsedOutput = jsonOut.response || jsonOut.content || jsonOut.summary || stdout.trim();
      } catch {}

      const synthResult = {
        status: 'ok',
        summary: parsedOutput.slice(0, 1000),
        filesChanged: validation.filesChanged,
      };
      await writeFile(
        path.join(input.workspacePath, resultFile),
        JSON.stringify(synthResult, null, 2),
        'utf-8'
      );
      validation = await validateWorkspace(input.workspacePath, {
        resultFileName: resultFile,
        expectedFiles: input.expectedFiles ?? [],
      });
    } catch {}
  }

  let status: JobStatus = 'PROCESS_EXITED';
  let failureReason: string | undefined;

  if (timedOut) {
    failureReason = `agy no terminó dentro de ${timeoutMs}ms — matado por timeout externo (Node).`;
  } else if (stderr.includes('command permission') || stderr.includes('auto-denied')) {
    failureReason = `Permiso denegado en agy headless: ${stderr.trim()}`;
  } else if (exitCode !== 0 && !validation.resultFilePresent) {
    failureReason = `agy terminó con código de error ${exitCode}: ${stderr || stdout || 'Error desconocido'}`;
  } else if (
    !validation.resultFilePresent &&
    (input.expectedFiles?.length ?? 0) === 0 &&
    validation.filesChanged.length === 0
  ) {
    failureReason = `agy salió (exit ${exitCode}) pero no escribió ${resultFile} ni se detectó ningún cambio en el workspace.`;
  } else if ((input.expectedFiles?.length ?? 0) > 0 && !validation.expectedFilesOk) {
    failureReason = `Faltan uno o más de los archivos esperados (${(input.expectedFiles ?? []).join(', ')}).`;
  }

  // Validación explícita del campo status en RESULT.json
  if (!failureReason && validation.resultFilePresent && typeof validation.resultFileContent === 'object' && validation.resultFileContent !== null) {
    const resObj = validation.resultFileContent as Record<string, unknown>;
    const statusVal = String(resObj.status ?? '').toLowerCase();
    if (statusVal === 'error' || statusVal === 'failed') {
      failureReason = typeof resObj.summary === 'string' ? resObj.summary : 'El agente reportó explícitamente fallo en RESULT.json';
    }
  }

  const finishedAt = new Date().toISOString();

  if (failureReason) {
    status = 'FAILED';
  } else {
    status = validation.expectedFilesOk ? 'COMPLETED' : 'WORKSPACE_VALIDATED';
  }

  return {
    jobId: input.jobId,
    status,
    exitCode,
    stderr,
    gitDiffSummary: validation.gitDiffSummary,
    filesChanged: validation.filesChanged,
    resultFilePresent: validation.resultFilePresent,
    resultFileContent: validation.resultFileContent,
    startedAt,
    finishedAt,
    failureReason,
  };
}

async function assertFileExists(filePath: string, errorMessage: string): Promise<void> {
  try {
    await access(filePath);
  } catch {
    throw new Error(errorMessage);
  }
}
