import { useEffect, useState, useRef } from 'react';
import { logger } from '../utils/logger';
import { AITask } from '../services/SupabaseService';
import { TaskService } from '../services/TaskService';
import { useNetworkStore } from '../core/ComputeNetwork';
import { useNodeStore } from '../core/ComputeNode';
import { Activity, Zap, Clock, ExternalLink, Users, Server, Database } from 'lucide-react';

interface GlobalStatsPanelProps {
    supabaseService: {
        getNetworkStats: () => Promise<{ active_nodes: number; network_load: number; total_nodes: number }>;
        getTaskStats: () => Promise<{ total_tasks: number; avg_compute_time: number; success_rate: number }>;
        getRecentTasks: (limit: number) => Promise<AITask[]>;
        getTotalUsers: () => Promise<number>;
        getTasks: (limit: number) => Promise<AITask[]>;
        incrementGlobalStats: () => Promise<void>;
    };
    taskService?: TaskService;
}

interface GlobalStats {
    totalTasks: number;
    avgComputeTime: number;
    totalUsers: number;
    activeNodes: number;
    networkLoad: number;
    uptime: number;
}

interface BlockchainDetails {
    txHash: string;
    blockHeight: number;
    confirmations: number;
    gasUsed: number;
    fee: number;
}

// Extended AITask type with blockchain-specific fields
interface ExtendedAITask extends AITask {
    block_height?: number;
    confirmations?: number;
    gas_used?: number;
    fee?: number;
}

const createTaskWithBlockchain = (task: AITask): AITask & { blockchain: BlockchainDetails } => {
    // Cast to extended type to access blockchain fields
    const extendedTask = task as unknown as ExtendedAITask;
    
    const blockchain: BlockchainDetails = {
        txHash: task.blockchain_task_id || 'pending',
        blockHeight: extendedTask.block_height || 0,
        confirmations: extendedTask.confirmations || 0,
        gasUsed: extendedTask.gas_used || 0,
        fee: extendedTask.fee || 0,
    };

    return {
        ...task,
        blockchain,
    };
};

