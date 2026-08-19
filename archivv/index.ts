import { runAntigravityJob } from './runner';
import { recordFailure, isCircuitOpen, resetCircuit } from './circuit-breaker';
import { AntigravityJobInput, AntigravityJobResult } from './types';

/**
 * Punto de entrada que llama Control Center desde su orquestador
 * (el mismo lugar donde hoy está el hook mockeado con fs.writeFile).
 *
 * Antes de correr un job de rol QA_VERIFIER, chequea si el circuit
 * breaker de esa task ya está abierto (3 FIX_REQUEST fallidos seguidos).
 * Si lo está, ni siquiera llama a agy — devuelve NEEDS_APPROVAL directo,
 * para que Control Center le avise al humano (por OpenClaw/Telegram si
 * ya lo tenés conectado, o por tu UI de Mission Control mientras tanto).
 */
export async function runAntigravityWithCircuitBreaker(
  input: AntigravityJobInput
): Promise<AntigravityJobResult> {
  if (isCircuitOpen(input.taskId)) {
    const now = new Date().toISOString();
    return {
      jobId: input.jobId,
      status: 'NEEDS_APPROVAL',
      exitCode: null,
      stderr: '',
      gitDiffSummary: null,
      filesChanged: [],
      resultFilePresent: false,
      resultFileContent: null,
      startedAt: now,
      finishedAt: now,
      failureReason:
        `Circuit breaker abierto para task ${input.taskId} — 3 intentos de FIX_REQUEST fallaron. ` +
        `Requiere intervención humana antes de seguir.`,
    };
  }

  const result = await runAntigravityJob(input);

  if (result.status === 'FAILED' && input.role === 'QA_VERIFIER') {
    recordFailure(input.taskId);
  }
  if (result.status === 'COMPLETED') {
    resetCircuit(input.taskId);
  }

  return result;
}

export * from './types';
export { runAntigravityJob } from './runner';
export { antigravitySemaphore } from './semaphore';
export { runAntigravitySmokeTests } from './health';
export { createJobWorkspace, destroyJobWorkspace } from './workspace-manager';
export { isCircuitOpen, resetCircuit, getCircuitState } from './circuit-breaker';
