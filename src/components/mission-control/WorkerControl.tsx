'use client';

import React, { useState } from 'react';
import { useMissionControl } from './MissionControlContext';
import { CONTROL_COMMANDS } from '@/lib/control';
import { Pause, Play, Square, Loader2 } from 'lucide-react';

interface WorkerControlProps {
  taskId: string;
  agentName: string;
  currentState: string;
}

/**
 * Sends CONTROL messages to the task's agent worker using the centralized
 * protocol (STOP / STOP_TASK:<id> / PAUSE_TASK:<id> / RESUME_TASK:<id>).
 * Only enabled for states where the command is a valid transition.
 */
export function WorkerControl({ taskId, agentName, currentState }: WorkerControlProps) {
  const { refresh } = useMissionControl();
  const [loading, setLoading] = useState(false);

  const sendControl = async (content: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromAgent: 'System',
          toAgent: agentName,
          taskId,
          type: 'CONTROL',
          content,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error('Failed to send control command:', data.error || res.statusText);
      } else {
        await refresh();
      }
    } catch (err) {
      console.error('Error sending control command:', err);
    } finally {
      setLoading(false);
    }
  };

  const btnClass =
    'px-2 py-1 rounded-md text-[11px] font-mono flex items-center gap-1 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed';

  if (currentState === 'RUNNING') {
    return (
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => sendControl(CONTROL_COMMANDS.PAUSE_TASK(taskId))}
          disabled={loading}
          title="Pause task"
          className={`${btnClass} bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 border border-yellow-500/30`}
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Pause className="w-3 h-3" />}
          PAUSE
        </button>
        <button
          onClick={() => sendControl(CONTROL_COMMANDS.STOP_TASK(taskId))}
          disabled={loading}
          title="Stop task (marks it FAILED)"
          className={`${btnClass} bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30`}
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Square className="w-3 h-3" />}
          STOP
        </button>
      </div>
    );
  }

  if (currentState === 'PAUSED') {
    return (
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => sendControl(CONTROL_COMMANDS.RESUME_TASK(taskId))}
          disabled={loading}
          title="Resume task"
          className={`${btnClass} bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30`}
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
          RESUME
        </button>
        <button
          onClick={() => sendControl(CONTROL_COMMANDS.STOP_TASK(taskId))}
          disabled={loading}
          title="Stop task (marks it FAILED)"
          className={`${btnClass} bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30`}
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Square className="w-3 h-3" />}
          STOP
        </button>
      </div>
    );
  }

  return null;
}