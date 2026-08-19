'use server';

import { prisma } from '@/lib/prisma';

export async function getMissionControlState() {
  const activeGoal = await prisma.goal.findFirst({
    where: { status: 'ACTIVE' },
    include: {
      tasks: {
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const projects = await prisma.project.findMany({
    include: {
      goals: {
        select: { id: true, status: true },
      },
      tasks: {
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const workerStatuses = await prisma.workerStatus.findMany();
  
  const knownAgents = ['Antigravity', 'OpenDesign', 'OpenCode', 'OpenHands'];
  const allAgentNames = Array.from(new Set([...knownAgents, ...workerStatuses.map(w => w.agent)]));
  
  const agentStatus = allAgentNames.map(agent => {
    const status = workerStatuses.find(w => w.agent === agent);
    const isOnline = status && (new Date().getTime() - status.lastSeenAt.getTime() < 30000);
    return {
      agent,
      state: isOnline ? status.status : 'OFFLINE',
    };
  });

  const activityLogs = await prisma.activityLog.findMany({
    orderBy: { timestamp: 'desc' },
    take: 50,
  });

  const pendingMessages = await prisma.agentMessage.findMany({
    where: { status: { not: 'RESOLVED' } },
  });

  const pendingApprovals = await prisma.approval.findMany({
    where: { status: 'PENDING' },
    include: {
      task: {
        include: {
          project: { select: { name: true, slug: true } },
        },
      },
    },
    orderBy: { requestedAt: 'desc' },
  });

  return {
    activeGoal,
    projects,
    agentStatus,
    activityLogs,
    pendingMessages,
    pendingApprovals,
  };
}
