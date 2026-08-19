import 'dotenv/config';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { TextContent } from '@modelcontextprotocol/sdk/types.js';
import path from 'path';
import fs from 'fs/promises';
import { prisma } from '@/lib/prisma';

/**
 * Demo: "Landing page de un estudio de diseño" — el flujo real de agentes
 * conectados vía MCP, coordinados por Control Center.
 *
 *   Antigravity  → research + scaffold (carpeta del proyecto)
 *   OpenDesign   → design system
 *   OpenCode     → build de la landing (index.html, sin <footer>)
 *   Antigravity  → verify & fix: detecta que falta el footer → fail_task
 *   OpenCode     → [FIX] (engine: FIX_REQUEST, retryCount 1)
 *   Antigravity  → re-verifica → complete → GOAL COMPLETED
 */

const tsxPath = path.resolve('node_modules', 'tsx', 'dist', 'cli.mjs');
const serverPath = path.resolve('src', 'mcp', 'server.ts');
const projectSlug = 'demo-landing';
const repoPath = path.resolve('test-fixtures', 'demo-landing');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function connectAgent(name: string) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [tsxPath, serverPath, '--agent', name],
    cwd: process.cwd(),
    stderr: 'pipe',
  });
  transport.stderr?.on('data', (d: Buffer) => process.stdout.write(`  [${name}] ${d}`));
  const client = new Client({ name: `demo-${name}`, version: '0.0.1' });
  await client.connect(transport);
  return client;
}

type ClientLike = Awaited<ReturnType<typeof connectAgent>>;

async function call(client: ClientLike, name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) {
    const text = Array.isArray(result.content)
      ? result.content.map((c) => (c as TextContent).text).join('\n')
      : '';
    throw new Error(`Tool ${name} failed: ${text}`);
  }
  const text = Array.isArray(result.content)
    ? result.content.map((c) => (c as TextContent).text || '').join('\n')
    : '';
  return JSON.parse(text);
}

/** Wait until the agent has a BACKLOG task in the goal (handoff / fix request). */
async function waitForTask(
  client: ClientLike,
  goalId: string,
  agent: string,
  titleHint: string,
  maxMs = 20000
) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const { tasks } = await call(client, 'list_tasks', { agent, state: 'BACKLOG' });
    const found = tasks.find(
      (t: { goalId: string; title: string }) => t.goalId === goalId && t.title.includes(titleHint)
    );
    if (found) return found;
    await sleep(500);
  }
  throw new Error(`Timeout waiting for task "${titleHint}" of ${agent}`);
}

