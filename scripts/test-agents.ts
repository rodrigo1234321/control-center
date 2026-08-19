import 'dotenv/config';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'path';
import fs from 'fs/promises';
import { createWriteStream, type WriteStream } from 'node:fs';
import { prisma } from '@/lib/prisma';
import { reapStaleRunningTasks } from '@/lib/watchdog';

/**
 * Real-agent integration test: 3 genuine opencode sessions (deepseek-v4-flash-free),
 * one per role (Antigravity, OpenDesign, OpenCode), each connected to its own MCP
 * identity via OPENCODE_CONFIG. The controller deliberately sabotages the build
 * (strips <footer>) right after Build→DONE so the recovery loop MUST fire:
 *
 *   FAILED → FIX_REQUEST → OpenCode fixes → HANDOFF → Antigravity re-verifies → COMPLETED
 *
 * Each session is dispatched when work is available (BACKLOG/RUNNING task or UNREAD message)
 * and instructed to discover context via MCP, complete its task, and hand off.
 * Logs go to logs/agents/*.log.
 */

const projectSlug = 'test-agents';
const fixturePath = path.resolve('test-fixtures', 'agents');
const logsDir = path.resolve('logs', 'agents');
const baseUrl = 'http://localhost:3100';
const opencodeBin =
  process.env.OPENCODE_BIN ??
  'C:\\Users\\rodri\\AppData\\Roaming\\npm\\node_modules\\opencode-ai\\bin\\opencode.exe';

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

const indexHtml = path.join(fixturePath, 'landing', 'index.html');

async function sabotage() {
  try {
    const html = await fs.readFile(indexHtml, 'utf-8');
    if (html.includes('<footer')) {
      const stripped = html.replace(/<footer[\s\S]*?<\/footer>/gi, '').replace(/<footer[\s\S]*$/i, '');
      await fs.writeFile(indexHtml, stripped);
      console.log(
        stripped.includes('<footer')
          ? '⚠️ SABOTAGE: intento falló (footer aún presente)'
          : '🛑 SABOTAGE: <footer> stripped from index.html'
      );
    }
  } catch {
    /* not built yet */
  }
}

interface Role {
  agentFile: string;
  config: string;
  mcpAgent: string;
  session: ChildProcess | null;
  restarts: number;
}

async function hasWorkFor(mcpAgent: string): Promise<boolean> {
  const [tasks, unread] = await Promise.all([
    prisma.task.count({
      where: {
        project: { slug: projectSlug },
        agent: mcpAgent,
        state: { in: ['BACKLOG', 'RUNNING'] },
      },
    }),
    prisma.agentMessage.count({
      where: {
        goal: { project: { slug: projectSlug } },
        toAgent: mcpAgent,
        status: 'UNREAD',
      },
    }),
  ]);
  return tasks > 0 || unread > 0;
}

