'use client';

import { useProjects } from '@/lib/hooks/useProjects';
import { FolderGit2, CheckCircle2 } from 'lucide-react';
import { Project, Task } from '@/generated/prisma/client';
import { useProjectContext } from '@/contexts/ProjectContext';

export function ProjectsList() {
  const { data: projects, isLoading, error } = useProjects();
  const { selectedProjectId, setSelectedProjectId } = useProjectContext();

  if (isLoading) return <div className="animate-pulse h-32 bg-neutral-900/50 rounded-xl border border-white/5"></div>;
  if (error) return <div className="text-red-400">Failed to load projects</div>;

  const activeProjects = (projects as (Project & { tasks: Task[] })[])?.filter(p => p.isActive) || [];

  return (
    <div className="bg-neutral-900/50 rounded-xl border border-white/5 overflow-hidden flex flex-col h-full">
      <div className="p-4 border-b border-white/5 flex items-center justify-between">
        <h2 className="text-sm font-semibold flex items-center gap-2 text-white">
          <FolderGit2 className="w-4 h-4 text-blue-400" />
          Active Projects
        </h2>
        <span className="bg-blue-500/10 text-blue-400 text-xs px-2 py-0.5 rounded-full font-medium">
          {activeProjects.length}
        </span>
      </div>
      
      <div className="divide-y divide-white/5 overflow-y-auto flex-1">
        {activeProjects.length === 0 ? (
          <div className="p-4 text-sm text-neutral-500 text-center">No active projects</div>
        ) : (
          activeProjects.map((project) => (
            <div 
              key={project.id} 
              className={`p-4 hover:bg-white/[0.02] transition-colors cursor-pointer ${
                selectedProjectId === project.id ? 'bg-purple-500/10 border-l-2 border-purple-500' : ''
              }`}
              onClick={() => setSelectedProjectId(selectedProjectId === project.id ? null : project.id)}
            >
              <div className="flex justify-between items-start mb-1">
                <h3 className={`text-sm font-medium ${selectedProjectId === project.id ? 'text-purple-400' : 'text-neutral-200'}`}>
                  {project.name}
                </h3>
              </div>
              {project.description && (
                <p className="text-xs text-neutral-500 line-clamp-1 mb-2">{project.description}</p>
              )}
              <div className="flex items-center gap-3 text-xs text-neutral-600">
                <div className="flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>{project.tasks?.filter(t => t.state === 'DONE').length || 0} tasks done</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