async function main() {
  console.log('🚀 DEMO: Coordinating 3 agents via MCP to build a landing page\n');

  const antigravity = await connectAgent('Antigravity');
  const openDesign = await connectAgent('OpenDesign');
  const openCode = await connectAgent('OpenCode');

  try {
    // ---- 0. Fresh project folder -----------------------------------------
    await fs.rm(repoPath, { recursive: true, force: true });
    await fs.mkdir(path.join(repoPath, 'landing', 'assets'), { recursive: true });

    // ---- 1. Antigravity: proyecto + goal ---------------------------------
    console.log('── Antigravity: crea el proyecto y el goal ────────────────');
    await call(antigravity, 'create_project', {
      name: 'Landing Estudio de Diseño',
      slug: projectSlug,
      repoPath,
      description: 'Landing page para un estudio de diseño (demo multi-agente).',
    });

    const { goal, planningTask } = await call(antigravity, 'create_goal', {
      title: 'Landing page del estudio',
      description: 'Investigar, diseñar y construir la landing; verificar y corregir el resultado.',
      projectSlug,
    });
    console.log(`  goal creado: ${goal.id}`);
    console.log(`  planning task: ${planningTask.title}`);

    // ---- 2. Antigravity: planning ----------------------------------------
    console.log('── Antigravity: lee el REQUEST, reclama y planifica ───────');
    const inbox = await call(antigravity, 'read_messages', { consume: true });
    console.log(`  📬 mensajes: ${inbox.count} (REQUEST de planning encontrado)`);

    await call(antigravity, 'claim_task', { taskId: planningTask.id });
    const plan = await call(antigravity, 'plan_goal', {
      goalId: goal.id,
      tasks: [
        {
          title: 'Research & Scaffold',
          agent: 'Antigravity',
          description: 'Investigar el nicho y crear la estructura del proyecto.',
        },
        {
          title: 'Design',
          agent: 'OpenDesign',
          description: 'Definir el design system y la paleta de la landing.',
        },
        {
          title: 'Build',
          agent: 'OpenCode',
          description: 'Construir la landing con HTML/CSS.',
        },
        {
          title: 'Verify & Fix',
          agent: 'Antigravity',
          description: 'Revisar el resultado; si falla, pedir corrección a OpenCode.',
          onFailureAgent: 'OpenCode',
        },
      ],
    });
    console.log(`  plan: ${plan.tasks.map((t: { agent: string }) => t.agent).join(' → ')}`);
    await call(antigravity, 'complete_task', {
      taskId: planningTask.id,
      result: 'Plan aprobado: Research → Design → Build → Verify.',
    });

    // ---- 3. Antigravity: Research & Scaffold ------------------------------
    console.log('── Antigravity: Research & Scaffold ───────────────────────');
    const research = await waitForTask(antigravity, goal.id, 'Antigravity', 'Research');
    await call(antigravity, 'claim_task', { taskId: research.id });
    await fs.writeFile(path.join(repoPath, 'research.md'), '# Research\n\nNicho: estudios de diseño premium.\n');
    await fs.writeFile(path.join(repoPath, 'landing', 'assets', 'brand.txt'), 'Estudio Norte\n');
    console.log('  escribió research.md + assets/brand.txt');
    await call(antigravity, 'complete_task', {
      taskId: research.id,
      result: 'Investigación lista. Handoff a OpenDesign (design system).',
    });

    // ---- 4. OpenDesign: Design --------------------------------------------
    console.log('── OpenDesign: Design ──────────────────────────────────────');
    const design = await waitForTask(openDesign, goal.id, 'OpenDesign', 'Design');
    await call(openDesign, 'claim_task', { taskId: design.id });
    await fs.writeFile(
      path.join(repoPath, 'landing', 'design-system.md'),
      '# Design System\n\n- Colores: #0f172a / #f8fafc / accent #6366f1\n- Tipografía: Inter\n- Secciones: hero, servicios, portafolio, contacto, footer\n'
    );
    console.log('  escribió landing/design-system.md');
    await call(openDesign, 'complete_task', {
      taskId: design.id,
      result: 'Design system definido. Handoff a OpenCode (build).',
    });

    // ---- 5. OpenCode: Build (a propósito, sin <footer>) --------------------
    console.log('── OpenCode: Build ─────────────────────────────────────────');
    const build = await waitForTask(openCode, goal.id, 'OpenCode', 'Build');
    await call(openCode, 'claim_task', { taskId: build.id });
    await fs.writeFile(
      path.join(repoPath, 'landing', 'index.html'),
      '<!doctype html>\n<html>\n<head><title>Estudio Norte</title></head>\n<body>\n  <header>Estudio Norte</header>\n  <section>Servicios de diseño</section>\n  <section>Portafolio</section>\n</body>\n</html>\n'
    );
    console.log('  escribió landing/index.html (intencionalmente SIN <footer>)');
    await call(openCode, 'complete_task', {
      taskId: build.id,
      result: 'Landing construida. Handoff a Antigravity (verify).',
    });

    // ---- 6. Antigravity: Verify → detecta el fallo → fail_task ------------
    console.log('── Antigravity: Verify & Fix ───────────────────────────────');
    const verify = await waitForTask(antigravity, goal.id, 'Antigravity', 'Verify');
    await call(antigravity, 'claim_task', { taskId: verify.id });
    const html = await fs.readFile(path.join(repoPath, 'landing', 'index.html'), 'utf-8');
    if (!html.includes('<footer')) {
      console.log('  ❌ verificación FALLÓ: falta el <footer> → fail_task');
      await call(antigravity, 'fail_task', {
        taskId: verify.id,
        error: 'Validation failed: landing/index.html missing <footer> element.',
      });
      // Engine crea [FIX] para OpenCode (retry 1) y le manda FIX_REQUEST
      const fix = await waitForTask(openCode, goal.id, 'OpenCode', '[FIX]');
      console.log(`  🔁 engine creó "[${fix.title}]" (retry ${fix.retryCount}/3)`);
      await call(openCode, 'claim_task', { taskId: fix.id });
      const fixedHtml = html.replace('</body>', '  <footer>Contacto: hola@estudionorte.com</footer>\n</body>');
      await fs.writeFile(path.join(repoPath, 'landing', 'index.html'), fixedHtml);
      console.log('  OpenCode corrigió: agregó el <footer>');
      await call(openCode, 'complete_task', {
        taskId: fix.id,
        result: 'Fixed: <footer> added to landing/index.html.',
      });
    }

    // ---- 7. Antigravity: re-verifica ──────────────────────────────────────
    const reVerify = await waitForTask(antigravity, goal.id, 'Antigravity', 'Handoff from OpenCode');
    await call(antigravity, 'claim_task', { taskId: reVerify.id });
    const finalHtml = await fs.readFile(path.join(repoPath, 'landing', 'index.html'), 'utf-8');
    if (!finalHtml.includes('<footer')) {
      throw new Error('Verification FAILED after fix: still missing <footer>');
    }
    console.log('  ✅ re-verificación OK: el <footer> está presente');
    await call(antigravity, 'complete_task', {
      taskId: reVerify.id,
      result: 'Verified: landing/index.html is complete and correct.',
    });

    // ---- 8. Asserts finales ------------------------------------------------
    console.log('\n── Asserts finales ────────────────────────────────────────');
    const done = await prisma.goal.findUnique({
      where: { id: goal.id },
      include: { tasks: { orderBy: { createdAt: 'asc' } } },
    });
    if (done?.status !== 'COMPLETED') throw new Error(`Goal not COMPLETED (got ${done?.status})`);
    console.log(`  ✅ GOAL COMPLETED: ${done.title}`);

    const messages = await prisma.agentMessage.findMany({ where: { goalId: goal.id } });
    const types = messages.map((m) => `${m.fromAgent}→${m.toAgent}:${m.type}`).join(' | ');
    console.log(`  📬 mensajes entre agentes: ${types}`);
    for (const expected of ['HANDOFF', 'FIX_REQUEST', 'HANDOFF']) {
      if (!types.includes(expected)) throw new Error(`Missing ${expected} message`);
    }
    console.log('  ✅ handoffs (HANDOFF) y fix loop (FIX_REQUEST) registrados');

    const states = done!.tasks.map((t) => `${t.agent}(${t.state})`).join(' -> ');
    console.log(`  🧩 cadena de tareas: ${states}`);

    console.log('\n🎉 DEMO COMPLETE: 3 agentes coordinados por Control Center');
    console.log(`   Resultado en: ${path.join(repoPath, 'landing', 'index.html')}`);
    console.log('   (ve el dashboard en http://localhost:3100 para ver el goal COMPLETED)');
  } finally {
    // Cleanup DB (the fixture folder stays so you can inspect the result)
    const projIds = (await prisma.project.findMany({ where: { slug: projectSlug } })).map((p) => p.id);
    const taskIds = (await prisma.task.findMany({ where: { projectId: { in: projIds } } })).map((t) => t.id);
    await prisma.agentMessage.deleteMany({ where: { goal: { project: { slug: projectSlug } } } });
    await prisma.activityLog.deleteMany({ where: { taskId: { in: taskIds } } });
    await prisma.approval.deleteMany({ where: { taskId: { in: taskIds } } });
    await prisma.task.deleteMany({ where: { project: { slug: projectSlug } } });
    await prisma.goal.deleteMany({ where: { project: { slug: projectSlug } } });
    await prisma.project.deleteMany({ where: { slug: projectSlug } });
    await prisma.workerStatus.deleteMany({ where: { agent: { in: ['Antigravity', 'OpenDesign', 'OpenCode'] } } });
    for (const c of [antigravity, openDesign, openCode]) await c.close();
    await prisma.$disconnect();
    console.log('\n🧹 DB limpia (los archivos del fixture quedan para inspeccionar)');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});