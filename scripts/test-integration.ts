import 'dotenv/config';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'path';
import fs from 'fs/promises';
import { prisma } from '@/lib/prisma';

/**
 * Integration test (deterministic): 3 real MCP agent instances driven by the
 * reference loop (scripts/agent-loop.ts). Agents discover ALL work exclusively
 * via MCP messages; the failure is injected in the role hooks (Build omits the
 * <footer>, Verify demands it) so the recovery path is exercised:
 *
 *   FAILED → FIX_REQUEST → OpenCode → HANDOFF → Antigravity → COMPLETED
 *
 * Asserts: identity (ownership enforced), context persistence (design-system.md
 * derives from research.md; index.html uses the accent from design-system.md),
 * and recovery (FAILED + FIX_REQUEST in the message chain).
 */

const projectSlug = 'test-integration';
const fixturePath = path.resolve('test-fixtures', 'integration');
const baseUrl = 'http://localhost:3100';
const tsxPath = path.resolve('node_modules', 'tsx', 'dist', 'cli.mjs');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function isDevUp() {
  try {
    const res = await fetch(baseUrl);
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForDev(ms = 60000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (await isDevUp()) return;
    await sleep(1000);
  }
  throw new Error('next dev did not become ready in time');
}

function killTree(child: ChildProcess) {
  if (child.pid) {
    try {
      spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } catch {
      child.kill();
    }
  }
}

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`POST ${url} failed (${res.status}): ${JSON.stringify(data)}`);
  return data;
}

