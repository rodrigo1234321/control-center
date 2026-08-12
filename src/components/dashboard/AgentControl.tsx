'use client';

import { useState } from 'react';

export default function AgentControl({ taskId, currentState, agentName, goalId, onUpdate }: { taskId: string, currentState: string, agentName: string, goalId: string | null, onUpdate?: () => void }) {
  const [loading, setLoading] = useState(false);

  const handleAction = async (actionState: string) => {
    setLoading(true);
    try {
      await fetch(`/api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromAgent: 'System',
          toAgent: agentName,
          goalId: goalId,
          taskId: taskId,
          type: 'CONTROL',
          content: actionState, // e.g. "PAUSED", "RUNNING", "FAILED"
        })
      });
      if (onUpdate) onUpdate();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex gap-2">
      {currentState === 'PAUSED' || currentState === 'BACKLOG' ? (
        <button 
          onClick={() => handleAction('RUNNING')}
          disabled={loading}
          className="bg-green-600/20 text-green-400 hover:bg-green-600/40 px-3 py-1 rounded text-xs font-bold transition-colors disabled:opacity-50"
        >
          ▶ START
        </button>
      ) : currentState === 'RUNNING' ? (
        <button 
          onClick={() => handleAction('PAUSED')}
          disabled={loading}
          className="bg-yellow-600/20 text-yellow-400 hover:bg-yellow-600/40 px-3 py-1 rounded text-xs font-bold transition-colors disabled:opacity-50"
        >
          ⏸ PAUSE
        </button>
      ) : null}

      {(currentState === 'RUNNING' || currentState === 'PAUSED') && (
        <button 
          onClick={() => handleAction('FAILED')}
          disabled={loading}
          className="bg-red-600/20 text-red-400 hover:bg-red-600/40 px-3 py-1 rounded text-xs font-bold transition-colors disabled:opacity-50"
        >
          ⛔ STOP
        </button>
      )}
    </div>
  );
}
