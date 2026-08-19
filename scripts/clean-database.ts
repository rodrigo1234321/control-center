import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

async function cleanDatabase() {
  console.log('🧹 Limpiando tareas residuales, logs de prueba y aprobaciones huérfanas...');

  await prisma.activityLog.deleteMany({});
  await prisma.agentMessage.deleteMany({});
  await prisma.approval.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.goal.deleteMany({});

  // Reset worker statuses to ONLINE
  await prisma.workerStatus.upsert({
    where: { agent: 'Antigravity' },
    update: { status: 'ONLINE', lastSeenAt: new Date() },
    create: { agent: 'Antigravity', status: 'ONLINE', lastSeenAt: new Date() },
  });

  await prisma.workerStatus.upsert({
    where: { agent: 'OpenCode' },
    update: { status: 'ONLINE', lastSeenAt: new Date() },
    create: { agent: 'OpenCode', status: 'ONLINE', lastSeenAt: new Date() },
  });

  console.log('✅ Base de datos limpia y lista para operaciones en vivo.');
}

cleanDatabase()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error limpiando base de datos:', err);
    process.exit(1);
  });
