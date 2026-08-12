'use client';

import React from 'react';
import { useMissionControl } from './MissionControlContext';
import { Target, AlertTriangle } from 'lucide-react';

export function ActiveGoal() {
  const { state } = useMissionControl();

  const goal = state?.activeGoal;
  if (!goal) {
    return (
      <div className="flex-1 flex flex-col justify-center items-center p-8 border border-white/5 rounded-xl bg-surface/30 text-zinc-500">
        <Target className="w-8 h-8 mb-4 opacity-50" />
        <p className="font-mono text-sm uppercase tracking-widest">No Active Mission</p>
      </div>
    );
  }

  const tasks = goal.tasks;
  const completedTasks = tasks.filter(t => t.state === 'DONE').length;
  const totalTasks = tasks.length;
  const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  
  const blockedTasks = tasks.filter(t => t.state === 'BLOCKED');
  const runningTasks = tasks.filter(t => t.state === 'RUNNING');
  const failedTasks = tasks.filter(t => t.state === 'FAILED');

  const isBlocked = blockedTasks.length > 0;
  const isFailed = failedTasks.length > 0;

  // Render progress bar in text
  const barLength = 20;
  const filledLength = Math.round((progress / 100) * barLength);
  const barText = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);

  const activeAgent = runningTasks.length > 0 ? runningTasks[0].agent : 
                      (blockedTasks.length > 0 ? blockedTasks[0].agent : 
                      (failedTasks.length > 0 ? failedTasks[0].agent : null));

  const activeTask = runningTasks[0] || blockedTasks[0] || failedTasks[0];

  return (
    <div className="flex-1 flex flex-col gap-6 p-6 md:p-8 border border-white/5 rounded-xl bg-surface/30 relative overflow-hidden">
      {/* Background glow if active */}
      <div className="absolute -top-32 -right-32 w-64 h-64 bg-zinc-800 rounded-full mix-blend-screen filter blur-[80px] opacity-20"></div>
      
      <div>
        <div className="text-xs font-mono text-zinc-500 uppercase tracking-widest mb-2">
          Active Mission
        </div>
        <h2 className="text-2xl md:text-3xl font-medium tracking-tight text-zinc-100 uppercase">
          {goal.title}
        </h2>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-4 text-zinc-300 font-mono">
          <span className="text-xl">{progress}%</span>
          <span className="text-zinc-600 tracking-[0.2em] hidden sm:inline-block">{barText}</span>
        </div>
        <div className="flex gap-4 text-xs font-mono text-zinc-500">
          <span>{completedTasks} completed</span>
          <span>{runningTasks.length} running</span>
          <span className={isBlocked ? 'text-amber-500' : ''}>{blockedTasks.length} blocked</span>
          <span className={isFailed ? 'text-red-500' : ''}>{failedTasks.length} failed</span>
        </div>
      </div>

      {(isBlocked || isFailed) && (
        <div className={`p-4 border rounded-lg flex items-start gap-3 ${isBlocked ? 'border-amber-500/20 bg-amber-500/5' : 'border-red-500/20 bg-red-500/5'}`}>
          <AlertTriangle className={`w-5 h-5 ${isBlocked ? 'text-amber-500' : 'text-red-500'}`} />
          <div className="flex flex-col gap-1">
            <span className={`text-sm font-medium uppercase ${isBlocked ? 'text-amber-500' : 'text-red-500'}`}>
              {isBlocked ? 'BLOCKED' : 'FAILED'}
            </span>
            <span className="text-sm text-zinc-400">
              {activeAgent} cannot continue. Waiting for human input or fix.
            </span>
          </div>
        </div>
      )}

      {activeAgent && !isBlocked && !isFailed && (
        <div className="mt-auto pt-6 border-t border-white/5">
          <div className="text-xs font-mono text-zinc-500 uppercase tracking-widest mb-3">
            Active Agent
          </div>
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-status-building animate-pulse" />
            <div className="flex flex-col">
              <span className="text-zinc-200 font-medium">{activeAgent}</span>
              <span className="text-xs font-mono text-zinc-500">{activeTask?.title}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
