import { ProjectsList } from '@/components/dashboard/ProjectsList';
import { TasksTable } from '@/components/dashboard/TasksTable';
import { ActivityFeed } from '@/components/dashboard/ActivityFeed';
import { ApprovalsPanel } from '@/components/dashboard/ApprovalsPanel';
import { TerminalSquare } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 font-sans selection:bg-purple-500/30">
      <header className="sticky top-0 z-10 bg-neutral-950/80 backdrop-blur-md border-b border-white/5">
        <div className="max-w-[1600px] mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-purple-500/10 p-1.5 rounded-lg border border-purple-500/20">
              <TerminalSquare className="w-5 h-5 text-purple-400" />
            </div>
            <h1 className="font-semibold text-white tracking-tight">Control Center</h1>
          </div>
          <div className="text-xs font-medium text-neutral-500">
            Orchestration Dashboard
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto p-4 md:p-6 space-y-6">
        <section>
          <ApprovalsPanel />
        </section>
        
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1 h-[400px]">
            <ProjectsList />
          </div>
          
          <div className="lg:col-span-3 h-[400px]">
            <TasksTable />
          </div>
        </div>
        
        <div className="h-[300px]">
          <ActivityFeed />
        </div>
      </main>
    </div>
  );
}
