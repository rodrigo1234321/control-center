import 'dotenv/config';
import { parseArgs } from 'node:util';
import { prisma } from '@/lib/prisma';
import { transitionTask } from '@/lib/transition';
import fs from 'fs/promises';
import path from 'path';

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let hasFailedOnce = false;

async function updateHeartbeat(agent: string) {
  await prisma.workerStatus.upsert({
    where: { agent },
    update: { status: 'ONLINE', lastSeenAt: new Date() },
    create: { agent, status: 'ONLINE' }
  });
}

async function markOffline(agent: string) {
  await prisma.workerStatus.upsert({
    where: { agent },
    update: { status: 'OFFLINE', lastSeenAt: new Date() },
    create: { agent, status: 'OFFLINE' }
  });
}

async function main() {
  const args = process.argv.slice(2);
  const { values } = parseArgs({
    args,
    options: {
      agent: { type: 'string' },
      poll: { type: 'string' }, // seconds
      'fail-once': { type: 'boolean' },
    },
  });

  if (!values.agent) {
    console.error('Usage: npx tsx scripts/dummy-worker.ts --agent <AgentName> [--poll <seconds>] [--fail-once]');
    process.exit(1);
  }

  const agent = values.agent;
  const pollInterval = values.poll ? parseInt(values.poll) * 1000 : 0;
  const failOnce = values['fail-once'] || false;

  console.log(`[Dummy Worker] Starting for agent: ${agent}`);
  if (failOnce) console.log(`[Dummy Worker] Simulated QA failure is ENABLED.`);

  async function tick() {
    await updateHeartbeat(agent);

    // Read UNREAD messages for this agent
    const messages = await prisma.agentMessage.findMany({
      where: {
        toAgent: agent,
        status: 'UNREAD',
      },
      orderBy: { createdAt: 'asc' },
    });

    if (messages.length === 0) {
      if (!pollInterval) console.log(`[Dummy Worker] No unread messages for ${agent}.`);
      return;
    }

    for (const msg of messages) {
      console.log(`\n[Dummy Worker] Received message ${msg.type} from ${msg.fromAgent}:`);
      console.log(`Content: ${msg.content}`);

      // Mark message as read
      await prisma.agentMessage.update({
        where: { id: msg.id },
        data: { status: 'READ', readAt: new Date() },
      });

      if (msg.type === 'CONTROL') {
        console.log(`[Dummy Worker] Handling CONTROL message...`);
        let ackContent = `Acknowledged control message: ${msg.content}`;

        if (msg.content.startsWith('STOP_TASK:')) {
          const taskId = msg.content.slice('STOP_TASK:'.length).trim() || msg.taskId;
          if (taskId) {
            console.log(`[${agent}] [Dummy Worker] Stopping task ${taskId}...`);
            try {
              await transitionTask(taskId, 'FAILED', 'Stopped by operator');
              ackContent = `Stopped task ${taskId}`;
            } catch (err: any) {
              console.error(`[${agent}] [Dummy Worker] Failed to stop task ${taskId}:`, err.message);
              ackContent = `Failed to stop task ${taskId}: ${err.message}`;
            }
          }
        } else if (msg.content.startsWith('PAUSE_TASK:')) {
          const taskId = msg.content.slice('PAUSE_TASK:'.length).trim() || msg.taskId;
          if (taskId) {
            console.log(`[${agent}] [Dummy Worker] Pausing task ${taskId}...`);
            try {
              await transitionTask(taskId, 'PAUSED');
              ackContent = `Paused task ${taskId}`;
            } catch (err: any) {
              console.error(`[${agent}] [Dummy Worker] Failed to pause task ${taskId}:`, err.message);
              ackContent = `Failed to pause task ${taskId}: ${err.message}`;
            }
          }
        } else if (msg.content.startsWith('RESUME_TASK:')) {
          const taskId = msg.content.slice('RESUME_TASK:'.length).trim() || msg.taskId;
          if (taskId) {
            console.log(`[${agent}] [Dummy Worker] Resuming task ${taskId}...`);
            try {
              await transitionTask(taskId, 'RUNNING');
              ackContent = `Resumed task ${taskId}`;
            } catch (err: any) {
              console.error(`[${agent}] [Dummy Worker] Failed to resume task ${taskId}:`, err.message);
              ackContent = `Failed to resume task ${taskId}: ${err.message}`;
            }
          }
        } else if (msg.content.startsWith('STOP')) {
          console.log(`[${agent}] [Dummy Worker] Received STOP command. Shutting down gracefully...`);
          await markOffline(agent);
          process.exit(0);
        }

        await prisma.agentMessage.create({
          data: {
            fromAgent: agent,
            toAgent: msg.fromAgent,
            goalId: msg.goalId,
            taskId: msg.taskId,
            type: 'ACK',
            content: ackContent,
          },
        });

        await prisma.agentMessage.update({
          where: { id: msg.id },
          data: { status: 'RESOLVED' },
        });

        await prisma.activityLog.create({
          data: {
            agent,
            action: `Handled CONTROL message: ${msg.content} -> ${ackContent}`,
          },
        });

        continue;
      }

      if (msg.taskId && (msg.type === 'REQUEST' || msg.type === 'HANDOFF' || msg.type === 'FIX_REQUEST')) {
        // Start working on the task
        const task = await prisma.task.findUnique({ 
          where: { id: msg.taskId },
          include: { project: true }
        });
        
        if (task && task.state === 'BACKLOG') {
          console.log(`[Dummy Worker] Transitioning Task ${task.id} to RUNNING...`);
          await transitionTask(task.id, 'RUNNING');
          
          console.log(`[Dummy Worker] Working on task: ${task.title}...`);
          await sleep(2000); // Simulate work
          
          const repoPath = task.project.repoPath || process.cwd();
          const targetFile = path.join(repoPath, 'landing', 'index.html');
          
          try {
            await fs.mkdir(path.dirname(targetFile), { recursive: true });
          } catch (e) {}

          if (failOnce && !hasFailedOnce) {
            console.log(`[Dummy Worker] Simulating failure!`);
            hasFailedOnce = true;
            await fs.writeFile(targetFile, '<!-- BROKEN HTML -->\n<button>Click');
            await transitionTask(task.id, 'FAILED', `Simulated failure by ${agent}. Syntax error in HTML.`);
          } else {
            console.log(`[Dummy Worker] Finished task successfully.`);
            await fs.writeFile(targetFile, '<!-- FIXED HTML -->\n<button>Click</button>');
            await transitionTask(task.id, 'DONE', `Simulated output by ${agent}. File written to ${targetFile}`);
          }
          
        } else {
          console.log(`[Dummy Worker] Task ${msg.taskId} is not in BACKLOG state (current: ${task?.state}). Skipping work.`);
        }
      }
      
      // Mark as resolved
      await prisma.agentMessage.update({
        where: { id: msg.id },
        data: { status: 'RESOLVED' },
      });
    }
  }

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log(`[Dummy Worker] Shutting down... marking offline.`);
    await markOffline(agent);
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log(`[Dummy Worker] Shutting down... marking offline.`);
    await markOffline(agent);
    process.exit(0);
  });

  if (pollInterval > 0) {
    console.log(`[Dummy Worker] Polling every ${pollInterval / 1000} seconds...`);
    while (true) {
      await tick();
      await sleep(pollInterval);
    }
  } else {
    await tick();
    await markOffline(agent);
  }
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
