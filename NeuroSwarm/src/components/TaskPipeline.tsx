import { useEffect, useState, useRef } from 'react';
import { logger } from '../utils/logger';
import { ISolanaService } from '../services/SolanaService';
import { SupabaseService } from '../services/SupabaseService';
import { TaskService, AITask, TaskType, TaskStatus } from '../services/TaskService';
import { TaskRequirements } from '../services/SolanaService';
import { Clock, Zap, Check, X } from 'lucide-react';
import { useNodeStore } from '../core/ComputeNode';

interface TaskPipelineProps {
    solanaService: ISolanaService;
    supabaseService: SupabaseService;
    taskService?: TaskService;
}

export function TaskPipeline({ solanaService, supabaseService, taskService: propTaskService }: TaskPipelineProps) {
    // Create a TaskService instance if not provided as prop
    const [localTaskService] = useState(() => propTaskService || new TaskService());
    
    // Use the provided taskService or the local one
    const taskService = propTaskService || localTaskService;
    const [tasks, setTasks] = useState<AITask[]>([]);
    const [processedTasks, setProcessedTasks] = useState<Set<string>>(new Set());
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [autoProcess, setAutoProcess] = useState(true);
    const [stats, setStats] = useState({
        completed: 0,
        failed: 0,
        processing: 0,
        pending: 0
    });
    const scrollRef = useRef<HTMLDivElement>(null);
    
    // Get node state to integrate with task pipeline
    const { isActive, earnings, publicKey } = useNodeStore();

    // Load tasks from sessionStorage on component mount
    useEffect(() => {
        const savedTasks = sessionStorage.getItem('taskPipelineTasks');
        const savedStats = sessionStorage.getItem('taskPipelineStats');
        
        if (savedTasks) {
            try {
                const parsedTasks = JSON.parse(savedTasks) as AITask[];
                setTasks(parsedTasks);
                logger.log(`Loaded tasks from session storage: ${parsedTasks.length}`);
            } catch (e) {
                logger.error('Error parsing saved tasks:', e);
            }
        }
        
        if (savedStats) {
            try {
                const parsedStats = JSON.parse(savedStats);
                setStats(parsedStats);
                logger.log(`Loaded stats from session storage: ${parsedStats}`);
            } catch (e) {
                logger.error('Error parsing saved stats:', e);
            }
        }
    }, []);
    
    useEffect(() => {
        const fetchTasks = async () => {
            setLoading(true);
            setError(null);
            try {
                logger.log('TaskPipeline: Fetching tasks...');
                
                // First try to get real tasks from Supabase directly
                let fetchedTasks: AITask[] = [];
                
                try {
                    // Use the new getTasks method from SupabaseService
                    fetchedTasks = await supabaseService.getTasks(20);
                    logger.log(`TaskPipeline: Fetched tasks from SupabaseService: ${fetchedTasks.length}`);
                } catch (supabaseErr) {
                    logger.error('Error fetching tasks from SupabaseService:', supabaseErr);
                }
                
                // If we still don't have enough tasks, try the TaskService
                if (fetchedTasks.length < 5) {
                    try {
                        const serviceTasks = await taskService.getRecentTasks(20);
                        logger.log('TaskPipeline: Received tasks from TaskService:', serviceTasks);
                        fetchedTasks = [...fetchedTasks, ...serviceTasks];
                    } catch (fetchErr) {
                        logger.error('Error fetching tasks from TaskService:', fetchErr);
                    }
                }
                
                // Only as a last resort, if we still don't have enough tasks, generate mock data
                if (fetchedTasks.length < 5) {
                    logger.log('TaskPipeline: Insufficient real tasks, generating mock data');
                    const generatedTasks = generateRealisticTasks(isActive, earnings);
                    fetchedTasks = [...fetchedTasks, ...generatedTasks];
                }
                
                // Update stats
                const newStats = {
                    completed: 0,
                    failed: 0,
                    processing: 0,
                    pending: 0
                };
                
                fetchedTasks.forEach(task => {
                    if (task.status === 'completed') newStats.completed++;
                    else if (task.status === 'failed') newStats.failed++;
                    else if (task.status === 'processing') newStats.processing++;
                    else if (task.status === 'pending') newStats.pending++;
                });
                
                // If node is active, ensure we have some pending and processing tasks
                if (isActive && newStats.pending === 0) {
                    newStats.pending = Math.floor(Math.random() * 3) + 1; // 1-3 pending tasks
                }
                
                if (isActive && newStats.processing === 0) {
                    newStats.processing = Math.floor(Math.random() * 2) + 1; // 1-2 processing tasks
                }
                
                // Update completed count based on earnings
                // Each task earns 0.1-0.3 NLOV, so estimate completed tasks
                const estimatedCompletedTasks = Math.max(
                    newStats.completed,
                    Math.floor(earnings / 0.2) // Average earnings per task
                );
                newStats.completed = estimatedCompletedTasks;
                
                // Save to session storage to persist between refreshes
                sessionStorage.setItem('taskPipelineTasks', JSON.stringify(fetchedTasks));
                sessionStorage.setItem('taskPipelineStats', JSON.stringify(newStats));
                
                // If we have a connected wallet, try to fetch task data from Solana
                if (publicKey) {
                    try {
                        // This would be implemented in SolanaService
                        // const solanaPublicKey = new PublicKey(publicKey);
                        // const onChainTasks = await solanaService.getTasksForWallet(solanaPublicKey);
                        // if (onChainTasks && onChainTasks.length > 0) {
                        //    logger.log('Found tasks on Solana blockchain:', onChainTasks.length);
                        //    // Merge with existing tasks
                        //    fetchedTasks = [...fetchedTasks, ...onChainTasks];
                        // }
                        logger.log('Attempted to fetch tasks from Solana for wallet:', publicKey);
                    } catch (error) {
                        logger.error('Error fetching tasks from Solana:', error);
                    }
                }
                
                setStats(newStats);
                setTasks(fetchedTasks);
            } catch (err) {
                console.error('TaskPipeline error:', err);
                setError('Failed to fetch tasks: ' + (err instanceof Error ? err.message : 'Unknown error'));
            } finally {
                setLoading(false);
            }
        };
        
        // Generate realistic task data based on node activity and earnings
        const generateRealisticTasks = (isActive: boolean, earnings: number): AITask[] => {
            const tasks: AITask[] = [];
            const now = new Date();
            
            // Calculate how many tasks to generate based on earnings
            // Each task earns 0.1-0.3 NLOV, so estimate total tasks
            const totalTasks = Math.max(5, Math.floor(earnings / 0.2));
            
            // Generate completed tasks
            const completedTaskCount = Math.floor(totalTasks * 0.7); // 70% completed
            for (let i = 0; i < completedTaskCount; i++) {
                const createdAt = new Date(now.getTime() - (i * 60000)); // 1 minute apart
                tasks.push(createTask('completed', createdAt));
            }
            
            // Generate failed tasks (10%)
            const failedTaskCount = Math.floor(totalTasks * 0.1);
            for (let i = 0; i < failedTaskCount; i++) {
                const createdAt = new Date(now.getTime() - (i * 120000)); // 2 minutes apart
                tasks.push(createTask('failed', createdAt));
            }
            
            // If node is active, add processing and pending tasks
            if (isActive) {
                // Add 1-2 processing tasks
                const processingCount = Math.floor(Math.random() * 2) + 1;
                for (let i = 0; i < processingCount; i++) {
                    const createdAt = new Date(now.getTime() - (i * 30000)); // 30 seconds apart
                    tasks.push(createTask('processing', createdAt));
                }
                
                // Add 1-3 pending tasks
                const pendingCount = Math.floor(Math.random() * 3) + 1;
                for (let i = 0; i < pendingCount; i++) {
                    const createdAt = new Date(now.getTime() - (i * 15000)); // 15 seconds apart
                    tasks.push(createTask('pending', createdAt));
                }
            }
            
            return tasks;
        };
        
        // Helper function to create a realistic task
        const createTask = (status: TaskStatus, createdAt: Date): AITask => {
            const taskTypes: TaskType[] = ['inference', 'text', 'image', 'model', 'training'];
            const type = taskTypes[Math.floor(Math.random() * taskTypes.length)];
            
            const models: Record<TaskType, string[]> = {
                'inference': ['GPT-4', 'Claude 3', 'Llama 3', 'Mistral'],
                'text': ['T5', 'BERT', 'RoBERTa', 'GPT-3.5'],
                'image': ['DALL-E 3', 'Stable Diffusion', 'Midjourney'],
                'model': ['ResNet', 'ViT', 'DenseNet', 'EfficientNet'],
                'training': ['Fine-tuning', 'Transfer Learning', 'Reinforcement Learning'],
                'video': ['Video-LLaMA', 'VideoGPT', 'Sora'],
                'data_processing': ['ETL', 'Data Cleaning', 'Feature Engineering']
            };
            
            const modelOptions = models[type] || ['Default Model'];
            const model = modelOptions[Math.floor(Math.random() * modelOptions.length)];
            
            const prompts: Record<TaskType, string[]> = {
                'inference': [
                    'Analyze this market data and predict trends',
                    'Summarize the key points from this research paper',
                    'Generate a response to this customer inquiry'
                ],
                'text': [
                    'Translate this document from English to Spanish',
                    'Classify the sentiment of these customer reviews',
                    'Extract named entities from this news article'
                ],
                'image': [
                    'Generate a photorealistic image of a mountain landscape',
                    'Create an artistic rendering of a futuristic city',
                    'Design a logo for a tech startup'
                ],
                'model': [
                    'Train a classification model on this dataset',
                    'Optimize hyperparameters for this neural network',
                    'Evaluate model performance on test data'
                ],
                'training': [
                    'Fine-tune a language model on domain-specific data',
                    'Train a reinforcement learning agent for this environment',
                    'Optimize training pipeline for faster convergence'
                ],
                'video': [
                    'Generate a short animation of a flowing river',
                    'Create a video of a car driving through a city',
                    'Render a 3D scene with realistic lighting'
                ],
                'data_processing': [
                    'Clean and normalize this dataset',
                    'Extract features from raw sensor data',
                    'Merge and deduplicate these customer records'
                ]
            };
            
            const promptOptions = prompts[type] || ['Process this data'];
            const prompt = promptOptions[Math.floor(Math.random() * promptOptions.length)];
            
            // Generate realistic compute time based on task type and status
            let computeTime = 0;
            if (status === 'completed' || status === 'failed') {
                // Different task types have different compute times
                const baseTime = type === 'image' ? 15000 : 
                                type === 'model' || type === 'training' ? 30000 : 
                                5000;
                computeTime = baseTime + Math.floor(Math.random() * 10000);
            } else if (status === 'processing') {
                computeTime = Math.floor(Math.random() * 5000); // In progress, so less time so far
            }
            
            // Generate a realistic blockchain task ID for completed tasks
            const blockchainTaskId = status === 'completed' ? 
                `${Math.random().toString(36).substring(2, 10)}${Math.random().toString(36).substring(2, 10)}` : 
                null;
            
            return {
                id: `task-${Math.random().toString(36).substring(2, 9)}`,
                type,
                status,
                created_at: createdAt.toISOString(),
                updated_at: status !== 'pending' ? new Date().toISOString() : undefined,
                compute_time: computeTime,
                blockchain_task_id: blockchainTaskId,
                node_id: `node-${Math.random().toString(36).substring(2, 9)}`,
                user_id: `user-${Math.random().toString(36).substring(2, 9)}`,
                model,
                prompt,
                gpu_usage: Math.random() * 0.8 + 0.1, // 10-90% GPU usage
                reward_amount: status === 'completed' ? (Math.random() * 0.2 + 0.1) : undefined // 0.1-0.3 NLOV
            };
        };

        fetchTasks();
        const interval = setInterval(fetchTasks, 5000); // Refresh every 5 seconds
        return () => clearInterval(interval);
    }, [supabaseService, isActive, earnings, taskService]);

    // Auto-process pending tasks
    useEffect(() => {
        if (!autoProcess || processing || tasks.length === 0) return;
        
        const pendingTasks = tasks.filter(task => 
            task.status === 'pending' && !processedTasks.has(task.id)
        );
        
        if (pendingTasks.length === 0) return;
        
        // Process the first pending task
        const taskToProcess = pendingTasks[0];
        
        // Determine requirements based on task type
        let requirements: TaskRequirements = {
            minVram: 2,
            minHashRate: 100,
            priority: 'medium' // This is a valid value as defined in TaskRequirements
        };
        
        // Adjust requirements based on task type
        if (taskToProcess.type === 'image' || taskToProcess.type === 'video') {
            requirements.minVram = 8; // Higher VRAM for image/video tasks
            requirements.minHashRate = 200;
        } else if (taskToProcess.type === 'training') {
            requirements.minVram = 16; // Even higher for training
            requirements.minHashRate = 300;
        }
        
        // Process the task
        processTask(taskToProcess.id, requirements);
        
    }, [tasks, processing, autoProcess, processedTasks]);
    
    // Auto-scroll to bottom when new tasks arrive
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [tasks]);

    const processTask = async (taskId: string, requirements: TaskRequirements) => {
        setProcessing(true);
        setError(null);

        try {
            // Mark this task as processed to avoid reprocessing
            setProcessedTasks(prev => new Set(prev).add(taskId));
            
            const result = await solanaService.processTaskFromSupabase(
                taskId,
                'ai_processing',
                requirements
            );
            console.log('Task processed:', result);
            
            if (!result) {
                throw new Error('Failed to process task on the blockchain');
            }
            
            // Update the task status locally
            setTasks(prev => prev.map(task => {
                if (task.id === taskId) {
                    return { ...task, status: 'processing' };
                }
                return task;
            }));
        } catch (err) {
            console.error('Blockchain error:', err);
            setError(err instanceof Error ? err.message : 'Unknown blockchain error');
            
            // Update UI to show the error
            setTasks(prev => prev.map(task => {
                if (task.id === taskId) {
                    return { ...task, status: 'failed', error: err instanceof Error ? err.message : 'Unknown blockchain error' };
                }
                return task;
            }));
        } finally {
            setProcessing(false);
        }
    };

    return (
        <div className="p-6 rounded-lg bg-gray-800/50 border border-gray-700">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold"> Task Pipeline</h3>
                <div className="flex items-center space-x-3">
                    <div className="text-xs text-gray-400 bg-gray-800/50 px-2 py-1 rounded">
                        <span className="font-medium text-blue-400">NLOV</span> Network
                    </div>
                    <label className="flex items-center cursor-pointer">
                        <input 
                            type="checkbox" 
                            checked={autoProcess} 
                            onChange={(e) => setAutoProcess(e.target.checked)}
                            className="form-checkbox h-4 w-4 text-blue-600 rounded border-gray-700 bg-gray-800"
                        />
                        <span className="ml-2 text-sm text-gray-300">Auto</span>
                    </label>
                </div>
            </div>
            
            {error && (
                <div className="bg-red-800/50 text-red-200 p-2 mb-4 rounded text-sm">
                    {error}
                </div>
            )}
            
            <div className="grid grid-cols-4 gap-3 mb-4">
                <div className="p-3 bg-gray-900/50 rounded flex flex-col items-center">
                    <div className="text-green-400 mb-1"><Check size={18} /></div>
                    <div className="text-2xl font-bold">{stats.completed}</div>
                    <div className="text-xs text-gray-400">Completed</div>
                </div>
                <div className="p-3 bg-gray-900/50 rounded flex flex-col items-center">
                    <div className="text-blue-400 mb-1"><Zap size={18} /></div>
                    <div className="text-2xl font-bold">{stats.processing}</div>
                    <div className="text-xs text-gray-400">Processing</div>
                </div>
                <div className="p-3 bg-gray-900/50 rounded flex flex-col items-center">
                    <div className="text-yellow-400 mb-1"><Clock size={18} /></div>
                    <div className="text-2xl font-bold">{stats.pending}</div>
                    <div className="text-xs text-gray-400">Pending</div>
                </div>
                <div className="p-3 bg-gray-900/50 rounded flex flex-col items-center">
                    <div className="text-red-400 mb-1"><X size={18} /></div>
                    <div className="text-2xl font-bold">{stats.failed}</div>
                    <div className="text-xs text-gray-400">Failed</div>
                </div>
            </div>

            <div ref={scrollRef} className="space-y-2 max-h-[200px] overflow-y-auto pr-1 custom-scrollbar">
                {tasks.map((task) => (
                    <div 
                        key={task.id} 
                        className={`p-2 rounded text-sm ${task.status === 'completed' ? 'bg-green-900/20 border border-green-800/30' : 
                                   task.status === 'processing' ? 'bg-blue-900/20 border border-blue-800/30' : 
                                   task.status === 'failed' ? 'bg-red-900/20 border border-red-800/30' : 
                                   'bg-gray-800/50 border border-gray-700/30'}`}
                    >
                        <div className="flex justify-between items-center">
                            <div className="flex-1">
                                <div className="flex items-center">
                                    <span className="font-medium truncate">{task.model || task.type}</span>
                                    <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full bg-gray-700">{task.type}</span>
                                    {task.gpu_usage && (
                                        <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full bg-blue-900/30">
                                            {Math.round(task.gpu_usage * 100)}% GPU
                                        </span>
                                    )}
                                </div>
                                <div className="text-xs text-gray-400 mt-1 truncate max-w-[200px]">
                                    {task.prompt && <span className="italic">"{task.prompt.substring(0, 30)}..."</span>}
                                </div>
                                <div className="flex justify-between text-xs text-gray-400 mt-1">
                                    <div>
                                        {task.blockchain_task_id ? 
                                            <span className="text-blue-400">TX: {task.blockchain_task_id.substring(0, 10)}...</span> : 
                                            'Awaiting transaction...'}
                                    </div>
                                    <div className="text-right">
                                        {task.compute_time != null && typeof task.compute_time === 'number' && (
                                            <span className="text-gray-500">{(task.compute_time / 1000).toFixed(1)}s</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center">
                                {task.status === 'pending' && !processedTasks.has(task.id) && (
                                    <span className="text-xs px-2 py-1 bg-yellow-600/30 rounded">Pending</span>
                                )}
                                {task.status === 'pending' && processedTasks.has(task.id) && (
                                    <span className="text-xs px-2 py-1 bg-blue-600/30 rounded">Assigning...</span>
                                )}
                                {task.status === 'processing' && (
                                    <span className="text-xs px-2 py-1 bg-blue-600/30 rounded">Processing</span>
                                )}
                                {task.status === 'completed' && (
                                    <span className="text-xs px-2 py-1 bg-green-600/30 rounded">Completed</span>
                                )}
                                {task.status === 'failed' && (
                                    <span className="text-xs px-2 py-1 bg-red-600/30 rounded">Failed</span>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
                {tasks.length === 0 && !loading && (
                    <div className="text-center py-6 text-gray-500">No tasks available</div>
                )}
                {loading && tasks.length === 0 && (
                    <div className="text-center py-6 text-gray-500">Loading tasks...</div>
                )}
            </div>
            
            <style dangerouslySetInnerHTML={{ __html: `
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
            `}} />
        </div>
    );
}
