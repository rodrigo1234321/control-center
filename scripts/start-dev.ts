import 'dotenv/config';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { EnvironmentValidator } from '../src/lib/env-validator';
import { reapStaleRunningTasks } from '../src/lib/watchdog';

// Validación temprana de variables críticas antes de spawnear
EnvironmentValidator.validateDatabase('Supervisor');

const nextBin = path.resolve('node_modules', 'next', 'dist', 'bin', 'next');
const tsxBin = path.resolve('node_modules', 'tsx', 'dist', 'cli.mjs');

interface ManagedProcess {
  name: string;
  command: string;
  args: string[];
  child?: ChildProcess;
}

// Invocamos node.exe (process.execPath) directamente, evitando la capa de batch (.cmd)
// y previniendo el error EINVAL de Node en Windows.
const processes: ManagedProcess[] = [
  {
    name: 'Control Center (Web :3100)',
    command: process.execPath,
    args: [nextBin, 'dev', '--port', '3100'],
  },
  {
    name: 'Antigravity Driver',
    command: process.execPath,
    args: [tsxBin, 'src/workers/antigravity/driver.ts'],
  },
  {
    name: 'OpenCode Driver',
    command: process.execPath,
    args: [tsxBin, 'src/workers/opencode/driver.ts'],
  },
];

function startProcess(proc: ManagedProcess) {
  console.log(`[SUPERVISOR] Levantando ${proc.name}...`);

  proc.child = spawn(proc.command, proc.args, {
    cwd: process.cwd(),
    env: { ...process.env },
    stdio: 'inherit',
    shell: false,
  });

  proc.child.on('close', (code) => {
    console.log(`[SUPERVISOR] ${proc.name} finalizó (exit code: ${code})`);
  });

  proc.child.on('error', (err) => {
    console.error(`[SUPERVISOR ERROR en ${proc.name}]: ${err.message}`);
  });
}

// Watchdog activo en segundo plano para liberar tareas RUNNING huérfanas (#9)
const watchdogInterval = setInterval(async () => {
  try {
    await reapStaleRunningTasks();
  } catch (err: any) {
    console.error('[SUPERVISOR Watchdog Error]:', err.message);
  }
}, 60_000);

function killAll() {
  console.log('\n[SUPERVISOR] Apagando todos los servicios...');
  clearInterval(watchdogInterval);
  for (const proc of processes) {
    if (proc.child && proc.child.pid) {
      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', proc.child.pid.toString(), '/t', '/f'], { stdio: 'ignore' });
        } else {
          proc.child.kill('SIGTERM');
        }
      } catch {}
    }
  }
  process.exit(0);
}

console.log('========================================');
console.log('  CONTROL CENTER + WORKERS SUPERVISOR   ');
console.log('========================================\n');

for (const proc of processes) {
  startProcess(proc);
}

process.on('SIGINT', killAll);
process.on('SIGTERM', killAll);
