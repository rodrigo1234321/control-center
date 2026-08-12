'use client';

import React, { useState } from 'react';
import { useMissionControl } from './MissionControlContext';
import { ShieldAlert, Check, X, CheckCircle2, Loader2, Clock, FolderGit2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function ApprovalsSection() {
  const { state, refresh } = useMissionControl();
  const [processingId, setProcessingId] = useState<string | null>(null);

  const pendingApprovals = state?.pendingApprovals ?? [];

  const handleResolve = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    try {
      setProcessingId(id);
      const res = await fetch(`/api/approvals/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        console.error('Failed to resolve approval:', errorData.error || res.statusText);
      } else {
        await refresh();
      }
    } catch (err) {
      console.error('Error resolving approval:', err);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="border border-white/5 rounded-xl bg-surface/30 p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-400" />
          <h2 className="text-xs font-mono text-zinc-500 uppercase tracking-widest">
            Pending Approvals ({pendingApprovals.length})
          </h2>
        </div>
      </div>

      {pendingApprovals.length === 0 ? (
        <div className="p-4 border border-emerald-500/20 bg-emerald-500/5 rounded-lg flex items-center gap-3 text-emerald-400 text-sm font-mono">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>No pending approvals</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <AnimatePresence mode="popLayout">
            {pendingApprovals.map((approval) => {
              const isProcessing = processingId === approval.id;
              const formattedTime = new Date(approval.requestedAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <motion.div
                  key={approval.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="border border-amber-500/20 bg-amber-500/5 rounded-lg p-4 flex flex-col justify-between gap-4"
                >
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400 font-mono text-[10px] uppercase tracking-wider font-semibold">
                        {approval.actionType}
                      </span>
                      {approval.task?.project?.name && (
                        <div className="flex items-center gap-1 text-xs font-mono text-zinc-400">
                          <FolderGit2 className="w-3 h-3 text-zinc-500" />
                          <span>{approval.task.project.name}</span>
                        </div>
                      )}
                    </div>

                    <div>
                      <h3 className="text-sm font-medium text-zinc-100 mb-1">
                        {approval.task?.title || 'Untitled Task'}
                      </h3>
                      <p className="text-xs text-zinc-400 font-mono bg-black/40 p-2.5 rounded border border-white/5 whitespace-pre-wrap">
                        {approval.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-white/5">
                    <div className="flex items-center gap-1 text-[11px] font-mono text-zinc-500">
                      <Clock className="w-3 h-3 text-zinc-600" />
                      <span>{formattedTime}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleResolve(approval.id, 'REJECTED')}
                        disabled={isProcessing}
                        className="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 active:scale-95 transition-all text-xs font-mono flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {isProcessing ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <X className="w-3.5 h-3.5" />
                        )}
                        Reject
                      </button>

                      <button
                        onClick={() => handleResolve(approval.id, 'APPROVED')}
                        disabled={isProcessing}
                        className="px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 active:scale-95 transition-all text-xs font-mono flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {isProcessing ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Check className="w-3.5 h-3.5" />
                        )}
                        Approve
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
