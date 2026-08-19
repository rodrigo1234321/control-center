'use client';

import React, { createContext, useContext } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getMissionControlState } from '@/app/actions';

type StateType = Awaited<ReturnType<typeof getMissionControlState>>;

interface MissionControlContextType {
  state: StateType | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const MissionControlContext = createContext<MissionControlContextType>({
  state: null,
  loading: true,
  refresh: async () => {},
});

export function MissionControlProvider({ children }: { children: React.ReactNode }) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['mission-control'],
    queryFn: getMissionControlState,
    refetchInterval: 3000,
  });

  return (
    <MissionControlContext.Provider
      value={{ state: data ?? null, loading: isLoading, refresh: async () => { await refetch(); } }}
    >
      {children}
    </MissionControlContext.Provider>
  );
}

export function useMissionControl() {
  return useContext(MissionControlContext);
}
