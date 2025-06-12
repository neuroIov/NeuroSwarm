import { getSwarmSupabase } from '@/lib/supabase-client';
import { AITask, TaskStatus, TaskType } from './types';
import { logger } from '../utils/logger';
import { TASK_PROCESSING_CONFIG, calculateProcessingTime } from './config';
import { taskCache } from './taskCacheService';
import { store } from '@/store';

// Helper function to get user ID safely without creating circular dependencies
let getUserIdFn: () => string | null | undefined = () => null;

/**
 * Set the function to retrieve user ID
 * This should be called once from the app initialization after store is created
 */
export const setUserIdProvider = (fn: () => string | null | undefined) => {
    getUserIdFn = fn;
};

/**
 * Get the current user ID safely without directly accessing the store
 */
const getCurrentUserId = (): string | null | undefined => {
    return getUserIdFn();
};

// Define a type for task processing result
interface TaskProcessingResult {
    success: boolean;
    result?: string;
    message?: string;  // Added for error messages and state change notifications
}

// Task processing state with mutex behavior
const taskProcessingState = {
    isProcessing: false,
    currentTaskId: null as string | null,
    processingPromise: null as Promise<TaskProcessingResult> | null,

    // Acquire lock for processing
    async acquireLock(taskId: string): Promise<boolean> {
        if (this.isProcessing) {
            logger.warn(`Cannot acquire lock for task ${taskId} - already processing task ${this.currentTaskId}`);
            return false;
        }

        logger.log(`Acquiring lock for task ${taskId}`);
        this.isProcessing = true;
        this.currentTaskId = taskId;
        return true;
    },

    // Release lock
    releaseLock(): void {
        logger.log(`Releasing lock for task ${this.currentTaskId}`);
        this.isProcessing = false;
        this.currentTaskId = null;
        this.processingPromise = null;
    }
};

/**
 * Get tasks for the current user or guest tasks if no user is logged in
 */
export const getUserTasks = async (limit: number = 50): Promise<AITask[]> => {
    try {
        const client = getSwarmSupabase();
        if (!client) {
            logger.error('Swarm client is not initialized');
            return [];
        }

        // Get user ID from the provider function
        const userId = getCurrentUserId();

        let query = client.from('tasks').select('*');

        if (userId) {
            // If user is logged in, get their tasks
            logger.log(`Fetching tasks for user: ${userId}`);
            query = query.eq('user_id', userId);
        } else {
            // If guest, get tasks with null user_id
            logger.log('Fetching guest tasks (null user_id)');
            query = query.is('user_id', null);
        }

        const { data, error } = await query
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) {
            logger.error('Error fetching user tasks:', error);
            return [];
        }

        const userType = userId ? 'user' : 'guest';
        logger.log(`Fetched ${data?.length || 0} tasks for ${userType}`);

        return data as AITask[] || [];
    } catch (error) {
        logger.error('Error in getUserTasks:', error);
        return [];
    }
};

/**
 * Get queued tasks that haven't been assigned to any user,
 * with proper distribution of task types (40% image, 60% text)
 */
export const getQueuedTasks = async (limit: number = 50): Promise<AITask[]> => {
    try {
        const client = getSwarmSupabase();
        if (!client) {
            logger.error('Swarm client is not initialized');
            return [];
        }

        // Calculate image and text task limits with 40/60 ratio
        const imageTaskLimit = Math.ceil(limit * TASK_PROCESSING_CONFIG.DISTRIBUTION.image); // 40%
        const textTaskLimit = Math.ceil(limit * TASK_PROCESSING_CONFIG.DISTRIBUTION.text);  // 60%

        // Get image tasks
        const { data: imageTasks, error: imageError } = await client
            .from('tasks')
            .select('*')
            .eq('status', 'pending')
            .eq('type', 'image')
            .is('user_id', null)
            .order('created_at', { ascending: true })
            .limit(imageTaskLimit);

        if (imageError) {
            logger.error('Error fetching queued image tasks:', imageError);
            return [];
        }

        // Get text tasks
        const { data: textTasks, error: textError } = await client
            .from('tasks')
            .select('*')
            .eq('status', 'pending')
            .eq('type', 'text')
            .is('user_id', null)
            .order('created_at', { ascending: true })
            .limit(textTaskLimit);

        if (textError) {
            logger.error('Error fetching queued text tasks:', textError);
            return [];
        }

        // Combine tasks
        const combinedTasks = [...(imageTasks || []), ...(textTasks || [])];
        logger.log(`Found ${combinedTasks.length} queued tasks (${imageTasks?.length || 0} image, ${textTasks?.length || 0} text)`);

        return combinedTasks as AITask[] || [];
    } catch (error) {
        logger.error('Error in getQueuedTasks:', error);
        return [];
    }
};

