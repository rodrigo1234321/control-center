import 'dotenv/config';
import { parseArgs } from 'node:util';
import path from 'path';
import fs from 'fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { TextContent } from '@modelcontextprotocol/sdk/types.js';

/**
 * Reference implementation of the Control Center agent loop (docs/AGENT-PROTOCOL.md).
 *
 *   heartbeat → read_messages → claim_task → get_task_context → execute → complete/fail → repeat
 *
 * The agent discovers ALL of its work exclusively through MCP messages; the only
 * role-specific part is the `execute` hook below. Run one instance per identity:
 *
 *   npx tsx scripts/agent-loop.ts --agent Antigravity [--poll 2]
 */

const tsxPath = path.resolve('node_modules', 'tsx', 'dist', 'cli.mjs');
const serverPath = path.resolve('src', 'mcp', 'server.ts');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type TaskCtx = {
  task: {
    id: string;
    title: string;
    description: string | null;
    state: string;
    agent: string;
    retryCount: number;
  };
  goal: { id: string; title: string; description: string | null; status: string };
  project: { id: string; name: string; slug: string; repoPath: string | null };
  messages: { type: string; fromAgent: string; content: string }[];
};

type HookResult = { ok: boolean; result?: string; error?: string };
type Hook = (ctx: TaskCtx, client: ClientLike) => Promise<HookResult>;

async function connectAgent(name: string) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [tsxPath, serverPath, '--agent', name],
    cwd: process.cwd(),
    stderr: 'pipe',
  });
  transport.stderr?.on('data', (d: Buffer) => process.stdout.write(`[MCP] ${d}`));
  const client = new Client({ name: `loop-${name}`, version: '0.0.1' });
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

// ---------------------------------------------------------------------------
// Execute hooks (the only role-specific part). Everything else is the contract.
// ---------------------------------------------------------------------------

