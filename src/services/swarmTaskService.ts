import { getSwarmSupabase, getTaskSupabase } from '@/lib/supabase-client';
import { AITask, TaskStatus, TaskType } from './types';
import { logger } from '../utils/logger';
import { TASK_TABLES, TASK_PROCESSING_CONFIG } from './config';
import { convertToAITask } from './taskService';
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
 * Fetches tasks directly from the main tasks table and converts them to AITask format
 * @param limit Maximum number of tasks to fetch (default: 20)
 * @returns Converted tasks
 */
export const fetchTasksFromSources = async (limit: number = 20): Promise<AITask[]> => {
    try {
        const taskClient = getTaskSupabase();
        if (!taskClient) {
            logger.error('Task client is not initialized');
            return [];
        }

        // Calculate image and text task limits with 40/60 ratio
        const imageTaskLimit = Math.ceil(limit * TASK_PROCESSING_CONFIG.DISTRIBUTION.image); // 40%
        const textTaskLimit = Math.ceil(limit * TASK_PROCESSING_CONFIG.DISTRIBUTION.text);  // 60%

        // Make a single API call with specific filtering to reduce load
        // Only unassigned tasks with user_id = null and status = pending
        const { data: tasksData, error: tasksError } = await taskClient
            .from('tasks')
            .select('*')
            .eq('status', 'pending')
            .is('user_id', null)
            .order('created_at', { ascending: false })
            .limit(limit * 2); // Fetch more to ensure we have enough of each type

        if (tasksError) {
            logger.error('Error fetching tasks:', tasksError);
            return [];
        }

        if (!tasksData || tasksData.length === 0) {
            logger.log('No pending unassigned tasks found');
            return [];
        }

        // Split tasks by type
        const textTasks = tasksData.filter(task => task.type === 'text');
        const imageTasks = tasksData.filter(task => task.type === 'image');

        logger.log(`Found ${textTasks.length} text tasks and ${imageTasks.length} image tasks`);

        // Determine how many of each type to use
        let finalTextLimit = Math.min(textTasks.length, textTaskLimit);
        let finalImageLimit = Math.min(imageTasks.length, imageTaskLimit);

        // Balance if one type is undersupplied
        if (textTasks.length < textTaskLimit && imageTasks.length > imageTaskLimit) {
            // Get more image tasks if text tasks are lacking
            finalImageLimit = Math.min(imageTasks.length, imageTaskLimit + (textTaskLimit - textTasks.length));
        } else if (imageTasks.length < imageTaskLimit && textTasks.length > textTaskLimit) {
            // Get more text tasks if image tasks are lacking
            finalTextLimit = Math.min(textTasks.length, textTaskLimit + (imageTaskLimit - imageTasks.length));
        }

        // Interleave tasks for balanced distribution
        const finalTasks: AITask[] = [];
        const maxTasks = Math.max(finalTextLimit, finalImageLimit);

        for (let i = 0; i < maxTasks; i++) {
            // Add image task first (if available)
            if (i < finalImageLimit) {
                finalTasks.push(imageTasks[i] as AITask);
            }

            // Add text task (if available)
            if (i < finalTextLimit) {
                finalTasks.push(textTasks[i] as AITask);
            }

            // Don't exceed the limit
            if (finalTasks.length >= limit) {
                break;
            }
        }

        // Ensure we don't exceed the requested limit
        const limitedTasks = finalTasks.slice(0, limit);

        // Keep only tasks that are valid and have content
        const validTasks = limitedTasks.filter(task =>
            task.prompt && task.prompt.trim() !== '' &&
            task.id && task.type
        );

        const imageTaskCount = validTasks.filter(t => t.type === 'image').length;
        const textTaskCount = validTasks.filter(t => t.type === 'text').length;

        logger.log(`Returning ${validTasks.length} total tasks (${imageTaskCount} image, ${textTaskCount} text)`);

        return validTasks;
    } catch (error) {
        logger.error('Error in fetchTasksFromSources:', error);
        return [];
    }
};

