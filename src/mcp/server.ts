import 'dotenv/config';
import { parseArgs } from 'node:util';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { transitionTask } from '@/lib/transition';
import { resolveApproval } from '@/lib/approvals';
import { MESSAGE_TYPES, TASK_STATES } from '@/lib/types';
import type { Prisma } from '@/generated/prisma/client';

/**
 * Control Center MCP Server.
 *
 * Run one instance per agent identity:
 *   npx tsx src/mcp/server.ts --agent Antigravity
 *
 * Agents connect as MCP clients (e.g. opencode/claude with this command in
 * their mcp config) and coordinate work through the shared database:
 * heartbeat → read_messages → claim_task → work → complete_task.
 */

function ok(data: unknown) {
  const text = JSON.stringify(data, null, 2);
  return {
    content: [{ type: 'text' as const, text }],
    structuredContent: data as Record<string, unknown>,
  };
}

function fail(message: string) {
  return {
    content: [{ type: 'text' as const, text: message }],
    isError: true,
  };
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      agent: { type: 'string' },
    },
  });

  const agentValue = values.agent || process.env.AGENT_NAME;
  if (!agentValue) {
    console.error(
      'Usage: npx tsx src/mcp/server.ts --agent <AgentName>\n' +
        '       or set the AGENT_NAME environment variable.'
    );
    process.exit(1);
  }
  const agent: string = agentValue;

  console.error(`[Control Center MCP] Starting server for agent: ${agent}`);

  const server = new McpServer({
    name: 'control-center',
    version: '0.1.0',
  });

  /** Refresh the agent's heartbeat on every tool call so the dashboard shows it ONLINE.
   *  Also touch updatedAt on any RUNNING tasks owned by this agent so the watchdog
   *  doesn't kill legitimate long-running sessions. */
  async function heartbeat() {
    await prisma.workerStatus.upsert({
      where: { agent },
      update: { status: 'ONLINE', lastSeenAt: new Date() },
      create: { agent, status: 'ONLINE', lastSeenAt: new Date() },
    });
    // Keep RUNNING tasks alive — prevents watchdog false positives
    await prisma.task.updateMany({
      where: { agent, state: 'RUNNING' },
      data: { updatedAt: new Date() },
    });
  }

  async function run(fn: () => Promise<unknown>) {
    try {
      await heartbeat();
      const result = await fn();
      return ok(result);
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  }

  function requireOwnTask(task: { agent: string }, taskId: string) {
    if (task.agent !== agent) {
      throw new Error(
        `Task ${taskId} is assigned to '${task.agent}', not to you ('${agent}').`
      );
    }
  }

  // ---------------------------------------------------------------- identity

  server.registerTool(
    'heartbeat',
    {
      title: 'Heartbeat',
      description:
        "Register this agent as ONLINE in Control Center. Called automatically before every tool call, but you can call it explicitly to appear online without doing work.",
      inputSchema: { status: z.enum(['ONLINE', 'OFFLINE']).optional() },
    },
    async ({ status }) =>
      run(async () => {
        const next = status ?? 'ONLINE';
        await prisma.workerStatus.upsert({
          where: { agent },
          update: { status: next, lastSeenAt: new Date() },
          create: { agent, status: next, lastSeenAt: new Date() },
        });
        return { agent, status: next };
      })
  );

  // ------------------------------------------------------------------ state

  server.registerTool(
    'get_state',
    {
      title: 'Get State',
      description:
        'Snapshot of the whole Control Center: active goal, projects, agent online status, tasks assigned to you, unread messages, and pending approvals.',
      inputSchema: {},
    },
    async () =>
      run(async () => {
        const [activeGoal, projects, workerStatuses, myTasks, pendingMessages, pendingApprovals] =
          await Promise.all([
            prisma.goal.findFirst({
              where: { status: 'ACTIVE' },
              include: { tasks: { orderBy: { createdAt: 'asc' } } },
              orderBy: { createdAt: 'desc' },
            }),
            prisma.project.findMany({
              include: { goals: { select: { id: true, status: true } } },
              orderBy: { createdAt: 'desc' },
            }),
            prisma.workerStatus.findMany(),
            prisma.task.findMany({
              where: { agent, state: { in: ['BACKLOG', 'RUNNING', 'PAUSED', 'BLOCKED', 'REVIEW'] } },
              include: { project: { select: { name: true, slug: true } } },
              orderBy: { createdAt: 'desc' },
            }),
            prisma.agentMessage.findMany({
              where: { toAgent: agent, status: { not: 'RESOLVED' } },
              orderBy: { createdAt: 'desc' },
            }),
            prisma.approval.findMany({
              where: { status: 'PENDING' },
              include: { task: { include: { project: { select: { name: true } } } } },
              orderBy: { requestedAt: 'desc' },
            }),
          ]);

        // F8: Agentes dinámicos — combina los conocidos con cualquier agente registrado en la DB
        const knownAgents = new Set(['Antigravity', 'OpenDesign', 'OpenCode', 'OpenHands']);
        for (const w of workerStatuses) knownAgents.add(w.agent);
        
        const agentStatus = [...knownAgents].map((name) => {
          const w = workerStatuses.find((s) => s.agent === name);
          const isOnline = w && Date.now() - w.lastSeenAt.getTime() < 30000;
          return { agent: name, state: isOnline ? w.status : 'OFFLINE' };
        });

        return { agent, activeGoal, projects, agentStatus, myTasks, pendingMessages, pendingApprovals };
      })
  );

  // --------------------------------------------------------------- projects

  server.registerTool(
    'create_project',
    {
      title: 'Create Project',
      description:
        'Create a new project in Control Center. Use this when starting a new workspace/repository so tasks and goals have a home.',
      inputSchema: {
        name: z.string().describe('Display name of the project'),
        slug: z.string().describe('Unique URL-safe identifier, e.g. landing-2026'),
        repoPath: z.string().optional().describe('Absolute path of the repository/workspace folder'),
        description: z.string().optional(),
      },
    },
    async ({ name, slug, repoPath, description }) =>
      run(async () => {
        const project = await prisma.project.create({ data: { name, slug, repoPath, description } });
        return { project };
      })
  );

  server.registerTool(
    'set_project_repo',
    {
      title: 'Set Project Repo',
      description:
        "Point a project at the actual repository/workspace folder. Use this after you've created the folder or GitHub repo so later agents know where to work.",
      inputSchema: {
        slug: z.string().describe('Project slug'),
        repoPath: z.string().describe('Absolute path of the repository'),
      },
    },
    async ({ slug, repoPath }) =>
      run(async () => {
        const project = await prisma.project.update({
          where: { slug },
          data: { repoPath },
        });
        return { project };
      })
  );

  // ------------------------------------------------------------------ goals

  server.registerTool(
    'create_goal',
    {
      title: 'Create Goal',
      description:
        'Create a mission goal, an initial planning task for the planner agent, and dispatch a REQUEST message so the planner picks it up.',
      inputSchema: {
        title: z.string(),
        description: z.string().optional(),
        projectSlug: z.string().optional().describe('Project slug (defaults to first project)'),
        agent: z
          .string()
          .optional()
          .describe('Agent that receives the initial planning task (defaults to your identity)'),
      },
    },
    async ({ title, description, projectSlug, agent: plannerAgent }) =>
      run(async () => {
        const targetAgent = plannerAgent || agent;
        const project = projectSlug
          ? await prisma.project.findUnique({ where: { slug: projectSlug } })
          : await prisma.project.findFirst({ orderBy: { createdAt: 'asc' } });

        if (!project) throw new Error('No project found. Create one with create_project first.');

        const goal = await prisma.goal.create({
          data: { title, description, projectId: project.id, status: 'ACTIVE' },
        });

        await prisma.activityLog.create({
          data: { agent: 'System', action: `Goal created: ${title}` },
        });

        const task = await prisma.task.create({
          data: {
            title: `Planning: ${title}`,
            description: `Automatically created planning task for goal: ${title}`,
            projectId: project.id,
            goalId: goal.id,
            agent: targetAgent,
            state: 'BACKLOG',
          },
        });

        await prisma.agentMessage.create({
          data: {
            goalId: goal.id,
            taskId: task.id,
            fromAgent: 'USER',
            toAgent: targetAgent,
            type: 'REQUEST',
            content: `ACTION REQUIRED: You have been assigned Task ${task.id} ("${task.title}").\n\nGoal: ${title}\nDescription: ${description || 'No description provided.'}\n\nPlease decompose this goal into a sequence of executable tasks.`,
          },
        });

        return { goal, planningTask: task };
      })
  );

  server.registerTool(
    'plan_goal',
    {
      title: 'Plan Goal',
      description:
        'Decompose a goal into chained tasks. Each task lists its agent; the next task in the array becomes the nextAgent (automatic handoff on completion).',
      inputSchema: {
        goalId: z.string(),
        tasks: z
          .array(
            z.object({
              title: z.string(),
              agent: z.string(),
              description: z.string().optional(),
              nextAgent: z.string().optional(),
              onFailureAgent: z.string().optional(),
            })
          )
          .min(1),
      },
    },
    async ({ goalId, tasks: tasksData }) =>
      run(async () => {
        const goal = await prisma.goal.findUnique({ where: { id: goalId } });
        if (!goal) throw new Error(`Goal ${goalId} not found`);

        const created: Prisma.TaskModel[] = [];
        for (let i = 0; i < tasksData.length; i++) {
          const t = tasksData[i];
          const nextTask = tasksData[i + 1];
          const task = await prisma.task.create({
            data: {
              title: t.title,
              description: t.description,
              agent: t.agent,
              nextAgent: t.nextAgent ?? (nextTask ? nextTask.agent : undefined),
              onFailureAgent: t.onFailureAgent,
              goalId: goal.id,
              projectId: goal.projectId,
              state: 'BACKLOG',
            },
          });
          created.push(task);
        }

        await prisma.activityLog.create({
          data: { agent, action: `Planned ${created.length} tasks for goal ${goal.title}` },
        });

        // Dispatch a REQUEST to the first task's agent so the contract
        // "discover work via read_messages" always holds (even when the
        // planner is also the first executor).
        if (created.length > 0) {
          const first = created[0];
          await prisma.agentMessage.create({
            data: {
              fromAgent: agent,
              toAgent: first.agent,
              goalId: goal.id,
              taskId: first.id,
              type: 'REQUEST',
              content: `ACTION REQUIRED: You have been assigned Task ${first.id} ("${first.title}") as the first step of goal "${goal.title}".\n\nDescription: ${first.description || 'No description provided.'}\n\nStart working on it.`,
            },
          });
        }

        return { goalId, planned: created.length, tasks: created };
      })
  );

  // ------------------------------------------------------------------ tasks

  server.registerTool(
    'list_tasks',
    {
      title: 'List Tasks',
      description: 'List tasks, optionally filtered by project slug, agent, or state.',
      inputSchema: {
        projectSlug: z.string().optional(),
        agent: z.string().optional(),
        state: z.enum(TASK_STATES).optional(),
      },
    },
    async ({ projectSlug, agent: filterAgent, state }) =>
      run(async () => {
        const where: Prisma.TaskWhereInput = {};
        if (filterAgent) where.agent = filterAgent;
        if (state) where.state = state;
        if (projectSlug) {
          const project = await prisma.project.findUnique({ where: { slug: projectSlug } });
          if (!project) throw new Error(`Project with slug '${projectSlug}' not found`);
          where.projectId = project.id;
        }

        const tasks = await prisma.task.findMany({
          where,
          include: {
            project: { select: { name: true, slug: true, repoPath: true } },
            goal: { select: { id: true, title: true } },
            approvals: true,
          },
          orderBy: { createdAt: 'desc' },
        });
        return { count: tasks.length, tasks };
      })
  );

  server.registerTool(
    'get_task_context',
    {
      title: 'Get Task Context',
      description:
        'Full context for a task: the task itself, its goal (title, description, status), its project (name, slug, repoPath) and every message attached to it. Call this after claiming a task to know where to work (repoPath) and what was asked.',
      inputSchema: { taskId: z.string() },
    },
    async ({ taskId }) =>
      run(async () => {
        const found = await prisma.task.findUnique({
          where: { id: taskId },
          include: {
            goal: { select: { id: true, title: true, description: true, status: true } },
            project: { select: { id: true, name: true, slug: true, repoPath: true } },
          },
        });
        if (!found) throw new Error(`Task ${taskId} not found`);
        const { goal, project, ...task } = found;
        if (!goal) throw new Error(`Task ${taskId} has no goal`);

        const messages = await prisma.agentMessage.findMany({
          where: { taskId },
          orderBy: { createdAt: 'asc' },
        });

        return { task, goal, project, messages };
      })
  );

  server.registerTool(
    'claim_task',
    {
      title: 'Claim Task',
      description:
        "Start working on a BACKLOG task assigned to you. Transitions the task to RUNNING and records activity. Use it after receiving a REQUEST/HANDOFF/FIX_REQUEST for the task.",
      inputSchema: { taskId: z.string() },
    },
    async ({ taskId }) =>
      run(async () => {
        const task = await prisma.task.findUnique({ where: { id: taskId } });
        if (!task) throw new Error(`Task ${taskId} not found`);
        requireOwnTask(task, taskId);
        if (task.state !== 'BACKLOG') {
          throw new Error(`Task ${taskId} is in state ${task.state}; only BACKLOG tasks can be claimed.`);
        }
        const updated = await transitionTask(taskId, 'RUNNING');
        return { task: updated };
      })
  );

  server.registerTool(
    'complete_task',
    {
      title: 'Complete Task',
      description:
        "Report a task as done. Transitions RUNNING → DONE and automatically triggers handoffs (next agent), fix loops, and goal completion. If the task requires approval, it is routed to REVIEW instead.",
      inputSchema: {
        taskId: z.string(),
        result: z.string().optional().describe('Summary of what was done / where the output lives'),
      },
    },
    async ({ taskId, result }) =>
      run(async () => {
        const task = await prisma.task.findUnique({ where: { id: taskId } });
        if (!task) throw new Error(`Task ${taskId} not found`);
        requireOwnTask(task, taskId);
        const updated = await transitionTask(taskId, 'DONE', result);
        return { task: updated };
      })
  );

  server.registerTool(
    'fail_task',
    {
      title: 'Fail Task',
      description:
        "Report a task as failed with an error description. Transitions RUNNING → FAILED and automatically triggers the fix loop (onFailureAgent, up to 3 retries) or a human approval when retries are exhausted.",
      inputSchema: {
        taskId: z.string(),
        error: z.string().optional().describe('Error log / failure description'),
      },
    },
    async ({ taskId, error }) =>
      run(async () => {
        const task = await prisma.task.findUnique({ where: { id: taskId } });
        if (!task) throw new Error(`Task ${taskId} not found`);
        requireOwnTask(task, taskId);
        const updated = await transitionTask(taskId, 'FAILED', error);
        return { task: updated };
      })
  );

  // --------------------------------------------------------------- messages

  server.registerTool(
    'send_message',
    {
      title: 'Send Message',
      description:
        "Send a message to another agent (or the human 'USER') through Control Center. Use REQUEST to assign work, QUESTION to ask something, RESPONSE to answer, INFO for updates, REVIEW for feedback.",
      inputSchema: {
        to: z.string(),
        type: z.enum(MESSAGE_TYPES),
        content: z.string(),
        taskId: z.string().optional(),
        goalId: z.string().optional(),
      },
    },
    async ({ to, type, content, taskId, goalId }) =>
      run(async () => {
        const message = await prisma.agentMessage.create({
          data: {
            fromAgent: agent,
            toAgent: to,
            type,
            content,
            taskId,
            goalId,
            status: 'UNREAD',
          },
        });
        return { message };
      })
  );

  server.registerTool(
    'read_messages',
    {
      title: 'Read Messages',
      description:
        "Read messages addressed to you. By default returns UNREAD messages; pass consume=true to mark them READ.",
      inputSchema: {
        status: z.enum(['UNREAD', 'READ', 'RESOLVED']).optional(),
        consume: z.boolean().optional().describe('Mark returned messages as READ'),
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    async ({ status, consume, limit }) =>
      run(async () => {
        const messages = await prisma.agentMessage.findMany({
          where: { toAgent: agent, ...(status ? { status } : { status: 'UNREAD' }) },
          orderBy: { createdAt: 'asc' },
          take: limit ?? 50,
        });

        if (consume && messages.length > 0) {
          await prisma.agentMessage.updateMany({
            where: { id: { in: messages.map((m) => m.id) } },
            data: { status: 'READ', readAt: new Date() },
          });
        }

        return { count: messages.length, messages };
      })
  );

  // -------------------------------------------------------------- approvals

  server.registerTool(
    'list_approvals',
    {
      title: 'List Approvals',
      description: 'List approvals, by default only PENDING ones.',
      inputSchema: { status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional() },
    },
    async ({ status }) =>
      run(async () => {
        const approvals = await prisma.approval.findMany({
          where: status ? { status } : { status: 'PENDING' },
          include: {
            task: { include: { project: { select: { name: true, slug: true } } } },
          },
          orderBy: { requestedAt: 'desc' },
        });
        return { count: approvals.length, approvals };
      })
  );

  server.registerTool(
    'resolve_approval',
    {
      title: 'Resolve Approval',
      description:
        'Approve or reject a pending human approval. Approving a REVIEW task completes it; rejecting it fails it. Approving a FAILED/BLOCKED task resets it to BACKLOG (retryCount reset).',
      inputSchema: {
        approvalId: z.string(),
        approved: z.boolean(),
        note: z.string().optional().describe('Note recorded when rejecting (resolvedNote)'),
      },
    },
    async ({ approvalId, approved, note }) =>
      run(async () => {
        const result = await resolveApproval(approvalId, approved ? 'APPROVED' : 'REJECTED', note);
        return result;
      })
  );

  // --------------------------------------------------------------- transport

  const transport = new StdioServerTransport();
  await server.connect(transport);

  const markOffline = async () => {
    await prisma.workerStatus
      .upsert({
        where: { agent },
        update: { status: 'OFFLINE', lastSeenAt: new Date() },
        create: { agent, status: 'OFFLINE', lastSeenAt: new Date() },
      })
      .catch(() => {});
  };

  process.on('SIGINT', async () => {
    await markOffline();
    process.exit(0);
  });
  process.on('SIGTERM', async () => {
    await markOffline();
    process.exit(0);
  });

  console.error(`[Control Center MCP] Ready. Agent: ${agent}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});