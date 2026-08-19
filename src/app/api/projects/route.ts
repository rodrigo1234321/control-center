import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/** GET /api/projects — List all active projects with task counts */
export async function GET() {
  try {
    const projects = await prisma.project.findMany({
      where: { isActive: true },
      include: {
        _count: {
          select: { tasks: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(projects);
  } catch (error) {
    console.error('[GET /api/projects]', error);
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
  }
}

import { CreateProjectSchema } from '@/lib/schemas';

/** POST /api/projects — Create a new project */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = CreateProjectSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validación fallida', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { name, slug, description, repoPath } = parsed.data;

    const project = await prisma.project.create({
      data: { name, slug, description, repoPath },
    });

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    if ((error as { code?: string } | null)?.code === 'P2002') {
      return NextResponse.json({ error: 'A project with this slug already exists' }, { status: 409 });
    }
    console.error('[POST /api/projects]', error);
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
  }
}
