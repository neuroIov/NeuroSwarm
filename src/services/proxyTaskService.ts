import { v4 as uuidv4 } from 'uuid';
import { AITask, TaskProcessingResult, TaskType } from './types';
import { logger } from '@/utils/logger';
import { store } from '@/store';
import { calculateProcessingTime } from './config';

// Task types with their SP rewards and completion times (in seconds)
const TASK_TYPES = {
  image: { sp: 10, time: 200 },
  text: { sp: 5, time: 100 },
  three_d: { sp: 15, time: 300 },
  video: { sp: 30, time: 600 }
};

// Timer for tracking device uptime
let uptimeTimer: NodeJS.Timeout | null = null;
let uptimeSeconds = 0;
let lastTaskGenerationTime = 0;

// Task processing state
const taskProcessingState = {
  isProcessing: false,
  currentTaskId: null as string | null,
  processingPromise: null as Promise<TaskProcessingResult> | null,
  lockTime: 0,
  
  acquireLock(taskId: string): boolean {
    if (this.isProcessing && this.currentTaskId !== taskId) {
      const now = Date.now();
      // Force release lock if it's been held for more than 10 minutes
      if (now - this.lockTime > 600000) {
        logger.warn(`Force releasing stale lock on task ${this.currentTaskId}`);
        this.releaseLock();
      } else {
        return false;
      }
    }
    
    this.isProcessing = true;
    this.currentTaskId = taskId;
    this.lockTime = Date.now();
    return true;
  },
  
  releaseLock(): void {
    this.isProcessing = false;
    this.currentTaskId = null;
    this.processingPromise = null;
  }
};

/**
 * Initialize uptime tracking
 */
export const initUptimeTracking = (): void => {
  if (uptimeTimer) {
    clearInterval(uptimeTimer);
  }
  
  uptimeSeconds = 0;
  uptimeTimer = setInterval(() => {
    const state = store.getState();
    if (state.node?.isActive) {
      uptimeSeconds++;
      checkTaskGeneration();
    }
  }, 1000);
};

/**
 * Stop uptime tracking
 */
export const stopUptimeTracking = (): void => {
  if (uptimeTimer) {
    clearInterval(uptimeTimer);
    uptimeTimer = null;
  }
};

/**
 * Get current uptime in seconds
 */
export const getUptime = (): number => {
  return uptimeSeconds;
};

/**
 * Check if we should generate new tasks based on uptime
 */
const checkTaskGeneration = (): void => {
  const now = Date.now();
  
  // Generate tasks every 10 minutes (600 seconds)
  if (uptimeSeconds % 600 === 0 && uptimeSeconds > 0 && now - lastTaskGenerationTime > 590000) {
    lastTaskGenerationTime = now;
    generateTasks();
  }
};

/**
 * Generate random tasks based on hardware tier and uptime
 */
const generateTasks = (): AITask[] => {
  const state = store.getState();
  if (!state.node?.isActive || !state.session?.userProfile?.id) {
    return [];
  }
  
  const userId = state.session.userProfile.id;
  const hardwareTier = state.node.rewardTier || 'cpu';
  const tasks: AITask[] = [];
  
  // Generate a mix of task types
  const taskTypes: TaskType[] = Object.keys(TASK_TYPES) as TaskType[];
  
  // Generate 2-5 tasks depending on hardware tier
  const taskCount = Math.floor(Math.random() * 3) + 2 + 
    (hardwareTier === 'webgpu' ? 1 : 0);
  
  for (let i = 0; i < taskCount; i++) {
    // Select random task type
    const taskTypeIndex = Math.floor(Math.random() * taskTypes.length);
    const taskType = taskTypes[taskTypeIndex];
    
    // Generate task
    const task: AITask = {
      id: uuidv4(),
      type: taskType,
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      compute_time: 0,
      user_id: userId,
      node_id: state.node.nodeId,
      prompt: generateRandomPrompt(taskType),
      model: getRandomModel(taskType)
    };
    
    tasks.push(task);
  }
  
  // Add tasks to store
  if (tasks.length > 0) {
    logger.log(`Generated ${tasks.length} proxy tasks`);
  }
  
  return tasks;
};

/**
 * Process a task locally
 */
