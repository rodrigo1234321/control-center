import { useQuery } from '@tanstack/react-query';

export function useGoals(projectId?: string) {
  return useQuery({
    queryKey: ['goals', projectId],
    queryFn: async () => {
      const url = projectId ? `/api/goals?projectId=${projectId}` : '/api/goals';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch goals');
      return res.json();
    },
    refetchInterval: 5000, // Poll every 5s
  });
}
