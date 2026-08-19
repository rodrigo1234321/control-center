import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { AntigravityJobInput, AntigravityJobResult, JobStatus } from './types';
import { antigravitySemaphore } from './semaphore';
import { validateWorkspace } from './validator';

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_RESULT_FILE = 'RESULT.json';
const DEFAULT_TASK_FILE = 'TASK.md';

/**
 * Ejecuta un job de Antigravity (`agy`) en modo headless.
 *
 * ADVERTENCIAS VERIFICADAS contra el repo público
 * google-antigravity/antigravity-cli (agosto 2026) — no son hipótesis:
 *
 * 1) `agy --print` NO escribe nada a stdout cuando stdout no es un TTY
 *    (issue #408, reproducido en la versión 1.0.9: exit code 0 pero
 *    archivo/pipe de salida vacío). spawn() siempre te da un pipe no-TTY,
 *    así que ACÁ NUNCA se usa el stdout capturado como fuente de verdad.
 *    El contrato con el agente es "escribí tu resultado en un archivo",
 *    no "imprimí tu resultado" — por eso el prompt le pide que escriba
 *    RESULT.json en vez de confiar en lo que devuelva por consola.
 *
 * 2) `--sandbox` combinado con `--dangerously-skip-permissions` deja el
 *    sandbox inútil: el modelo puede pedir bypassSandbox:true y con
 *    --dangerously-skip-permissions eso se autoaprueba igual que
 *    cualquier otro permiso (issue #36). CONCLUSIÓN: este runner NO usa
 *    --sandbox porque daría una falsa sensación de seguridad. El
 *    aislamiento tiene que venir de AFUERA de agy — corré este proceso
 *    Node dentro de un contenedor Docker o una VM donde workspacePath
 *    sea el único path realmente escribible. No lo corras suelto contra
 *    tu filesystem principal de Windows.
 *
 * 3) --output-format json es "mejora, no dependencia crítica" (el issue
 *    #394 sobre salida estructurada sigue abierto) — se pasa el flag por
 *    si algún día ayuda, pero la validación real pasa por validator.ts.
 */
export async function runAntigravityJob(input: AntigravityJobInput): Promise<AntigravityJobResult> {
  return antigravitySemaphore.run(() => executeJob(input));
}

async function executeJob(input: AntigravityJobInput): Promise<AntigravityJobResult> {
  const startedAt = new Date().toISOString();
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const taskFile = input.taskFileName ?? DEFAULT_TASK_FILE;
  const resultFile = input.resultFileName ?? DEFAULT_RESULT_FILE;

  await assertFileExists(
    path.join(input.workspacePath, taskFile),
    `Falta ${taskFile} en ${input.workspacePath} — escribilo ANTES de llamar a runAntigravityJob. ` +
      `El contenido real de la tarea va en ese archivo, no en el prompt de línea de comandos ` +
      `(evitamos así el límite de argv y los problemas de escaping que reporta el issue #408).`
  );

  // Prompt corto A PROPÓSITO. El detalle de la tarea vive en TASK.md.
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
    '--dangerously-skip-permissions',
    '--output-format', 'json',
  ];

  const { exitCode, stderr, timedOut } = await spawnWithTimeout('agy', args, input.workspacePath, timeoutMs);

  const validation = await validateWorkspace(input.workspacePath, {
    resultFileName: resultFile,
    expectedFiles: input.expectedFiles ?? [],
  });

  let status: JobStatus = 'PROCESS_EXITED';
  let failureReason: string | undefined;

  if (timedOut) {
    failureReason = `agy no terminó dentro de ${timeoutMs}ms — matado por timeout externo (Node), no confiar solo en --print-timeout.`;
  } else if (
    !validation.resultFilePresent &&
    (input.expectedFiles?.length ?? 0) === 0 &&
    validation.filesChanged.length === 0
  ) {
    failureReason = `agy salió (exit ${exitCode}) pero no escribió ${resultFile} ni se detectó ningún cambio en el workspace. Tratar como fallo, no como éxito silencioso.`;
  } else if ((input.expectedFiles?.length ?? 0) > 0 && !validation.expectedFilesOk) {
    failureReason = `Faltan uno o más de los archivos esperados (${(input.expectedFiles ?? []).join(', ')}).`;
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

function spawnWithTimeout(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs: number
): Promise<{ exitCode: number | null; stdout: string; stderr: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    // Margen sobre --print-timeout: no confiamos en que ese flag interno
    // de agy siempre mate el proceso a tiempo.
    const killTimer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs + 5_000);

    // Best-effort. Por el issue #408, esto probablemente llegue vacío —
    // no se usa como señal de éxito/fracaso en ningún lado de este archivo.
    child.stdout?.on('data', (d) => { stdout += d.toString(); });
    child.stderr?.on('data', (d) => { stderr += d.toString(); });

    child.on('close', (code) => {
      clearTimeout(killTimer);
      resolve({ exitCode: code, stdout, stderr, timedOut });
    });

    child.on('error', (err) => {
      clearTimeout(killTimer);
      stderr += `\n[spawn error] ${err.message}`;
      resolve({ exitCode: null, stdout, stderr, timedOut });
    });
  });
}

async function assertFileExists(filePath: string, message: string): Promise<void> {
  try {
    await access(filePath);
  } catch {
    throw new Error(message);
  }
}
