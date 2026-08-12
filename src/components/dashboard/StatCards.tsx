'use client';

import { useProjects } from '@/lib/hooks/useProjects';
import { useTasks } from '@/lib/hooks/useTasks';
import { Project, Task } from '@/generated/prisma/client';

import { useProjectContext } from '@/contexts/ProjectContext';

export function StatCards() {
  const { data: projects } = useProjects();
  const { selectedProjectId } = useProjectContext();
  const { data: tasks } = useTasks({ projectId: selectedProjectId || undefined });

  const activeProjects = (projects as Project[])?.filter(p => p.isActive)?.length || 0;
  const totalTasks = (tasks as Task[])?.length || 0;

  return (
    <div className="flex items-center gap-6 bg-neutral-900/50 p-4 rounded-xl border border-white/5 mb-6">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-neutral-400">Proyectos activos:</span>
        <span className="text-sm font-bold text-white">{activeProjects}</span>
      </div>
      <div className="w-px h-4 bg-white/10"></div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-neutral-400">Tareas:</span>
        <span className="text-sm font-bold text-white">{totalTasks}</span>
      </div>
    </div>
  );
}