const hooks: Record<string, Hook> = {
  Antigravity: async (ctx, client) => {
    // Planner: decompose the goal into a chained pipeline.
    if (ctx.task.title.startsWith('Planning')) {
      const planned = await call(client, 'plan_goal', {
        goalId: ctx.goal.id,
        tasks: [
          {
            title: 'Research & Scaffold',
            agent: 'Antigravity',
            description: 'Investigar el brief y crear la estructura del proyecto.',
          },
          { title: 'Design', agent: 'OpenDesign', description: 'Design system basado en la research.' },
          { title: 'Build', agent: 'OpenCode', description: 'Construir la landing según el design system.' },
          {
            title: 'Verify & Fix',
            agent: 'Antigravity',
            description: 'Verificar la landing; si falta algo, pedir corrección a OpenCode.',
            onFailureAgent: 'OpenCode',
          },
        ],
      });
      return { ok: true, result: `Plan approved: ${planned.planned} tasks.` };
    }

    const repoPath = ctx.project.repoPath;
    if (!repoPath) return { ok: false, error: 'Project has no repoPath.' };

    // Research: seed the repo with the brief (from goal context) + scaffold.
    if (ctx.task.title.includes('Research')) {
      const brief = ctx.goal.description || ctx.task.description || 'Landing page (sin brief).';
      await fs.mkdir(path.join(repoPath, 'landing', 'assets'), { recursive: true });
      await fs.writeFile(
        path.join(repoPath, 'research.md'),
        `# Research\n\nBrief:\n${brief}\n\nBrand: Estudio Norte\nPalette: #0f172a / #f8fafc / accent #6366f1\n`
      );
      await fs.writeFile(path.join(repoPath, 'landing', 'assets', 'brand.txt'), 'Estudio Norte\n');
      return { ok: true, result: 'Research done: research.md + assets/brand.txt written.' };
    }

    // Verify: enforce the checklist; fail_task if the build is incomplete.
    if (ctx.task.title.includes('Verify')) {
      const html = await fs.readFile(path.join(repoPath, 'landing', 'index.html'), 'utf-8');
      if (!html.includes('<footer')) {
        return { ok: false, error: 'Validation failed: landing/index.html missing <footer> element.' };
      }
      return { ok: true, result: 'Verified: landing/index.html is complete and correct.' };
    }

    return { ok: false, error: `No hook for task "${ctx.task.title}".` };
  },

  OpenDesign: async (ctx) => {
    const repoPath = ctx.project.repoPath;
    if (!repoPath) return { ok: false, error: 'Project has no repoPath.' };

    if (ctx.task.title.includes('Design')) {
      // Context persistence: derive the design system from the repo files the
      // previous agent left (research.md), never from injected context.
      const research = await fs.readFile(path.join(repoPath, 'research.md'), 'utf-8').catch(() => '');
      const brand = research.match(/Brand:\s*([^\n]+)/)?.[1]?.trim() ?? 'Estudio Norte';
      const accent = research.match(/accent\s+(#[0-9a-fA-F]{6})/)?.[1] ?? '#6366f1';
      await fs.writeFile(
        path.join(repoPath, 'landing', 'design-system.md'),
        `# Design System\n\n- Brand: ${brand}\n- Colores: #0f172a / #f8fafc / acento ${accent}\n- Tipografía: Inter\n- Secciones: hero, servicios, portafolio, contacto, footer\n`
      );
      return { ok: true, result: `Design system done (brand: ${brand}, accent: ${accent}).` };
    }

    return { ok: false, error: `No hook for task "${ctx.task.title}".` };
  },

  OpenCode: async (ctx) => {
    const repoPath = ctx.project.repoPath;
    if (!repoPath) return { ok: false, error: 'Project has no repoPath.' };

    // Fix loop: re-add the <footer> that the (deliberately incomplete) build omitted.
    if (ctx.task.title.includes('[FIX]')) {
      const file = path.join(repoPath, 'landing', 'index.html');
      const html = await fs.readFile(file, 'utf-8');
      if (!html.includes('<footer')) {
        const fixed = html.replace(
          '</body>',
          '  <footer>Contacto: hola@estudionorte.com</footer>\n</body>'
        );
        await fs.writeFile(file, fixed);
      }
      return { ok: true, result: 'Fixed: <footer> added to landing/index.html.' };
    }

    if (ctx.task.title.includes('Build')) {
      // Context persistence: use the accent from design-system.md. Deliberately
      // omits the <footer> so the verify step fails and exercises the fix loop.
      const ds = await fs.readFile(path.join(repoPath, 'landing', 'design-system.md'), 'utf-8').catch(() => '');
      const accent = ds.match(/acento\s+(#[0-9a-fA-F]{6})/)?.[1] ?? '#6366f1';
      await fs.writeFile(
        path.join(repoPath, 'landing', 'index.html'),
        `<!doctype html>\n<html>\n<head><title>Estudio Norte</title><style>body{color:#0f172a;background:#f8fafc}a{color:${accent}}</style></head>\n<body>\n  <header>Estudio Norte</header>\n  <section>Servicios de diseño</section>\n  <section>Portafolio</section>\n</body>\n</html>\n`
      );
      return { ok: true, result: `Landing built with accent ${accent} (no footer, on purpose).` };
    }

    return { ok: false, error: `No hook for task "${ctx.task.title}".` };
  },
};

// ---------------------------------------------------------------------------
// Contract loop
// ---------------------------------------------------------------------------

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      agent: { type: 'string' },
      poll: { type: 'string' },
    },
  });

  if (!values.agent) {
    console.error('Usage: npx tsx scripts/agent-loop.ts --agent <Name> [--poll <seconds>]');
    process.exit(1);
  }
  const agent = values.agent;
  const pollMs = (values.poll ? parseInt(values.poll, 10) : 2) * 1000;

  console.log(`[loop] ${agent} starting (contract loop, poll ${pollMs}ms)`);
  const client = await connectAgent(agent);

  const runHook = (ctx: TaskCtx) => {
    const hook = hooks[agent];
    if (!hook) return Promise.resolve({ ok: false, error: `No execute hook for role ${agent}.` } as HookResult);
    return hook(ctx, client);
  };

  try {
    await call(client, 'heartbeat');

    while (true) {
      const { messages } = await call(client, 'read_messages', { consume: true });

      for (const msg of messages) {
        if (msg.type === 'CONTROL') {
          console.log(`[loop] ${agent} CONTROL: ${msg.content}`);
          if (msg.content.startsWith('STOP')) {
            await call(client, 'heartbeat', { status: 'OFFLINE' }).catch(() => {});
            console.log(`[loop] ${agent} stopped by CONTROL.`);
            process.exit(0);
          }
          await call(client, 'send_message', {
            to: msg.fromAgent || 'System',
            type: 'ACK',
            content: `Acknowledged control message: ${msg.content}`,
          }).catch(() => {});
          continue;
        }

        if (!['REQUEST', 'HANDOFF', 'FIX_REQUEST'].includes(msg.type) || !msg.taskId) continue;

        const ctx = await call(client, 'get_task_context', { taskId: msg.taskId });
        if (ctx.task.state !== 'BACKLOG') {
          console.log(`[loop] ${agent} skip task ${msg.taskId} (state ${ctx.task.state})`);
          continue;
        }

        console.log(`[loop] ${agent} claiming "${ctx.task.title}" (${msg.type})`);
        await call(client, 'claim_task', { taskId: msg.taskId });

        const result = await runHook(ctx);
        if (result.ok) {
          console.log(`[loop] ${agent} completing "${ctx.task.title}"`);
          await call(client, 'complete_task', { taskId: msg.taskId, result: result.result });
        } else {
          console.log(`[loop] ${agent} FAILING "${ctx.task.title}": ${result.error}`);
          await call(client, 'fail_task', { taskId: msg.taskId, error: result.error });
        }
      }

      await sleep(pollMs);
    }
  } catch (err) {
    console.error(`[loop] ${agent} fatal:`, err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});