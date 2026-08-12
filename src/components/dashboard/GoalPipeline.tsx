'use client';

import { useGoals } from '@/lib/hooks/useGoals';
import { STATE_COLORS } from '@/lib/types';
import { Target, ArrowRight, CheckCircle2, Clock, PlayCircle, Eye, XCircle, ListTodo } from 'lucide-react';
import { useProjectContext } from '@/contexts/ProjectContext';

const STATE_ICONS: Record<string, any> = {
  BACKLOG: Clock,
  RUNNING: PlayCircle,
  REVIEW: Eye,
  DONE: CheckCircle2,
  FAILED: XCircle,
  UNKNOWN: ListTodo
};

export function GoalPipeline() {
  const { selectedProjectId } = useProjectContext();
  const { data: goals, isLoading, error } = useGoals(selectedProjectId || undefined);

  if (isLoading) return <div className="animate-pulse h-64 bg-neutral-900/50 rounded-xl border border-white/5"></div>;
  if (error) return <div className="text-red-400">Failed to load goals</div>;

  return (
    <div className="bg-neutral-900/50 rounded-xl border border-white/5 overflow-hidden flex flex-col h-full">
      <div className="p-4 border-b border-white/5 flex items-center justify-between">
        <h2 className="text-sm font-semibold flex items-center gap-2 text-white">
          <Target className="w-4 h-4 text-purple-400" />
          Active Goals Pipeline
        </h2>
        <span className="bg-purple-500/10 text-purple-400 text-xs px-2 py-0.5 rounded-full font-medium">
          {goals?.length || 0} goals
        </span>
      </div>
      
      <div className="p-4 space-y-6 overflow-y-auto flex-1">
        {(!goals || goals.length === 0) ? (
          <div className="text-center text-neutral-500 py-8">No active goals</div>
        ) : (
          goals.map((goal: any) => (
            <div key={goal.id} className="bg-black/20 rounded-lg p-4 border border-white/5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-medium text-white">{goal.title}</h3>
                  <p className="text-xs text-neutral-400 mt-1">{goal.project?.name}</p>
                </div>
                <div className={`px-2 py-1 rounded text-xs font-medium ${
                  goal.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-blue-500/10 text-blue-400'
                }`}>
                  {goal.status}
                </div>
              </div>
              
              <div className="flex flex-wrap items-center gap-2">
                {goal.tasks?.map((task: any, index: number) => {
                  const stateName = task.state || 'UNKNOWN';
                  const stateColors = STATE_COLORS[stateName] || STATE_COLORS['UNKNOWN'];
                  const Icon = STATE_ICONS[stateName] || STATE_ICONS['UNKNOWN'];
                  
                  return (
                    <div key={task.id} className="flex items-center">
                      <div className={`flex flex-col border border-white/10 rounded-lg p-3 w-48 ${stateName === 'FAILED' ? 'border-red-500/30 bg-red-500/5' : 'bg-white/[0.02]'}`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-neutral-300">{task.agent}</span>
                          <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${stateColors.bg} ${stateColors.text}`}>
                            <Icon className="w-3 h-3" />
                            {task.state}
                          </div>
                        </div>
                        <p className="text-[11px] text-neutral-400 line-clamp-2" title={task.title}>{task.title}</p>
                      </div>
                      
                      {index < goal.tasks.length - 1 && (
                        <ArrowRight className="w-4 h-4 mx-2 text-neutral-600" />
                      )}
                    </div>
                  );
                })}
                {goal.tasks?.length === 0 && (
                  <span className="text-xs text-neutral-500">No tasks defined for this goal yet.</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
