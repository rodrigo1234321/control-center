/**
 * Tipos compartidos del worker de Antigravity.
 * Pensado para integrarse a tu Control Center (Next.js + Prisma) como el
 * adapter que reemplaza el hook mockeado (`fs.writeFile`) por invocaciones
 * reales a `agy` (Antigravity CLI), con validación fuera del agente.
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
  /** id único del job (para logs, lock, Job Ledger) */
  jobId: string;
  /** id de la Task en tu modelo de Control Center (Prisma) */
  taskId: string;
  /** id del Goal padre */
  goalId: string;
  /** Planner escribe research.md; QA_VERIFIER valida el trabajo de OpenCode */
  role: AntigravityRole;
  /**
   * Carpeta AISLADA del job (ver workspace-manager.ts). NUNCA el checkout
   * principal del repo — cada job clona a una carpeta descartable propia.
   */
  workspacePath: string;
  /** nombre del archivo de instrucciones que vos escribís antes de llamar al runner (default 'TASK.md') */
  taskFileName?: string;
  /** nombre del archivo que le pedimos a Antigravity que escriba con su resultado (default 'RESULT.json') */
  resultFileName?: string;
  /** timeout duro en ms (default 120000) */
  timeoutMs?: number;
  /** archivos relativos al workspace que deberían existir si la tarea salió bien (ej. ['research.md']) */
  expectedFiles?: string[];
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
