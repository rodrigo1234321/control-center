import { runAntigravityJob } from './runner';
import { recordFailure, isCircuitOpen, resetCircuit } from './circuit-breaker';
import { AntigravityJobInput, AntigravityJobResult } from './types';

/**
 * Punto de entrada con Circuit Breaker integrado para Control Center.
 */
export async function runAntigravityWithCircuitBreaker(
  input: AntigravityJobInput
): Promise<AntigravityJobResult> {
  const circuitOpen = await isCircuitOpen(input.taskId);
  if (circuitOpen && !input.force) {
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
    await recordFailure(input.taskId);
  }
  if (result.status === 'COMPLETED') {
    await resetCircuit(input.taskId);
  }

  return result;
}

export * from './types';
export { runAntigravityJob } from './runner';
export { antigravitySemaphore } from './semaphore';
export { runAntigravitySmokeTests } from './health';
export { createJobWorkspace, destroyJobWorkspace } from './workspace-manager';
export { isCircuitOpen, resetCircuit, getCircuitState } from './circuit-breaker';
