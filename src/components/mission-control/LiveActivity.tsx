'use client';

import React, { useRef, useEffect, useState } from 'react';
import { useMissionControl } from './MissionControlContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, ArrowDown, Pause, Play } from 'lucide-react';

export function LiveActivity() {
  const { state } = useMissionControl();
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(false); // Desactivado por defecto para no secuestrar el scroll del usuario

  // Auto-scroll local ÚNICAMENTE dentro del contenedor de logs (sin tocar la ventana/página)
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
    }
  }, [state?.activityLogs, autoScroll]);

  if (!state || state.activityLogs.length === 0) {
    return (
      <div className="flex justify-center items-center h-48 text-zinc-600 font-mono text-xs tracking-wider">
        NO ACTIVITY RECORDED YET
      </div>
    );
  }

  // Orden: más recientes primero para lectura natural tipo stream
  const logs = [...state.activityLogs];

  return (
    <div className="flex flex-col h-full">
      {/* Controles de barra de actividad */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/5 text-[11px] font-mono text-zinc-500">
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
          <span>{logs.length} EVENTS RECORDED</span>
        </div>
        <button
          type="button"
          onClick={() => setAutoScroll(!autoScroll)}
          className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] transition-colors border ${
            autoScroll
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              : 'bg-white/5 text-zinc-400 border-white/10 hover:text-zinc-200'
          }`}
          title="Auto-desplazar al recibir nuevos eventos dentro de este panel"
        >
          {autoScroll ? <Pause className="w-2.5 h-2.5" /> : <Play className="w-2.5 h-2.5" />}
          <span>Auto-follow: {autoScroll ? 'ON' : 'OFF'}</span>
        </button>
      </div>

      {/* Contenedor de logs con scroll local aislado */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto max-h-72 pr-2 flex flex-col gap-1.5 font-mono text-xs scrollbar-thin scrollbar-thumb-white/10"
      >
        <AnimatePresence initial={false}>
          {logs.map((log) => {
            const time = new Date(log.timestamp).toLocaleTimeString([], {
              hour12: false,
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            });
            const isError = log.action.toUpperCase().includes('FAIL') || log.action.toUpperCase().includes('ERROR') || log.action.toUpperCase().includes('BLOCKED');
            const isSuccess = log.action.toUpperCase().includes('COMPLETED') || log.action.toUpperCase().includes('ONLINE');

            let badgeColor = 'bg-zinc-500/10 text-zinc-300 border-zinc-500/20';
            if (isError) badgeColor = 'bg-red-500/10 text-red-400 border-red-500/30';
            if (isSuccess) badgeColor = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';

            return (
              <motion.div
                key={log.id}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col sm:flex-row sm:items-start gap-2 py-1.5 px-2.5 rounded bg-white/[0.02] border border-white/[0.03] hover:border-white/10 transition-colors"
              >
                <div className="text-zinc-600 text-[10px] shrink-0 pt-0.5">{time}</div>
                <div className="shrink-0">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-semibold border ${badgeColor}`}>
                    {log.agent}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`font-medium ${isError ? 'text-red-300' : 'text-zinc-200'}`}>
                    {log.action}
                  </div>
                  {log.details && (
                    <div className="mt-0.5 text-[11px] text-zinc-500 break-all font-mono">
                      {log.details}
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
