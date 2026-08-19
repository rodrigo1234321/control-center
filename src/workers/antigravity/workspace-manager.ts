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
 * Aplica los cambios producidos en el workspace aislado de vuelta sobre el repositorio real.
 */
export async function applyJobWorkspaceChanges(
  jobId: string,
  targetRepoPath: string
): Promise<boolean> {
  return defaultRuntime.applyWorkspaceChanges(jobId, targetRepoPath);
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
