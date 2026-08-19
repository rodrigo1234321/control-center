import 'dotenv/config';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { TextContent } from '@modelcontextprotocol/sdk/types.js';
import path from 'path';
import { prisma } from '@/lib/prisma';

const tsxPath = path.resolve('node_modules', 'tsx', 'dist', 'cli.mjs');
const serverPath = path.resolve('src', 'mcp', 'server.ts');
const testSlug = `mcp-smoke-${Date.now()}`;

async function main() {
  console.log('🚀 MCP Smoke Test — agent identity: Antigravity');

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [tsxPath, serverPath, '--agent', 'Antigravity'],
    cwd: process.cwd(),
    stderr: 'pipe',
  });

  transport.stderr?.on('data', (d: Buffer) => process.stdout.write(`[MCP ERR] ${d}`));

  const client = new Client({ name: 'smoke-test', version: '0.0.1' });
  await client.connect(transport);

  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await client.callTool({ name, arguments: args });
    if (result.isError) {
      const text = Array.isArray(result.content) ? result.content.map((c) => (c as TextContent).text).join('\n') : '';
      throw new Error(`Tool ${name} failed: ${text}`);
    }
    const text = Array.isArray(result.content) ? result.content.map((c) => (c as TextContent).text || '').join('\n') : '';
    return JSON.parse(text);
  };

  try {
    // 1. Heartbeat
    const hb = await call('heartbeat');
    console.log('✅ heartbeat:', hb.agent, hb.status);

    // 2. Get state
    const state = await call('get_state');
    console.log(`✅ get_state: ${state.projects.length} projects, ${state.myTasks.length} my tasks`);

    // 3. Create project
    const proj = await call('create_project', {
      name: 'MCP Smoke Test',
      slug: testSlug,
      repoPath: 'C:/temp/mcp-smoke',
    });
    console.log(`✅ create_project: ${proj.project.slug}`);

    // 4. Create goal (dispatch planning task to me)
    const goalRes = await call('create_goal', {
      title: 'MCP Smoke Goal',
      description: 'Verify the MCP flow end to end',
      projectSlug: testSlug,
    });
    const goalId = goalRes.goal.id;
    const planningTaskId = goalRes.planningTask.id;
    console.log(`✅ create_goal: ${goalId} (planning task ${planningTaskId})`);

    // 5. Read my messages — should include the REQUEST for the planning task
    const inbox = await call('read_messages', { consume: true });
    const hasRequest = inbox.messages.some((m: { taskId: string; type: string }) => m.taskId === planningTaskId && m.type === 'REQUEST');
    if (!hasRequest) throw new Error('REQUEST message for planning task not found');
    console.log(`✅ read_messages: ${inbox.count} messages, REQUEST for planning task found`);

    // 6. Claim the planning task
    const claimed = await call('claim_task', { taskId: planningTaskId });
    if (claimed.task.state !== 'RUNNING') throw new Error('Task did not transition to RUNNING');
    console.log('✅ claim_task: BACKLOG → RUNNING');

    // 7. Plan the goal into a chained pipeline (Antigravity → OpenCode)
    const plan = await call('plan_goal', {
      goalId,
      tasks: [
        { title: 'Research', agent: 'Antigravity', nextAgent: 'OpenCode' },
        { title: 'Build', agent: 'OpenCode' },
      ],
    });
    console.log(`✅ plan_goal: ${plan.planned} tasks planned`);

    // 7b. First planned task must have received a REQUEST (discovery via messages)
    const firstPlanned = plan.tasks[0];
    const firstReq = await prisma.agentMessage.findFirst({
      where: { taskId: firstPlanned.id, type: 'REQUEST' },
    });
    if (!firstReq) throw new Error('plan_goal did not dispatch REQUEST for first planned task');
    console.log('✅ plan_goal: REQUEST dispatched for first planned task');

    // 7c. get_task_context must expose task + goal + project (with repoPath) + messages
    const ctx = await call('get_task_context', { taskId: firstPlanned.id });
    if (!ctx.task || !ctx.goal || !ctx.project || !ctx.project.repoPath) {
      throw new Error('get_task_context missing project.repoPath / goal / messages');
    }
    if (!ctx.messages.some((m: { type: string }) => m.type === 'REQUEST')) {
      throw new Error('get_task_context missing task messages');
    }
    console.log('✅ get_task_context: task + goal + project.repoPath + messages');

    // 8. Send a message to OpenCode (agents talk to each other)
    const sent = await call('send_message', {
      to: 'OpenCode',
      type: 'INFO',
      content: 'Research complete, building now.',
      goalId,
    });
    console.log(`✅ send_message: ${sent.message.id}`);

    // 9. Complete the planning task
    const done = await call('complete_task', {
      taskId: planningTaskId,
      result: 'Research finished, plan created.',
    });
    console.log(`✅ complete_task: ${done.task.state} (handed off to ${done.task.nextAgent || 'n/a'})`);

    // 10. Ownership enforcement: Antigravity must NOT be able to complete OpenCode's task
    const openCodeTask = await prisma.task.findFirst({
      where: { goalId, agent: 'OpenCode' },
      orderBy: { createdAt: 'asc' },
    });
    if (!openCodeTask) throw new Error('OpenCode task not found after handoff');
    const denied = await client.callTool({
      name: 'complete_task',
      arguments: { taskId: openCodeTask.id, result: 'sneaky' },
    });
    if (!denied.isError) throw new Error('Ownership check FAILED: Antigravity completed OpenCode task');
    console.log('✅ ownership: complete_task on foreign task correctly denied');

    // 11. Approvals listing
    const approvals = await call('list_approvals');
    console.log(`✅ list_approvals: ${approvals.count} pending`);

    console.log('\n🎉 ALL MCP SMOKE TESTS PASSED!');
  } finally {
    // Cleanup test data
    const projIds = (await prisma.project.findMany({ where: { slug: testSlug } })).map((p) => p.id);
    const taskIds = (await prisma.task.findMany({ where: { projectId: { in: projIds } } })).map((t) => t.id);
    await prisma.agentMessage.deleteMany({ where: { goal: { project: { slug: testSlug } } } });
    await prisma.activityLog.deleteMany({ where: { taskId: { in: taskIds } } });
    await prisma.activityLog.deleteMany({ where: { agent: 'Antigravity', action: { contains: 'MCP Smoke' } } });
    await prisma.task.deleteMany({ where: { project: { slug: testSlug } } });
    await prisma.goal.deleteMany({ where: { project: { slug: testSlug } } });
    await prisma.project.deleteMany({ where: { slug: testSlug } });
    await prisma.workerStatus.deleteMany({ where: { agent: 'Antigravity' } });
    await client.close();
    await prisma.$disconnect();
    console.log('🧹 cleanup done');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});