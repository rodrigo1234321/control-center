import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '../src/generated/prisma/client';

const adapter = new PrismaBetterSqlite3({
  url: 'file:./prisma/control-center.db',
});
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Seeding Control Center database...');

  // Clean existing data
  await prisma.approval.deleteMany();
  await prisma.activityLog.deleteMany();
  await prisma.task.deleteMany();
  await prisma.project.deleteMany();

  // --- Projects ---
  const naroAI = await prisma.project.create({
    data: {
      name: 'Naro AI WhatsApp Bot',
      slug: 'naro-ai',
      description: 'Bot de WhatsApp con IA para atención al cliente automatizada',
      repoPath: 'c:\\Users\\rodri\\Desktop\\AI\\Projects\\naro-ai-deploy',
    },
  });

  const dynasty = await prisma.project.create({
    data: {
      name: 'Dynasty.ar',
      slug: 'dynasty-ar',
      description: 'E-commerce de indumentaria urbana premium',
      repoPath: 'c:\\Users\\rodri\\Desktop\\AI\\Projects\\Dynasty.ar',
    },
  });

  const kaffa = await prisma.project.create({
    data: {
      name: 'Kaffa Café de Especialidad',
      slug: 'kaffa-cafe',
      description: 'Landing page para café de especialidad en Mar del Plata',
      repoPath: 'c:\\Users\\rodri\\Desktop\\AI\\Projects\\kaffa-cafe-de-especialidad',
    },
  });

  console.log('  ✅ Created 3 projects');

  // --- Tasks ---
  const tasks = await Promise.all([
    // Naro AI tasks
    prisma.task.create({
      data: {
        title: 'Implementar respuestas con contexto de historial',
        projectId: naroAI.id,
        agent: 'Antigravity',
        state: 'DONE',
        result: 'Implementado con ventana de 10 mensajes previos',
        finishedAt: new Date(Date.now() - 86400000),
      },
    }),
    prisma.task.create({
      data: {
        title: 'Fix timeout en webhook de WhatsApp',
        projectId: naroAI.id,
        agent: 'OpenCode',
        state: 'RUNNING',
      },
    }),
    prisma.task.create({
      data: {
        title: 'Deploy v2.1 a producción',
        projectId: naroAI.id,
        agent: 'OpenCode',
        state: 'REVIEW',
        requiresApproval: true,
        result: 'Build exitoso, tests pasaron, listo para deploy',
      },
    }),

    // Dynasty tasks
    prisma.task.create({
      data: {
        title: 'Rediseñar página de producto con glass effect',
        projectId: dynasty.id,
        agent: 'OpenDesign',
        state: 'DONE',
        result: 'Design system actualizado con glassmorphism tokens',
        finishedAt: new Date(Date.now() - 172800000),
      },
    }),
    prisma.task.create({
      data: {
        title: 'Implementar carrito de compras con persistencia',
        projectId: dynasty.id,
        agent: 'Antigravity',
        state: 'RUNNING',
      },
    }),
    prisma.task.create({
      data: {
        title: 'Integrar MercadoPago checkout',
        projectId: dynasty.id,
        agent: 'OpenCode',
        state: 'BACKLOG',
        requiresApproval: true,
      },
    }),

    // Kaffa tasks
    prisma.task.create({
      data: {
        title: 'Optimizar LCP hero image',
        projectId: kaffa.id,
        agent: 'OpenHands',
        state: 'DONE',
        result: 'LCP reducido de 4.2s a 1.1s con WebP + preload',
        finishedAt: new Date(Date.now() - 43200000),
      },
    }),
    prisma.task.create({
      data: {
        title: 'Test responsive en móvil',
        projectId: kaffa.id,
        agent: 'OpenHands',
        state: 'FAILED',
        result: 'Menú hamburguesa no cierra al hacer scroll en iOS Safari',
        finishedAt: new Date(Date.now() - 7200000),
      },
    }),
  ]);

  console.log(`  ✅ Created ${tasks.length} tasks`);

  // --- Activity Log ---
  const activities = await Promise.all([
    prisma.activityLog.create({
      data: {
        agent: 'Antigravity',
        action: 'Created task: Implementar respuestas con contexto de historial',
        taskId: tasks[0].id,
        timestamp: new Date(Date.now() - 90000000),
      },
    }),
    prisma.activityLog.create({
      data: {
        agent: 'Antigravity',
        action: 'Task completed: Implementar respuestas con contexto de historial',
        taskId: tasks[0].id,
        timestamp: new Date(Date.now() - 86400000),
      },
    }),
    prisma.activityLog.create({
      data: {
        agent: 'OpenCode',
        action: 'Started: Fix timeout en webhook de WhatsApp',
        taskId: tasks[1].id,
        timestamp: new Date(Date.now() - 3600000),
      },
    }),
    prisma.activityLog.create({
      data: {
        agent: 'OpenCode',
        action: 'Task moved to REVIEW (approval required): Deploy v2.1 a producción',
        taskId: tasks[2].id,
        timestamp: new Date(Date.now() - 1800000),
      },
    }),
    prisma.activityLog.create({
      data: {
        agent: 'OpenDesign',
        action: 'Completed: Rediseñar página de producto con glass effect',
        taskId: tasks[3].id,
        timestamp: new Date(Date.now() - 172800000),
      },
    }),
    prisma.activityLog.create({
      data: {
        agent: 'Antigravity',
        action: 'Started: Implementar carrito de compras con persistencia',
        taskId: tasks[4].id,
        timestamp: new Date(Date.now() - 600000),
      },
    }),
    prisma.activityLog.create({
      data: {
        agent: 'OpenHands',
        action: 'QA FAILED: Menú hamburguesa no cierra al hacer scroll en iOS Safari',
        taskId: tasks[7].id,
        timestamp: new Date(Date.now() - 7200000),
      },
    }),
  ]);

  console.log(`  ✅ Created ${activities.length} activity log entries`);

  // --- Approval (pending) ---
  await prisma.approval.create({
    data: {
      taskId: tasks[2].id,
      actionType: 'DEPLOY',
      description: 'Deploy Naro AI WhatsApp Bot v2.1 a producción — build OK, tests OK',
    },
  });

  console.log('  ✅ Created 1 pending approval');
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
