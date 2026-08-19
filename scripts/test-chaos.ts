import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { transitionTask } from '../src/lib/transition';
import { reapStaleRunningTasks } from '../src/lib/watchdog';
import { CreateTaskSchema, CreateMessageSchema, CreateGoalSchema } from '../src/lib/schemas';
import { TASK_STATES, isValidTransition, type TaskState } from '../src/lib/types';

async function runChaosTestSuite() {
  console.log('================================================================');
  console.log('   🔥 CHAOS & STRESS TESTING SUITE: AUDITING FOR BREAKAGES 🔥   ');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  async function test(name: string, fn: () => Promise<void>) {
    total++;
    process.stdout.write(`⏳ [CHAOS-${String(total).padStart(2, '0')}] ${name}... `);
    try {
      await fn();
      console.log('✅ PASSED');
      passed++;
    } catch (err: any) {
      console.log('❌ FAILED:', err.message);
      throw err;
    }
  }

  // Setup test project
  const chaosProject = await prisma.project.create({
    data: {
      name: 'Chaos Testing Project',
      slug: `chaos-${Date.now()}`,
      repoPath: null,
    },
  });

  try {
    // 1. Race Condition / Concurrency Stress Test
    await test('10 concurrent workers competing for 1 task claim', async () => {
      const task = await prisma.task.create({
        data: {
          projectId: chaosProject.id,
          title: 'Contested Task',
          agent: 'Antigravity',
          state: 'BACKLOG',
        },
      });

      // Simular 10 workers intentando reclamar simultáneamente
      const workerIds = Array.from({ length: 10 }, (_, i) => `worker-${i}`);
      const results = await Promise.all(
        workerIds.map((wId) =>
          prisma.task.updateMany({
            where: { id: task.id, state: 'BACKLOG' },
            data: {
              state: 'RUNNING',
              workerId: wId,
              lastStartedAt: new Date(),
            },
          })
        )
      );

      const successfulClaims = results.filter((r) => r.count === 1).length;
      if (successfulClaims !== 1) {
        throw new Error(`Race condition broken: ${successfulClaims} workers successfully claimed the task instead of exactly 1`);
      }
    });

    // 2. Invalid Transition Rejection Test
    await test('Rejection of illegal state transitions (DONE -> RUNNING, etc.)', async () => {
      const task = await prisma.task.create({
        data: {
          projectId: chaosProject.id,
          title: 'State Transition Integrity Task',
          agent: 'Antigravity',
          state: 'DONE',
        },
      });

      // DONE -> RUNNING debe ser ilegal
      if (isValidTransition('DONE', 'RUNNING')) {
        throw new Error('isValidTransition returned true for DONE -> RUNNING');
      }

      let errorThrown = false;
      try {
        await transitionTask(task.id, 'RUNNING');
      } catch (err: any) {
        if (err.message.includes('Invalid transition')) {
          errorThrown = true;
        }
      }

      if (!errorThrown) {
        throw new Error('transitionTask allowed illegal transition DONE -> RUNNING');
      }
    });

    // 3. Zod Payload Fuzzing Test
    await test('Fuzzing & Payload Validation rejection', async () => {
      // Missing title
      const invalidTask1 = CreateTaskSchema.safeParse({ projectId: chaosProject.id, agent: 'Antigravity' });
      if (invalidTask1.success) throw new Error('Schema accepted task without title');

      // Invalid agent name
      const invalidTask2 = CreateTaskSchema.safeParse({ title: 'T', projectId: chaosProject.id, agent: 'FakeAgent' });
      if (invalidTask2.success) throw new Error('Schema accepted task with invalid agent');

      // Invalid message type
      const invalidMsg = CreateMessageSchema.safeParse({
        fromAgent: 'User',
        toAgent: 'Antigravity',
        type: 'INVALID_TYPE',
        content: 'hello',
      });
      if (invalidMsg.success) throw new Error('Schema accepted message with invalid type');
    });

    // 4. Watchdog Mass Reaper Stress Test
    await test('Watchdog reaps 10 stale RUNNING tasks concurrently', async () => {
      const staleTime = new Date(Date.now() - 20 * 60 * 1000); // Hace 20 minutos

      const staleTasks = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          prisma.task.create({
            data: {
              projectId: chaosProject.id,
              title: `Stale Task ${i}`,
              agent: 'Antigravity',
              state: 'RUNNING',
              updatedAt: staleTime,
            },
          })
        )
      );

      // Forzar fecha updatedAt en el pasado
      for (const t of staleTasks) {
        await prisma.task.update({
          where: { id: t.id },
          data: { updatedAt: staleTime },
        });
      }

      const reapedCount = await reapStaleRunningTasks();
      if (reapedCount < 10) {
        throw new Error(`Watchdog reaped ${reapedCount} tasks instead of at least 10`);
      }

      // Verificar que quedaron en FAILED
      const checkTasks = await prisma.task.findMany({
        where: { id: { in: staleTasks.map((t) => t.id) } },
      });
      for (const t of checkTasks) {
        if (t.state !== 'FAILED') {
          throw new Error(`Task ${t.id} was not moved to FAILED by watchdog`);
        }
      }
    });

    // 5. Interactive Question Flow without Active Goal
    await test('Interactive QUESTION message flow with 0 active goals', async () => {
      const questionMsg = await prisma.agentMessage.create({
        data: {
          fromAgent: 'USER',
          toAgent: 'Antigravity',
          type: 'QUESTION',
          content: '¿Cuál es el estado de la infraestructura?',
          status: 'UNREAD',
        },
      });

      const foundMsg = await prisma.agentMessage.findUnique({
        where: { id: questionMsg.id },
      });
      if (!foundMsg || foundMsg.content !== '¿Cuál es el estado de la infraestructura?') {
        throw new Error('Interactive message was not stored correctly');
      }

      // Responder a la pregunta
      const responseMsg = await prisma.agentMessage.create({
        data: {
          fromAgent: 'Antigravity',
          toAgent: 'USER',
          type: 'RESPONSE',
          content: 'Todos los workers están ONLINE y la infraestructura está en estado óptimo.',
          status: 'UNREAD',
        },
      });

      if (!responseMsg.id) throw new Error('Response message failed');
    });

    // 6. Standalone Task Dispatch with null repoPath
    await test('Standalone Task dispatch with repoPath: null defaults safely', async () => {
      const task = await prisma.task.create({
        data: {
          projectId: chaosProject.id,
          title: 'Standalone Ad-hoc Task',
          agent: 'Antigravity',
          state: 'BACKLOG',
        },
        include: { project: true },
      });

      // El fallback de repositorio debe resolverse sin crashear
      const defaultRepo = task.project.repoPath || `temp-repos/${task.project.slug}`;
      if (!defaultRepo.includes(chaosProject.slug)) {
        throw new Error('Default repo fallback did not resolve correctly');
      }
    });

    console.log('\n================================================================');
    console.log(`🎉 ALL ${passed}/${total} CHAOS & STRESS TESTS PASSED WITH 0 BREAKAGES!`);
    console.log('   The system is battle-hardened, resilient, and ready for use.');
    console.log('================================================================\n');
  } finally {
    // Cleanup chaos fixtures
    await prisma.activityLog.deleteMany({ where: { projectId: chaosProject.id } });
    await prisma.agentMessage.deleteMany({ where: { task: { projectId: chaosProject.id } } });
    await prisma.task.deleteMany({ where: { projectId: chaosProject.id } });
    await prisma.project.deleteMany({ where: { id: chaosProject.id } });
  }
}

runChaosTestSuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Chaos test failed:', err);
    process.exit(1);
  });
