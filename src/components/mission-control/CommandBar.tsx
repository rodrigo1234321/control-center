'use client';

import React, { useState } from 'react';
import { useMissionControl } from './MissionControlContext';
import { Sparkles, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';

export function CommandBar() {
  const { state, refresh } = useMissionControl();
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || !state || state.projects.length === 0) return;
    
    setLoading(true);
    
    // Simplistic heuristic to split title and description
    const title = prompt.split('.')[0].slice(0, 40) || 'New Mission';
    const projectId = state.projects[0].id; // Use first project for now
    
    try {
      const res = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description: prompt,
          projectId,
        }),
      });
      
      if (res.ok) {
        setPrompt('');
        await refresh();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative w-full max-w-4xl mx-auto">
      <form onSubmit={handleSubmit} className="relative flex items-center">
        <div className="absolute left-4 text-zinc-400">
          <Sparkles className="w-5 h-5" />
        </div>
        
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={loading}
          placeholder="What should your agents accomplish?"
          className="w-full bg-surface/40 hover:bg-surface-hover focus:bg-surface-elevated border border-white/10 rounded-2xl py-4 pl-12 pr-16 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-white/20 transition-all shadow-2xl shadow-black/50"
        />
        
        <button
          type="submit"
          disabled={!prompt.trim() || loading}
          className="absolute right-3 p-2 bg-white/5 hover:bg-white/10 rounded-xl text-zinc-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
              className="w-5 h-5 border-2 border-zinc-400 border-t-transparent rounded-full"
            />
          ) : (
            <ArrowRight className="w-5 h-5" />
          )}
        </button>
      </form>
      
      {prompt && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute top-full left-0 right-0 mt-4 p-4 glass-panel rounded-xl flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-zinc-300">Planning with</span>
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/5 border border-white/10">
              <div className="w-1.5 h-1.5 rounded-full bg-status-building animate-pulse" />
              <span className="text-xs font-mono text-zinc-200">Antigravity</span>
            </div>
          </div>
          <span className="text-xs font-mono text-zinc-500">Press Enter to dispatch ↵</span>
        </motion.div>
      )}
    </div>
  );
}
