
import React, { useState, useEffect } from 'react';
import { Activity, Clock, Users, Server, RefreshCw, FileCode } from 'lucide-react';
import { InfoTooltip } from './InfoTooltip';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { fetchGlobalStats, fetchTasks } from '@/lib/supabase';
import { useWallet } from '@/contexts/WalletContext';
import { GlobalTask } from '@/types/hardware';

export const GlobalStatistics = () => {
  const { isConnected } = useWallet();
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [globalTasks, setGlobalTasks] = useState<GlobalTask[]>([]);
  const [stats, setStats] = useState({
    totalTasks: 0,
    totalUsers: 0,
    activeNodes: 0,
    avgComputeTime: 3.75 // Default value
  });
  
  // Fetch data on component mount and when wallet connection changes
  useEffect(() => {
    if (isConnected) {
      loadData();
    } else {
      // If not connected, use placeholder data
      setGlobalTasks([]);
      setStats({
        totalTasks: 0,
        totalUsers: 0,
        activeNodes: 0,
        avgComputeTime: 3.75
      });
    }
  }, [isConnected]);
  
  // Auto-refresh data
  useEffect(() => {
    if (!autoRefresh || !isConnected) return;
    
    const intervalId = setInterval(() => {
      loadData(false); // Don't show loading state for auto-refresh
    }, 30000); // Refresh every 30 seconds
    
    return () => clearInterval(intervalId);
  }, [autoRefresh, isConnected]);
  
  const loadData = async (showLoading = true) => {
    if (showLoading) {
      setIsRefreshing(true);
    }
    
    try {
      // Fetch global stats
      const globalStats = await fetchGlobalStats();
      
      // Fetch recent tasks
      const tasks = await fetchTasks();
      const formattedTasks = tasks.slice(0, 10).map(task => ({
        id: task.id,
        type: 'gpt-4' as const,
        subtype: 'text' as const,
        prompt: task.prompt,
        status: task.status as 'pending',
        timestamp: new Date(task.created_at)
      }));
      
      setGlobalTasks(formattedTasks);
      setStats({
        ...globalStats,
        avgComputeTime: 3.75 // This would come from the server in a real implementation
      });
      
      if (showLoading) {
        toast.success("Global statistics refreshed");
      }
    } catch (error) {
      console.error('Error loading data:', error);
      if (showLoading) {
        toast.error("Failed to refresh statistics");
      }
    } finally {
      if (showLoading) {
        setIsRefreshing(false);
      }
    }
  };
  
  const handleRefresh = () => {
    loadData();
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
            disabled={isRefreshing || !isConnected}
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
          <div className="text-2xl font-bold">{stats.totalTasks}</div>
        </div>
        
        <div className="flex flex-col p-3 bg-slate-800/30 rounded-lg">
          <div className="flex items-center text-slate-400 mb-1">
            <Clock className="w-4 h-4 mr-2" /> Avg. Compute Time
          </div>
          <div className="text-2xl font-bold">{stats.avgComputeTime}s</div>
        </div>
        
        <div className="flex flex-col p-3 bg-slate-800/30 rounded-lg">
          <div className="flex items-center text-slate-400 mb-1">
            <Users className="w-4 h-4 mr-2" /> Total Users
          </div>
          <div className="text-2xl font-bold">{stats.totalUsers}</div>
        </div>
        
        <div className="flex flex-col p-3 bg-slate-800/30 rounded-lg">
          <div className="flex items-center text-slate-400 mb-1">
            <Server className="w-4 h-4 mr-2" /> Active Nodes
          </div>
          <div className="text-2xl font-bold">{stats.activeNodes}</div>
        </div>
      </div>
      
      {isConnected ? (
        <div>
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-lg font-medium">Recent Global Tasks</h3>
            <div className="text-sm text-blue-400">
              <span className="mr-1">•</span> Network Load: {Math.min(stats.activeNodes * 10, 100).toFixed(1)}%
            </div>
          </div>
          
          {globalTasks.length > 0 ? (
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
                        <span className="text-sm font-medium text-blue-400">{task.type}</span>
                        <span className="text-xs bg-slate-700/50 px-2 py-0.5 rounded text-slate-300">{task.subtype}</span>
                        <span className="text-xs bg-amber-900/50 px-2 py-0.5 rounded text-amber-300 ml-auto">{task.status}</span>
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
          ) : (
            <div className="p-4 text-center text-slate-400">
              No tasks available currently. Tasks will appear here when submitted to the network.
            </div>
          )}
        </div>
      ) : (
        <div className="p-6 text-center border border-dashed border-slate-700 rounded-lg">
          <Wallet className="w-12 h-12 text-slate-500 mx-auto mb-2" />
          <h3 className="text-lg font-medium mb-1">Connect Wallet to View Tasks</h3>
          <p className="text-slate-400">
            Connect your wallet to see live tasks and statistics from the Swarm Network.
          </p>
        </div>
      )}
    </div>
  );
};