export const processTask = async (
  taskId: string, 
  userId: string
): Promise<TaskProcessingResult> => {
  // Prevent processing multiple tasks simultaneously
  if (taskProcessingState.isProcessing) {
    if (taskProcessingState.currentTaskId === taskId) {
      if (taskProcessingState.processingPromise) {
        return taskProcessingState.processingPromise;
      }
    } else {
      logger.warn(`Cannot process task ${taskId} - already processing task ${taskProcessingState.currentTaskId}`);
      return { success: false, message: 'ALREADY_PROCESSING' };
    }
  }
  
  // Try to acquire the processing lock
  if (!taskProcessingState.acquireLock(taskId)) {
    return { success: false, message: 'LOCK_ACQUISITION_FAILED' };
  }
  
  // Create a new processing promise
  taskProcessingState.processingPromise = (async () => {
    let processingTimer: NodeJS.Timeout | null = null;
    
    try {
      // Get task from store
      const state = store.getState();
      const task = state.tasks.assignedTasks.find(t => t.id === taskId);
      
      if (!task) {
        logger.error(`Task ${taskId} not found`);
        return { success: false, message: 'TASK_NOT_FOUND' };
      }
      
      // Check if task is in a valid state
      if (task.status !== 'pending' && task.status !== 'processing') {
        logger.warn(`Task ${taskId} is in invalid state: ${task.status}`);
        return { success: false, message: 'INVALID_TASK_STATE' };
      }
      
      // Get hardware tier from store
      const rewardTier = state.node?.rewardTier || 'cpu';
      
      // Calculate processing time based on task type and hardware tier
      const taskType = task.type as keyof typeof TASK_TYPES;
      const baseTime = TASK_TYPES[taskType]?.time || 100;
      const processingTime = calculateProcessingTime(
        taskType === 'three_d' || taskType === 'video' ? 'image' : taskType as 'image' | 'text', 
        rewardTier as 'webgpu' | 'wasm' | 'webgl' | 'cpu'
      );
      
      logger.log(`Processing ${task.type} task ${taskId} for ${processingTime} seconds (${rewardTier} hardware tier)`);
      
      // Simulate processing with a promise
      await new Promise<void>((resolve) => {
        processingTimer = setTimeout(() => resolve(), processingTime * 1000);
      });
      
      // Generate a simulated result
      const result = generateTaskResult(task.type);
      
      // Calculate resource usage stats
      const gpuUsage = Math.random() * 0.6 + 0.2; // 20-80% GPU usage
      const inputTokens = Math.floor(Math.random() * 200) + 50;
      const outputTokens = Math.floor(Math.random() * 500) + 100;
      
      logger.log(`Successfully completed task ${taskId}`);
      
      return { 
        success: true, 
        result,
        gpuUsage,
        inputTokens,
        outputTokens,
        computeTime: processingTime
      };
    } catch (error) {
      logger.error('Error processing task:', error);
      return { success: false, message: 'PROCESSING_ERROR' };
    } finally {
      // Clean up any timers
      if (processingTimer) {
        clearTimeout(processingTimer);
      }
      
      // Release the processing lock
      taskProcessingState.releaseLock();
    }
  })();
  
  return taskProcessingState.processingPromise;
};

/**
 * Generate random prompt for a task type
 */
const generateRandomPrompt = (taskType: TaskType): string => {
  const prompts = {
    image: [
      'Generate a realistic landscape with mountains and a lake',
      'Create a portrait of a person with blue eyes',
      'Design a futuristic city with flying cars',
      'Draw a cat playing with a ball of yarn'
    ],
    text: [
      'Write a short story about a detective solving a mystery',
      'Create a poem about nature',
      'Write a product description for a new smartphone',
      'Generate a recipe for chocolate chip cookies'
    ],
    three_d: [
      'Create a 3D model of a modern house',
      'Design a 3D character for a video game',
      'Generate a 3D scene with trees and a river',
      'Model a 3D sports car'
    ],
    video: [
      'Generate a short animation of waves on a beach',
      'Create a video of clouds moving across the sky',
      'Design a video intro for a YouTube channel',
      'Generate a short clip of rain falling'
    ]
  };
  
  const availablePrompts = prompts[taskType] || prompts.text;
  return availablePrompts[Math.floor(Math.random() * availablePrompts.length)];
};

/**
 * Get a random model name for a task type
 */
const getRandomModel = (taskType: TaskType): string => {
  const models = {
    image: ['stable-diffusion-xl', 'midjourney-v5', 'dalle-3'],
    text: ['llama-3-8b', 'mistral-7b', 'gpt-neo-2.7b'],
    three_d: ['blender-gen', '3d-diffusion', 'meshy-3d'],
    video: ['stable-video-diffusion', 'sora-lite', 'gen-1']
  };
  
  const availableModels = models[taskType] || models.text;
  return availableModels[Math.floor(Math.random() * availableModels.length)];
};

/**
 * Generate a simulated result for a completed task
 */
const generateTaskResult = (taskType: TaskType): string => {
  switch (taskType) {
    case 'image':
      return 'data:image/jpeg;base64,/9j...'; // Truncated base64 image
    case 'text':
      return 'Generated text content based on the prompt...';
    case 'three_d':
      return 'https://neuroswarm-models.s3.amazonaws.com/model_123.glb';
    case 'video':
      return 'https://neuroswarm-videos.s3.amazonaws.com/video_123.mp4';
    default:
      return 'Task completed successfully';
  }
};

/**
 * Calculate SP rewards based on device uptime and compute category
 */
export const calculateSpRewards = (
  uptimeMinutes: number,
  hardwareTier: 'webgpu' | 'wasm' | 'webgl' | 'cpu'
): number => {
  // Base SP per 10 minutes
  const baseSp = 5;
  
  // Hardware tier multipliers
  const tierMultipliers = {
    webgpu: 2.0,
    wasm: 1.6,
    webgl: 1.3,
    cpu: 1.0
  };
  
  // Calculate SP
  const multiplier = tierMultipliers[hardwareTier];
  return Math.floor(baseSp * multiplier * (uptimeMinutes / 10));
};

/**
 * Record proxy earnings for completed tasks
 */
export const recordProxyEarnings = async (
  userId: string,
  taskType: TaskType,
  hardwareTier: 'webgpu' | 'wasm' | 'webgl' | 'cpu'
): Promise<{ success: boolean }> => {
  try {
    const typeReward = TASK_TYPES[taskType]?.sp || 5;
    const multiplier = hardwareTier === 'webgpu' ? 2 :
                      hardwareTier === 'wasm' ? 1.6 :
                      hardwareTier === 'webgl' ? 1.3 : 1.0;
                      
    const amount = typeReward * multiplier;
    
    logger.log(`Recording proxy earnings of ${amount} SP for ${taskType} task`);
    
    // In a real implementation, this would call an API to record earnings
    // For now, we'll just return success
    return { success: true };
  } catch (error) {
    logger.error('Error recording proxy earnings:', error);
    return { success: false };
  }
};

export default {
  generateTasks,
  processTask,
  initUptimeTracking,
  stopUptimeTracking,
  getUptime,
  calculateSpRewards,
  recordProxyEarnings
}; 