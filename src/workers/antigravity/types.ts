/**
 * Tipos compartidos del worker de Antigravity.
 */

export type JobStatus =
  | 'CREATED'
  | 'RUNNING'
  | 'PROCESS_EXITED'
  | 'WORKSPACE_VALIDATED'
  | 'COMPLETED'
  | 'FAILED'
  | 'NEEDS_APPROVAL';

export type AntigravityRole = 'PLANNER' | 'QA_VERIFIER';

export interface AntigravityJobInput {
  /** ID único del job */
  jobId: string;
  /** ID de la Task en Prisma */
  taskId: string;
  /** ID del Goal padre */
  goalId: string;
  /** Planner escribe research.md / arquitectura; QA_VERIFIER valida */
  role: AntigravityRole;
  /** Carpeta AISLADA del job */
  workspacePath: string;
  /** Nombre del archivo de instrucciones (default 'TASK.md') */
  taskFileName?: string;
  /** Nombre del archivo de resultado (default 'RESULT.json') */
  resultFileName?: string;
  /** Timeout duro en ms (default 120000) */
  timeoutMs?: number;
  /** Archivos esperados (ej. ['research.md']) */
  expectedFiles?: string[];
  /** Modo de permisos: 'accept-edits' (seguro) o 'skip-permissions' (fallback) */
  permissionMode?: 'accept-edits' | 'allow-specific' | 'skip-permissions';
  /** Flag para forzar ejecución aún si circuit breaker estuviera abierto */
  force?: boolean;
}

export interface AntigravityJobResult {
  jobId: string;
  status: JobStatus;
  exitCode: number | null;
  stderr: string;
  gitDiffSummary: string | null;
  filesChanged: string[];
  resultFilePresent: boolean;
  resultFileContent: unknown | null;
  startedAt: string;
  finishedAt: string;
  failureReason?: string;
}
