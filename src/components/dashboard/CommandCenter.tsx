'use client';

import { useState } from 'react';
import { useProjectContext } from '@/contexts/ProjectContext';

export default function CommandCenter({ projectId: defaultProjectId }: { projectId: string }) {
  const { selectedProjectId } = useProjectContext();
  const projectId = selectedProjectId || defaultProjectId;

  const [goal, setGoal] = useState('');
  const [agent, setAgent] = useState('Antigravity');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goal.trim()) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: goal,
          projectId,
          agent,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create goal');
      }

      setGoal('');
      // Ideally trigger a refetch of the dashboard data
      window.location.reload();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8 relative overflow-hidden">
      {/* Visual flair for the "Command Center" feel */}
      <div className="absolute top-0 right-0 p-4 opacity-10">
        <svg width="120" height="120" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2L2 22h20L12 2zm0 4.2l7.1 14.3H4.9L12 6.2z"/>
        </svg>
      </div>

      <h2 className="text-xl font-bold text-white mb-2 font-mono flex items-center gap-2">
        <span className="text-blue-500">▶</span> COMMAND CENTER
      </h2>
      <p className="text-gray-400 text-sm mb-6">¿Qué querés que hagan tus agentes?</p>

      <form onSubmit={handleSubmit} className="space-y-4 relative z-10">
        <div>
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="Ej: Crear una landing premium para mi SaaS..."
            className="w-full bg-black/50 border border-gray-700 rounded-lg p-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono resize-none h-24"
            disabled={isSubmitting}
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex gap-4">
            <div>
              <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">Agente Inicial</label>
              <select
                value={agent}
                onChange={(e) => setAgent(e.target.value)}
                className="bg-gray-800 border border-gray-700 text-white rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                disabled={isSubmitting || !projectId}
              >
                <option value="Antigravity">Antigravity (Planning)</option>
                <option value="OpenCode">OpenCode</option>
                <option value="OpenHands">OpenHands</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {!projectId && (
              <span className="text-amber-500 text-sm font-medium">
                ⚠️ Select a project first
              </span>
            )}
            <button
              type="submit"
              disabled={isSubmitting || !goal.trim() || !projectId}
              className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-bold tracking-wide flex items-center gap-2 disabled:opacity-50 transition-colors"
            >
              {isSubmitting ? 'ENVIANDO...' : '🚀 EJECUTAR'}
            </button>
          </div>
        </div>
        {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
      </form>
    </div>
  );
}
