'use client';

import React from 'react';
import { useMissionControl } from './MissionControlContext';
import { motion, AnimatePresence } from 'framer-motion';

export function AgentPipeline() {
  const { state } = useMissionControl();
  const goal = state?.activeGoal;

  if (!goal || goal.tasks.length === 0) {
    return (
      <div className="flex-1 flex flex-col justify-center items-center p-8 border border-white/5 rounded-xl bg-surface/30 text-zinc-500">
        <p className="font-mono text-sm uppercase tracking-widest">No Pipeline Data</p>
      </div>
    );
  }

  // Deduplicate agents while maintaining order for the pipeline flow
  const agentsInFlow = Array.from(new Set(goal.tasks.map(t => t.agent)));

  return (
    <div className="flex-1 flex flex-col p-6 md:p-8 border border-white/5 rounded-xl bg-surface/30">
      <div className="text-xs font-mono text-zinc-500 uppercase tracking-widest mb-8">
        Agent Pipeline
      </div>

      <div className="flex flex-col items-start gap-0 relative">
        {agentsInFlow.map((agent, idx) => {
          // Find if this agent has a running or failed task
          const agentTasks = goal.tasks.filter(t => t.agent === agent);
          const isActive = agentTasks.some(t => t.state === 'RUNNING');
          const isFailed = agentTasks.some(t => t.state === 'FAILED');
          const isBlocked = agentTasks.some(t => t.state === 'BLOCKED');
          const isDone = agentTasks.every(t => t.state === 'DONE');

          const statusColor = isActive ? 'text-status-building border-status-building' :
                              isFailed ? 'text-status-failed border-status-failed' :
                              isBlocked ? 'text-amber-500 border-amber-500' :
                              isDone ? 'text-status-success border-status-success' :
                              'text-zinc-500 border-zinc-800';

          return (
            <React.Fragment key={agent}>
              <div className="flex items-center gap-4 z-10">
                <motion.div 
                  initial={false}
                  animate={{ 
                    scale: isActive ? [1, 1.1, 1] : 1,
                    boxShadow: isActive ? ['0px 0px 0px rgba(59,130,246,0)', '0px 0px 20px rgba(59,130,246,0.5)', '0px 0px 0px rgba(59,130,246,0)'] : 'none'
                  }}
                  transition={{ repeat: isActive ? Infinity : 0, duration: 2 }}
                  className={`w-4 h-4 rounded-full border-2 bg-background ${statusColor}`}
                />
                <span className={`font-mono uppercase tracking-widest ${statusColor.split(' ')[0]}`}>
                  {agent}
                </span>
              </div>
              
              {idx < agentsInFlow.length - 1 && (
                <div className="h-8 w-4 flex justify-center">
                  <div className="w-px h-full bg-zinc-800 relative overflow-hidden">
                    <AnimatePresence>
                      {isActive && (
                        <motion.div
                          className="absolute top-0 w-px h-full bg-status-building"
                          initial={{ top: '-100%' }}
                          animate={{ top: '100%' }}
                          transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
                        />
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
