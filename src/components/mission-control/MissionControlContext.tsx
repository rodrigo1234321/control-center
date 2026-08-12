'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
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
  const [state, setState] = useState<StateType | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchState = async () => {
    try {
      const newState = await getMissionControlState();
      setState(newState);
    } catch (e) {
      console.error('Failed to fetch mission control state', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <MissionControlContext.Provider value={{ state, loading, refresh: fetchState }}>
      {children}
    </MissionControlContext.Provider>
  );
}

export function useMissionControl() {
  return useContext(MissionControlContext);
}
