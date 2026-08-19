import 'dotenv/config';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '../src/generated/prisma/client';

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL as string,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Seeding Control Center database...');

  // Clean existing data
  await prisma.agentMessage.deleteMany();
  await prisma.approval.deleteMany();
  await prisma.activityLog.deleteMany();
  await prisma.task.deleteMany();
  await prisma.goal.deleteMany();
  await prisma.project.deleteMany();

  // Create Project
  const project = await prisma.project.create({
    data: {
      name: 'WhatsApp AI SaaS',
      slug: 'whatsapp-saas',
      description: 'Build an AI-powered WhatsApp automation platform',
      repoPath: 'c:\\Users\\rodri\\Desktop\\AI\\Projects\\whatsapp-saas',
    },
  });

  // Create Goal
  const goal = await prisma.goal.create({
    data: {
      title: 'Build WhatsApp AI Platform',
      description: 'Implement core functionality from planning to QA',
      projectId: project.id,
      status: 'ACTIVE',
    },
  });

  // Create Tasks (encadenadas)
  const task1 = await prisma.task.create({
    data: {
      title: 'Planning',
      description: 'Define architecture and endpoints',
      projectId: project.id,
      goalId: goal.id,
      agent: 'Antigravity',
      state: 'DONE',
      result: 'Architecture planned.',
      nextAgent: 'OpenDesign',
      handedOff: true,
    },
  });

  const task2 = await prisma.task.create({
    data: {
      title: 'Design',
      description: 'Create UI mockups and design system',
      projectId: project.id,
      goalId: goal.id,
      agent: 'OpenDesign',
      state: 'DONE',
      result: 'Design approved.',
      nextAgent: 'OpenCode',
      handedOff: true,
    },
  });

  const task3 = await prisma.task.create({
    data: {
      title: 'Development',
      description: 'Implement frontend and backend: FastAPI backend endpoints + modern landing page',
      projectId: project.id,
      goalId: goal.id,
      agent: 'OpenCode',
      state: 'BACKLOG',
      nextAgent: 'Antigravity',
      onFailureAgent: 'OpenCode',
    },
  });

  await prisma.task.create({
    data: {
      title: 'QA Verification',
      description: 'End-to-end testing and quality audit',
      projectId: project.id,
      goalId: goal.id,
      agent: 'Antigravity',
      state: 'BACKLOG',
      onFailureAgent: 'OpenCode',
    },
  });

  // Create Messages
  await prisma.agentMessage.createMany({
    data: [
      {
        fromAgent: 'Antigravity',
        toAgent: 'OpenDesign',
        goalId: goal.id,
        taskId: task2.id,
        type: 'HANDOFF',
        content: 'Architecture planned. Ready for design.',
        status: 'RESOLVED',
      },
      {
        fromAgent: 'OpenDesign',
        toAgent: 'OpenCode',
        goalId: goal.id,
        taskId: task3.id,
        type: 'HANDOFF',
        content: 'Design approved. Proceed with development.',
        status: 'READ',
      },
    ],
  });

  // Create an Approval for the blocked task
  await prisma.approval.create({
    data: {
      taskId: task3.id,
      actionType: 'CLIENT_ACTION',
      description: 'Need WhatsApp Business API credentials to continue.',
      status: 'PENDING',
    },
  });

  // Activity Logs
  await prisma.activityLog.createMany({
    data: [
      {
        taskId: task1.id,
        agent: 'Antigravity',
        action: 'Completed planning phase',
      },
      {
        taskId: task2.id,
        agent: 'OpenDesign',
        action: 'Completed design phase',
      },
      {
        taskId: task3.id,
        agent: 'System',
        action: 'Task blocked waiting for human input',
      },
    ],
  });

  console.log('  ✅ Seeded WhatsApp AI SaaS project (1 Goal, 4 Tasks, Messages, Approval)');
  console.log('\n🎉 Seed complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
