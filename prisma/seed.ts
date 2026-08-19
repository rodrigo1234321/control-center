import 'dotenv/config';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '../src/generated/prisma/client';

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL as string,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Inicializando Control Center en estado limpio y listo para operar...');

  // Limpiar datos residuales
  await prisma.agentMessage.deleteMany();
  await prisma.approval.deleteMany();
  await prisma.activityLog.deleteMany();
  await prisma.task.deleteMany();
  await prisma.goal.deleteMany();
  await prisma.project.deleteMany();

  // Crear Proyecto Base limpio (sin tareas pendientes encoladas)
  const defaultProject = await prisma.project.create({
    data: {
      name: 'Default Workspace',
      slug: 'default-workspace',
      description: 'Espacio de trabajo principal para consultas, pruebas y misiones bajo demanda.',
      repoPath: null,
      isActive: true,
    },
  });

  // Registrar estado ONLINE para los agentes principales
  const agents = ['Antigravity', 'OpenCode', 'OpenDesign', 'OpenHands'];
  for (const agent of agents) {
    await prisma.workerStatus.upsert({
      where: { agent },
      update: { status: 'ONLINE', lastSeenAt: new Date() },
      create: { agent, status: 'ONLINE', lastSeenAt: new Date() },
    });
  }

  // Registrar log de bienvenida
  await prisma.activityLog.create({
    data: {
      projectId: defaultProject.id,
      agent: 'System',
      action: 'Control Center iniciado en modo limpio. Listo para recibir misiones y consultas.',
    },
  });

  console.log('  ✅ Entorno limpio configurado con éxito.');
  console.log('  ✅ 0 tareas pendientes. Workers en modo ONLINE / IDLE listos para recibir trabajo.');
  console.log('\n🎉 Seed completado.');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
