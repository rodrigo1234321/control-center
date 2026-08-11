'use client';

import { useTasks } from '@/lib/hooks/useTasks';
import { ListTodo, Clock, PlayCircle, Eye, CheckCircle2, XCircle } from 'lucide-react';
import { TaskState } from '@/lib/types';
import { Task, Project } from '@/generated/prisma/client';

const STATE_CONFIG: Record<TaskState, { icon: any, color: string, bg: string }> = {
  BACKLOG: { icon: Clock, color: 'text-neutral-400', bg: 'bg-neutral-500/10' },
  RUNNING: { icon: PlayCircle, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  REVIEW: { icon: Eye, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  DONE: { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  FAILED: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10' }
};

export function TasksTable() {
  const { data: tasks, isLoading, error } = useTasks();

  if (isLoading) return <div className="animate-pulse h-64 bg-neutral-900/50 rounded-xl border border-white/5"></div>;
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
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {(tasks as (Task & { project: Project })[])?.map((task) => {
              const stateConf = STATE_CONFIG[task.state as TaskState];
              const Icon = stateConf.icon;
              return (
                <tr key={task.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${stateConf.bg} ${stateConf.color}`}>
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
