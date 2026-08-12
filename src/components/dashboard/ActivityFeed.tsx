'use client';

import { useActivity } from '@/lib/hooks/useActivity';
import { Activity, Terminal, Bot, User } from 'lucide-react';
import { ActivityLog } from '@/generated/prisma/client';
import { useProjectContext } from '@/contexts/ProjectContext';

function getAgentIcon(agent: string) {
  const lower = agent.toLowerCase();
  if (lower.includes('antigravity')) return <Bot className="w-3.5 h-3.5 text-purple-400" />;
  if (lower.includes('opencode')) return <Terminal className="w-3.5 h-3.5 text-blue-400" />;
  if (lower.includes('openhands')) return <Bot className="w-3.5 h-3.5 text-emerald-400" />;
  if (lower.includes('opendesign')) return <Bot className="w-3.5 h-3.5 text-pink-400" />;
  return <User className="w-3.5 h-3.5 text-neutral-400" />;
}

export function ActivityFeed() {
  const { selectedProjectId } = useProjectContext();
  const { data: activities, isLoading, error } = useActivity(50, selectedProjectId || undefined);

  if (isLoading) return <div className="animate-pulse h-64 bg-neutral-900/50 rounded-xl border border-white/5"></div>;
  if (error) return <div className="text-red-400">Failed to load activity</div>;

  return (
    <div className="bg-neutral-900/50 rounded-xl border border-white/5 overflow-hidden flex flex-col h-full">
      <div className="p-4 border-b border-white/5 flex items-center justify-between">
        <h2 className="text-sm font-semibold flex items-center gap-2 text-white">
          <Activity className="w-4 h-4 text-purple-400" />
          Activity Log
        </h2>
      </div>
      
      <div className="p-4 overflow-y-auto flex-1 space-y-4">
        {activities?.length === 0 ? (
          <div className="text-sm text-neutral-500 text-center py-4">No activity yet</div>
        ) : (
          (activities as ActivityLog[])?.map((activity) => (
            <div key={activity.id} className="flex gap-3 text-sm">
              <div className="mt-0.5 flex-shrink-0 bg-neutral-800 p-1.5 rounded-full border border-white/5">
                {getAgentIcon(activity.agent)}
              </div>
              <div>
                <p className="text-neutral-300">
                  <span className="font-medium text-neutral-200 mr-2">{activity.agent}</span>
                  {activity.action}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-neutral-600">
                    {new Date(activity.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