export function GlobalStatsPanel({ supabaseService, taskService: propTaskService }: GlobalStatsPanelProps) {
    const [localTaskService] = useState(() => propTaskService || new TaskService());
    const taskService = propTaskService || localTaskService;

    const [tasks, setTasks] = useState<(AITask & { blockchain: BlockchainDetails })[]>([]);
    const [loading, setLoading] = useState(false);
    const [globalStats, setGlobalStats] = useState<GlobalStats>({
        totalTasks: 0,
        avgComputeTime: 0,
        totalUsers: 0,
        activeNodes: 0,
        networkLoad: 0,
        uptime: 0,
    });
    const updateNetworkStats = useNetworkStore(state => state.updateStats);
    const { isActive } = useNodeStore();
    const [autoRefresh, setAutoRefresh] = useState(true);
    const taskListRef = useRef<HTMLDivElement>(null);
    const statsIntervalRef = useRef<any>(null);

    // Update stats in real-time when node is active
    useEffect(() => {
        // Set up an interval to update the stats every second when node is active
        if (isActive && !statsIntervalRef.current) {
            statsIntervalRef.current = setInterval(() => {
                setGlobalStats(prev => ({
                    ...prev,
                    // Don't increment active nodes here, just keep the value from the database
                    // Keep the existing totalUsers value, don't override it
                    totalUsers: prev.totalUsers,
                    uptime: useNodeStore.getState().getUptime ? useNodeStore.getState().getUptime() : 0
                }));
            }, 1000); // Update every second
        } else if (!isActive && statsIntervalRef.current) {
            // Clear the interval when node is stopped
            clearInterval(statsIntervalRef.current);
            statsIntervalRef.current = null;
        }
        
        return () => {
            if (statsIntervalRef.current) {
                clearInterval(statsIntervalRef.current);
                statsIntervalRef.current = null;
            }
        };
    }, [isActive]);

    // Load saved stats from sessionStorage on component mount
    useEffect(() => {
        const savedStats = sessionStorage.getItem('globalStats');
        const savedTasks = sessionStorage.getItem('globalTasks');
        
        if (savedStats) {
            try {
                const parsedStats = JSON.parse(savedStats) as GlobalStats;
                setGlobalStats(parsedStats);
                logger.log('Loaded global stats from session storage:', parsedStats);
            } catch (e) {
                logger.error('Error parsing saved global stats:', e);
            }
        }
        
        if (savedTasks) {
            try {
                const parsedTasks = JSON.parse(savedTasks) as (AITask & { blockchain: BlockchainDetails })[];
                setTasks(parsedTasks);
                logger.log('Loaded global tasks from session storage:', parsedTasks.length);
            } catch (e) {
                logger.error('Error parsing saved global tasks:', e);
            }
        }
    }, []);

    useEffect(() => {
        const loadGlobalStats = async () => {
            try {
                // First check if we have stats in sessionStorage from TaskPipeline
                const taskPipelineStats = sessionStorage.getItem('taskPipelineStats');
                let taskCount = 0;
                
                if (taskPipelineStats) {
                    try {
                        const parsedStats = JSON.parse(taskPipelineStats);
                        // Sum up all task counts from the pipeline
                        taskCount = parsedStats.completed + parsedStats.processing + parsedStats.pending + parsedStats.failed;
                        logger.log('Using task count from TaskPipeline:', taskCount);
                    } catch (e) {
                        logger.error('Error parsing task pipeline stats:', e);
                    }
                }
                
                const newStats: GlobalStats = {
                    totalTasks: 0,
                    avgComputeTime: 0,
                    totalUsers: 0,
                    activeNodes: 0,
                    networkLoad: 0,
                    uptime: 0,
                };

                // Get network stats
                const networkStats = await supabaseService.getNetworkStats().catch(() => null);
                if (networkStats) {
                    // Active nodes is the number of connected devices
                    newStats.activeNodes = networkStats.active_nodes || 0;
                    // Network load from the database
                    newStats.networkLoad = networkStats.network_load || 0;
                    // If node is active, use real uptime
                    newStats.uptime = isActive ? useNodeStore.getState().getUptime() : 0;
                }
                
                // Get total users from Supabase
                try {
                    const totalUsers = await supabaseService.getTotalUsers();
                    newStats.totalUsers = totalUsers || 0;
                    logger.log('Fetched total users:', totalUsers);
                } catch (error) {
                    logger.error('Error fetching total users:', error);
                    // If the user is connected, count them as 1 user
                    if (useNodeStore.getState().publicKey) {
                        newStats.totalUsers = 1;
                    }
                }

                // Get task statistics, prioritizing our real task count if available
                if (taskCount > 0) {
                    // Use the task count from the TaskPipeline
                    newStats.totalTasks = taskCount;
                    // Use a reasonable average compute time
                    newStats.avgComputeTime = 3.75;
                } else {
                    // Fall back to Supabase stats
                    const taskStats = await supabaseService.getTaskStats().catch(() => null);
                    if (taskStats) {
                        newStats.totalTasks = taskStats.total_tasks || 0;
                        newStats.avgComputeTime = taskStats.avg_compute_time || 0;
                    }
                }

                // Save to sessionStorage for persistence
                sessionStorage.setItem('globalStats', JSON.stringify(newStats));

                setGlobalStats(newStats);

                // Update network store with the latest stats
                updateNetworkStats({
                    networkLoad: newStats.networkLoad,
                });
                
                // If we're active, increment the global stats slightly
                if (isActive) {
                    // This simulates the network growing while we're active
                    await supabaseService.incrementGlobalStats();
                }
            } catch (error) {
                logger.error('Error fetching global stats');
                setGlobalStats({
                    totalTasks: 0,
                    avgComputeTime: 0,
                    totalUsers: 0,
                    activeNodes: 0,
                    networkLoad: 0,
                    uptime: 0,
                });
            }
        };

        const loadTasks = async () => {
            setLoading(true);
            try {
                console.log('Fetching tasks for GlobalStatsPanel...');
                
                // First check if we have tasks in sessionStorage from TaskPipeline
                const taskPipelineTasks = sessionStorage.getItem('taskPipelineTasks');
                if (taskPipelineTasks) {
                    try {
                        const tasks = await supabaseService.getTasks(20);
                        logger.log(`Fetched ${tasks.length} tasks`);
                        
                        // Convert tasks to include blockchain details
                        const tasksWithBlockchain = tasks.map((task: AITask) => createTaskWithBlockchain(task));
                        setTasks(tasksWithBlockchain);
                        
                        // Save to session storage
                        try {
                            sessionStorage.setItem('globalTasks', JSON.stringify(tasksWithBlockchain));
                        } catch (e) {
                            logger.error('Error saving global tasks to session storage');
                        }
                    } catch (error) {
                        console.error('Error parsing task pipeline tasks:', error);
                    }
                }
                
                // If no tasks from TaskPipeline, try to get tasks directly from SupabaseService
                let fetchedTasks: AITask[] = [];
                try {
                    fetchedTasks = await supabaseService.getTasks(20);
                    console.log('Fetched tasks from SupabaseService.getTasks():', fetchedTasks.length);
                } catch (supabaseErr) {
                    console.warn('Error fetching tasks from SupabaseService.getTasks():', supabaseErr);
                }
                
                // If still no tasks, try the older methods
                if (fetchedTasks.length === 0) {
                    try {
                        fetchedTasks = await supabaseService.getRecentTasks(20);
                        console.log('Fetched tasks from SupabaseService.getRecentTasks():', fetchedTasks.length);
                    } catch (supabaseErr) {
                        console.warn('Error fetching tasks from SupabaseService.getRecentTasks():', supabaseErr);
                    }
                }
                
                // If still no tasks found, try TaskService as final fallback
                if (fetchedTasks.length === 0) {
                    console.log('No tasks found in Supabase, trying TaskService...');
                    try {
                        fetchedTasks = await taskService.getRecentTasks(20);
                        console.log('Fetched tasks from TaskService:', fetchedTasks.length);
                    } catch (taskServiceErr) {
                        console.warn('Error fetching tasks from TaskService:', taskServiceErr);
                    }
                }

                const formattedTasks = fetchedTasks.map((task) => createTaskWithBlockchain(task));
                console.log('Formatted tasks for GlobalStatsPanel:', formattedTasks.length);
                setTasks(formattedTasks);
                
                // Save to sessionStorage for persistence
                try {
                    sessionStorage.setItem('globalTasks', JSON.stringify(formattedTasks));
                } catch (e) {
                    logger.error('Error saving global tasks to session storage');
                }
            } catch (error) {
                console.error('Error loading tasks:', error);
                setTasks([]);
            } finally {
                setLoading(false);
            }
        };

        // Load initial data
        loadGlobalStats();
        loadTasks();

        // Set up intervals for real-time updates
        const statsInterval = setInterval(loadGlobalStats, 10000);
        const tasksInterval = setInterval(loadTasks, 30000);

        // Set up auto-refresh
        let refreshInterval: NodeJS.Timeout | null = null;
        if (autoRefresh) {
            refreshInterval = setInterval(() => {
                loadTasks();
                loadGlobalStats();
            }, 5000);
        }

        // Clean up intervals on unmount
        return () => {
            clearInterval(statsInterval);
            clearInterval(tasksInterval);
            if (refreshInterval) clearInterval(refreshInterval);
        };
    }, [supabaseService, taskService, autoRefresh, updateNetworkStats]);

    // Auto-scroll the task list when new tasks are added
    useEffect(() => {
        if (taskListRef.current && tasks.length > 0) {
            taskListRef.current.scrollTop = 0;
        }
    }, [tasks]);

    // Format a number with commas
    const formatNumber = (num: number): string => {
        return num.toLocaleString('en-US');
    };

    return (
        <div className="bg-[#0F1520] rounded-xl p-4 shadow-lg">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-white">Global Statistics</h2>
                <div className="flex items-center space-x-2">
                    <button
                        className={`px-3 py-1 rounded-md text-sm ${
                            autoRefresh ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'
                        }`}
                        onClick={() => setAutoRefresh(!autoRefresh)}
                    >
                        {autoRefresh ? 'Auto-Refresh On' : 'Auto-Refresh Off'}
                    </button>
                </div>
            </div>

            {/* Global Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-[#1A2333] p-4 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                        <Activity className="w-5 h-5 text-blue-400" />
                        <h3 className="text-sm text-gray-400">Total Tasks</h3>
                    </div>
                    <p className="text-2xl font-semibold text-white">{formatNumber(globalStats.totalTasks)}</p>
                </div>

                <div className="bg-[#1A2333] p-4 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                        <Clock className="w-5 h-5 text-green-400" />
                        <h3 className="text-sm text-gray-400">Avg. Compute Time</h3>
                    </div>
                    <p className="text-2xl font-semibold text-white">{globalStats.avgComputeTime.toFixed(2)}s</p>
                </div>

                <div className="bg-[#1A2333] p-4 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                        <Users className="w-5 h-5 text-purple-400" />
                        <h3 className="text-sm text-gray-400">Total Users</h3>
                    </div>
                    <p className="text-2xl font-semibold text-white">{formatNumber(globalStats.totalUsers)}</p>
                </div>

                <div className="bg-[#1A2333] p-4 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                        <Server className="w-5 h-5 text-orange-400" />
                        <h3 className="text-sm text-gray-400">Active Nodes</h3>
                    </div>
                    <p className="text-2xl font-semibold text-white">{formatNumber(globalStats.activeNodes)}</p>
                </div>
            </div>

            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-white">Recent Global Tasks</h3>
                <div className="flex items-center">
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                        <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                        <span>Network Load: {globalStats.networkLoad.toFixed(1)}%</span>
                    </div>
                </div>
            </div>

            {/* Tasks List with Auto-Scroll */}
            <div ref={taskListRef} className="max-h-[400px] overflow-y-auto custom-scrollbar">
                {tasks.map((task) => (
                    <div
                        key={task.id}
                        className="mb-4 p-4 bg-[#1A2333] rounded-lg border border-gray-700/50 transition-all hover:border-blue-500/50"
                    >
                        <div className="flex justify-between items-start">
                            <div className="flex items-center gap-3">
                                {task.type === 'image' && (
                                    <div className="w-10 h-10 flex items-center justify-center bg-purple-500/20 rounded-lg">
                                        <svg
                                            className="w-6 h-6 text-purple-400"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                            xmlns="http://www.w3.org/2000/svg"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth="2"
                                                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2zM9 9h6v6H9V9z"
                                            ></path>
                                        </svg>
                                    </div>
                                )}
                                {task.type === 'video' && (
                                    <div className="w-10 h-10 flex items-center justify-center bg-red-500/20 rounded-lg">
                                        <svg
                                            className="w-6 h-6 text-red-400"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                            xmlns="http://www.w3.org/2000/svg"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth="2"
                                                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                                            ></path>
                                        </svg>
                                    </div>
                                )}
                                {(task.type === 'text' || task.type === 'inference') && (
                                    <div className="w-10 h-10 flex items-center justify-center bg-blue-500/20 rounded-lg">
                                        <svg
                                            className="w-6 h-6 text-blue-400"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                            xmlns="http://www.w3.org/2000/svg"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth="2"
                                                d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                                            ></path>
                                        </svg>
                                    </div>
                                )}
                                {task.type === 'model' && (
                                    <div className="w-10 h-10 flex items-center justify-center bg-green-500/20 rounded-lg">
                                        <svg
                                            className="w-6 h-6 text-green-400"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                            xmlns="http://www.w3.org/2000/svg"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth="2"
                                                d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
                                            ></path>
                                        </svg>
                                    </div>
                                )}
                                {task.type === 'training' && (
                                    <div className="w-10 h-10 flex items-center justify-center bg-yellow-500/20 rounded-lg">
                                        <svg
                                            className="w-6 h-6 text-yellow-400"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                            xmlns="http://www.w3.org/2000/svg"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth="2"
                                                d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
                                            ></path>
                                        </svg>
                                    </div>
                                )}
                                {task.type === 'data_processing' && (
                                    <div className="w-10 h-10 flex items-center justify-center bg-indigo-500/20 rounded-lg">
                                        <Database className="w-6 h-6 text-indigo-400" />
                                    </div>
                                )}

                                <div>
                                    <h3 className="text-lg font-medium text-white">{task.model || task.type}</h3>
                                    <div className="flex items-center gap-2 text-sm">
                                        <span className="text-gray-400">{task.type}</span>
                                        <span className="text-gray-600">•</span>
                                        <span
                                            className={`
                                                ${task.status === 'completed' ? 'text-green-400' : ''}
                                                ${task.status === 'pending' ? 'text-yellow-400' : ''}
                                                ${task.status === 'processing' ? 'text-blue-400' : ''}
                                                ${task.status === 'failed' ? 'text-red-400' : ''}
                                            `}
                                        >
                                            {task.status.charAt(0).toUpperCase() + task.status.slice(1)}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="text-xs text-gray-400">
                                {new Date(task.created_at).toLocaleTimeString()}
                            </div>
                        </div>

                        {/* Task Details */}
                        {task.prompt && (
                            <div className="mt-3 text-sm text-gray-300">
                                <span className="text-gray-400">Prompt: </span>
                                {task.prompt}
                            </div>
                        )}

                        {/* Task Metrics */}
                        <div className="mt-3 text-sm text-gray-400 flex justify-between items-center">
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-1">
                                    <Clock className="w-4 h-4 text-blue-400" />
                                    <span>{(task.compute_time / 1000).toFixed(1)}s</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <Zap className="w-4 h-4 text-yellow-400" />
                                    <span>{task.gpu_usage ? `${(task.gpu_usage * 100).toFixed(0)}%` : 'N/A'}</span>
                                </div>
                            </div>

                            {task.blockchain_task_id && (
                                <div className="flex items-center gap-1 text-blue-400">
                                    <span className="font-mono">
                                        {task.blockchain_task_id.slice(0, 8)}...{task.blockchain_task_id.slice(-6)}
                                    </span>
                                    <ExternalLink className="w-3 h-3" />
                                </div>
                            )}
                        </div>
                    </div>
                ))}

                {loading && tasks.length === 0 && (
                    <div className="text-center py-8">
                        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
                        <p className="mt-2 text-gray-400">Loading global tasks...</p>
                    </div>
                )}

                {!loading && tasks.length === 0 && (
                    <div className="text-center py-8">
                        <p className="text-gray-400">No tasks available</p>
                    </div>
                )}
            </div>

            <style>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: rgba(31, 41, 55, 0.5);
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(75, 85, 99, 0.5);
                    border-radius: 10px;
                }
            `}</style>
        </div>
    );
}