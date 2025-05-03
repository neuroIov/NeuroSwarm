import { getSwarmSupabase } from '@/lib/supabase-client';
import { AITask, TaskStatus, TaskType } from './types';
import { logger } from '../utils/logger';
import { TASK_PROCESSING_CONFIG } from './config';
import { taskCache } from './taskCacheService';

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

        // Assign tasks to user one by one to prevent race conditions
        const assignedTasks: AITask[] = [];
        const timestamp = new Date().toISOString();

        for (const task of tasksToAssign) {
            const { error: updateError } = await client
                .from('tasks')
                .update({
                    user_id: userId,
                    updated_at: timestamp
                })
                .eq('id', task.id)
                .is('user_id', null) // Only update if still unassigned
                .eq('status', 'pending'); // Only update if still pending

            if (updateError) {
                logger.error(`Error assigning task ${task.id} to user ${userId}:`, updateError);
                continue;
            }

            // Add to our assigned tasks list
            assignedTasks.push({
                ...task,
                user_id: userId,
                updated_at: timestamp
            });
        }

        // Log success and distribution info
        const assignedImageCount = assignedTasks.filter(t => t.type === 'image').length;
        const assignedTextCount = assignedTasks.filter(t => t.type === 'text').length;

        logger.log(`Assigned ${assignedTasks.length} tasks to user: ${userId}`);

        if (assignedTasks.length > 0) {
            logger.log(`Task distribution: ${assignedImageCount} images (${Math.round(assignedImageCount / assignedTasks.length * 100)}%), ${assignedTextCount} text (${Math.round(assignedTextCount / assignedTasks.length * 100)}%)`);
        }

        // Return assigned tasks
        return assignedTasks;
    } catch (error) {
        logger.error('Error in assignTasksToUser:', error);
        return [];
    }
};

/**
 * Processes a task and updates its status
 * Ensures only one task is processed at a time and prevents race conditions
 */
export const processTask = async (
    taskId: string,
    estimatedTime: number
): Promise<{ success: boolean, result?: string }> => {
    try {
        // If we're already processing a task, don't start another one
        if (taskCache.isProcessingTask && taskCache.processingTask?.id !== taskId) {
            logger.log(`Already processing task ${taskCache.processingTask?.id}, can't process ${taskId} now`);
            return { success: false };
        }

        const client = getSwarmSupabase();
        if (!client) {
            logger.error('Swarm client is not initialized');
            return { success: false };
        }

        const startTime = Date.now();

        // Get current user ID
        const userId = getCurrentUserId();

        if (!userId) {
            logger.error(`Cannot process task ${taskId}: No user ID available`);
            return { success: false };
        }

        // First, fetch the task by ID only without filtering by status
        // This ensures we can find the task regardless of current status
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

        // Verify the task is in a state we can process
        if (task.status !== 'pending') {
            logger.warn(`Task ${taskId} is not in pending state (current status: ${task.status})`);
            return { success: false };
        }

        // Set this task as the currently processing task in cache
        taskCache.setProcessingTask(task);

        // Update status to processing
        const { error: updateError } = await client
            .from('tasks')
            .update({
                status: 'processing',
                user_id: userId,
                updated_at: new Date().toISOString()
            })
            .eq('id', taskId)
            .is('user_id', null) // Only update unassigned tasks
            .eq('status', 'pending'); // Only update if still pending

        // Check for errors in the update
        if (updateError) {
            logger.error(`Error updating task ${taskId} to processing state:`, updateError);
            taskCache.setProcessingTask(null);
            return { success: false };
        }

        // Verify task was updated by fetching it again
        const { data: updatedTask, error: verifyError } = await client
            .from('tasks')
            .select('*')
            .eq('id', taskId)
            .single();

        if (verifyError || !updatedTask) {
            logger.error(`Error verifying task update for ${taskId}:`, verifyError);
            taskCache.setProcessingTask(null);
            return { success: false };
        }

        // Check if the task was actually updated to processing and assigned to us
        if (updatedTask.status !== 'processing' || updatedTask.user_id !== userId) {
            logger.warn(`Task ${taskId} could not be claimed by user ${userId} (current status: ${updatedTask.status}, assigned to: ${updatedTask.user_id || 'none'})`);
            taskCache.setProcessingTask(null);
            return { success: false };
        }

        // Process the task with fixed duration based on type
        // This simulates the actual computation time
        const processingTime = task.type === 'image' ? 30 : 15; // 30s for images, 15s for text
        logger.log(`Processing ${task.type} task ${taskId} for user ${userId} (will take ${processingTime}s)`);

        // Simulate processing with a promise
        await new Promise(resolve => setTimeout(resolve, processingTime * 1000));

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

        // Mark as completed
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
            .eq('id', taskId)
            .eq('user_id', userId); // Only update if it belongs to this user

        // Check for errors in the completion update
        if (completeError) {
            logger.error(`Error marking task ${taskId} as completed:`, completeError);
            taskCache.setProcessingTask(null);
            return { success: false };
        }

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

        // Clear the processing task
        taskCache.setProcessingTask(null);

        logger.log(`Successfully completed task ${taskId} (${task.type}) for user ${userId} in ${actualComputeTime.toFixed(2)}s`);
        return { success: true, result };
    } catch (error) {
        logger.error('Error processing task:', error);

        try {
            // Get current user ID
            const userId = getCurrentUserId();

            if (userId) {
                // Mark as failed if this user owns this task
                const client = getSwarmSupabase();
                if (!client) {
                    logger.error('Swarm client is not initialized');
                    return { success: false };
                }

                await client
                    .from('tasks')
                    .update({
                        status: 'failed',
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', taskId)
                    .eq('user_id', userId); // Only if task belongs to this user
            }
        } catch (updateError) {
            logger.error('Error updating failed task status:', updateError);
        }

        // Clear the processing task
        taskCache.setProcessingTask(null);

        return { success: false };
    }
}; 