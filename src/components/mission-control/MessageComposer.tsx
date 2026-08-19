'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useMissionControl } from './MissionControlContext';
import type { MessageType } from '@/lib/types';
import { Send, MessagesSquare, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const COMPOSER_TYPES = ['REQUEST', 'QUESTION', 'INFO'] as const;

const TYPE_COLORS: Record<string, string> = {
  REQUEST: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  QUESTION: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  INFO: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30',
  RESPONSE: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  HANDOFF: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  FIX_REQUEST: 'bg-red-500/10 text-red-400 border-red-500/30',
  ACK: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  ERROR: 'bg-red-500/10 text-red-400 border-red-500/30',
  CONTROL: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
  REVIEW: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
};

const STATUS_COLORS: Record<string, string> = {
  UNREAD: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  READ: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30',
  RESOLVED: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
};

interface MessageItem {
  id: string;
  fromAgent: string;
  toAgent: string;
  type: string;
  status: string;
  content: string;
  createdAt: string;
}

export function MessageComposer() {
  const { refresh } = useMissionControl();
  const [toAgent, setToAgent] = useState('Antigravity');
  const [type, setType] = useState<MessageType>('REQUEST');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<MessageItem[]>([]);

  const fetchMessages = useCallback(() => {
    return fetch('/api/messages')
      .then((res) => (res.ok ? res.json() : Promise.resolve([])))
      .then((data: MessageItem[]) => data.slice(0, 12))
      .catch(() => []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const poll = () =>
      fetchMessages().then((data) => {
        if (!cancelled) setMessages(data);
      });
    poll();
    const interval = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [fetchMessages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    setLoading(true);
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromAgent: 'USER',
          toAgent,
          type,
          content,
        }),
      });

      if (res.ok) {
        setContent('');
        await Promise.all([fetchMessages().then(setMessages), refresh()]);
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
        <MessagesSquare className="w-4 h-4 text-zinc-400" />
        <h2 className="text-xs font-mono text-zinc-500 uppercase tracking-widest">
          Communications
        </h2>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1">
            <label className="block text-[10px] font-mono text-zinc-500 uppercase tracking-wider mb-1">
              To
            </label>
            <select
              value={toAgent}
              onChange={(e) => setToAgent(e.target.value)}
              className="w-full bg-surface/40 hover:bg-surface-hover border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-white/20 transition-all"
            >
              {['Antigravity', 'OpenDesign', 'OpenCode', 'OpenHands'].map((a) => (
                <option key={a} value={a} className="bg-zinc-900">
                  {a}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-mono text-zinc-500 uppercase tracking-wider mb-1">
              Type
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as MessageType)}
              className="w-full bg-surface/40 hover:bg-surface-hover border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-white/20 transition-all"
            >
              {COMPOSER_TYPES.map((t) => (
                <option key={t} value={t} className="bg-zinc-900">
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={`Message for ${toAgent}...`}
          rows={2}
          className="w-full bg-surface/40 hover:bg-surface-hover focus:bg-surface-elevated border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-white/20 transition-all resize-none"
        />

        <div className="flex items-center justify-end">
          <button
            type="submit"
            disabled={!content.trim() || loading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-200 text-xs font-mono active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            SEND
          </button>
        </div>
      </form>

      <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
        <AnimatePresence mode="popLayout" initial={false}>
          {messages.length === 0 ? (
            <div className="p-6 border border-white/5 rounded-lg bg-surface/20 flex flex-col items-center justify-center text-zinc-500 gap-2 font-mono text-sm">
              <MessagesSquare className="w-5 h-5 opacity-40" />
              <span>No messages yet</span>
            </div>
          ) : (
            messages.map((msg) => {
              const typeColor = TYPE_COLORS[msg.type] || 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30';
              const statusColor = STATUS_COLORS[msg.status] || 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30';
              const formattedTime = new Date(msg.createdAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <motion.div
                  key={msg.id}
                  layout
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  className="border border-white/5 rounded-lg bg-surface/20 p-3 flex flex-col gap-1.5"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider font-semibold ${typeColor}`}>
                      {msg.type}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider font-semibold ${statusColor}`}>
                      {msg.status}
                    </span>
                    <span className="text-[11px] font-mono text-zinc-400">
                      {msg.fromAgent} <span className="text-zinc-600">→</span> {msg.toAgent}
                    </span>
                    <span className="ml-auto text-[10px] font-mono text-zinc-600">
                      {formattedTime}
                    </span>
                  </div>
                  <p className="text-xs font-mono text-zinc-300 line-clamp-2 whitespace-pre-wrap">
                    {msg.content}
                  </p>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}