/**
 * Assigns tasks to a specific user with a balanced distribution of task types (40% image, 60% text)
 * With added locking to prevent race conditions
 */
export const assignTasksToUser = async (userId: string, limit: number = 5): Promise<AITask[]> => {
    try {
        const client = getSwarmSupabase();
        if (!client) {
            logger.error('Swarm client is not initialized');
            return [];
        }

        // Calculate the ideal distribution of tasks
        const imageTaskLimit = Math.ceil(limit * TASK_PROCESSING_CONFIG.DISTRIBUTION.image); // 40% image tasks 
        const textTaskLimit = limit - imageTaskLimit;   // remaining for text tasks

        // Find pending tasks that aren't assigned to any user, grouped by type
        const { data: imageTasksData, error: imageError } = await client
            .from('tasks')
            .select('*')
            .eq('status', 'pending')
            .eq('type', 'image')
            .is('user_id', null)
            .order('created_at', { ascending: true })
            .limit(imageTaskLimit);

        if (imageError) {
            logger.error('Error fetching pending image tasks:', imageError);
            return [];
        }

        const { data: textTasksData, error: textError } = await client
            .from('tasks')
            .select('*')
            .eq('status', 'pending')
            .eq('type', 'text')
            .is('user_id', null)
            .order('created_at', { ascending: true })
            .limit(textTaskLimit);

        if (textError) {
            logger.error('Error fetching pending text tasks:', textError);
            return [];
        }

        // Handle null checks
        const imageTasks = imageTasksData || [];
        const textTasks = textTasksData || [];

        // Balance tasks based on availability
        let finalImageLimit = imageTasks.length;
        let finalTextLimit = textTasks.length;

        if (imageTasks.length < imageTaskLimit && textTasks.length > textTaskLimit) {
            // Get more text tasks if we don't have enough image tasks
            finalTextLimit = Math.min(textTasks.length, textTaskLimit + (imageTaskLimit - imageTasks.length));
        } else if (textTasks.length < textTaskLimit && imageTasks.length > imageTaskLimit) {
            // Get more image tasks if we don't have enough text tasks
            finalImageLimit = Math.min(imageTasks.length, imageTaskLimit + (textTaskLimit - textTasks.length));
        }

        // Interleave tasks to create a balanced distribution
        const tasksToAssign: AITask[] = [];
        const maxTasks = Math.max(finalImageLimit, finalTextLimit);

        for (let i = 0; i < maxTasks; i++) {
            // Start with images to maintain ~40% ratio
            if (i < finalImageLimit) {
                tasksToAssign.push(imageTasks[i] as AITask);
            }

            // Then add text tasks
            if (i < finalTextLimit) {
                tasksToAssign.push(textTasks[i] as AITask);
            }

            // Don't exceed the limit
            if (tasksToAssign.length >= limit) {
                break;
            }
        }

        if (tasksToAssign.length === 0) {
            logger.log('No pending tasks available to assign');
            return [];
        }

        // Assign tasks to user using a transaction to prevent race conditions
        const assignedTasks: AITask[] = [];
        const timestamp = new Date().toISOString();
        const taskIds = tasksToAssign.map(task => task.id);

        // Use Supabase's batch update with proper constraints
        // This ensures we only update tasks that are still unassigned
        const { data: updatedTasks, error: updateError } = await client
            .from('tasks')
            .update({
                user_id: userId,
                updated_at: timestamp
            })
            .in('id', taskIds)
            .is('user_id', null) // Only update if still unassigned
            .eq('status', 'pending') // Only update if still pending
            .select();

        if (updateError) {
            logger.error(`Error assigning tasks to user ${userId}:`, updateError);
            return [];
        }

        // Only count tasks that were successfully assigned
        const successfullyAssigned = updatedTasks || [];

        logger.log(`Successfully assigned ${successfullyAssigned.length} of ${tasksToAssign.length} tasks to user ${userId}`);

        // Log success and distribution info
        const assignedImageCount = successfullyAssigned.filter(t => t.type === 'image').length;
        const assignedTextCount = successfullyAssigned.filter(t => t.type === 'text').length;

        if (successfullyAssigned.length > 0) {
            logger.log(`Task distribution: ${assignedImageCount} images (${Math.round(assignedImageCount / successfullyAssigned.length * 100)}%), ${assignedTextCount} text (${Math.round(assignedTextCount / successfullyAssigned.length * 100)}%)`);
        }

        // Return only the tasks that were successfully assigned
        return successfullyAssigned as AITask[];
    } catch (error) {
        logger.error('Error in assignTasksToUser:', error);
        return [];
    }
};

