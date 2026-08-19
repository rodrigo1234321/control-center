import 'dotenv/config';
import { runAntigravityJob } from '../src/workers/antigravity/runner';
import { createJobWorkspace, destroyJobWorkspace } from '../src/workers/antigravity/workspace-manager';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

async function main() {
  console.log('Testing live Antigravity execution with agy.exe (180s timeout)...');
  const jobId = `live-test-${Date.now()}`;
  const repoPath = path.resolve('temp-repos', 'live-test');
  await mkdir(repoPath, { recursive: true });

  const workspacePath = await createJobWorkspace(jobId, repoPath, 'main');
  console.log('Workspace created:', workspacePath);

  await writeFile(
    path.join(workspacePath, 'TASK.md'),
    '# Tarea de prueba\nEscribi un archivo index.html con un h1 que diga Hola Control Center.',
    'utf-8'
  );

  console.log('Running Antigravity job with --dangerously-skip-permissions...');
  const result = await runAntigravityJob({
    jobId,
    taskId: 'test-task-1',
    goalId: 'test-goal',
    role: 'PLANNER',
    workspacePath,
    timeoutMs: 180000,
  });

  console.log('\nAntigravity Result Status:', result.status);
  console.log('Exit Code:', result.exitCode);
  console.log('Files Changed:', result.filesChanged);
  console.log('Result JSON:', result.resultFileContent);
  if (result.failureReason) console.log('Failure Reason:', result.failureReason);

  await destroyJobWorkspace(jobId);
}

main().catch(console.error);
