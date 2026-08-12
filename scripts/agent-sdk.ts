import 'dotenv/config';
import { parseArgs } from 'node:util';
import { prisma } from '@/lib/prisma';
import { MESSAGE_TYPES } from '@/lib/types';

async function upsertWorkerStatus(agent: string, status: string = 'ONLINE') {
  await prisma.workerStatus.upsert({
    where: { agent },
    update: { status, lastSeenAt: new Date() },
    create: { agent, status, lastSeenAt: new Date() },
  });
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.error('Usage: npx tsx scripts/agent-sdk.ts <command> [args]');
    process.exit(1);
  }

  if (command === 'heartbeat') {
    const { values } = parseArgs({
      args: args.slice(1),
      options: {
        agent: { type: 'string' },
        status: { type: 'string' },
      },
    });

    if (!values.agent) {
      console.error('Missing required argument: --agent');
      process.exit(1);
    }

    const status = values.status || 'ONLINE';
    await upsertWorkerStatus(values.agent, status);

    console.log(`Heartbeat updated for agent '${values.agent}' (status: ${status})`);
    process.exit(0);
  }

  if (command === 'create-task') {
    const { values } = parseArgs({
      args: args.slice(1),
      options: {
        project: { type: 'string' },
        title: { type: 'string' },
        agent: { type: 'string' },
      },
    });

    if (!values.project || !values.title || !values.agent) {
      console.error('Missing required arguments: --project, --title, --agent');
      process.exit(1);
    }

    const project = await prisma.project.findUnique({
      where: { slug: values.project },
    });

    if (!project) {
      console.error(`Project with slug '${values.project}' not found`);
      process.exit(1);
    }

    const task = await prisma.task.create({
      data: {
        projectId: project.id,
        title: values.title,
        agent: values.agent,
        state: 'BACKLOG',
      },
    });

    await prisma.activityLog.create({
      data: {
        taskId: task.id,
        agent: values.agent,
        action: `Created task via SDK: ${task.title}`,
      },
    });

    await upsertWorkerStatus(values.agent, 'ONLINE');

    console.log(`Task created successfully with ID: ${task.id}`);
    process.exit(0);
  }

  if (command === 'update-task') {
    const taskId = args[1];
    if (!taskId || taskId.startsWith('--')) {
      console.error('Usage: update-task <id> [--agent AGENT] [--state STATE] [--result "RESULT"]');
      process.exit(1);
    }

    const { values } = parseArgs({
      args: args.slice(2),
      options: {
        agent: { type: 'string' },
        state: { type: 'string' },
        result: { type: 'string' },
        'next-agent': { type: 'string' },
        'on-failure-agent': { type: 'string' },
      },
    });

    try {
      const { transitionTask } = await import('@/lib/transition');
      const task = await transitionTask(taskId, values.state as any, values.result);
      
      // If there are specific fields like next-agent that transitionTask doesn't handle natively via state
      const extraUpdate: any = {};
      if (values['next-agent']) extraUpdate.nextAgent = values['next-agent'];
      if (values['on-failure-agent']) extraUpdate.onFailureAgent = values['on-failure-agent'];
      
      if (Object.keys(extraUpdate).length > 0) {
        await prisma.task.update({
          where: { id: taskId },
          data: extraUpdate,
        });
      }

      const agentToUpdate = (values.agent as string) || task.agent;
      if (agentToUpdate) {
        await upsertWorkerStatus(agentToUpdate, 'ONLINE');
      }

      console.log(`Task ${task.id} updated successfully.`);
    } catch (e: any) {
      console.error(`Failed to update task: ${e.message}`);
      process.exit(1);
    }

    process.exit(0);
  }

  if (command === 'send-message') {
    const { values } = parseArgs({
      args: args.slice(1),
      options: {
        from: { type: 'string' },
        to: { type: 'string' },
        goal: { type: 'string' },
        task: { type: 'string' },
        type: { type: 'string' },
        content: { type: 'string' },
      },
    });

    if (!values.from || !values.to || !values.type || !values.content) {
      console.error('Missing required arguments: --from, --to, --type, --content');
      process.exit(1);
    }

    if (!MESSAGE_TYPES.includes(values.type as any)) {
      console.error(`Invalid type. Must be one of: ${MESSAGE_TYPES.join(', ')}`);
      process.exit(1);
    }

    const message = await prisma.agentMessage.create({
      data: {
        fromAgent: values.from,
        toAgent: values.to,
        goalId: values.goal,
        taskId: values.task,
        type: values.type,
        content: values.content,
      },
    });

    await upsertWorkerStatus(values.from, 'ONLINE');

    console.log(`Message sent successfully with ID: ${message.id}`);
    
    // Process handoffs to see if this message triggers an immediate task handoff
    const { processHandoffs } = await import('@/lib/handoff');
    await processHandoffs();

    process.exit(0);
  }

  if (command === 'read-messages') {
    const { values } = parseArgs({
      args: args.slice(1),
      options: {
        agent: { type: 'string' },
        status: { type: 'string' }, // UNREAD, READ, RESOLVED
        consume: { type: 'boolean' }, // Mark as READ
        peek: { type: 'boolean' },    // Leave as is (default)
      },
    });

    if (!values.agent) {
      console.error('Missing required argument: --agent');
      process.exit(1);
    }

    const where: any = { toAgent: values.agent };
    if (values.status) where.status = values.status;
    else where.status = 'UNREAD'; // Default to unread

    const messages = await prisma.agentMessage.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });

    if (values.consume && messages.length > 0) {
      await prisma.agentMessage.updateMany({
        where: { id: { in: messages.map((m) => m.id) } },
        data: { status: 'READ', readAt: new Date() },
      });
    }

    console.log(JSON.stringify(messages, null, 2));
    process.exit(0);
  }

  if (command === 'plan-goal') {
    const goalId = args[1];
    if (!goalId || goalId.startsWith('--')) {
      console.error('Usage: plan-goal <goalId> --tasks \'[{"title": "...", "agent": "...", "description": "..."}]\'');
      process.exit(1);
    }

    const { values } = parseArgs({
      args: args.slice(2),
      options: {
        tasks: { type: 'string' },
      },
    });

    if (!values.tasks) {
      console.error('Missing required argument: --tasks (JSON string)');
      process.exit(1);
    }

    const goal = await prisma.goal.findUnique({ where: { id: goalId } });
    if (!goal) {
      console.error(`Goal ${goalId} not found`);
      process.exit(1);
    }

    const tasksData = JSON.parse(values.tasks);
    
    for (let i = 0; i < tasksData.length; i++) {
      const t = tasksData[i];
      const nextTask = tasksData[i + 1];
      
      await prisma.task.create({
        data: {
          title: t.title,
          description: t.description,
          agent: t.agent,
          nextAgent: nextTask ? nextTask.agent : undefined,
          goalId: goal.id,
          projectId: goal.projectId,
          state: 'BACKLOG',
        },
      });
    }

    console.log(`Successfully planned ${tasksData.length} tasks for goal ${goal.id}`);
    process.exit(0);
  }

  console.error(`Unknown command: ${command}`);
  process.exit(1);
}

main().catch(console.error);
