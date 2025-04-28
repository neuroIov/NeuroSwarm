import { useEffect, useState, useRef, useCallback } from 'react';
import { AITask, TaskType, TaskStatus } from '../services/SupabaseService';
import { useNetworkStore } from '../core/ComputeNetwork';
import { Activity, Zap, Clock, ExternalLink } from 'lucide-react';
import { useWallet } from '@solana/wallet-adapter-react';
import { submitTaskTransaction } from '../services/SolanaService';

// Extended TaskType to include 'all' option for filtering
type ExtendedTaskType = TaskType | 'all';

interface AITasksPanelProps {
    supabaseService: any;
}

interface BlockchainDetails {
    txHash: string;
    blockHeight: number;
    confirmations: number;
    gasUsed: number;
    fee: number;
}

// Helper function to convert task data to the format we need with real blockchain data
const createTaskWithBlockchain = async (task: AITask, solanaService?: any): Promise<AITask & { blockchain: BlockchainDetails }> => {
    // Default blockchain details
    let blockchain: BlockchainDetails = {
        txHash: task.blockchain_task_id || 'pending',
        blockHeight: 0,
        confirmations: 0,
        gasUsed: 0,
        fee: 0
    };
    
    // If we have a transaction ID and Solana service, fetch real blockchain data
    if (task.blockchain_task_id && solanaService) {
        try {
            // Fetch transaction details from Solana
            const txDetails = await solanaService.getTransactionDetails(task.blockchain_task_id);
            
            if (txDetails) {
                blockchain = {
                    txHash: task.blockchain_task_id,
                    blockHeight: txDetails.slot || 0,
                    confirmations: txDetails.confirmations || 0,
                    gasUsed: txDetails.computeUnits || 0,
                    fee: txDetails.fee ? txDetails.fee / 1e9 : 0 // Convert lamports to SOL
                };
            }
        } catch (error) {
            console.error('Error fetching transaction details:', error);
            // Keep using default values if fetch fails
        }
    }
    
    return {
        ...task,
        blockchain
    };
};

