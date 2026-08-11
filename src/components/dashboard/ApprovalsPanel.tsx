'use client';

import { useApprovals, useResolveApproval } from '@/lib/hooks/useApprovals';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, X } from 'lucide-react';
import { useState } from 'react';
import { Approval, Task, Project } from '@/generated/prisma/client';

export function ApprovalsPanel() {
  const { data: approvals, isLoading, error } = useApprovals();
  const resolveMutation = useResolveApproval();
  const queryClient = useQueryClient();
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const typedApprovals = approvals as (Approval & { task: Task & { project: Project } })[];
  const pendingApprovals = typedApprovals?.filter(a => a.status === 'PENDING') || [];

  const handleResolve = async (id: string, approved: boolean) => {
    setResolvingId(id);
    try {
      await resolveMutation.mutateAsync({
        id,
        status: approved ? 'APPROVED' : 'REJECTED',
        note: approved ? 'Approved by user' : 'Rejected by user',
      });
      // Invalidate tasks as well since the task state might change based on approval
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['activity'] });
    } catch (e) {
      console.error('Failed to resolve approval', e);
    } finally {
      setResolvingId(null);
    }
  };

  if (isLoading) return <div className="animate-pulse h-32 bg-neutral-900/50 rounded-xl border border-white/5"></div>;
  if (error) return <div className="text-red-400">Failed to load approvals</div>;

  if (pendingApprovals.length === 0) {
    return (
      <div className="bg-emerald-950/20 rounded-xl border border-emerald-500/10 p-4 flex items-center justify-center text-emerald-400/80 text-sm font-medium">
        <Check className="w-4 h-4 mr-2" />
        No pending approvals
      </div>
    );
  }

  return (
    <div className="bg-amber-950/20 rounded-xl border border-amber-500/20 overflow-hidden">
      <div className="p-3 border-b border-amber-500/20 bg-amber-500/5 flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-400" />
        <h2 className="text-sm font-semibold text-amber-400">
          {pendingApprovals.length} Approval{pendingApprovals.length !== 1 ? 's' : ''} Required
        </h2>
      </div>
      
      <div className="divide-y divide-amber-500/10">
        {pendingApprovals.map((approval) => (
          <div key={approval.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-400">
                  {approval.actionType}
                </span>
                <span className="text-sm font-medium text-neutral-200">
                  {approval.task?.project?.name}
                </span>
              </div>
              <p className="text-sm text-neutral-400">{approval.description}</p>
            </div>
            
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => handleResolve(approval.id, false)}
                disabled={resolvingId === approval.id}
                className="px-3 py-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-sm font-medium transition-colors border border-white/5 disabled:opacity-50"
              >
                Reject
              </button>
              <button
                onClick={() => handleResolve(approval.id, true)}
                disabled={resolvingId === approval.id}
                className="px-3 py-1.5 rounded-md bg-amber-500 hover:bg-amber-400 text-amber-950 text-sm font-medium transition-colors disabled:opacity-50"
              >
                {resolvingId === approval.id ? 'Approving...' : 'Approve'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
