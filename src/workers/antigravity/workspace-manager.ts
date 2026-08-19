import { defaultRuntime, ExecutionEvidence } from '../runtime';

/**
 * Crea un workspace descartable y aislado para un job.
 */
export async function createJobWorkspace(
  jobId: string,
  repoUrl: string,
  baseBranch = 'main'
): Promise<string> {
  return defaultRuntime.createWorkspace(jobId, repoUrl, baseBranch);
}

/**
 * Archiva la evidencia de ejecución (metadata, RESULT.json, logs, patches) antes de la limpieza.
 */
export async function archiveJobEvidence(
  jobId: string,
  evidence: ExecutionEvidence
): Promise<string> {
  return defaultRuntime.archiveEvidence(jobId, evidence);
}

/**
 * Borra el workspace de trabajo temporal de un job pero preserva los logs y la evidencia.
 */
export async function destroyJobWorkspace(jobId: string): Promise<void> {
  return defaultRuntime.destroyWorkspace(jobId);
}