export function AITasksPanel({ supabaseService }: AITasksPanelProps) {
    const [tasks, setTasks] = useState<(AITask & { blockchain: BlockchainDetails })[]>([]);
    const [selectedType, setSelectedType] = useState<ExtendedTaskType>('all');
    const [loading, setLoading] = useState(false);
    const [stats, setStats] = useState({ total_tasks: 0, avg_compute_time: 0, success_rate: 0 });
    const observer = useRef<IntersectionObserver | null>(null);
    const updateNetworkStats = useNetworkStore(state => state.updateStats);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [solanaService, setSolanaService] = useState<any>(null);
    const { publicKey, signTransaction } = useWallet();

    // Get Solana service from the global context
    useEffect(() => {
        // Try to get the solana service from the global context
        const globalAny = window as any;
        if (globalAny.solanaService) {
            setSolanaService(globalAny.solanaService);
        }
    }, []);

    // Load real data from Supabase
    useEffect(() => {
        const loadTasks = async () => {
            setLoading(true);
            try {
                let fetchedTasks: AITask[] = [];
                
                if (selectedType === 'all') {
                    fetchedTasks = await supabaseService.getRecentTasks(20);
                } else {
                    fetchedTasks = await supabaseService.getTasksByType(selectedType, 20);
                }
                
                // Get task statistics
                const taskStats = await supabaseService.getTaskStats();
                setStats(taskStats);
                
                // Convert tasks to the format we need with real blockchain data
                const taskPromises = fetchedTasks.map(task => createTaskWithBlockchain(task, solanaService));
                const formattedTasks = await Promise.all(taskPromises);
                
                setTasks(formattedTasks);
                updateNetworkStats({
                    networkLoad: Math.min(fetchedTasks.length * 5, 100),
                    networkEfficiency: taskStats.success_rate
                });
                setLoading(false);
            } catch (error) {
                console.error('Error loading tasks:', error);
                setLoading(false);
            }
        };
        
        loadTasks();
        
        // Set up a timer to periodically refresh tasks if autoRefresh is enabled
        let refreshInterval: NodeJS.Timeout | null = null;
        
        if (autoRefresh) {
            // Refresh tasks every 30 seconds to get the latest data from the blockchain
            refreshInterval = setInterval(async () => {
                try {
                    // Fetch the latest tasks from the blockchain
                    let fetchedTasks: AITask[] = [];
                    
                    if (selectedType === 'all') {
                        fetchedTasks = await supabaseService.getRecentTasks(20);
                    } else {
                        fetchedTasks = await supabaseService.getTasksByType(selectedType, 20);
                    }
                    
                    // Convert tasks to the format we need with real blockchain data
                    const taskPromises = fetchedTasks.map(task => createTaskWithBlockchain(task, solanaService));
                    const formattedTasks = await Promise.all(taskPromises);
                    
                    // Update the tasks state
                    setTasks(formattedTasks);
                    
                    // Get updated task statistics
                    const taskStats = await supabaseService.getTaskStats();
                    setStats(taskStats);
                    
                    // Update network stats
                    updateNetworkStats({
                        networkLoad: Math.min(fetchedTasks.length * 5, 100),
                        networkEfficiency: taskStats.success_rate
                    });
                } catch (error) {
                    console.error('Error refreshing tasks:', error);
                }
            }, 30000); // 30 seconds interval
        }
        
        // Subscribe to real-time task updates
        const unsubscribe = supabaseService.subscribeToTasks((updatedTask: AITask) => {
            // Only update if the task matches our filter or if 'all' is selected
            if (selectedType === 'all' || updatedTask.type === selectedType) {
                const formattedTask = createTaskWithBlockchain(updatedTask);
                
                setTasks(prevTasks => {
                    // Check if the task already exists in our list
                    const taskIndex = prevTasks.findIndex(t => t.id === updatedTask.id);
                    
                    if (taskIndex >= 0) {
                        // Update the existing task
                        const newTasks = [...prevTasks];
                        newTasks[taskIndex] = formattedTask;
                        return newTasks;
                    } else {
                        // Add the new task to the beginning
                        return [formattedTask, ...prevTasks.slice(0, 19)];
                    }
                });
            }
        });
        
        return () => {
            // Clean up
            if (refreshInterval) clearInterval(refreshInterval);
            unsubscribe();
        };
    }, [selectedType, supabaseService, updateNetworkStats, autoRefresh]);

    const handleTaskSubmit = async (prompt: string) => {
        try {
            const { data: task, error } = await supabase
              .from('tasks')
              .insert([{ 
                prompt, 
                status: 'pending',
                created_at: new Date().toISOString() 
              }])
              .single();

            const txSignature = await submitTaskTransaction(
              { ...task, id: task.id },
              { publicKey, signTransaction }
            );

            await supabase
              .from('tasks')
              .update({ 
                tx_hash: txSignature,
                status: 'processed' 
              })
              .eq('id', task.id);

            setTasks(prev => [
              { ...task, tx_hash: txSignature, status: 'processed' },
              ...prev
            ]);

        } catch (error) {
            console.error('Processing error:', error);
        }
    };

    // Infinite scroll handler
    const lastTaskElementRef = useCallback((node: HTMLDivElement | null) => {
        if (loading) return;
        if (observer.current) observer.current.disconnect();
        
        observer.current = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting && !loading) {
                // Load more tasks when scrolling to the bottom
                const loadMoreTasks = async () => {
                    if (loading) return;
                    setLoading(true);
                    
                    try {
                        // Get the current number of tasks to calculate offset
                        const offset = tasks.length;
                        
                        // Fetch more tasks from the blockchain
                        let fetchedTasks: AITask[] = [];
                        
                        if (selectedType === 'all') {
                            fetchedTasks = await supabaseService.getRecentTasks(5, offset);
                        } else {
                            fetchedTasks = await supabaseService.getTasksByType(selectedType, 5, offset);
                        }
                        
                        // Convert tasks to the format we need with real blockchain data
                        const taskPromises = fetchedTasks.map(task => createTaskWithBlockchain(task, solanaService));
                        const formattedTasks = await Promise.all(taskPromises);
                        
                        // Add the new tasks to the existing ones
                        setTasks(prevTasks => [...prevTasks, ...formattedTasks]);
                        setLoading(false);
                    } catch (error) {
                        console.error('Error loading more tasks:', error);
                        setLoading(false);
                    }
                };
                
                loadMoreTasks();
            }
        });

        if (node) observer.current.observe(node);
    }, [loading, selectedType, supabaseService, tasks.length]);

    // Filter tasks by type
    const filteredTasks = tasks.filter(task => 
        selectedType === 'all' || task.type === selectedType
    );

    return (
        <div className="w-full p-6 rounded-lg bg-gray-800/50 border border-gray-700">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold text-white">AI Tasks Panel</h2>
                <div className="flex gap-2">
                    <button 
                        onClick={() => setSelectedType('all')}
                        className={`px-3 py-1 rounded-md text-sm ${selectedType === 'all' ? 'bg-blue-600' : 'bg-gray-700'}`}
                    >
                        All
                    </button>
                    <button 
                        onClick={() => setSelectedType('inference' as ExtendedTaskType)}
                        className={`px-3 py-1 rounded-md text-sm ${selectedType === 'inference' ? 'bg-blue-600' : 'bg-gray-700'}`}
                    >
                        Inference
                    </button>
                    <button 
                        onClick={() => setSelectedType('training' as ExtendedTaskType)}
                        className={`px-3 py-1 rounded-md text-sm ${selectedType === 'training' ? 'bg-blue-600' : 'bg-gray-700'}`}
                    >
                        Training
                    </button>
                    <button 
                        onClick={() => setSelectedType('data_processing' as ExtendedTaskType)}
                        className={`px-3 py-1 rounded-md text-sm ${selectedType === 'data_processing' ? 'bg-blue-600' : 'bg-gray-700'}`}
                    >
                        Data Processing
                    </button>
                    <button 
                        onClick={() => setAutoRefresh(!autoRefresh)}
                        className={`px-3 py-1 rounded-md text-sm ${autoRefresh ? 'bg-green-600' : 'bg-gray-700'}`}
                        title={autoRefresh ? "Auto-refresh enabled" : "Auto-refresh disabled"}
                    >
                        {autoRefresh ? "Live" : "Paused"}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="p-4 rounded-md bg-gray-900/50 border border-gray-700/50">
                    <div className="flex items-center gap-2 mb-2 text-yellow-500">
                        <Activity className="w-4 h-4" />
                        <span className="text-gray-300">Total Tasks</span>
                    </div>
                    <div className="text-2xl font-bold text-white">{stats.total_tasks}</div>
                </div>
                <div className="p-4 rounded-md bg-gray-900/50 border border-gray-700/50">
                    <div className="flex items-center gap-2 mb-2 text-blue-500">
                        <Clock className="w-4 h-4" />
                        <span className="text-gray-300">Avg Time</span>
                    </div>
                    <div className="text-2xl font-bold text-white">{stats.avg_compute_time.toFixed(2)}s</div>
                </div>
                <div className="p-4 rounded-md bg-gray-900/50 border border-gray-700/50">
                    <div className="flex items-center gap-2 mb-2 text-green-500">
                        <Zap className="w-4 h-4" />
                        <span className="text-gray-300">Success Rate</span>
                    </div>
                    <div className="text-2xl font-bold text-white">{stats.success_rate.toFixed(1)}%</div>
                </div>
            </div>

            <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-gray-900/50">
                {filteredTasks.map((task, index) => (
                    <div 
                        key={task.id} 
                        ref={index === filteredTasks.length - 1 ? lastTaskElementRef : null}
                        className="p-4 rounded-md bg-gray-900/50 border border-gray-700/50 transition-all hover:bg-gray-800/50"
                    >
                        <div className="flex justify-between items-start mb-2">
                            <h3 className="font-medium text-white">{task.prompt}</h3>
                            <span className={`px-2 py-1 rounded text-sm ${
                                task.status === 'completed' ? 'bg-green-900/50 text-green-400 border border-green-700/50' :
                                task.status === 'processing' ? 'bg-blue-900/50 text-blue-400 border border-blue-700/50' :
                                task.status === 'failed' ? 'bg-red-900/50 text-red-400 border border-red-700/50' :
                                'bg-gray-900/50 text-gray-400 border border-gray-700/50'
                            }`}>
                                {task.status}
                            </span>
                        </div>
                        {task.type === 'image' && task.status === 'completed' && task.result && (
                            <div className="mt-2 rounded-md overflow-hidden border border-gray-700/50">
                                <img 
                                    src={task.result} 
                                    alt={task.prompt}
                                    className="w-full h-48 object-cover"
                                    loading="lazy"
                                />
                            </div>
                        )}
                        {task.type === 'text' && task.status === 'completed' && task.result && (
                            <p className="mt-2 text-gray-400">{task.result}</p>
                        )}
                        
                        {/* Task Metrics */}
                        <div className="mt-2 text-sm text-gray-400 flex justify-between items-center">
                            <div>
                                <span>Compute Time: {(task.compute_time != null ? (task.compute_time / 1000).toFixed(1) : '0.0')}s</span>
                                <span className="mx-2 text-gray-600">•</span>
                                <span>GPU Usage: {(task.gpu_usage != null ? task.gpu_usage.toFixed(1) : '0.0')}%</span>
                            </div>
                            <span className="text-xs text-gray-500">{new Date(task.created_at).toLocaleString()}</span>
                        </div>

                        {/* Blockchain Details */}
                        <div className="mt-3 pt-3 border-t border-gray-700/50">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <div className="text-xs text-gray-400 mb-1">Transaction Hash</div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-mono text-blue-400 truncate">
                                            {task.blockchain.txHash.slice(0, 16)}...{task.blockchain.txHash.slice(-8)}
                                        </span>
                                        <a 
                                            href={`https://solscan.io/tx/${task.blockchain.txHash}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-blue-400 hover:text-blue-300"
                                        >
                                            <ExternalLink className="w-3 h-3" />
                                        </a>
                                    </div>
                                </div>
                                <div>
                                    <div className="text-xs text-gray-400 mb-1">Block Height</div>
                                    <div className="text-sm text-gray-300">{task.blockchain.blockHeight}</div>
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-4 mt-2">
                                <div>
                                    <div className="text-xs text-gray-400 mb-1">Confirmations</div>
                                    <div className="text-sm text-white">{task.blockchain.confirmations}</div>
                                </div>
                                <div>
                                    <div className="text-xs text-gray-400 mb-1">Gas Used</div>
                                    <div className="text-sm text-white">{task.blockchain.gasUsed.toLocaleString()}</div>
                                </div>
                                <div>
                                    <div className="text-xs text-gray-400 mb-1">Fee</div>
                                    <div className="text-sm text-white">{task.blockchain.fee} SOL</div>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
                
                {loading && (
                    <div className="text-center py-4">
                        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
                    </div>
                )}
            </div>
        </div>
    );
}
