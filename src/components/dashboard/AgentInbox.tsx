'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useProjectContext } from '@/contexts/ProjectContext';
import { AgentMessage } from '@/generated/prisma/client';

type MessageWithRelations = AgentMessage & {
  goal?: { title: string };
  task?: { title: string; state: string };
};

export default function AgentInbox() {
  const { selectedProjectId } = useProjectContext();
  const queryClient = useQueryClient();
  
  const { data: messages = [], isLoading: loading } = useQuery({
    queryKey: ['messages', selectedProjectId],
    queryFn: async () => {
      const url = selectedProjectId ? `/api/messages?status=UNREAD&projectId=${selectedProjectId}` : '/api/messages?status=UNREAD';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch messages');
      return res.json() as Promise<MessageWithRelations[]>;
    },
    refetchInterval: 3000,
  });

  if (loading && messages.length === 0) return <div className="animate-pulse h-64 bg-gray-900 rounded-lg border border-gray-800"></div>;
  
  if (messages.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <h3 className="text-gray-400 font-mono text-sm">📥 No unread messages</h3>
      </div>
    );
  }

  // Group by toAgent
  const grouped = messages.reduce((acc, msg) => {
    if (!acc[msg.toAgent]) acc[msg.toAgent] = [];
    acc[msg.toAgent].push(msg);
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
      <h3 className="text-white font-mono text-lg mb-4 flex items-center gap-2">
        📥 AGENT INBOX
      </h3>
      
      <div className="space-y-6">
        {Object.entries(grouped as Record<string, any[]>).map(([agent, msgs]) => (
          <div key={agent} className="border border-gray-800 rounded-lg overflow-hidden">
            <div className="bg-gray-800 px-4 py-2 border-b border-gray-700 flex justify-between items-center">
              <span className="font-bold text-blue-400 font-mono">{agent}</span>
              <span className="bg-blue-900/50 text-blue-300 text-xs px-2 py-0.5 rounded-full">
                {msgs.length} unread
              </span>
            </div>
            <div className="divide-y divide-gray-800">
              {msgs.map(msg => (
                <div key={msg.id} className="p-4 bg-black/30">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs text-gray-500 font-mono flex items-center gap-2">
                      From: <span className="text-gray-300">{msg.fromAgent}</span>
                      <span className="bg-gray-800 px-2 py-0.5 rounded text-gray-400">{msg.type}</span>
                    </span>
                    <div className="flex items-center gap-4">
                      <span className="text-xs text-gray-600">
                        {new Date(msg.createdAt).toLocaleTimeString()}
                      </span>
                      <button
                        onClick={async () => {
                          await fetch(`/api/messages/${msg.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ status: 'READ' }),
                          });
                          // The interval will refresh, but we could also mutate locally. For now let it poll.
                        }}
                        className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                      >
                        Mark Read
                      </button>
                      <button
                        onClick={async () => {
                          await fetch(`/api/messages/${msg.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ status: 'RESOLVED' }),
                          });
                        }}
                        className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
                      >
                        Resolve
                      </button>
                    </div>
                  </div>
                  {msg.goal?.title && (
                    <div className="text-xs text-gray-500 mb-2 truncate">
                      Goal: {msg.goal.title}
                    </div>
                  )}
                  <p className="text-sm text-gray-300 font-mono whitespace-pre-wrap">{msg.content}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
