import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { prisma } from '@/lib/prisma';

async function main() {
  console.log('DATABASE_URL:', process.env.DATABASE_URL);
  const dbFile = process.env.DATABASE_URL?.replace('file:', '') ?? '';
  console.log('db file:', path.resolve(dbFile));
  console.log('exists:', fs.existsSync(path.resolve(dbFile)));

  const goals = await prisma.goal.findMany({
    orderBy: { createdAt: 'desc' },
    include: { tasks: true, project: { select: { slug: true } } },
  });
  for (const g of goals) {
    console.log('---');
    console.log('GOAL', g.id, '|', g.status, '|', g.title, '| slug:', g.project.slug);
    for (const t of g.tasks) console.log('   ', t.state, '|', t.agent, '|', t.title);
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});