import React, { useState, useEffect } from 'react';
import { InfoTooltip } from './InfoTooltip';
import { Progress } from "@/components/ui/progress";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer 
} from 'recharts';

interface GlobalTask {
  id: string;
  type: "gpt-4" | "compute" | "storage";
  subtype: string;
  prompt: string;
  status: "pending" | "processing" | "completed";
  timestamp: Date;
}

interface NetworkData {
  date: string;
  tasks: number;
  nodes: number;
}

export const GlobalStatistics = () => {
  const [globalTasks, setGlobalTasks] = useState<GlobalTask[]>([]);
  const [networkData, setNetworkData] = useState<NetworkData[]>([]);
  const [totalNodes, setTotalNodes] = useState(0);
  const [totalTasks, setTotalTasks] = useState(0);
  
  useEffect(() => {
    const initialGlobalTasks: GlobalTask[] = [
      {
        id: "global-1",
        type: "gpt-4",
        subtype: "text-generation",
        prompt: "Generate marketing copy",
        status: "completed",
        timestamp: new Date(Date.now() - 1000 * 60 * 5)
      },
      {
        id: "global-2",
        type: "compute",
        subtype: "neural-network",
        prompt: "Train image classifier",
        status: "processing",
        timestamp: new Date(Date.now() - 1000 * 60 * 3)
      },
      {
        id: "global-3",
        type: "storage",
        subtype: "data-indexing", 
        prompt: "Index transaction database",
        status: "pending",
        timestamp: new Date()
      }
    ];
    
    setGlobalTasks(initialGlobalTasks);
    
    const today = new Date();
    const networkStats: NetworkData[] = [];
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      
      const factor = (6 - i) * 1.2;
      const baseNodes = 1000 + Math.floor(Math.random() * 200) + (i * 150);
      const baseTasks = 5000 + Math.floor(Math.random() * 1000) + (i * 700);
      
      networkStats.push({
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        nodes: baseNodes + Math.floor(factor * 50),
        tasks: baseTasks + Math.floor(factor * 300)
      });
    }
    
    setNetworkData(networkStats);
    
    setTotalNodes(networkStats[networkStats.length - 1].nodes);
    setTotalTasks(networkStats[networkStats.length - 1].tasks);
  }, []);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setGlobalTasks(prevTasks => {
        return prevTasks.map(task => {
          if (task.status === "pending") {
            return { ...task, status: "processing" };
          } else if (task.status === "processing") {
            return { ...task, status: "completed" };
          }
          return task;
        });
      });
      
      if (Math.random() > 0.5) {
        const taskTypes: Array<"gpt-4" | "compute" | "storage"> = ["gpt-4", "compute", "storage"];
        const taskSubtypes = [
          "text-generation", "neural-network", "data-indexing",
          "code-generation", "model-training", "data-distribution"
        ];
        const taskPrompts = [
          "Process language model", "Optimize algorithm", "Distribute content",
          "Train classification model", "Generate creative text", "Index database"
        ];
        
        const newTask: GlobalTask = {
          id: `global-${Date.now()}`,
          type: taskTypes[Math.floor(Math.random() * taskTypes.length)],
          subtype: taskSubtypes[Math.floor(Math.random() * taskSubtypes.length)],
          prompt: taskPrompts[Math.floor(Math.random() * taskPrompts.length)],
          status: "pending",
          timestamp: new Date()
        };
        
        setGlobalTasks(prev => {
          const updatedTasks = [newTask, ...prev];
          if (updatedTasks.length > 10) {
            return updatedTasks.slice(0, 10);
          }
          return updatedTasks;
        });
        
        setTotalTasks(prev => prev + 1);
      }
      
      if (Math.random() > 0.7) {
        setTotalNodes(prev => prev + Math.floor(Math.random() * 5) + 1);
      }
    }, 3000);
    
    return () => clearInterval(interval);
  }, []);
  
  const formatNumber = (num: number) => {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };
  
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-800 p-2 border border-slate-700 rounded text-sm">
          <p className="text-white font-semibold">{label}</p>
          <p className="text-green-400">Nodes: {formatNumber(payload[0].value)}</p>
          <p className="text-blue-400">Tasks: {formatNumber(payload[1].value)}</p>
        </div>
      );
    }
    return null;
  };
  
  return (
    <div className="stat-card">
      <div className="flex flex-col space-y-6">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold">Global Statistics</h2>
          <InfoTooltip content="Network-wide activity and performance metrics" />
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-800/30 p-4 rounded-lg">
            <h3 className="text-sm text-slate-400 mb-1">Total Active Nodes</h3>
            <div className="text-2xl font-bold">{formatNumber(totalNodes)}</div>
            <Progress 
              value={85} 
              max={100} 
              className="h-1 mt-2"
            />
            <p className="text-xs text-slate-500 mt-1">85% network stability</p>
          </div>
          
          <div className="bg-slate-800/30 p-4 rounded-lg">
            <h3 className="text-sm text-slate-400 mb-1">Total Tasks Processed</h3>
            <div className="text-2xl font-bold">{formatNumber(totalTasks)}</div>
            <Progress 
              value={92} 
              max={100} 
              className="h-1 mt-2"
            />
            <p className="text-xs text-slate-500 mt-1">92% completion rate</p>
          </div>
        </div>
        
        <div>
          <h3 className="text-sm text-slate-400 mb-3">Network Activity (7-day)</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={networkData}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <XAxis 
                  dataKey="date" 
                  stroke="#475569" 
                  tick={{ fill: '#94a3b8' }} 
                  axisLine={{ stroke: '#334155' }}
                />
                <YAxis 
                  stroke="#475569" 
                  tick={{ fill: '#94a3b8' }} 
                  axisLine={{ stroke: '#334155' }}
                />
                <RechartsTooltip content={<CustomTooltip />} />
                <Bar dataKey="nodes" fill="#10b981" name="Nodes" />
                <Bar dataKey="tasks" fill="#3b82f6" name="Tasks" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        
        <div>
          <h3 className="text-sm text-slate-400 mb-3">Recent Global Tasks</h3>
          <div className="space-y-2">
            {globalTasks.slice(0, 5).map(task => (
              <div key={task.id} className="bg-slate-800/20 p-2 rounded flex justify-between items-center">
                <div className="text-sm">
                  {task.prompt}
                  <div className="text-xs text-slate-500">{task.type.toUpperCase()} / {task.subtype}</div>
                </div>
                <div className="text-xs">
                  {task.status === "pending" && (
                    <span className="text-amber-400">Pending</span>
                  )}
                  {task.status === "processing" && (
                    <span className="text-blue-400">Processing</span>
                  )}
                  {task.status === "completed" && (
                    <span className="text-green-400">Completed</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
