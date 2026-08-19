import 'dotenv/config';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { prisma } from '../src/lib/prisma';
import { transitionTask } from '../src/lib/transition';
import { processHandoffs } from '../src/lib/handoff';
import { isValidTransition } from '../src/lib/types';

async function runDefinitiveE2ETest() {
  console.log('================================================================');
  console.log('   DEFINITIVE REAL E2E PIPELINE TEST: GOAL → PLAN → BUILD → QA   ');
  console.log('================================================================\n');

  // 1. Crear Proyecto de prueba E2E
  const projectSlug = `e2e-landing-${Date.now()}`;
  const repoPath = path.resolve('temp-repos', projectSlug);
  await mkdir(repoPath, { recursive: true });

  const project = await prisma.project.create({
    data: {
      name: 'E2E Consulting Landing',
      slug: projectSlug,
      repoPath,
    },
  });
  console.log(`✅ [1/5] Proyecto E2E creado: ${project.name} (${project.slug}) en ${repoPath}`);

  // 2. Crear Goal Activo
  const goal = await prisma.goal.create({
    data: {
      title: 'Crear una landing mínima de consultoría IA',
      description: 'Arquitectura, diseño frontend y verificación completa de landing page profesional.',
      projectId: project.id,
      status: 'ACTIVE',
    },
  });
  console.log(`✅ [2/5] Goal creado: ${goal.title} (GoalID: ${goal.id})`);

  // 3. Tarea 1: PLANNER (Antigravity) con handoff configurado a OpenCode
  const planTask = await prisma.task.create({
    data: {
      projectId: project.id,
      goalId: goal.id,
      title: 'Planning & Architecture Research',
      description: 'Investigar estructura de landing y definir design tokens en research.md',
      agent: 'Antigravity',
      state: 'BACKLOG',
      nextAgent: 'OpenCode',
      onFailureAgent: 'Antigravity',
    },
  });
  console.log(`✅ [3/5] Tarea 1 creada en BACKLOG: ${planTask.title} (Agent: ${planTask.agent})`);

  // Simular ciclo de ejecución de Planner: BACKLOG -> RUNNING -> DONE
  if (!isValidTransition('BACKLOG', 'RUNNING')) throw new Error('Invalid transition BACKLOG -> RUNNING');
  await transitionTask(planTask.id, 'RUNNING');
  console.log('   -> Tarea 1 reclamada: BACKLOG → RUNNING');

  // Escribir archivo de investigación real en el repo
  await writeFile(path.join(repoPath, 'research.md'), '# AI Consulting Landing Architecture\n- Hero Section\n- Services Grid\n- Contact Form', 'utf-8');

  if (!isValidTransition('RUNNING', 'DONE')) throw new Error('Invalid transition RUNNING -> DONE');
  await transitionTask(planTask.id, 'DONE', 'Research y arquitectura completados con research.md.');
  console.log('   -> Tarea 1 finalizada con éxito: RUNNING → DONE');

  // 4. Verificar Handoff automático a Tarea 2: BUILDER (OpenCode)
  const buildTask = await prisma.task.findFirst({
    where: {
      goalId: goal.id,
      agent: 'OpenCode',
      state: 'BACKLOG',
    },
  });
  if (!buildTask) throw new Error('Handoff engine failed: OpenCode task was not created automatically in BACKLOG');
  console.log(`✅ [4/5] Handoff exitoso -> Tarea 2 creada automáticamente: ${buildTask.title} (Agent: ${buildTask.agent})`);

  // Configurar handoff de OpenCode hacia QA_VERIFIER (Antigravity)
  await prisma.task.update({
    where: { id: buildTask.id },
    data: { nextAgent: 'Antigravity', onFailureAgent: 'OpenCode' },
  });

  // Simular ciclo de ejecución de OpenCode: BACKLOG -> RUNNING -> DONE
  await transitionTask(buildTask.id, 'RUNNING');
  console.log('   -> Tarea 2 reclamada: BACKLOG → RUNNING');

  // Escribir artefacto de código real
  await writeFile(path.join(repoPath, 'index.html'), '<!DOCTYPE html><html><head><title>AI Consulting</title></head><body><h1>AI Enterprise</h1></body></html>', 'utf-8');

  await transitionTask(buildTask.id, 'DONE', 'Landing HTML estructurada y compilada en index.html.');
  console.log('   -> Tarea 2 finalizada con éxito: RUNNING → DONE');

  // 5. Verificar Handoff automático a Tarea 3: QA_VERIFIER (Antigravity)
  const qaTask = await prisma.task.findFirst({
    where: {
      goalId: goal.id,
      agent: 'Antigravity',
      state: 'BACKLOG',
      id: { not: planTask.id },
    },
  });
  if (!qaTask) throw new Error('Handoff engine failed: Antigravity QA task was not created automatically in BACKLOG');
  console.log(`✅ [5/5] Handoff exitoso -> Tarea 3 creada automáticamente: ${qaTask.title} (Agent: ${qaTask.agent})`);

  // Simular ciclo de ejecución de QA: BACKLOG -> RUNNING -> DONE
  await transitionTask(qaTask.id, 'RUNNING');
  console.log('   -> Tarea 3 reclamada: BACKLOG → RUNNING');

  await writeFile(path.join(repoPath, 'QA_REPORT.md'), '# QA Verification Report\nStatus: 100% Passed. Semantic HTML valid.', 'utf-8');
  await transitionTask(qaTask.id, 'DONE', 'Verificación QA aprobada al 100%. Código listo para producción.');
  console.log('   -> Tarea 3 finalizada con éxito: RUNNING → DONE');

  // Completar Goal
  await prisma.goal.update({
    where: { id: goal.id },
    data: { status: 'COMPLETED' },
  });

  console.log('\n================================================================');
  console.log('🎉 DEFINITIVE E2E PIPELINE PASSED 100% WITH ZERO INVALID TRANSITIONS!');
  console.log('   Goal Lifecycle: ACTIVE → PLANNER → BUILDER → QA → COMPLETED');
  console.log('================================================================\n');
}

runDefinitiveE2ETest()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('E2E Pipeline Test Error:', err);
    process.exit(1);
  });
