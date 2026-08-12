import 'dotenv/config';
import { prisma } from '@/lib/prisma';
import { processHandoffs } from '@/lib/handoff';
import { transitionTask } from '@/lib/transition';
import { PATCH } from '@/app/api/approvals/[id]/route';
import { NextRequest } from 'next/server';

async function testRetryAndApproval() {
  console.log('🧪 Testing Retry Limit & Approval Integration via Real API/Engine...');

  // Cleanup prior test project if left over
  const existingProj = await prisma.project.findUnique({ where: { slug: 'test-retry-proj' } });
  if (existingProj) {
    const tasks = await prisma.task.findMany({ where: { projectId: existingProj.id } });
    const taskIds = tasks.map((t) => t.id);
    await prisma.approval.deleteMany({ where: { taskId: { in: taskIds } } });
    await prisma.activityLog.deleteMany({ where: { taskId: { in: taskIds } } });
    await prisma.agentMessage.deleteMany({ where: { taskId: { in: taskIds } } });
    await prisma.task.deleteMany({ where: { projectId: existingProj.id } });
    await prisma.project.delete({ where: { id: existingProj.id } });
  }

  const project = await prisma.project.create({
    data: {
      name: 'Retry Test Project',
      slug: 'test-retry-proj',
    },
  });

  // Create task with max retries already reached (retryCount: 3, state: FAILED, onFailureAgent: FixerAgent, nextAgent: NextStepAgent)
  const task = await prisma.task.create({
    data: {
      projectId: project.id,
      title: 'Failing Task',
      agent: 'BrokenAgent',
      onFailureAgent: 'FixerAgent',
      nextAgent: 'NextStepAgent',
      state: 'FAILED',
      retryCount: 3,
      handedOff: false,
    },
  });

  console.log(`Created failing task ${task.id} with retryCount = 3`);

  // Step 1: Run handoff engine
  await processHandoffs(task.id);

  // Step 2: Verify approval was created
  const approval = await prisma.approval.findFirst({
    where: { taskId: task.id, status: 'PENDING' },
  });

  if (!approval) {
    console.error('❌ FAIL: Approval was not created when max retries reached!');
    process.exit(1);
  }
  console.log(`✅ Approval created automatically with ID: ${approval.id}`);

  // Step 3: Resolve approval via real PATCH /api/approvals/[id] API endpoint handler
  console.log('Resolving approval via PATCH /api/approvals/[id] handler...');
  const req = new NextRequest(`http://localhost:3100/api/approvals/${approval.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status: 'APPROVED',
      resolvedNote: 'Human approved task retry',
    }),
  });

  const res = await PATCH(req, { params: Promise.resolve({ id: approval.id }) });
  if (res.status !== 200) {
    const errorBody = await res.json();
    console.error('❌ FAIL: PATCH /api/approvals/[id] failed:', errorBody);
    process.exit(1);
  }

  const approvedData = await res.json();
  if (approvedData.status !== 'APPROVED') {
    console.error('❌ FAIL: Approval status was not updated to APPROVED');
    process.exit(1);
  }
  console.log(`✅ Approval ${approval.id} status updated to APPROVED.`);

  // Step 4: Verify Task transitioned to BACKLOG, retryCount reset to 0, handedOff set to false
  const updatedTask = await prisma.task.findUnique({ where: { id: task.id } });
  if (!updatedTask) {
    console.error('❌ FAIL: Task not found!');
    process.exit(1);
  }

  if (updatedTask.state !== 'BACKLOG') {
    console.error(`❌ FAIL: Expected task state BACKLOG, got ${updatedTask.state}`);
    process.exit(1);
  }

  if (updatedTask.retryCount !== 0) {
    console.error(`❌ FAIL: Expected retryCount 0, got ${updatedTask.retryCount}`);
    process.exit(1);
  }

  if (updatedTask.handedOff !== false) {
    console.error(`❌ FAIL: Expected handedOff false, got ${updatedTask.handedOff}`);
    process.exit(1);
  }

  console.log(`✅ Task ${task.id} correctly transitioned to BACKLOG with retryCount = 0 and handedOff = false.`);

  // Step 5: Simulate task execution finishing successfully using transitionTask
  console.log('Simulating task execution completion via transitionTask engine...');
  await transitionTask(task.id, 'RUNNING');
  await transitionTask(task.id, 'DONE', 'Task completed successfully after approval');

  // Step 6: Verify NextStepAgent task was created
  const nextTask = await prisma.task.findFirst({
    where: { projectId: project.id, agent: 'NextStepAgent' },
  });

  if (!nextTask) {
    console.error('❌ FAIL: Task for NextStepAgent was not created after human approval and task completion!');
    process.exit(1);
  }

  console.log(`✅ NextStepAgent task created automatically with ID: ${nextTask.id}`);

  // Step 7: Test Rejection of FAILED task to ensure currentState === newTaskState logic works correctly
  console.log('\n--- Testing Rejection of FAILED Task ---');
  const task2 = await prisma.task.create({
    data: {
      projectId: project.id,
      title: 'Failing Task 2',
      agent: 'BrokenAgent',
      onFailureAgent: 'FixerAgent',
      state: 'FAILED',
      retryCount: 3,
      handedOff: false,
    },
  });

  await processHandoffs(task2.id);

  const approval2 = await prisma.approval.findFirst({
    where: { taskId: task2.id, status: 'PENDING' },
  });

  if (!approval2) {
    console.error('❌ FAIL: Approval 2 was not created!');
    process.exit(1);
  }

  const reqReject = new NextRequest(`http://localhost:3100/api/approvals/${approval2.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status: 'REJECTED',
      resolvedNote: 'Task fix rejected by human',
    }),
  });

  const resReject = await PATCH(reqReject, { params: Promise.resolve({ id: approval2.id }) });
  if (resReject.status !== 200) {
    const errBody = await resReject.json();
    console.error('❌ FAIL: Rejection returned error status:', errBody);
    process.exit(1);
  }

  const task2After = await prisma.task.findUnique({ where: { id: task2.id } });
  if (task2After?.state !== 'FAILED' || task2After?.handedOff !== true) {
    console.error('❌ FAIL: Task 2 after rejection invalid state:', task2After);
    process.exit(1);
  }
  console.log(`✅ Rejecting FAILED task set status to REJECTED, left state as FAILED, and set handedOff = true.`);

  console.log('\n🎉 SUCCESS! All Retry Limit & Approval Integration tests passed!');

  // Cleanup
  const tasks = await prisma.task.findMany({ where: { projectId: project.id } });
  const taskIds = tasks.map((t) => t.id);
  await prisma.approval.deleteMany({ where: { taskId: { in: taskIds } } });
  await prisma.activityLog.deleteMany({ where: { taskId: { in: taskIds } } });
  await prisma.agentMessage.deleteMany({ where: { taskId: { in: taskIds } } });
  await prisma.task.deleteMany({ where: { projectId: project.id } });
  await prisma.project.delete({ where: { id: project.id } });

  process.exit(0);
}

testRetryAndApproval().catch((err) => {
  console.error(err);
  process.exit(1);
});
