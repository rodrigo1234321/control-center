'use client';

import { useTasks } from '@/lib/hooks/useTasks';
import { ListTodo, Clock, PlayCircle, Eye, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { TaskState } from '@/lib/types';
import { Task, Project } from '@/generated/prisma/client';
import AgentControl from './AgentControl';
import { useProjectContext } from '@/contexts/ProjectContext';

import { STATE_COLORS } from '@/lib/types';

const STATE_ICONS: Record<string, any> = {
  BACKLOG: Clock,
  RUNNING: PlayCircle,
  REVIEW: Eye,
  DONE: CheckCircle2,
  FAILED: XCircle,
  PAUSED: Clock,
  BLOCKED: AlertCircle,
  UNKNOWN: ListTodo
};

export function TasksTable() {
  const { selectedProjectId } = useProjectContext();
  const { data: tasks, isLoading, error } = useTasks({ projectId: selectedProjectId || undefined });

  if (isLoading) return <div className="animate-pulse h-full bg-neutral-900/50 rounded-xl border border-white/5 min-h-[300px]"></div>;
  if (error) return <div className="text-red-400">Failed to load tasks</div>;

  return (
    <div className="bg-neutral-900/50 rounded-xl border border-white/5 overflow-hidden flex flex-col h-full">
      <div className="p-4 border-b border-white/5 flex items-center justify-between">
        <h2 className="text-sm font-semibold flex items-center gap-2 text-white">
          <ListTodo className="w-4 h-4 text-emerald-400" />
          Recent Tasks
        </h2>
        <span className="bg-emerald-500/10 text-emerald-400 text-xs px-2 py-0.5 rounded-full font-medium">
          {tasks?.length || 0} total
        </span>
      </div>
      
      <div className="overflow-x-auto flex-1">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-neutral-500 bg-black/20 uppercase border-b border-white/5">
            <tr>
              <th className="px-4 py-3 font-medium">State</th>
              <th className="px-4 py-3 font-medium">Title</th>
              <th className="px-4 py-3 font-medium">Project</th>
              <th className="px-4 py-3 font-medium">Agent</th>
              <th className="px-4 py-3 font-medium">Result</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {(tasks as (Task & { project: Project })[])?.map((task) => {
              const stateName = task.state || 'UNKNOWN';
              const stateColors = STATE_COLORS[stateName] || STATE_COLORS['UNKNOWN'];
              const Icon = STATE_ICONS[stateName] || STATE_ICONS['UNKNOWN'];
              return (
                <tr key={task.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${stateColors.bg} ${stateColors.text}`}>
                      <Icon className="w-3.5 h-3.5" />
                      {task.state}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium text-neutral-200">
                    {task.title}
                  </td>
                  <td className="px-4 py-3 text-neutral-400">
                    {task.project?.name || 'Unknown'}
                  </td>
                  <td className="px-4 py-3 text-neutral-400">
                    {task.agent}
                  </td>
                  <td className="px-4 py-3 text-neutral-500 max-w-xs truncate">
                    {task.result || '-'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <AgentControl 
                      taskId={task.id} 
                      currentState={task.state}
                      agentName={task.agent}
                      goalId={task.goalId}
                      onUpdate={() => window.location.reload()} 
                    />
                  </td>
                </tr>
              );
            })}
            {(!tasks || tasks.length === 0) && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-neutral-500">
                  No tasks found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
