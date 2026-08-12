'use client';

import React, { useRef, useEffect } from 'react';
import { useMissionControl } from './MissionControlContext';
import { motion, AnimatePresence } from 'framer-motion';

export function LiveActivity() {
  const { state } = useMissionControl();
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [state?.activityLogs]);

  if (!state || state.activityLogs.length === 0) {
    return (
      <div className="flex justify-center items-center h-full text-zinc-600 font-mono text-sm">
        AWAITING ACTIVITY...
      </div>
    );
  }

  // Activity logs are fetched desc, we reverse them to show oldest first (top to bottom reading)
  const logs = [...state.activityLogs].reverse();

  return (
    <div className="flex flex-col gap-2 font-mono text-sm">
      <AnimatePresence initial={false}>
        {logs.map((log) => {
          const time = new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
          const isError = log.action.toUpperCase().includes('FAIL') || log.action.toUpperCase().includes('ERROR');
          
          return (
            <motion.div
              key={log.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex flex-col md:flex-row md:items-start gap-2 md:gap-4 py-1.5 border-b border-white/5 last:border-0"
            >
              <div className="text-zinc-500 shrink-0">{time}</div>
              <div className={`shrink-0 w-24 uppercase font-medium ${isError ? 'text-status-failed' : 'text-zinc-300'}`}>
                {log.agent}
              </div>
              <div className={`flex-1 ${isError ? 'text-red-400' : 'text-zinc-400'}`}>
                {log.action}
                {log.details && (
                  <div className="mt-1 text-xs text-zinc-600 break-all">
                    {log.details}
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
      <div ref={logsEndRef} />
    </div>
  );
}
