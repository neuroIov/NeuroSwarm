import React, { useState, useEffect } from 'react';
import { 
  CheckCircle, 
  Clock, 
  Zap, 
  XCircle,
  Loader2,
  FileCode
} from 'lucide-react';
import { InfoTooltip } from './InfoTooltip';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

interface Task {
  id: string;
  type: 'gpt-4' | 'compute' | 'storage';
  subtype: 'text' | 'image' | 'video' | 'data';
  prompt: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  timeRemaining?: number;
  timestamp: Date;
}

export const TaskPipeline = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [autoMode, setAutoMode] = useState(true);
  const [stats, setStats] = useState({
    completed: 0,
    processing: 0,
    pending: 0,
    failed: 0
  });
  
  // Initialize with some pending tasks
  useEffect(() => {
    const prompts = [
      "Explain the concept of blockchain in layman terms.",
      "Write a short story about a robot learning emotions.",
      "Create a marketing tagline for a new smartphone.",
      "Design a simple algorithm to sort an array.",
      "Suggest three names for a cafe in Paris."
    ];
    
    const initialTasks: Task[] = prompts.map((prompt, index) => ({
      id: `task-${index + 1}`,
      type: 'gpt-4',
      subtype: 'text',
      prompt,
      status: 'pending',
      timeRemaining: Math.floor(Math.random() * 20) + 5,
      timestamp: new Date(Date.now() - Math.floor(Math.random() * 3600000))
    }));
    
    setTasks(initialTasks);
    setStats({
      completed: 0,
      processing: 0,
      pending: initialTasks.length,
      failed: 0
    });
  }, []);
  
  // Process tasks in auto mode
  useEffect(() => {
    if (!autoMode) return;
    
    const interval = setInterval(() => {
      setTasks(prevTasks => {
        const updatedTasks = [...prevTasks];
        
        // Find a pending task to start processing
        const pendingTaskIndex = updatedTasks.findIndex(t => t.status === 'pending');
        if (pendingTaskIndex >= 0) {
          updatedTasks[pendingTaskIndex] = {
            ...updatedTasks[pendingTaskIndex],
            status: 'processing',
            timeRemaining: Math.floor(Math.random() * 10) + 3
          };
          
          // Update stats
          setStats(prev => ({
            ...prev,
            pending: prev.pending - 1,
            processing: prev.processing + 1
          }));
          
          toast.info(`Started processing: ${updatedTasks[pendingTaskIndex].prompt.substring(0, 30)}...`);
        }
        
        // Progress or complete processing tasks
        updatedTasks.forEach((task, index) => {
          if (task.status === 'processing' && task.timeRemaining !== undefined) {
            if (task.timeRemaining <= 1) {
              // Task completed
              updatedTasks[index] = {
                ...task,
                status: 'completed',
                timeRemaining: undefined
              };
              
              // Update stats
              setStats(prev => ({
                ...prev,
                processing: prev.processing - 1,
                completed: prev.completed + 1
              }));
              
              toast.success(`Task completed successfully!`);
              
            } else {
              // Decrease time remaining
              updatedTasks[index] = {
                ...task,
                timeRemaining: task.timeRemaining - 1
              };
            }
          }
        });
        
        return updatedTasks;
      });
    }, 3000);
    
    return () => clearInterval(interval);
  }, [autoMode]);
  
  // Update stats when tasks change
  useEffect(() => {
    const newStats = {
      completed: tasks.filter(t => t.status === 'completed').length,
      processing: tasks.filter(t => t.status === 'processing').length,
      pending: tasks.filter(t => t.status === 'pending').length,
      failed: tasks.filter(t => t.status === 'failed').length
    };
    
    setStats(newStats);
  }, [tasks]);
  
  const toggleAutoMode = (checked: boolean) => {
    setAutoMode(checked);
    toast(checked ? "Auto-processing enabled" : "Auto-processing disabled");
  };
  
  const getStatusIcon = (status: Task['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'processing':
        return <Zap className="w-5 h-5 text-blue-500" />;
      case 'pending':
        return <Clock className="w-5 h-5 text-amber-500" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />;
    }
  };
  
  return (
    <div className="stat-card">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold">Task Pipeline</h2>
          <InfoTooltip 
            content="The task pipeline shows all tasks assigned to your nodes. Tasks are automatically processed when your nodes are active."
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-swarm-text-secondary">NLOV Network</span>
          <div className="flex items-center gap-2">
            <span className="text-sm text-swarm-text-secondary">Auto</span>
            <Switch checked={autoMode} onCheckedChange={toggleAutoMode} />
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="flex flex-col items-center p-3 bg-slate-800/30 rounded-lg">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-500" />
            <span className="text-xl font-bold">{stats.completed}</span>
          </div>
          <span className="text-xs text-slate-400">Completed</span>
        </div>
        
        <div className="flex flex-col items-center p-3 bg-slate-800/30 rounded-lg">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-blue-500" />
            <span className="text-xl font-bold">{stats.processing}</span>
          </div>
          <span className="text-xs text-slate-400">Processing</span>
        </div>
        
        <div className="flex flex-col items-center p-3 bg-slate-800/30 rounded-lg">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-500" />
            <span className="text-xl font-bold">{stats.pending}</span>
          </div>
          <span className="text-xs text-slate-400">Pending</span>
        </div>
        
        <div className="flex flex-col items-center p-3 bg-slate-800/30 rounded-lg">
          <div className="flex items-center gap-2">
            <XCircle className="w-4 h-4 text-red-500" />
            <span className="text-xl font-bold">{stats.failed}</span>
          </div>
          <span className="text-xs text-slate-400">Failed</span>
        </div>
      </div>
      
      <div className="space-y-3">
        {tasks.map(task => (
          <div key={task.id} className="task-card">
            <div className="flex items-start gap-3">
              <div className="mt-1">
                <FileCode className="w-5 h-5 text-swarm-accent-purple" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-swarm-accent-purple">gpt-4</span>
                  <span className="text-xs bg-slate-700/50 px-2 py-0.5 rounded text-slate-300">text</span>
                </div>
                <p className="text-sm mt-1 text-slate-200">
                  {task.prompt}
                </p>
                <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                  <span>Awaiting transaction...</span>
                  <span>0.0s</span>
                </div>
              </div>
              <div className="ml-2 flex flex-col items-end">
                <div className={`
                  text-xs rounded-full px-2 py-0.5
                  ${task.status === 'completed' ? 'bg-green-900/50 text-green-300' : ''}
                  ${task.status === 'processing' ? 'bg-blue-900/50 text-blue-300' : ''}
                  ${task.status === 'pending' ? 'bg-amber-900/50 text-amber-300' : ''}
                  ${task.status === 'failed' ? 'bg-red-900/50 text-red-300' : ''}
                `}>
                  {task.status === 'processing' ? (
                    <div className="flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>Processing</span>
                    </div>
                  ) : (
                    task.status.charAt(0).toUpperCase() + task.status.slice(1)
                  )}
                </div>
                {task.timeRemaining !== undefined && task.status === 'processing' && (
                  <span className="text-xs mt-1 text-slate-400">{task.timeRemaining}s remaining</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
