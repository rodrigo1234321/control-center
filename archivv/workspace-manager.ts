import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// Ajustá esta raíz a tu convención (ver el árbol C:\AI\runtime\jobs\ que
// veníamos usando). Podés setearla por env var para no hardcodear el path
// de tu PC en el código.
const RUNTIME_ROOT = process.env.CC_RUNTIME_ROOT ?? 'C:\\AI\\runtime\\jobs';

/**
 * Crea un workspace DESCARTABLE y aislado para un job: clona el repo a
 * una carpeta propia y arranca una rama temporal cc/<jobId>. Ningún job
 * de Antigravity/OpenCode/Open Design escribe nunca sobre el checkout
 * principal — eso es justamente lo que causaba pisadas entre agentes.
 */
export async function createJobWorkspace(
  jobId: string,
  repoUrl: string,
  baseBranch: string
): Promise<string> {
  const jobPath = path.join(RUNTIME_ROOT, jobId, 'workspace');
  await mkdir(jobPath, { recursive: true });

  await execFileAsync('git', ['clone', '--branch', baseBranch, '--single-branch', repoUrl, jobPath]);

  const tempBranch = `cc/${jobId}`;
  await execFileAsync('git', ['checkout', '-b', tempBranch], { cwd: jobPath });

  return jobPath;
}

/**
 * Borra el workspace de un job. Llamalo después de que Control Center
 * decidió qué hacer con el resultado (mergear la rama temporal al repo
 * principal, o descartarla si el circuit breaker se abrió).
 */
export async function destroyJobWorkspace(jobId: string): Promise<void> {
  const jobRoot = path.join(RUNTIME_ROOT, jobId);
  await rm(jobRoot, { recursive: true, force: true });
}
