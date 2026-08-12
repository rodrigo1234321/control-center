import { useQuery } from '@tanstack/react-query';

export function useActivity(limit: number = 50, projectId?: string) {
  return useQuery({
    queryKey: ['activity', limit, projectId],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: limit.toString() });
      if (projectId) params.set('projectId', projectId);
      
      const res = await fetch(`/api/activity?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch activity');
      return res.json();
    },
    refetchInterval: 3000,
  });
}
