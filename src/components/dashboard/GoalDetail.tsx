'use client';

import { useState, useEffect } from 'react';

export default function GoalDetail({ goalId }: { goalId: string }) {
  const [goal, setGoal] = useState<any>(null);

  useEffect(() => {
    const fetchGoal = async () => {
      try {
        const res = await fetch(`/api/goals/${goalId}`);
        if (res.ok) {
          const data = await res.json();
          setGoal(data);
        }
      } catch (err) {
        console.error(err);
      }
    };

    fetchGoal();
    const interval = setInterval(fetchGoal, 5000);
    return () => clearInterval(interval);
  }, [goalId]);

  if (!goal) return null;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 mb-8">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">{goal.title}</h2>
          <p className="text-gray-400 text-sm">{goal.description}</p>
        </div>
        <div className="text-right">
          <div className="text-4xl font-mono font-bold text-blue-500">{goal.progress}%</div>
          <div className="text-gray-500 text-xs uppercase tracking-wider mt-1">{goal.status}</div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-gray-800 rounded-full h-2.5 mb-6">
        <div 
          className="bg-blue-600 h-2.5 rounded-full transition-all duration-500" 
          style={{ width: `${goal.progress}%` }}
        ></div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-4 border-b border-gray-800 pb-2">Execution Breakdown</h3>
          <div className="space-y-3 font-mono text-sm">
            {goal.tasks?.map((task: any) => (
              <div key={task.id} className="flex justify-between items-center">
                <span className={`truncate mr-4 ${task.state === 'DONE' ? 'text-gray-500 line-through' : 'text-gray-300'}`}>
                  {task.title}
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">{task.agent}</span>
                  {task.state === 'DONE' && <span className="text-green-500">✓</span>}
                  {task.state === 'RUNNING' && <span className="text-blue-500 animate-pulse">●</span>}
                  {task.state === 'FAILED' && <span className="text-red-500">❌</span>}
                  {task.state === 'PAUSED' && <span className="text-yellow-500">⏸</span>}
                  {task.state === 'BLOCKED' && <span className="text-orange-500">⛔</span>}
                  {task.state === 'BACKLOG' && <span className="text-gray-600">○</span>}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-4 border-b border-gray-800 pb-2">Metrics</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-800/50 rounded p-3">
              <div className="text-2xl font-mono text-white">{goal.metrics?.completedTasks} / {goal.metrics?.totalTasks}</div>
              <div className="text-xs text-gray-500">Tasks Completed</div>
            </div>
            <div className="bg-gray-800/50 rounded p-3">
              <div className="text-2xl font-mono text-red-400">{goal.metrics?.failedTasks}</div>
              <div className="text-xs text-gray-500">Failed Tasks</div>
            </div>
          </div>

          {goal.currentAgent && (
            <div className="mt-4 bg-blue-900/20 border border-blue-900/50 rounded p-3">
              <div className="text-xs text-blue-400 mb-1">Current Focus</div>
              <div className="text-white font-mono text-sm">{goal.currentAgent} is working on</div>
              <div className="text-gray-400 text-sm truncate">{goal.currentTaskTitle}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
