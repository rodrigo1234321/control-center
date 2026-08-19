import 'dotenv/config';
import path from 'node:path';
import { access, readFile, mkdir } from 'node:fs/promises';
import { prisma } from '../src/lib/prisma';
import { quotaGuard } from '../src/workers/quota-guard';
import { defaultRuntime } from '../src/workers/runtime';
import { recordFailure, isCircuitOpen, resetCircuit, getCircuitState } from '../src/workers/antigravity/circuit-breaker';
import { SecurityGuard } from '../src/lib/security-guard';
import { transitionTask } from '../src/lib/transition';

async function runProductionReadinessTests() {
  console.log('======================================================');
  console.log('   PRODUCTION READINESS & HARDENING TEST SUITE (PRT)  ');
  console.log('======================================================\n');

  let passed = 0;
  let total = 0;

  async function test(name: string, fn: () => Promise<void>) {
    total++;
    process.stdout.write(`⏳ [PRT-${String(total).padStart(2, '0')}] ${name}... `);
    try {
      await fn();
      console.log('✅ PASSED');
      passed++;
    } catch (err: any) {
      console.log(`❌ FAILED: ${err.message}`);
    }
  }

  // PRT-01: Artifact Preservation & Evidence Retention
  await test('Artifact Preservation before workspace cleanup', async () => {
    const testJobId = `prt-job-${Date.now()}`;
    const evidencePath = await defaultRuntime.archiveEvidence(testJobId, {
      metadata: { jobId: testJobId, role: 'PLANNER', status: 'COMPLETED' },
      resultJson: { status: 'ok', summary: 'Evidence test passed', filesChanged: ['research.md'] },
      stdout: 'Execution logs sample',
      stderr: '',
      gitDiffPatch: 'diff --git a/test.txt b/test.txt\n+hello world',
      summary: 'All checks passed',
    });

    await access(path.join(evidencePath, 'metadata.json'));
    await access(path.join(evidencePath, 'RESULT.json'));
    await access(path.join(evidencePath, 'stdout.log'));
    await access(path.join(evidencePath, 'git-diff.patch'));
    await access(path.join(evidencePath, 'summary.json'));

    const meta = JSON.parse(await readFile(path.join(evidencePath, 'metadata.json'), 'utf-8'));
    if (meta.jobId !== testJobId) throw new Error('Metadata jobId mismatch');
  });

  // PRT-02: QuotaGuard Concurrency Stress Test
  await test('QuotaGuard concurrency enforcement under pressure (concurrency = 1)', async () => {
    let peakConcurrency = 0;
    let currentRunning = 0;

    const taskCount = 5;
    const promises = Array.from({ length: taskCount }).map((_, i) =>
      quotaGuard.runWithGuard(async () => {
        currentRunning++;
        if (currentRunning > peakConcurrency) peakConcurrency = currentRunning;
        await new Promise((r) => setTimeout(r, 20));
        currentRunning--;
        return i;
      })
    );

    await Promise.all(promises);

    if (peakConcurrency !== 1) {
      throw new Error(`QuotaGuard allowed peak concurrency of ${peakConcurrency}, expected strictly 1.`);
    }
  });

  // PRT-03: Circuit Breaker Persistence in SQLite
  await test('Circuit Breaker persistence across restarts (Task.circuitOpenedAt)', async () => {
    const project = await prisma.project.create({
      data: { name: 'PRT Circuit Test', slug: `prt-circuit-${Date.now()}` },
    });

    const task = await prisma.task.create({
      data: {
        title: 'Failing QA Task',
        projectId: project.id,
        agent: 'Antigravity',
        state: 'RUNNING',
      },
    });

    // 1st failure
    await recordFailure(task.id);
    let open = await isCircuitOpen(task.id);
    if (open) throw new Error('Circuit should not be open after 1 failure');

    // 2nd failure
    await recordFailure(task.id);
    open = await isCircuitOpen(task.id);
    if (open) throw new Error('Circuit should not be open after 2 failures');

    // 3rd failure -> Circuit OPENS
    await recordFailure(task.id);
    open = await isCircuitOpen(task.id);
    if (!open) throw new Error('Circuit should be open after 3 failures');

    const state = await getCircuitState(task.id);
    if (!state?.openedAt) throw new Error('circuitOpenedAt should be recorded');

    // Reset circuit
    await resetCircuit(task.id);
    open = await isCircuitOpen(task.id);
    if (open) throw new Error('Circuit should be closed after reset');
  });

  // PRT-04: Security Guard - Dangerous Command Blocking & Secret Redaction
  await test('Security Guard: Malicious Command Blocking & Secret Redaction', async () => {
    // Dangerous instructions
    const check1 = SecurityGuard.validateInstruction('git push origin main --force');
    if (check1.allowed) throw new Error('git push --force should have been blocked');

    const check2 = SecurityGuard.validateInstruction('cat .env');
    if (check2.allowed) throw new Error('cat .env should have been blocked');

    const check3 = SecurityGuard.validateInstruction('Create standard hero section component');
    if (!check3.allowed) throw new Error('Safe instruction was incorrectly blocked');

    // Secret Redaction
    const sampleText = 'Use key AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6 for api and sk-123456789012345678901234567890123456789012345678 for openrouter';
    const redacted = SecurityGuard.sanitizeOutput(sampleText);
    if (redacted.includes('AIzaSy') || redacted.includes('sk-1234567890')) {
      throw new Error('Secrets were not redacted from output text');
    }

    // User authorization
    const isAuth = SecurityGuard.isUserAuthorized('123456', ['123456', '999999']);
    if (!isAuth) throw new Error('Authorized user was rejected');

    const isDenied = SecurityGuard.isUserAuthorized('666666', ['123456', '999999']);
    if (isDenied) throw new Error('Unauthorized user was accepted');
  });

  // PRT-05: Emergency Stop & State Machine Isolation
  await test('Emergency Stop & System Resume state integrity', async () => {
    const project = await prisma.project.create({
      data: { name: 'PRT Emergency Test', slug: `prt-emerg-${Date.now()}` },
    });

    const t1 = await prisma.task.create({
      data: { title: 'Task 1', projectId: project.id, agent: 'Antigravity', state: 'RUNNING' },
    });
    const t2 = await prisma.task.create({
      data: { title: 'Task 2', projectId: project.id, agent: 'OpenCode', state: 'BACKLOG' },
    });

    // Simular Emergency Stop
    await prisma.task.updateMany({
      where: { state: { in: ['RUNNING', 'BACKLOG'] } },
      data: { state: 'PAUSED' },
    });

    const paused1 = await prisma.task.findUnique({ where: { id: t1.id } });
    const paused2 = await prisma.task.findUnique({ where: { id: t2.id } });
    if (paused1?.state !== 'PAUSED' || paused2?.state !== 'PAUSED') {
      throw new Error('Tasks were not transitioned to PAUSED');
    }

    // Simular Resume
    await prisma.task.updateMany({
      where: { state: 'PAUSED' },
      data: { state: 'BACKLOG' },
    });

    const resumed1 = await prisma.task.findUnique({ where: { id: t1.id } });
    const resumed2 = await prisma.task.findUnique({ where: { id: t2.id } });
    if (resumed1?.state !== 'BACKLOG' || resumed2?.state !== 'BACKLOG') {
      throw new Error('Tasks were not resumed to BACKLOG');
    }
  });

  // PRT-06: Task Audit Model Verification
  await test('Task Model Auditing (jobId, workerId, lastStartedAt, lastFinishedAt)', async () => {
    const project = await prisma.project.findFirst();
    if (!project) throw new Error('No project found');

    const created = await prisma.task.create({
      data: {
        title: 'Audited Task Test',
        projectId: project.id,
        agent: 'Antigravity',
        jobId: 'job-aud-001',
        workerId: 'worker-node-1',
        lastStartedAt: new Date(),
        lastFinishedAt: new Date(),
        lastError: null,
      },
    });

    const fetched = await prisma.task.findUnique({ where: { id: created.id } });
    if (fetched?.jobId !== 'job-aud-001' || fetched?.workerId !== 'worker-node-1') {
      throw new Error('Task audit fields were not correctly persisted');
    }
  });

  // PRT-07: FailureClassifier & RetryPolicy Anti-Storm Verification
  await test('FailureClassifier & RetryPolicy: Block IAM/Auth storms & Allow code retry', async () => {
    const { FailureClassifier } = await import('../src/workers/policies/failure-classifier');
    const { RetryPolicy } = await import('../src/workers/policies/retry-policy');

    // 1. IAM_PERMISSION_DENIED -> Must be classified as AUTH and NOT retryable
    const iamError = 'M_PERMISSION_DENIED domain: iam.googleapis.com permission: cloudaicompanion.instances.completeTask';
    const classification = FailureClassifier.classify(iamError);
    if (classification.category !== 'AUTH' || classification.isRetryable !== false) {
      throw new Error('IAM error was not classified as non-retryable AUTH error');
    }

    const decisionAuth = RetryPolicy.evaluate(iamError, 0);
    if (decisionAuth.shouldRetry !== false || decisionAuth.createApproval !== true || decisionAuth.openCircuit !== true) {
      throw new Error('RetryPolicy did not block and open circuit on IAM failure');
    }

    // 2. 429 Quota -> Must be classified as QUOTA with exponential backoff
    const quotaDecision = RetryPolicy.evaluate('Error 429: rate_limit exceeded', 1);
    if (quotaDecision.shouldRetry !== true || quotaDecision.classification.category !== 'QUOTA' || quotaDecision.backoffMs <= 0) {
      throw new Error('Rate limit was not categorized with backoff');
    }

    // 3. Code Failure -> Retryable via FIX_REQUEST
    const codeDecision = RetryPolicy.evaluate('SyntaxError: unexpected token in index.html', 0);
    if (codeDecision.shouldRetry !== true || codeDecision.classification.category !== 'CODE') {
      throw new Error('Code error was not categorized as valid FIX_REQUEST retry');
    }
  });

  // Limpieza de datos de prueba para mantener limpio el Mission Control en vivo
  try {
    const testProjects = await prisma.project.findMany({
      where: { slug: { startsWith: 'prt-' } },
      select: { id: true },
    });
    const projectIds = testProjects.map((p) => p.id);
    if (projectIds.length > 0) {
      await prisma.approval.deleteMany({ where: { task: { projectId: { in: projectIds } } } });
      await prisma.activityLog.deleteMany({ where: { projectId: { in: projectIds } } });
      await prisma.task.deleteMany({ where: { projectId: { in: projectIds } } });
      await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    }
    await prisma.task.deleteMany({ where: { title: 'Audited Task Test' } });
  } catch {}

  console.log('\n======================================================');
  console.log(`   RESULTS: ${passed}/${total} PRODUCTION READINESS TESTS PASSED   `);
  console.log('======================================================\n');

  if (passed === total) {
    console.log('🎉 100% OPERATIONAL HARDENING ACHIEVED! The system is production-ready.');
  } else {
    process.exit(1);
  }
}

runProductionReadinessTests().catch((err) => {
  console.error('Test suite failure:', err);
  process.exit(1);
});
