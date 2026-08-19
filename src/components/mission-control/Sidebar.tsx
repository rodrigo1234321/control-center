'use client';

import React from 'react';
import { useMissionControl } from './MissionControlContext';
import { useProjectContext } from '@/contexts/ProjectContext';
import { FolderGit2, Bot, ShieldAlert } from 'lucide-react';

export function Sidebar() {
  const { state, loading } = useMissionControl();
  const { selectedProjectId, setSelectedProjectId } = useProjectContext();

  if (loading || !state) {
    return <div className="p-4 text-zinc-500 font-mono text-sm">INITIALIZING...</div>;
  }

  const pendingApprovalsCount = state.pendingApprovals?.length ?? 0;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ONLINE': return 'bg-emerald-500';
      case 'BUSY':
      case 'BUILDING':
      case 'RUNNING': return 'bg-blue-500 animate-pulse';
      case 'QA': return 'bg-purple-500';
      case 'WAITING': return 'bg-amber-500';
      case 'OFFLINE': return 'bg-zinc-600';
      case 'FAILED': return 'bg-red-500';
      case 'DONE': return 'bg-emerald-500';
      default: return 'bg-zinc-500';
    }
  };

  return (
    <div className="flex flex-col gap-8 p-4">
      {/* Projects */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-xs font-mono text-zinc-500 uppercase tracking-widest">
            <FolderGit2 className="w-4 h-4" />
            <h2>Projects</h2>
          </div>
          {pendingApprovalsCount > 0 && (
            <div
              className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 text-xs font-mono font-semibold"
              title={`${pendingApprovalsCount} pending approval${pendingApprovalsCount > 1 ? 's' : ''}`}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>{pendingApprovalsCount}</span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          {state.projects.map((project) => {
            const isSelected = project.id === selectedProjectId;
            const hasActiveGoal = project.goals.some((g) => g.status === 'ACTIVE');

            return (
              <div
                key={project.id}
                onClick={() =>
                  setSelectedProjectId(project.id === selectedProjectId ? null : project.id)
                }
                className={`flex flex-col gap-1 p-2.5 rounded-lg cursor-pointer transition-all border ${
                  isSelected
                    ? 'bg-zinc-800/80 border-amber-500/40 text-zinc-100 shadow-sm'
                    : 'border-transparent hover:bg-white/5 text-zinc-400'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`w-1.5 h-1.5 rounded-full ${
                      isSelected
                        ? 'bg-amber-400'
                        : hasActiveGoal
                        ? 'bg-zinc-200'
                        : 'bg-zinc-800'
                    }`}
                  />
                  <span
                    className={`text-sm font-medium ${
                      isSelected
                        ? 'text-zinc-100 font-semibold'
                        : hasActiveGoal
                        ? 'text-zinc-200'
                        : 'text-zinc-500'
                    }`}
                  >
                    {project.name}
                  </span>
                </div>
                <div className="pl-3.5 text-xs font-mono text-zinc-500">
                  {hasActiveGoal
                    ? `${
                        project.goals.filter((g) => g.status === 'ACTIVE').length
                      } active goal`
                    : 'idle'}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Agents */}
      <div>
        <div className="flex items-center gap-2 mb-4 text-xs font-mono text-zinc-500 uppercase tracking-widest">
          <Bot className="w-4 h-4" />
          <h2>Agents</h2>
        </div>
        <div className="flex flex-col gap-3">
          {state.agentStatus.map(agent => (
            <div key={agent.agent} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${getStatusColor(agent.state)}`} />
                <span className={`text-sm font-medium ${agent.state === 'OFFLINE' ? 'text-zinc-500' : 'text-zinc-200'}`}>{agent.agent}</span>
              </div>
              <div className="pl-4 text-xs font-mono text-zinc-600 uppercase">
                {agent.state}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* System Health & Emergency Controls */}
      <div className="pt-4 border-t border-zinc-800/80">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest">System Controls</span>
        </div>
        <div className="flex flex-col gap-2">
          <button
            onClick={async () => {
              if (confirm('¿Pausar todos los workers y tareas del sistema (Emergency Stop)?')) {
                await fetch('/api/system/emergency-stop', { method: 'POST' });
              }
            }}
            className="flex items-center justify-center gap-2 px-3 py-2 text-xs font-mono font-semibold rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition-colors"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>EMERGENCY STOP</span>
          </button>
          <button
            onClick={async () => {
              await fetch('/api/system/resume', { method: 'POST' });
            }}
            className="flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-mono text-zinc-400 hover:text-zinc-200 bg-zinc-800/50 hover:bg-zinc-800 rounded-lg border border-zinc-700/40 transition-colors"
          >
            <span>Resume System</span>
          </button>
        </div>
      </div>
    </div>
  );
}