/**
 * Processes a task and updates its status
 * Uses a mutex pattern to ensure only one task is processed at a time
 * and adds resilience against race conditions
 */
export const processTask = async (
    taskId: string,
    userId: string
): Promise<TaskProcessingResult> => {
    // First check if we're already processing this or another task
    if (taskProcessingState.isProcessing) {
        if (taskProcessingState.currentTaskId === taskId) {
            // If this is the same task and we have a processing promise, return it
            if (taskProcessingState.processingPromise) {
                logger.log(`Already processing task ${taskId}, returning existing promise`);
                return taskProcessingState.processingPromise;
            }
        } else {
            // Different task is being processed
            logger.warn(`Cannot process task ${taskId} - already processing task ${taskProcessingState.currentTaskId}`);
            return { success: false, message: 'ALREADY_PROCESSING' };
        }
    }

    // Try to acquire the processing lock
    if (!await taskProcessingState.acquireLock(taskId)) {
        return { success: false, message: 'LOCK_ACQUISITION_FAILED' };
    }

    // Create a new processing promise and store it
    taskProcessingState.processingPromise = (async () => {
        let processingTimer: NodeJS.Timeout | null = null;

        try {
            logger.log(`Starting to process task ${taskId}`);
            const client = getSwarmSupabase();
            if (!client) {
                logger.error('Swarm client is not initialized');
                return { success: false };
            }

            const startTime = Date.now();

            if (!userId) {
                logger.error(`Cannot process task ${taskId}: No user ID available`);
                return { success: false };
            }

            // First, fetch the task by ID to check its current state
            const { data: taskData, error: fetchError } = await client
                .from('tasks')
                .select('*')
                .eq('id', taskId)
                .single();

            if (fetchError || !taskData) {
                logger.error(`Error fetching task ${taskId}:`, fetchError);
                // Remove from cache if it doesn't exist
                taskCache.removeTask(taskId);
                return { success: false };
            }

            const task = taskData as AITask;
            logger.log(`Fetched task ${taskId} - current status: ${task.status}, assigned to: ${task.user_id || 'none'}`);

            // Set this task as the currently processing task in cache
            taskCache.setProcessingTask(task);

            // Check if task is in a state we can process
            if (task.status !== 'pending' && task.status !== 'processing') {
                logger.warn(`Task ${taskId} is not in a valid state for processing (current status: ${task.status})`);
                return { success: false };
            }

            // If task is assigned to someone else, don't process it
            if (task.user_id && task.user_id !== userId) {
                logger.warn(`Task ${taskId} is assigned to user ${task.user_id}, not current user ${userId}`);
                return { success: false };
            }

            // Get current device's reward tier from store
            const state = store.getState();
            const rewardTier = state.node?.rewardTier || 'cpu'; // Default to CPU if not available

            // Process the task with duration based on task type and hardware tier
            const processingTime = calculateProcessingTime(task.type as 'image' | 'text', rewardTier as 'webgpu' | 'wasm' | 'webgl' | 'cpu');

            logger.log(`Processing ${task.type} task ${taskId} for ${processingTime} seconds (${rewardTier} hardware tier)`);

            // Update task to processing state with proper conditions to prevent race conditions
            // This uses a conditional update that only succeeds if our conditions are met
            const { data: updatedTask, error: updateError } = await client
                .from('tasks')
                .update({
                    status: 'processing',
                    user_id: userId,
                    updated_at: new Date().toISOString()
                })
                .match({
                    id: taskId,
                    status: 'pending'  // Only update if status is still pending
                })
                .select()
                .single();

            if (updateError) {
                logger.error(`Error updating task ${taskId} to processing state:`, updateError);
                taskCache.setProcessingTask(null);
                return { success: false };
            }

            // If no updatedTask was returned, the conditional update didn't match
            if (!updatedTask) {
                // Try to fetch the task again to check why the update failed
                const { data: currentTask } = await client
                    .from('tasks')
                    .select('*')
                    .eq('id', taskId)
                    .single();

                if (currentTask) {
                    logger.warn(`Could not update task ${taskId} to processing state. Current status: ${currentTask.status}, assigned to: ${currentTask.user_id || 'none'}`);
                }

                taskCache.setProcessingTask(null);
                return { success: false };
            }

            try {
                // Simulate processing with a promise that can be safely interrupted
                await new Promise<void>((resolve) => {
                    processingTimer = setTimeout(() => resolve(), processingTime * 1000);
                });
            } catch (processingError) {
                logger.error(`Error during task ${taskId} processing:`, processingError);
                throw processingError;
            } finally {
                // Clean up any timers if they exist
                if (processingTimer) {
                    clearTimeout(processingTimer);
                    processingTimer = null;
                }
            }

            // Generate a result based on task type
            let result = '';
            const shortPrompt = task.prompt ?
                `${task.prompt.substring(0, 50)}${task.prompt.length > 50 ? '...' : ''}` :
                'No prompt';

            if (task.type === 'text') {
                result = `Generated text response for prompt: "${shortPrompt}"`;
            } else if (task.type === 'image') {
                result = `https://example.com/generated-image-${taskId}.png`;
            } else {
                result = `Processed ${task.type} task: "${shortPrompt}"`;
            }

            // Calculate actual compute time and stats
            const endTime = Date.now();
            const actualComputeTime = (endTime - startTime) / 1000; // in seconds

            // Calculate realistic GPU usage (varies by task type and size)
            const gpuUsage = task.type === 'image' ?
                Math.min(95, 65 + Math.random() * 30) : // 65-95% for images
                Math.min(80, 40 + Math.random() * 40);  // 40-80% for text

            // Calculate input and output tokens if not already set
            const inputTokens = task.input_tokens || (task.prompt ? Math.ceil(task.prompt.length / 4) : 0);
            const outputTokens = task.type === 'text' ?
                Math.ceil(result.length / 4) : // For text, estimate based on result length
                0;  // For images, output tokens don't apply the same way

            logger.log(`Preparing to mark task ${taskId} as completed after ${actualComputeTime.toFixed(2)}s of processing`);

            // Mark as completed with conditional update to prevent race conditions
            const { error: completeError } = await client
                .from('tasks')
                .update({
                    status: 'completed',
                    result,
                    updated_at: new Date().toISOString(),
                    compute_time: actualComputeTime,
                    gpu_usage: gpuUsage,
                    input_tokens: inputTokens,
                    output_tokens: outputTokens
                })
                .match({
                    id: taskId,
                    user_id: userId,
                    status: 'processing' // Only update if still in processing state
                });

            // Check for errors in the completion update
            if (completeError) {
                logger.error(`Error marking task ${taskId} as completed:`, completeError);

                // Try to fetch current state to understand why completion failed
                const { data: currentTask } = await client
                    .from('tasks')
                    .select('*')
                    .eq('id', taskId)
                    .single();

                if (currentTask) {
                    logger.warn(`Failed to complete task ${taskId}. Current status: ${currentTask.status}, assigned to: ${currentTask.user_id || 'none'}`);
                }

                return { success: false };
            }

            logger.log(`Successfully completed task ${taskId} in ${actualComputeTime.toFixed(2)}s`);

            // Update the cache
            taskCache.updateTask(taskId, {
                status: 'completed',
                result,
                compute_time: actualComputeTime,
                gpu_usage: gpuUsage,
                input_tokens: inputTokens,
                output_tokens: outputTokens,
                updated_at: new Date().toISOString(),
                user_id: userId
            });

            return { success: true, result };
        } catch (error) {
            logger.error('Error processing task:', error);

            try {
                // Mark as failed if this user owns this task
                const client = getSwarmSupabase();
                if (client && userId) {
                    logger.log(`Marking task ${taskId} as failed due to error`);
                    await client
                        .from('tasks')
                        .update({
                            status: 'failed',
                            updated_at: new Date().toISOString()
                        })
                        .match({
                            id: taskId,
                            user_id: userId,
                            status: 'processing' // Only update if still in processing state
                        });

                    // Update the cache
                    taskCache.updateTask(taskId, {
                        status: 'failed',
                        updated_at: new Date().toISOString()
                    });
                }
            } catch (updateError) {
                logger.error('Error updating failed task status:', updateError);
            }

            return { success: false };
        } finally {
            // Clean up any timers that might still be active
            if (processingTimer) {
                clearTimeout(processingTimer);
                processingTimer = null;
            }

            logger.log(`Task ${taskId} processing completed, cleaning up resources`);
            // Always clear the processing task and release the lock
            taskCache.setProcessingTask(null);
            taskProcessingState.releaseLock();
        }
    })();

    // Return the processing promise
    return taskProcessingState.processingPromise;
}; 