
import React, { useState, useEffect } from 'react';
import { 
  Code, 
  HardDrive, 
  Database, 
  Clock,
  MoreHorizontal,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InfoTooltip } from './InfoTooltip';
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useNodes } from '@/contexts/NodeContext';

// Define task type more strictly
interface Task {
  id: string;
  type: "gpt-4" | "compute" | "storage";
  subtype: string;
  prompt: string;
  status: "pending" | "running" | "completed" | "failed";
  timeRemaining: number; // in seconds
  timestamp: Date;
}

export const TaskPipeline = () => {
  const { nodes } = useNodes();
  const [tasks, setTasks] = useState<Task[]>([]);
  const activeNodesCount = nodes.filter(node => node.status === 'running').length;
  
  // Generate initial tasks
  useEffect(() => {
    const initialTasks: Task[] = [
      {
        id: "task-1",
        type: "compute",
        subtype: "matrix-multiplication",
        prompt: "Calculate large matrix multiplication",
        status: "pending",
        timeRemaining: 120,
        timestamp: new Date()
      },
      {
        id: "task-2",
        type: "gpt-4",
        subtype: "text-generation",
        prompt: "Generate product description based on specifications",
        status: "pending",
        timeRemaining: 90,
        timestamp: new Date()
      },
      {
        id: "task-3",
        type: "storage",
        subtype: "data-indexing",
        prompt: "Index and categorize document archive",
        status: "pending",
        timeRemaining: 150,
        timestamp: new Date()
      }
    ];
    
    setTasks(initialTasks);
  }, []);
  
  useEffect(() => {
    // Process tasks only if we have active nodes
    if (activeNodesCount > 0) {
      const interval = setInterval(() => {
        setTasks(currentTasks => {
          return currentTasks.map(task => {
            // Only process tasks that are running or pending
            if (task.status === "running") {
              // Decrease remaining time
              const newTimeRemaining = task.timeRemaining - 1;
              
              // Check if task is complete
              if (newTimeRemaining <= 0) {
                // 90% chance of success
                const success = Math.random() > 0.1;
                
                if (success) {
                  toast.success(`Task completed: ${task.prompt}`);
                  return { ...task, timeRemaining: 0, status: "completed" };
                } else {
                  toast.error(`Task failed: ${task.prompt}`);
                  return { ...task, timeRemaining: 0, status: "failed" };
                }
              }
              
              return { ...task, timeRemaining: newTimeRemaining };
            } 
            // Auto-start pending tasks if we have active nodes and not too many tasks running
            else if (task.status === "pending") {
              const runningTasks = currentTasks.filter(t => t.status === "running").length;
              
              // Start task if we have space for it (based on active nodes)
              if (runningTasks < activeNodesCount) {
                toast.info(`Starting task: ${task.prompt}`);
                return { ...task, status: "running" };
              }
            }
            
            return task;
          });
        });
      }, 1000);
      
      return () => clearInterval(interval);
    }
  }, [activeNodesCount]);
  
  // Clean up completed or failed tasks after a while
  useEffect(() => {
    const completedTasks = tasks.filter(t => t.status === "completed" || t.status === "failed").length;
    
    if (completedTasks > 0) {
      const timeout = setTimeout(() => {
        setTasks(current => {
          // Remove completed/failed tasks
          const filtered = current.filter(t => t.status !== "completed" && t.status !== "failed");
          
          // Add new tasks if we're running low
          if (filtered.length < 3 && activeNodesCount > 0) {
            const newTaskTypes: Array<"gpt-4" | "compute" | "storage"> = ["gpt-4", "compute", "storage"];
            const newTaskSubtypes = {
              "gpt-4": ["text-generation", "code-generation", "translation"],
              "compute": ["matrix-multiplication", "neural-network", "data-processing"],
              "storage": ["data-indexing", "file-distribution", "backup-verification"]
            };
            
            const taskPrompts = {
              "gpt-4": ["Generate creative content", "Write code documentation", "Translate text"],
              "compute": ["Process large dataset", "Train machine learning model", "Optimize algorithm"],
              "storage": ["Index file collection", "Distribute content globally", "Verify backup integrity"]
            };
            
            // Generate 1-2 new tasks
            const newTasksCount = Math.min(2, 5 - filtered.length);
            const newTasks: Task[] = [];
            
            for (let i = 0; i < newTasksCount; i++) {
              const type = newTaskTypes[Math.floor(Math.random() * newTaskTypes.length)];
              const subtype = newTaskSubtypes[type][Math.floor(Math.random() * newTaskSubtypes[type].length)];
              const promptIndex = Math.floor(Math.random() * taskPrompts[type].length);
              
              newTasks.push({
                id: `task-${Date.now()}-${i}`,
                type,
                subtype,
                prompt: taskPrompts[type][promptIndex],
                status: "pending",
                timeRemaining: 60 + Math.floor(Math.random() * 180),
                timestamp: new Date()
              });
            }
            
            return [...filtered, ...newTasks];
          }
          
          return filtered;
        });
      }, 5000);
      
      return () => clearTimeout(timeout);
    }
  }, [tasks, activeNodesCount]);
  
  const getTaskIcon = (type: Task['type']) => {
    switch (type) {
      case "gpt-4": return <Code className="w-5 h-5 text-blue-400" />;
      case "compute": return <HardDrive className="w-5 h-5 text-green-400" />;
      case "storage": return <Database className="w-5 h-5 text-amber-400" />;
    }
  };
  
  const getStatusBadge = (status: Task['status']) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="text-slate-400 border-slate-500">Pending</Badge>;
      case "running":
        return <Badge variant="outline" className="text-blue-400 border-blue-500">Running</Badge>;
      case "completed":
        return <Badge variant="outline" className="text-green-400 border-green-500">Completed</Badge>;
      case "failed":
        return <Badge variant="outline" className="text-red-400 border-red-500">Failed</Badge>;
    }
  };
  
  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };
  
  return (
    <div className="stat-card">
      <div className="flex flex-col h-full">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold">Task Pipeline</h2>
            <InfoTooltip content="Tasks queued for processing by your active nodes" />
          </div>
          <div className="text-sm text-slate-400">
            Active Nodes: <span className="font-semibold text-green-400">{activeNodesCount}</span>
          </div>
        </div>
        
        {tasks.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-slate-400">No tasks in queue</p>
          </div>
        ) : (
          <div className="space-y-3 flex-1">
            {tasks.map(task => (
              <div 
                key={task.id} 
                className={`p-3 rounded-lg border ${
                  task.status === "pending" ? "border-slate-700 bg-slate-800/30" :
                  task.status === "running" ? "border-blue-900/50 bg-blue-900/10" :
                  task.status === "completed" ? "border-green-900/50 bg-green-900/10" :
                  "border-red-900/50 bg-red-900/10"
                }`}
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    {getTaskIcon(task.type)}
                    <div>
                      <div className="font-medium">{task.prompt}</div>
                      <div className="text-xs text-slate-400">
                        {task.type.toUpperCase()} / {task.subtype}
                      </div>
                    </div>
                  </div>
                  
                  {getStatusBadge(task.status)}
                </div>
                
                {/* Show progress for running tasks */}
                {task.status === "running" && (
                  <div className="mt-2">
                    <Progress 
                      value={100 - (task.timeRemaining / 2)} 
                      max={100} 
                      className="h-1"
                    />
                    <div className="flex justify-between mt-1 text-xs text-slate-400">
                      <span>Processing...</span>
                      <div className="flex items-center">
                        <Clock className="w-3 h-3 mr-1" />
                        <span>{formatTime(task.timeRemaining)}</span>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Show completion status */}
                {task.status === "completed" && (
                  <div className="flex items-center mt-2 text-xs text-green-400">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    <span>Completed successfully</span>
                  </div>
                )}
                
                {/* Show failure status */}
                {task.status === "failed" && (
                  <div className="flex items-center mt-2 text-xs text-red-400">
                    <XCircle className="w-3 h-3 mr-1" />
                    <span>Failed to complete</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
