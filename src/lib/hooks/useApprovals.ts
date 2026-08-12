import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export function useApprovals(projectId?: string) {
  return useQuery({
    queryKey: ['approvals', projectId],
    queryFn: async () => {
      const url = projectId ? `/api/approvals?projectId=${projectId}` : '/api/approvals';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch approvals');
      return res.json();
    },
    refetchInterval: 3000,
  });
}

export function useResolveApproval() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, note }: { id: string; status: 'APPROVED' | 'REJECTED'; note?: string }) => {
      const res = await fetch(`/api/approvals/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, resolvedNote: note }),
      });
      if (!res.ok) throw new Error('Failed to resolve approval');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}
