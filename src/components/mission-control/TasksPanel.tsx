'use client';

import React from 'react';
import { useMissionControl } from './MissionControlContext';
import { useProjectContext } from '@/contexts/ProjectContext';
import { WorkerControl } from './WorkerControl';
import { STATE_COLORS } from '@/lib/types';
import { ListTodo, Bot, Clock, FolderGit2, Target, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function TasksPanel() {
  const { state } = useMissionControl();
  const { selectedProjectId, setSelectedProjectId } = useProjectContext();

  const selectedProject = state?.projects.find((p) => p.id === selectedProjectId);
  const activeGoal = state?.activeGoal;

  type MissionTask = NonNullable<typeof state>['projects'][number]['tasks'][number];

  // Determine tasks to display: Selected project tasks if project selected, otherwise active goal tasks
  let tasksToDisplay: MissionTask[] = [];
  let headerLabel = 'Tasks';
  let headerSub = 'Active Mission';

  if (selectedProject) {
    tasksToDisplay = selectedProject.tasks ?? [];
    headerLabel = `Tasks — ${selectedProject.name}`;
    headerSub = 'Selected Project';
  } else if (activeGoal) {
    tasksToDisplay = activeGoal.tasks ?? [];
    headerLabel = `Tasks — ${activeGoal.title}`;
    headerSub = 'Active Mission';
  }

  return (
    <div className="border border-white/5 rounded-xl bg-surface/30 p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListTodo className="w-4 h-4 text-zinc-400" />
          <h2 className="text-xs font-mono text-zinc-500 uppercase tracking-widest">
            {headerLabel} ({tasksToDisplay.length})
          </h2>
        </div>

        {selectedProject && (
          <button
            onClick={() => setSelectedProjectId(null)}
            className="flex items-center gap-1 text-[11px] font-mono text-amber-400/80 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 px-2 py-1 rounded border border-amber-500/30 transition-all"
            title="Clear project filter"
          >
            <FolderGit2 className="w-3 h-3" />
            <span>Filter: {selectedProject.name}</span>
            <X className="w-3 h-3 ml-0.5" />
          </button>
        )}
      </div>

      {tasksToDisplay.length === 0 ? (
        <div className="p-8 border border-white/5 rounded-lg bg-surface/20 flex flex-col items-center justify-center text-zinc-500 gap-2 font-mono text-sm">
          <Target className="w-6 h-6 opacity-40" />
          <span>No tasks found for {headerSub.toLowerCase()}</span>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          <AnimatePresence mode="popLayout">
            {tasksToDisplay.map((task) => {
              const colorConfig = STATE_COLORS[task.state] || STATE_COLORS.UNKNOWN;
              const formattedTime = new Date(task.createdAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              });
              const formattedDate = new Date(task.createdAt).toLocaleDateString([], {
                month: 'short',
                day: 'numeric',
              });

              return (
                <motion.div
                  key={task.id}
                  layout
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  className="border border-white/5 rounded-lg bg-surface/20 p-3.5 hover:border-white/10 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3"
                >
                  <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider font-semibold ${colorConfig.bg} ${colorConfig.text}`}
                      >
                        {task.state}
                      </span>
                      <h3 className="text-sm font-medium text-zinc-200 truncate">
                        {task.title}
                      </h3>
                    </div>

                    {task.description && (
                      <p className="text-xs font-mono text-zinc-400 line-clamp-2 pl-0.5">
                        {task.description}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-3 shrink-0 self-end md:self-center">
                    {['RUNNING', 'PAUSED'].includes(task.state) && (
                      <WorkerControl
                        taskId={task.id}
                        agentName={task.agent}
                        currentState={task.state}
                      />
                    )}

                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-white/5 border border-white/5 text-xs font-mono text-zinc-300">
                      <Bot className="w-3.5 h-3.5 text-zinc-400" />
                      <span>{task.agent}</span>
                    </div>

                    <div className="flex items-center gap-1 text-[11px] font-mono text-zinc-500">
                      <Clock className="w-3 h-3 text-zinc-600" />
                      <span>{formattedDate} {formattedTime}</span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
