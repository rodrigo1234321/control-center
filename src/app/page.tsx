import { MissionControlProvider } from '@/components/mission-control/MissionControlContext';
import { Sidebar } from '@/components/mission-control/Sidebar';
import { ActiveGoal } from '@/components/mission-control/ActiveGoal';
import { AgentPipeline } from '@/components/mission-control/AgentPipeline';
import { ApprovalsSection } from '@/components/mission-control/ApprovalsSection';
import { TasksPanel } from '@/components/mission-control/TasksPanel';
import { LiveActivity } from '@/components/mission-control/LiveActivity';
import { CommandBar } from '@/components/mission-control/CommandBar';
import { Terminal } from 'lucide-react';

export default function Home() {
  return (
    <MissionControlProvider>
      <div className="min-h-screen bg-background text-foreground flex flex-col md:flex-row overflow-hidden">
        
        {/* Desktop Sidebar / Mobile Drawer (simplified to top stack for now) */}
        <aside className="w-full md:w-64 border-b md:border-r border-white/5 bg-[#050505] flex-shrink-0 flex flex-col">
          <div className="h-14 flex items-center px-4 border-b border-white/5">
            <Terminal className="w-5 h-5 text-zinc-400 mr-2" />
            <span className="font-mono font-medium tracking-wide text-zinc-200">CONTROL CENTER</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            <Sidebar />
          </div>
        </aside>

        {/* Main Interface */}
        <main className="flex-1 flex flex-col h-screen overflow-hidden relative">
          
          <div className="flex-1 overflow-y-auto p-4 md:p-8 flex flex-col gap-8 pb-32">
            {/* Top row: Active Goal & Pipeline */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
              <ActiveGoal />
              <AgentPipeline />
            </div>

            {/* Approvals Section */}
            <ApprovalsSection />

            {/* Tasks Panel */}
            <TasksPanel />

            {/* Bottom row: Live Activity */}
            <div className="flex-1 min-h-[300px] border border-white/5 rounded-xl bg-surface/30 overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest">Live Activity</span>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <LiveActivity />
              </div>
            </div>
          </div>

          {/* Fixed Command Bar at the bottom */}
          <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6 border-t border-white/5 bg-background/80 backdrop-blur-md">
            <div className="max-w-4xl mx-auto">
              <CommandBar />
            </div>
          </div>

        </main>
      </div>
    </MissionControlProvider>
  );
}
