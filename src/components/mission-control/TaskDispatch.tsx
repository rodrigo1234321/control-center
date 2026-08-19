'use client';

import React, { useState } from 'react';
import { useMissionControl } from './MissionControlContext';
import { useProjectContext } from '@/contexts/ProjectContext';
import { Plus, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

export function TaskDispatch() {
  const { state, refresh } = useMissionControl();
  const { selectedProjectId } = useProjectContext();

  const [projectId, setProjectId] = useState('');
  const [agent, setAgent] = useState('Antigravity');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [loading, setLoading] = useState(false);

  const projects = state?.projects ?? [];
  const effectiveProjectId = projectId || selectedProjectId || projects[0]?.id || '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !effectiveProjectId) return;

    setLoading(true);
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          projectId: effectiveProjectId,
          agent,
          requiresApproval,
          notify: true,
        }),
      });

      if (res.ok) {
        setTitle('');
        setDescription('');
        setRequiresApproval(false);
        await refresh();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border border-white/5 rounded-xl bg-surface/30 p-6 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Plus className="w-4 h-4 text-zinc-400" />
        <h2 className="text-xs font-mono text-zinc-500 uppercase tracking-widest">
          Dispatch Task
        </h2>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-mono text-zinc-500 uppercase tracking-wider mb-1">
              Project
            </label>
            <select
              value={effectiveProjectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full bg-surface/40 hover:bg-surface-hover border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-white/20 transition-all"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id} className="bg-zinc-900">
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-mono text-zinc-500 uppercase tracking-wider mb-1">
              Agent
            </label>
            <select
              value={agent}
              onChange={(e) => setAgent(e.target.value)}
              className="w-full bg-surface/40 hover:bg-surface-hover border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-white/20 transition-all"
            >
              {['Antigravity', 'OpenDesign', 'OpenCode', 'OpenHands'].map((a) => (
                <option key={a} value={a} className="bg-zinc-900">
                  {a}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-mono text-zinc-500 uppercase tracking-wider mb-1">
            Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What should the agent do?"
            className="w-full bg-surface/40 hover:bg-surface-hover focus:bg-surface-elevated border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-white/20 transition-all"
          />
        </div>

        <div>
          <label className="block text-[10px] font-mono text-zinc-500 uppercase tracking-wider mb-1">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Context, details, links..."
            className="w-full bg-surface/40 hover:bg-surface-hover focus:bg-surface-elevated border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-white/20 transition-all resize-none"
          />
        </div>

        <label className="flex items-center gap-2 text-xs font-mono text-zinc-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={requiresApproval}
            onChange={(e) => setRequiresApproval(e.target.checked)}
            className="w-3.5 h-3.5 accent-amber-500"
          />
          Requires approval before DONE
        </label>

        <div className="flex items-center justify-end">
          <motion.button
            type="submit"
            disabled={!title.trim() || loading || projects.length === 0}
            whileTap={{ scale: 0.97 }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 text-xs font-mono active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Plus className="w-3.5 h-3.5" />
            )}
            CREATE TASK
          </motion.button>
        </div>
      </form>
    </div>
  );
}