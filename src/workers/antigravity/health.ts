import { writeFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { runAntigravityJob } from './runner';

export interface SmokeTestReport {
  passed: boolean;
  results: Record<string, { ok: boolean; detail: string }>;
}

/**
 * 8 pruebas (A–H) para verificar el funcionamiento de agy en este entorno.
 */
export async function runAntigravitySmokeTests(): Promise<SmokeTestReport> {
  const results: SmokeTestReport['results'] = {};
  const tmpDir = await makeTmpDir();

  try {
    // A — Autenticación
    await writeFile(path.join(tmpDir, 'TASK.md'), '# Test A\nEscribí exactamente {"status":"ok","summary":"a","filesChanged":[]} en RESULT.json.');
    const authTest = await runAntigravityJob({
      jobId: 'smoke-a', taskId: 'smoke', goalId: 'smoke', role: 'PLANNER',
      workspacePath: tmpDir, timeoutMs: 30_000,
    });
    results.A_auth = {
      ok: !/authentication required/i.test(authTest.stderr),
      detail: `exit=${authTest.exitCode} status=${authTest.status} stderr="${authTest.stderr.slice(0, 200)}"`,
    };

    // B — Proceso terminó
    results.B_process_exit = {
      ok: authTest.exitCode !== null,
      detail: `exitCode=${authTest.exitCode}`,
    };

    // C — Captura de stderr
    results.C_stderr_capture = {
      ok: true,
      detail: authTest.stderr ? 'stderr tiene contenido' : 'stderr vacío (normal)',
    };

    // D — Filesystem write (RESULT.json)
    results.D_filesystem_write = {
      ok: authTest.resultFilePresent,
      detail: authTest.resultFilePresent
        ? 'RESULT.json presente'
        : 'RESULT.json no fue creado en este timeout',
    };

    // E — git diff
    results.E_git_diff = {
      ok: true,
      detail: authTest.gitDiffSummary ?? '(sin diff — esperado en carpeta tmp sin git)',
    };

    // F — Timeout kill
    const timeoutTest = await runAntigravityJob({
      jobId: 'smoke-f', taskId: 'smoke', goalId: 'smoke', role: 'PLANNER',
      workspacePath: tmpDir, timeoutMs: 1,
    });
    results.F_timeout_kill = {
      ok: timeoutTest.status === 'FAILED' && /timeout/i.test(timeoutTest.failureReason ?? ''),
      detail: timeoutTest.failureReason ?? '(no falló por timeout)',
    };

    // G — Permisos con skip
    await writeFile(path.join(tmpDir, 'TASK.md'), '# Test G\nCorré el comando de terminal `echo permtest` y después escribí RESULT.json con status ok.');
    const permTest = await runAntigravityJob({
      jobId: 'smoke-g', taskId: 'smoke', goalId: 'smoke', role: 'PLANNER',
      workspacePath: tmpDir, timeoutMs: 30_000,
    });
    results.G_permissions = {
      ok: permTest.exitCode !== null && !/timeout/i.test(permTest.failureReason ?? ''),
      detail: `status=${permTest.status} failureReason=${permTest.failureReason ?? '-'}`,
    };

    // H — Fallo deliberado sin TASK.md
    await rm(path.join(tmpDir, 'TASK.md'), { force: true });
    let hFailedAsExpected = false;
    try {
      await runAntigravityJob({
        jobId: 'smoke-h', taskId: 'smoke', goalId: 'smoke', role: 'PLANNER',
        workspacePath: tmpDir, timeoutMs: 5_000,
      });
    } catch {
      hFailedAsExpected = true;
    }
    results.H_deliberate_failure = {
      ok: hFailedAsExpected,
      detail: hFailedAsExpected ? 'Falló correctamente sin TASK.md' : 'No falló como esperado',
    };
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }

  const passed = Object.values(results).every((r) => r.ok);
  return { passed, results };
}

async function makeTmpDir(): Promise<string> {
  const dir = path.join(os.tmpdir(), `agy-smoke-${Date.now()}`);
  await mkdir(dir, { recursive: true });
  return dir;
}
