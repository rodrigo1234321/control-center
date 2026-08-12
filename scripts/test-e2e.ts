import 'dotenv/config';
import { prisma } from '@/lib/prisma';
import { spawn } from 'node:child_process';
import fs from 'fs/promises';
import path from 'path';

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('🚀 Starting E2E Autonomous Engine Test...');
  let workers: any[] = [];
  
  let isCleaningUp = false;

  const cleanupWorkers = async () => {
    if (isCleaningUp) return;
    isCleaningUp = true;
    console.log('\n[E2E] Gracefully shutting down workers...');
    
    for (const agent of ['OpenCode', 'OpenHands']) {
      await prisma.agentMessage.create({
        data: {
          fromAgent: 'System',
          toAgent: agent,
          type: 'CONTROL',
          content: 'STOP',
        }
      });
    }

    const workersExited = Promise.all(workers.map(w => new Promise(res => {
      w.on('exit', res);
      w.on('close', res);
    })));

    // Wait up to 5 seconds for them to shut down
    let timedOut = false;
    await Promise.race([
      workersExited,
      sleep(5000).then(() => { timedOut = true; })
    ]);

    if (timedOut) {
      console.log('?? Workers did not exit cleanly within 5 seconds, forcefully killing...');
      workers.forEach(w => w.kill());
    } else {
      console.log('? Workers shut down gracefully.');
    }
  };

  process.on('SIGINT', async () => {
    console.log('\nReceived SIGINT. Cleaning up...');
    await cleanupWorkers();
    process.exit(1);
  });

  process.on('SIGTERM', async () => {
    console.log('\nReceived SIGTERM. Cleaning up...');
    await cleanupWorkers();
    process.exit(1);
  });

  try {
    // 1. Get or create the isolated test project
    const projectSlug = 'control-center-e2e';
    let project = await prisma.project.findUnique({
      where: { slug: projectSlug },
    });

    if (!project) {
      project = await prisma.project.create({
        data: {
          slug: projectSlug,
          name: 'E2E Test Project',
          description: 'Isolated project for E2E tests',
          repoPath: path.resolve('./test-fixtures/e2e-project'),
        }
      });
    }
    
    const targetFile = path.join(project.repoPath!, 'landing', 'index.html');
    try { await fs.rm(targetFile, { force: true }); } catch (e) {}
    try { await fs.mkdir(path.dirname(targetFile), { recursive: true }); } catch (e) {}

    // 2. Create Goal
    console.log('\n[E2E] Creating Goal...');
    const goal = await prisma.goal.create({
      data: {
        title: 'Build Landing Page',
        description: 'Create a modern landing page for a new product.',
        projectId: project.id,
        status: 'ACTIVE',
      },
    });
    console.log(`Goal created: ${goal.id}`);

    // 3. Plan tasks
    console.log('\n[E2E] Planning tasks...');
    const buildTask = await prisma.task.create({
      data: {
        title: 'Frontend Implementation',
        description: 'Build React components',
        agent: 'OpenCode',
        nextAgent: 'OpenHands',
        goalId: goal.id,
        projectId: goal.projectId,
        state: 'BACKLOG',
      },
    });

    const qaTask = await prisma.task.create({
      data: {
        title: 'QA',
        description: 'Test the implementation',
        agent: 'OpenHands',
        onFailureAgent: 'OpenCode', 
        goalId: goal.id,
        projectId: goal.projectId,
        state: 'BACKLOG',
      },
    });

    await prisma.agentMessage.create({
      data: {
        goalId: goal.id,
        taskId: buildTask.id,
        fromAgent: 'USER',
        toAgent: 'OpenCode',
        type: 'REQUEST',
        content: `ACTION REQUIRED: Please begin development.`
      }
    });

    // 4. Start dummy workers in background using node/tsx natively
    console.log('\n[E2E] Starting Dummy Workers...');
    const tsxPath = path.resolve('node_modules', 'tsx', 'dist', 'cli.mjs');
    
    const openCodeChild = spawn(process.execPath, [tsxPath, 'scripts/dummy-worker.ts', '--agent', 'OpenCode', '--poll', '2'], { shell: false });
    openCodeChild.stdout?.on('data', (data) => process.stdout.write(`[OpenCode] ${data}`));
    openCodeChild.stderr?.on('data', (data) => process.stdout.write(`[OpenCode ERR] ${data}`));
    
    const openHandsChild = spawn(process.execPath, [tsxPath, 'scripts/dummy-worker.ts', '--agent', 'OpenHands', '--poll', '2', '--fail-once'], { shell: false });
    openHandsChild.stdout?.on('data', (data) => process.stdout.write(`[OpenHands] ${data}`));
    openHandsChild.stderr?.on('data', (data) => process.stdout.write(`[OpenHands ERR] ${data}`));

    workers = [openCodeChild, openHandsChild];

    // 5. Poll for Goal completion
    let attempts = 0;
    let success = false;
    
    console.log('\n[E2E] Waiting for Goal completion...');
    while (attempts < 45) { // 90s max
      await sleep(2000);
      const checkGoal = await prisma.goal.findUnique({
        where: { id: goal.id },
        include: { tasks: { orderBy: { createdAt: 'asc' } } }
      });

      if (checkGoal?.status === 'COMPLETED') {
        success = true;
        console.log('\n✅ Goal state is COMPLETED');
        break;
      }
      
      if (checkGoal) {
        const states = checkGoal.tasks.map(t => `${t.agent}(${t.state})`).join(' -> ');
        console.log(`Current state: ${states}`);
      }
      attempts++;
    }

    if (!success) {
      console.error('\n❌ E2E TEST FAILED: Goal did not complete in time.');
      process.exitCode = 1;
      return;
    }

    // 6. Final Asserts
    console.log('\n[E2E] Running final assertions...');
    
    // Assert FileSystem
    const fileContent = await fs.readFile(targetFile, 'utf-8');
    if (!fileContent.includes('FIXED HTML')) {
      console.error(`❌ File content assertion failed. Expected "FIXED HTML", got: ${fileContent}`);
      process.exitCode = 1;
      return;
    }
    console.log('✅ FileSystem Assert Passed');

    // Assert Messages
    const messages = await prisma.agentMessage.findMany({ where: { goalId: goal.id } });
    const hasRequest = messages.some(m => m.type === 'REQUEST' && m.status === 'RESOLVED');
    const hasFixRequest = messages.some(m => m.type === 'FIX_REQUEST' && m.status === 'RESOLVED');
    const hasHandoff = messages.some(m => m.type === 'HANDOFF' && m.status === 'RESOLVED');

    if (!hasRequest || !hasFixRequest || !hasHandoff) {
      console.error('❌ DB Assert Failed: Missing RESOLVED messages (REQUEST, HANDOFF, or FIX_REQUEST).');
      process.exitCode = 1;
      return;
    }
    console.log('✅ Messages Assert Passed: Found RESOLVED REQUEST, HANDOFF, and FIX_REQUEST');

    // Assert Tasks
    const checkGoal = await prisma.goal.findUnique({
      where: { id: goal.id },
      include: { tasks: true }
    });
    const pendingTasks = checkGoal!.tasks.filter(t => ['BACKLOG', 'RUNNING', 'PAUSED', 'BLOCKED'].includes(t.state));
    if (pendingTasks.length > 0) {
      console.error(`❌ DB Assert Failed: Found ${pendingTasks.length} pending tasks, expected 0.`);
      process.exitCode = 1;
      return;
    }
    console.log('✅ Tasks Assert Passed: 0 pending tasks');

    // Assert ActivityLog
    const logs = await prisma.activityLog.findMany({ 
      where: { taskId: { in: messages.map(m => m.taskId).filter(Boolean) as string[] } },
      orderBy: { timestamp: 'asc' }
    });
    
    const actions = logs.map(l => `${l.action} ${l.details || ''}`).join(' | ');
    if (!actions.includes('FAILED') || !actions.includes('Auto-fix assigned to OpenCode')) {
      console.error('❌ DB Assert Failed: ActivityLog sequence incomplete. Got: ' + actions);
      process.exitCode = 1;
      return;
    }
    console.log(`✅ ActivityLog Assert Passed: Recorded ${logs.length} events during the flow.`);

    console.log('\n🎉 ALL E2E ASSERTS PASSED! The Autonomous Engine works end-to-end!');

  } finally {
    await cleanupWorkers();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