/**
 * Creates tasks in the swarm database using bulk RPC insert
 * Associates tasks with the current user session
 */
export const createTasksInSwarm = async (tasks: AITask[]): Promise<number> => {
    try {
        const client = getSwarmSupabase();

        // Prepare tasks for bulk insert with null user_id initially (unassigned)
        const tasksToInsert = tasks.map(task => {
            // Set timestamp fields properly
            const timestamp = new Date().toISOString();

            return {
                type: task.type,
                status: 'pending' as TaskStatus,
                created_at: timestamp,
                updated_at: timestamp,
                compute_time: 0,
                blockchain_task_id: '',
                node_id: '',
                user_id: null, // Set to null initially, will be assigned when a user connects
                model: task.model || 'default-model',
                params: task.params || JSON.stringify({
                    model: task.model,
                    temperature: 0.7,
                    max_tokens: 1000,
                }),
                input_tokens: task.input_tokens || Math.ceil((task.prompt?.length || 0) / 4),
                output_tokens: 0,
                prompt: task.prompt,
                result: '',
                gpu_usage: 0,
                reward_amount: 0,
                completion_signature: ''
            };
        });

        // Process in batches to avoid overwhelming the database
        const batchSize = 50;
        let totalCreated = 0;

        for (let i = 0; i < tasksToInsert.length; i += batchSize) {
            const batch = tasksToInsert.slice(i, i + batchSize);

            try {
                // Use RPC endpoint for bulk insert
                const { error } = await client.rpc('insert_tasks_bulk', {
                    task_rows: batch
                });

                if (error) {
                    logger.error('Error in bulk insert RPC:', error);
                    continue;
                }

                totalCreated += batch.length;
                logger.log(`Successfully batch inserted ${batch.length} tasks`);
            } catch (batchError) {
                logger.error('Error processing batch:', batchError);
            }

            // Add a small delay between batches
            if (i + batchSize < tasksToInsert.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        return totalCreated;
    } catch (error) {
        logger.error('Error in createTasksInSwarm:', error);
        return 0;
    }
};

/**
 * Get tasks for the current user or guest tasks if no user is logged in
 */
export const getUserTasks = async (limit: number = 50): Promise<AITask[]> => {
    try {
        const client = getSwarmSupabase();

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
 * Get queued tasks that haven't been assigned to any node,
 * with proper distribution of task types
 */
export const getQueuedTasks = async (limit: number = 50): Promise<AITask[]> => {
    try {
        const client = getSwarmSupabase();

        // Calculate image and text task limits with 40/60 ratio
        const imageTaskLimit = Math.ceil(limit * TASK_PROCESSING_CONFIG.DISTRIBUTION.image); // 40%
        const textTaskLimit = Math.ceil(limit * TASK_PROCESSING_CONFIG.DISTRIBUTION.text);  // 60%

        // Get image tasks
        const { data: imageTasks, error: imageError } = await client
            .from('tasks')
            .select('*')
            .eq('status', 'pending')
            .eq('type', 'image')
            .is('node_id', null)
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
            .is('node_id', null)
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
 * Assigns tasks to a specific node with a balanced distribution of task types
 * and updates the user_id to associate tasks with the connected user
 */
export const assignTasksToNode = async (nodeId: string, limit: number = 5, userId?: string): Promise<AITask[]> => {
    try {
        const client = getSwarmSupabase();

        // Calculate the ideal distribution of tasks
        const imageTaskLimit = Math.ceil(limit * TASK_PROCESSING_CONFIG.DISTRIBUTION.image); // 40% image tasks 
        const textTaskLimit = limit - imageTaskLimit;   // 60% text tasks

        // Find pending tasks that aren't assigned to any node or user, grouped by type
        const { data: imageTasksData, error: imageError } = await client
            .from('tasks')
            .select('*')
            .eq('status', 'pending')
            .eq('type', 'image')
            .is('node_id', null)
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
            .is('node_id', null)
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
        const assignedTasks: AITask[] = [];
        const maxTasks = Math.max(finalImageLimit, finalTextLimit);

        for (let i = 0; i < maxTasks; i++) {
            // Start with images to maintain ~40% ratio
            if (i < finalImageLimit) {
                assignedTasks.push(imageTasks[i] as AITask);
            }

            // Then add text tasks
            if (i < finalTextLimit) {
                assignedTasks.push(textTasks[i] as AITask);
            }

            // Don't exceed the limit
            if (assignedTasks.length >= limit) {
                break;
            }
        }

        // If we don't have enough tasks, try to refresh from source
        if (assignedTasks.length < 2) {
            logger.log(`Found only ${assignedTasks.length} tasks to assign, attempting to load more from source`);

            // Fetch tasks from source and create them in Swarm
            const newTasks = await fetchTasksFromSources(100); // Fetch a good number
            await createTasksInSwarm(newTasks);

            // After creating new tasks, try assigning again
            return assignTasksToNode(nodeId, limit, userId);
        }

        if (assignedTasks.length === 0) {
            return [];
        }

        // Assign tasks to node and user
        const taskIds = assignedTasks.map(task => task.id);
        const timestamp = new Date().toISOString();

        const updateData: {
            node_id: string;
            status: TaskStatus;
            updated_at: string;
            user_id?: string;
        } = {
            node_id: nodeId,
            status: 'pending',
            updated_at: timestamp
        };

        // Add user_id to update if provided
        if (userId) {
            updateData.user_id = userId;
        }

        const { error: updateError } = await client
            .from('tasks')
            .update(updateData)
            .in('id', taskIds);

        if (updateError) {
            logger.error('Error assigning tasks to node:', updateError);
            return [];
        }

        // Log success and distribution info
        const assignedImageCount = assignedTasks.filter(t => t.type === 'image').length;
        const assignedTextCount = assignedTasks.filter(t => t.type === 'text').length;

        logger.log(`Assigned ${assignedTasks.length} tasks to node: ${nodeId}${userId ? ` and user: ${userId}` : ''}`);
        logger.log(`Task distribution: ${assignedImageCount} images (${Math.round(assignedImageCount / assignedTasks.length * 100)}%), ${assignedTextCount} text (${Math.round(assignedTextCount / assignedTasks.length * 100)}%)`);

        // Return assigned tasks with updated status and user_id
        return assignedTasks.map(task => ({
            ...task,
            node_id: nodeId,
            user_id: userId || task.user_id,
            status: 'pending' as TaskStatus,
            updated_at: timestamp
        }));
    } catch (error) {
        logger.error('Error in assignTasksToNode:', error);
        return [];
    }
};

/**
 * Process tasks and ensure the database has a sufficient number of tasks
 * Associates tasks with the current session user ID
 */
export const refreshAndStoreTasks = async (): Promise<number> => {
    try {
        // Check if we already have enough tasks in the Swarm database
        const existingTasks = await getQueuedTasks(10);

        if (existingTasks.length >= 10) {
            logger.log(`Already have ${existingTasks.length} queued tasks in database`);
            return 0;
        }

        // Fetch new tasks from source
        logger.log('Fetching tasks from source tables to replenish database');
        const sourceTasks = await fetchTasksFromSources(100);

        if (sourceTasks.length === 0) {
            logger.log('No tasks found from source tables');
            return 0;
        }

        // Create tasks in swarm database
        const createdCount = await createTasksInSwarm(sourceTasks);

        logger.log(`Created ${createdCount} new tasks in Swarm database`);
        return createdCount;
    } catch (error) {
        logger.error('Error in refreshAndStoreTasks:', error);
        return 0;
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