async function main() {
  console.log('🤖 REAL-AGENT TEST (opencode sessions, deepseek-v4-flash-free, event-driven dispatcher)');

  const roles: Role[] = [
    { agentFile: 'antigravity', config: 'agent-antigravity.json', mcpAgent: 'Antigravity', session: null, restarts: 0 },
    { agentFile: 'opendesign', config: 'agent-opendesign.json', mcpAgent: 'OpenDesign', session: null, restarts: 0 },
    { agentFile: 'opencode-agent', config: 'agent-opencode.json', mcpAgent: 'OpenCode', session: null, restarts: 0 },
  ];

  const openLogs = new Map<string, WriteStream>();
  let devChild: ChildProcess | null = null;

  try {
    // ---- 0. Dev server ------------------------------------------------
    if (await isDevUp()) {
      console.log('✅ next dev already running on :3100');
    } else {
      console.log('⏳ starting next dev on :3100...');
      devChild = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--port', '3100'], {
        stdio: 'ignore',
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
    await fs.rm(logsDir, { recursive: true, force: true });
    await fs.mkdir(logsDir, { recursive: true });

    // ---- 2. Seed project + goal (same as the dashboard CommandBar) -------
    const project = await postJson(`${baseUrl}/api/projects`, {
      name: 'Real Agents Landing',
      slug: projectSlug,
      repoPath: fixturePath,
      description: 'Proyecto de prueba con agentes reales.',
    });
    const goal = await postJson(`${baseUrl}/api/goals`, {
      title: 'Landing page del estudio',
      description:
        'Construir una landing para "Estudio Norte". Paleta: #0f172a / #f8fafc / acento #6366f1. Secciones: hero, servicios, portafolio, contacto, footer.',
      projectId: project.id,
      agent: 'Antigravity',
    });
    console.log(`✅ goal creado vía API: ${goal.id}`);

    // ---- 3. Session prompt & starter ----------------------------------------
    const makePrompt = (role: Role) =>
      `Tu identidad en este turno es "${role.mcpAgent}". Sigue el contrato oficial de Control Center (docs/AGENT-PROTOCOL.md):\n` +
      `1. Envía heartbeat con status="ONLINE".\n` +
      `2. Llama a read_messages(consume=true) para ver tus mensajes pendientes.\n` +
      `3. Si tienes una tarea asignada en BACKLOG, llámala con claim_task(taskId).\n` +
      `4. Si tienes una tarea en RUNNING (recién reclamada o previa), llama a get_task_context(taskId) para ver los detalles, proyecto y repoPath.\n` +
      `5. Realiza las acciones correspondientes en los archivos del workspace según tu rol:\n` +
      `   - Si eres Antigravity y tienes una tarea de planning: usa plan_goal para descomponer el goal en cadena (Research -> Design -> Build -> Verify), o investiga y genera research.md, o verifica index.html.\n` +
      `   - Si eres OpenDesign: lee research.md y genera design-system.md en la carpeta landing/.\n` +
      `   - Si eres OpenCode: lee design-system.md y genera/arregla landing/index.html (con todas las secciones y <footer>).\n` +
      `6. Al finalizar tu trabajo, llama a complete_task(result) para transferir la posta al siguiente agente, o fail_task(error) si detectas que la validación falló.\n` +
      `7. IMPORTANTE: Una vez que llames a complete_task o fail_task, finaliza tu turno de forma clara.`;

    const startSession = (role: Role) => {
      if (role.session) return;
      const log = createWriteStream(`${logsDir}/${role.mcpAgent}.log`, { flags: 'a' });
      log.on('error', () => {});
      openLogs.set(role.mcpAgent, log);

      const prompt = makePrompt(role);
      const child = spawn(opencodeBin, ['run', prompt, '--agent', role.agentFile, '--auto', '--format', 'json'], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          OPENCODE_CONFIG: path.resolve('configs', role.config),
          OPENCODE_DISABLE_AUTOUPDATE: '1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      child.stdout.pipe(log);
      child.stderr.pipe(log);

      child.on('exit', (code) => {
        console.log(`💤 sesión ${role.mcpAgent} terminó (exit ${code})`);
        openLogs.delete(role.mcpAgent);
        role.session = null;
      });

      role.session = child;
      role.restarts++;
      console.log(
        `⏳ sesión ${role.mcpAgent} iniciada (log: logs/agents/${role.mcpAgent}.log, #${role.restarts})`
      );
    };

    // ---- 4. Supervisor loop (checks work every 4 seconds) -------------------
    const supervisor = setInterval(async () => {
      const reaped = await reapStaleRunningTasks();
      if (reaped > 0) {
        console.log(`🧟 watchdog: ${reaped} tarea(s) huérfana(s) en RUNNING liberadas y falladas`);
      }
      for (const role of roles) {
        if (!role.session) {
          const work = await hasWorkFor(role.mcpAgent);
          if (work) {
            startSession(role);
          }
        }
      }
    }, 4000);

    // Initial trigger for the planning agent
    startSession(roles[0]);

    // ---- 5. Sabotage watcher ------------------------------------------------
    let sabotaged = false;
    const watcher = setInterval(async () => {
      const build = await prisma.task.findFirst({
        where: { project: { slug: projectSlug }, state: 'DONE', title: { contains: 'Build' } },
      });
      if (build && !sabotaged) {
        sabotaged = true;
        await sleep(500);
        await sabotage();
      }
    }, 500);

    // ---- 6. Wait for GOAL COMPLETED (up to 25 min; LLM sessions are slow) ---
    let done = false;
    let lastSig = '';
    let lastChange = Date.now();
    for (let i = 0; i < 1500; i++) {
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
      const sig = g ? JSON.stringify(g.tasks.map((t) => `${t.agent}:${t.state}`)) : '';
      if (sig !== lastSig) {
        lastSig = sig;
        lastChange = Date.now();
      } else if (Date.now() - lastChange > 90000) {
        lastChange = Date.now();
        const unread = await prisma.agentMessage.count({ where: { goalId: goal.id, status: 'UNREAD' } });
        console.log(
          `⚠️ 90s sin cambios: ${sig} | unread:${unread} | sessions: ` +
            roles.map((r) => `${r.mcpAgent}=${r.session ? 'up' : 'down'}`).join(',')
        );
      }
      if (i % 30 === 0 && g) {
        console.log(
          `  [${Math.round(i / 60)}min] ${g.tasks.map((t) => `${t.agent}:${t.state}`).join(' -> ')}` +
            ` | sessions: ${roles.map((r) => `${r.mcpAgent}=${r.session ? 'up' : 'down'}`).join(',')}`
        );
      }
    }
    clearInterval(supervisor);
    clearInterval(watcher);
    if (!done) throw new Error('Goal did not complete in 25 min (see logs/agents/*.log)');

    // ---- 7. Asserts ----------------------------------------------------------
    console.log('\n── Asserts ────────────────────────────────────────────────');

    const glob = (pattern: string) => fs.readdir(fixturePath, { recursive: true }).then(
      (files) => files.map(String).filter((f) => f.includes(pattern)),
      () => [] as string[]
    );

    const researchFiles = await glob('research.md');
    if (researchFiles.length === 0) throw new Error('research.md not found in fixture');
    const research = await fs.readFile(path.join(fixturePath, researchFiles[0]), 'utf-8');
    if (!research.includes('Estudio Norte')) throw new Error('research.md missing brand');
    console.log(`✅ [contexto] ${researchFiles[0]} (brand)`);

    const dsFiles = await glob('design-system.md');
    if (dsFiles.length === 0) throw new Error('design-system.md not found in fixture');
    const designSystem = await fs.readFile(path.join(fixturePath, dsFiles[0]), 'utf-8');
    if (!designSystem.includes('Estudio Norte') || !designSystem.includes('#6366f1')) {
      throw new Error('design-system.md did not derive brand/accent from research.md');
    }
    console.log(`✅ [contexto] ${dsFiles[0]} derivó de research.md (brand + acento)`);

    const htmlFiles = await glob('index.html');
    if (htmlFiles.length === 0) throw new Error('index.html not found in fixture');
    const html = await fs.readFile(path.join(fixturePath, htmlFiles[0]), 'utf-8');
    if (!html.includes('<footer')) throw new Error('index.html missing <footer> after fix');

    const cssFiles = await glob('.css');
    const builtArtifacts = [html, ...(await Promise.all(cssFiles.map((f) => fs.readFile(path.join(fixturePath, f), 'utf-8'))))];
    if (!builtArtifacts.some((c) => c.includes('#6366f1'))) {
      throw new Error('built artifact missing accent #6366f1 from design-system.md');
    }
    console.log(`✅ [contexto] ${htmlFiles[0]} (+${cssFiles.length} css) usa el acento del design system + <footer> tras el fix`);

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
    console.log('✅ [identidad] ownership enforced; 0 tareas pendientes');

    console.log('\n🎉 REAL-AGENT TEST PASSED');
  } finally {
    for (const role of roles) if (role.session) killTree(role.session);
    for (const stream of openLogs.values()) stream.destroy();
    if (devChild) killTree(devChild);
    await sleep(500);
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});