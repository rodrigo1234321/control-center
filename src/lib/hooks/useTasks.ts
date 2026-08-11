import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export function useTasks(filters?: { state?: string; projectId?: string; agent?: string }) {
  const params = new URLSearchParams();
  if (filters?.state) params.set('state', filters.state);
  if (filters?.projectId) params.set('projectId', filters.projectId);
  if (filters?.agent) params.set('agent', filters.agent);

  return useQuery({
    queryKey: ['tasks', filters],
    queryFn: async () => {
      const res = await fetch(`/api/tasks?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch tasks');
      return res.json();
    },
    refetchInterval: 3000,
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; state?: string; result?: string }) => {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update task');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
    },
  });
}
