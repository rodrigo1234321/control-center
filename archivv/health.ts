import { writeFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { runAntigravityJob } from './runner';

export interface SmokeTestReport {
  passed: boolean;
  results: Record<string, { ok: boolean; detail: string }>;
}

/**
 * 8 pruebas (A–H) para correr A MANO una vez por máquina (y de nuevo
 * cada vez que actualices `agy`), ANTES de conectar esto a Control Center
 * de verdad. No lo metas en el pipeline automático — es un chequeo de
 * humano, no un paso del flujo.
 *
 * Uso:
 *   import { runAntigravitySmokeTests } from './health';
 *   const report = await runAntigravitySmokeTests();
 *   console.log(report);
 */
export async function runAntigravitySmokeTests(): Promise<SmokeTestReport> {
  const results: SmokeTestReport['results'] = {};
  const tmpDir = await makeTmpDir();

  try {
    // A — Autenticación: sin sesión cacheada para este usuario de Windows,
    // agy falla con "authentication required" en vez de colgarse.
    await writeFile(path.join(tmpDir, 'TASK.md'), '# Test A\nEscribí exactamente {"status":"ok","summary":"a","filesChanged":[]} en RESULT.json.');
    const authTest = await runAntigravityJob({
      jobId: 'smoke-a', taskId: 'smoke', goalId: 'smoke', role: 'PLANNER',
      workspacePath: tmpDir, timeoutMs: 30_000,
    });
    results.A_auth = {
      ok: !/authentication required/i.test(authTest.stderr),
      detail: `exit=${authTest.exitCode} status=${authTest.status} stderr="${authTest.stderr.slice(0, 200)}"`,
    };

    // B — El proceso realmente terminó (no quedó colgado)
    results.B_process_exit = {
      ok: authTest.exitCode !== null,
      detail: `exitCode=${authTest.exitCode}`,
    };

    // C — Captura de stderr (informativo — stdout NO se valida, ver issue #408)
    results.C_stderr_capture = {
      ok: true,
      detail: authTest.stderr ? 'stderr tiene contenido' : 'stderr vacío (normal)',
    };

    // D — Filesystem: ¿escribió RESULT.json de verdad?
    results.D_filesystem_write = {
      ok: authTest.resultFilePresent,
      detail: authTest.resultFilePresent
        ? 'RESULT.json presente'
        : 'RESULT.json NO fue creado — revisar el prompt o si agy realmente tiene permiso de escritura en el cwd',
    };

    // E — git diff funciona en el workspace (si es un repo de prueba real)
    results.E_git_diff = {
      ok: true,
      detail: authTest.gitDiffSummary ?? '(sin diff — esperado si tmpDir no es un repo git)',
    };

    // F — Timeout: con timeout absurdamente corto, debe morir limpio y marcarse FAILED
    const timeoutTest = await runAntigravityJob({
      jobId: 'smoke-f', taskId: 'smoke', goalId: 'smoke', role: 'PLANNER',
      workspacePath: tmpDir, timeoutMs: 1,
    });
    results.F_timeout_kill = {
      ok: timeoutTest.status === 'FAILED' && /timeout/i.test(timeoutTest.failureReason ?? ''),
      detail: timeoutTest.failureReason ?? '(no falló por timeout — revisar spawnWithTimeout)',
    };

    // G — Permisos: pedirle algo que normalmente dispara una aprobación,
    // y confirmar que con --dangerously-skip-permissions no se cuelga esperando input
    await writeFile(path.join(tmpDir, 'TASK.md'), '# Test G\nCorré el comando de terminal `echo permtest` y después escribí RESULT.json con status ok.');
    const permTest = await runAntigravityJob({
      jobId: 'smoke-g', taskId: 'smoke', goalId: 'smoke', role: 'PLANNER',
      workspacePath: tmpDir, timeoutMs: 30_000,
    });
    results.G_permissions = {
      ok: permTest.exitCode !== null && !/timeout/i.test(permTest.failureReason ?? ''),
      detail: `status=${permTest.status} failureReason=${permTest.failureReason ?? '-'}`,
    };

    // H — Fallo deliberado: sin TASK.md, el runner debe rechazar ANTES de invocar agy
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
      detail: hFailedAsExpected ? 'Falló correctamente sin TASK.md' : 'NO falló — revisar assertFileExists en runner.ts',
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
