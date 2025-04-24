
import React, { useState, useEffect } from 'react';
import { Activity, Clock, Users, Server, RefreshCw } from 'lucide-react';
import { InfoTooltip } from './InfoTooltip';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

interface GlobalTask {
  id: string;
  type: 'gpt-4';
  subtype: 'text';
  prompt: string;
  status: 'pending';
  timestamp: Date;
}

export const GlobalStatistics = () => {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [globalTasks, setGlobalTasks] = useState<GlobalTask[]>([]);
  
  // Initialize global tasks
  useEffect(() => {
    const prompts = [
      "Explain the concept of blockchain in layman terms.",
      "Write a short story about a robot learning emotions.",
      "Summarize the history of artificial intelligence.",
      "Write a poem about technology and nature.",
      "Explain quantum computing for beginners.",
      "Create a marketing slogan for an eco-friendly product.",
      "Describe the impact of social media on society.",
      "Write a recipe for a traditional dish from your culture.",
      "Compare and contrast renewable energy sources.",
      "Explain how the Internet works to a 5-year-old."
    ];
    
    const tasks = prompts.map((prompt, index) => ({
      id: `global-task-${index + 1}`,
      type: 'gpt-4',
      subtype: 'text',
      prompt,
      status: 'pending' as const,
      timestamp: new Date(Date.now() - Math.floor(Math.random() * 3600000))
    }));
    
    setGlobalTasks(tasks);
  }, []);
  
  const handleRefresh = () => {
    setIsRefreshing(true);
    
    // Simulate refresh delay
    setTimeout(() => {
      setIsRefreshing(false);
      toast.success("Global statistics refreshed");
    }, 1000);
  };
  
  const toggleAutoRefresh = (checked: boolean) => {
    setAutoRefresh(checked);
    toast(checked ? "Auto-refresh enabled" : "Auto-refresh disabled");
  };
  
  // Format timestamp to display time only
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };
  
  return (
    <div className="stat-card">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold">Global Statistics</h2>
          <InfoTooltip content="Overview of the entire Swarm Network activity" />
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400">Auto-Refresh</span>
            <Switch checked={autoRefresh} onCheckedChange={toggleAutoRefresh} />
          </div>
          <Button 
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="bg-slate-700/50 border-slate-600"
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="flex flex-col p-3 bg-slate-800/30 rounded-lg">
          <div className="flex items-center text-slate-400 mb-1">
            <Activity className="w-4 h-4 mr-2" /> Total Tasks
          </div>
          <div className="text-2xl font-bold">20</div>
        </div>
        
        <div className="flex flex-col p-3 bg-slate-800/30 rounded-lg">
          <div className="flex items-center text-slate-400 mb-1">
            <Clock className="w-4 h-4 mr-2" /> Avg. Compute Time
          </div>
          <div className="text-2xl font-bold">3.75s</div>
        </div>
        
        <div className="flex flex-col p-3 bg-slate-800/30 rounded-lg">
          <div className="flex items-center text-slate-400 mb-1">
            <Users className="w-4 h-4 mr-2" /> Total Users
          </div>
          <div className="text-2xl font-bold">50</div>
        </div>
        
        <div className="flex flex-col p-3 bg-slate-800/30 rounded-lg">
          <div className="flex items-center text-slate-400 mb-1">
            <Server className="w-4 h-4 mr-2" /> Active Nodes
          </div>
          <div className="text-2xl font-bold">45</div>
        </div>
      </div>
      
      <div>
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-lg font-medium">Recent Global Tasks</h3>
          <div className="text-sm text-blue-400">
            <span className="mr-1">•</span> Network Load: 60.0%
          </div>
        </div>
        
        <div className="space-y-3">
          {globalTasks.slice(0, 3).map(task => (
            <div key={task.id} className="task-card">
              <div className="flex">
                <div className="mr-3 p-2 bg-blue-900/20 rounded">
                  <div className="w-8 h-8 flex items-center justify-center">
                    <FileCode className="w-5 h-5 text-blue-400" />
                  </div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-blue-400">gpt-4</span>
                    <span className="text-xs bg-slate-700/50 px-2 py-0.5 rounded text-slate-300">text</span>
                    <span className="text-xs bg-amber-900/50 px-2 py-0.5 rounded text-amber-300 ml-auto">Pending</span>
                  </div>
                  <p className="text-sm mb-1">Prompt: {task.prompt}</p>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span>0.0s</span>
                    <span className="ml-auto">{formatTime(task.timestamp)}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// FileCode icon for task type visualization
const FileCode = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
    <polyline points="14 2 14 8 20 8"></polyline>
    <path d="m10 13-2 2 2 2"></path>
    <path d="m14 17 2-2-2-2"></path>
  </svg>
);
