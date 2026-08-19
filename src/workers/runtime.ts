import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile, cp, access } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface RuntimeOpts {
  timeoutMs: number;
  executable: string;
  args: string[];
  cwd?: string;
}

export interface RuntimeResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export interface ExecutionEvidence {
  metadata?: Record<string, unknown>;
  resultJson?: unknown;
  stdout?: string;
  stderr?: string;
  gitDiffPatch?: string;
  summary?: string;
}

export interface ExecutionRuntime {
  createWorkspace(jobId: string, repoUrl: string, baseBranch?: string): Promise<string>;
  applyWorkspaceChanges(jobId: string, targetRepoPath: string): Promise<boolean>;
  archiveEvidence(jobId: string, evidence: ExecutionEvidence): Promise<string>;
  destroyWorkspace(jobId: string): Promise<void>;
  execute(opts: RuntimeOpts): Promise<RuntimeResult>;
}

export class WindowsRuntime implements ExecutionRuntime {
  private runtimeRoot: string;

  constructor(runtimeRoot?: string) {
    this.runtimeRoot = runtimeRoot ?? process.env.CC_RUNTIME_ROOT ?? path.join(os.homedir(), '.control-center', 'jobs');
  }

  async createWorkspace(jobId: string, repoUrl: string, baseBranch = 'main'): Promise<string> {
    const jobRoot = path.join(this.runtimeRoot, jobId);
    const jobWorkspace = path.join(jobRoot, 'workspace');
    await mkdir(jobWorkspace, { recursive: true });

    let isGitRepo = false;
    try {
      await access(path.join(repoUrl, '.git'));
      isGitRepo = true;
    } catch {
      isGitRepo = false;
    }

    if (isGitRepo) {
      try {
        await execFileAsync('git', ['clone', '--branch', baseBranch, '--single-branch', repoUrl, jobWorkspace]);
      } catch {
        try {
          await execFileAsync('git', ['clone', repoUrl, jobWorkspace]);
        } catch {
          // Fallback: copiar archivos ignorando .git e inicializar repo local
          try {
            await cp(repoUrl, jobWorkspace, {
              recursive: true,
              filter: (s) => path.basename(s) !== '.git' && path.basename(s) !== 'node_modules',
            });
          } catch {}
          try {
            await execFileAsync('git', ['init', '-b', baseBranch], { cwd: jobWorkspace });
          } catch {
            await execFileAsync('git', ['init'], { cwd: jobWorkspace });
          }
        }
      }
    } else {
      // Directorio local no git o nuevo: copiamos contenido e inicializamos git en el workspace
      try {
        await cp(repoUrl, jobWorkspace, {
          recursive: true,
          filter: (s) => path.basename(s) !== 'node_modules',
        });
      } catch {}
      try {
        await execFileAsync('git', ['init', '-b', baseBranch], { cwd: jobWorkspace });
      } catch {
        await execFileAsync('git', ['init'], { cwd: jobWorkspace });
      }
      // Inicializamos también en repoUrl para trazabilidad
      try {
        await execFileAsync('git', ['init'], { cwd: repoUrl });
      } catch {}
    }

    const tempBranch = `cc/${jobId}`;
    try {
      await execFileAsync('git', ['checkout', '-b', tempBranch], { cwd: jobWorkspace });
    } catch (err: any) {
      // Si la rama no se puede crear (p. ej. repo vacío sin commits iniciales), no es fatal
    }

    return jobWorkspace;
  }

  /**
   * Aplica los cambios realizados en el workspace aislado de vuelta al repositorio real (targetRepoPath).
   * Sincroniza archivos creados/modificados respetando el .git del repo destino.
   */
  async applyWorkspaceChanges(jobId: string, targetRepoPath: string): Promise<boolean> {
    const jobWorkspace = path.join(this.runtimeRoot, jobId, 'workspace');
    try {
      await cp(jobWorkspace, targetRepoPath, {
        recursive: true,
        filter: (source) => {
          const basename = path.basename(source);
          return basename !== '.git' && basename !== 'node_modules';
        },
      });
      return true;
    } catch (err: any) {
      console.error(`[Runtime] Error aplicando cambios a ${targetRepoPath}:`, err.message);
      return false;
    }
  }

  /**
   * Guarda de forma persistente los artefactos de evidencia antes de la limpieza del working tree.
   */
  async archiveEvidence(jobId: string, evidence: ExecutionEvidence): Promise<string> {
    const evidenceDir = path.join(this.runtimeRoot, jobId, 'evidence');
    await mkdir(evidenceDir, { recursive: true });

    if (evidence.metadata) {
      await writeFile(path.join(evidenceDir, 'metadata.json'), JSON.stringify(evidence.metadata, null, 2), 'utf-8');
    }
    if (evidence.resultJson !== undefined) {
      await writeFile(path.join(evidenceDir, 'RESULT.json'), typeof evidence.resultJson === 'string' ? evidence.resultJson : JSON.stringify(evidence.resultJson, null, 2), 'utf-8');
    }
    if (evidence.stdout !== undefined) {
      await writeFile(path.join(evidenceDir, 'stdout.log'), evidence.stdout, 'utf-8');
    }
    if (evidence.stderr !== undefined) {
      await writeFile(path.join(evidenceDir, 'stderr.log'), evidence.stderr, 'utf-8');
    }
    if (evidence.gitDiffPatch !== undefined) {
      await writeFile(path.join(evidenceDir, 'git-diff.patch'), evidence.gitDiffPatch, 'utf-8');
    }
    if (evidence.summary !== undefined) {
      await writeFile(path.join(evidenceDir, 'summary.json'), JSON.stringify({ summary: evidence.summary, archivedAt: new Date().toISOString() }, null, 2), 'utf-8');
    }

    return evidenceDir;
  }

  /**
   * Elimina el árbol de trabajo temporal (workspace/) pero conserva la evidencia y los logs (evidence/)
   */
  async destroyWorkspace(jobId: string): Promise<void> {
    const jobWorkspace = path.join(this.runtimeRoot, jobId, 'workspace');
    await rm(jobWorkspace, { recursive: true, force: true });
  }

  async execute(opts: RuntimeOpts): Promise<RuntimeResult> {
    return new Promise((resolve) => {
      const child = spawn(opts.executable, opts.args, {
        cwd: opts.cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: process.platform === 'win32' && (opts.executable.endsWith('.cmd') || opts.executable.endsWith('.bat')),
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const killTimer = setTimeout(() => {
        timedOut = true;
        try {
          if (process.platform === 'win32' && child.pid) {
            execFile('taskkill', ['/pid', child.pid.toString(), '/t', '/f'], () => {});
          } else {
            child.kill('SIGKILL');
          }
        } catch {
          child.kill();
        }
      }, opts.timeoutMs);

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
}

export const defaultRuntime: ExecutionRuntime = new WindowsRuntime();