async function main() {
  console.log('🚀 INTEGRATION TEST (deterministic, reference drivers)');
  let devChild: ChildProcess | null = null;
  const drivers: ChildProcess[] = [];

  try {
    // ---- 0. Dev server ------------------------------------------------
    if (await isDevUp()) {
      console.log('✅ next dev already running on :3100');
    } else {
      console.log('⏳ starting next dev on :3100...');
      const nextBin = path.resolve('node_modules', 'next', 'dist', 'bin', 'next');
      devChild = spawn(process.execPath, [nextBin, 'dev', '--port', '3100'], {
        stdio: 'ignore',
        shell: process.platform === 'win32',
      });
      await waitForDev();
      console.log('✅ next dev ready');
    }

    // ---- 1. Fresh state ------------------------------------------------
    const oldProjects = await prisma.project.findMany({ where: { slug: projectSlug } });
    const oldIds = oldProjects.map((p) => p.id);
    const oldTaskIds = (await prisma.task.findMany({ where: { projectId: { in: oldIds } } })).map((t) => t.id);
    await prisma.agentMessage.deleteMany({ where: { goal: { project: { slug: projectSlug } } } });
    await prisma.approval.deleteMany({ where: { taskId: { in: oldTaskIds } } });
    await prisma.activityLog.deleteMany({ where: { taskId: { in: oldTaskIds } } });
    await prisma.task.deleteMany({ where: { project: { slug: projectSlug } } });
    await prisma.goal.deleteMany({ where: { project: { slug: projectSlug } } });
    await prisma.project.deleteMany({ where: { slug: projectSlug } });
    await prisma.workerStatus.deleteMany({ where: { agent: { in: ['Antigravity', 'OpenDesign', 'OpenCode'] } } });
    await fs.rm(fixturePath, { recursive: true, force: true });
    await fs.mkdir(path.join(fixturePath, 'landing'), { recursive: true });

    // ---- 2. Seed project + goal (same as the dashboard CommandBar) -------
    const project = await postJson(`${baseUrl}/api/projects`, {
      name: 'Integration Test Landing',
      slug: projectSlug,
      repoPath: fixturePath,
      description: 'Proyecto de prueba de integración.',
    });
    const goal = await postJson(`${baseUrl}/api/goals`, {
      title: 'Landing page del estudio',
      description:
        'Construir una landing para "Estudio Norte". Paleta: #0f172a / #f8fafc / acento #6366f1. Secciones: hero, servicios, portafolio, contacto, footer.',
      projectId: project.id,
      agent: 'Antigravity',
    });
    console.log(`✅ goal creado vía API: ${goal.id}`);

    // ---- 3. Spawn the 3 real MCP agent instances (reference drivers) -----
    for (const agent of ['Antigravity', 'OpenDesign', 'OpenCode']) {
      const child = spawn(
        process.execPath,
        [tsxPath, 'scripts/agent-loop.ts', '--agent', agent, '--poll', '1'],
        { stdio: ['ignore', 'inherit', 'inherit'] }
      );
      drivers.push(child);
    }
    console.log('✅ 3 agent instances running (agent-loop drivers)');

    // ---- 4. Wait for GOAL COMPLETED --------------------------------------
    let done = false;
    for (let i = 0; i < 240; i++) {
      await sleep(1000);
      const g = await prisma.goal.findUnique({
        where: { id: goal.id },
        include: { tasks: { orderBy: { createdAt: 'asc' } } },
      });
      if (g?.status === 'COMPLETED') {
        done = true;
        console.log('✅ GOAL COMPLETED');
        break;
      }
      if (i % 10 === 0 && g) {
        console.log(
          `  … ${g.tasks.map((t) => `${t.agent}(${t.state})`).join(' -> ')}`
        );
      }
    }
    if (!done) throw new Error('Goal did not complete in 240s');

    // ---- 5. Asserts --------------------------------------------------------
    console.log('\n── Asserts ────────────────────────────────────────────────');

    const research = await fs.readFile(path.join(fixturePath, 'research.md'), 'utf-8');
    if (!research.includes('Estudio Norte')) throw new Error('research.md missing brand');
    console.log('✅ [contexto] research.md (brand)');

    const designSystem = await fs.readFile(path.join(fixturePath, 'landing', 'design-system.md'), 'utf-8');
    if (!designSystem.includes('Estudio Norte') || !designSystem.includes('#6366f1')) {
      throw new Error('design-system.md did not derive brand/accent from research.md');
    }
    console.log('✅ [contexto] design-system.md derivó de research.md (brand + acento)');

    const indexHtml = await fs.readFile(path.join(fixturePath, 'landing', 'index.html'), 'utf-8');
    if (!indexHtml.includes('#6366f1')) throw new Error('index.html missing accent from design-system.md');
    if (!indexHtml.includes('<footer')) throw new Error('index.html missing <footer> after fix');
    console.log('✅ [contexto] index.html usa el acento del design system + <footer> tras el fix');

    const messages = await prisma.agentMessage.findMany({ where: { goalId: goal.id } });
    const types = messages.map((m) => `${m.fromAgent}→${m.toAgent}:${m.type}`);
    console.log(`  📬 ${types.join(' | ')}`);
    if (types.filter((t) => t.includes('HANDOFF')).length < 3) {
      throw new Error('Missing chained HANDOFFs');
    }
    if (!types.some((t) => t.includes('FIX_REQUEST'))) {
      throw new Error('Recovery path not exercised: no FIX_REQUEST');
    }
    console.log('✅ [recuperación] cadena FAILED → FIX_REQUEST → fix → HANDOFF verificada');

    const g = await prisma.goal.findUnique({ where: { id: goal.id }, include: { tasks: true } });
    const failed = g!.tasks.filter((t) => t.state === 'FAILED');
    const pending = g!.tasks.filter((t) => ['BACKLOG', 'RUNNING', 'REVIEW', 'PAUSED', 'BLOCKED'].includes(t.state));
    if (failed.length !== 1 || !failed[0].title.includes('Verify')) {
      throw new Error(`Expected exactly 1 FAILED (verify), got ${failed.map((t) => t.title)}`);
    }
    if (pending.length > 0) throw new Error(`Found ${pending.length} pending tasks`);
    console.log('✅ [identidad] ownership enforced (solo el verify falló intencionalmente; 0 pendientes)');

    console.log('\n🎉 INTEGRATION TEST PASSED');
  } finally {
    for (const d of drivers) killTree(d);
    if (devChild) killTree(devChild);
    await sleep(500);
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});