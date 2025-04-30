import { getSwarmSupabase, getTaskSupabase } from '@/lib/supabase-client';
import { AITask, TaskStatus, TaskType } from './types';
import { logger } from '../utils/logger';
import { TASK_TABLES } from './config';
import { convertToAITask } from './taskService';

/**
 * Fetches recent tasks from Freedom AI and Image Gen tables
 * and converts them to AITask format
 */
export const fetchAndConvertTasks = async (limit: number = 20): Promise<AITask[]> => {
    try {
        const taskClient = getTaskSupabase();
        const swarmClient = getSwarmSupabase();
        let convertedTasks: AITask[] = [];

        // Get tasks from Freedom AI conversations - text tasks
        try {
            // Get all available tasks from freedomai_messages
            const { data: freedomAIData, error: freedomAIError } = await taskClient
                .from('freedomai_messages')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(50); // Fetch up to 50

            if (!freedomAIError && freedomAIData && freedomAIData.length > 0) {
                logger.log(`Found ${freedomAIData.length} tasks in freedomai_messages table`);
                logger.log(`Found ${freedomAIData.length} tasks in freedomai_messages table of tasks project`);
                const aiTasks = freedomAIData.map(item => convertToAITask(item, 'freedomai_messages'));
                convertedTasks.push(...aiTasks);
            }
        } catch (error) {
            logger.error('Error fetching from freedomai_messages:', error);
        }

        // Get tasks from Image Gen - image tasks
        let imageTasks: AITask[] = [];
        try {
            // Get all available tasks from img_gen_messages
            const { data: imageGenData, error: imageGenError } = await taskClient
                .from('img_gen_messages')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(50); // Fetch up to 50

            if (!imageGenError && imageGenData && imageGenData.length > 0) {
                logger.log(`Found ${imageGenData.length} tasks in img_gen_messages table`);
                logger.log(`Raw imageGenData: ${JSON.stringify(imageGenData.slice(0, 2))}`);

                // Map image tasks without duplication
                imageTasks = imageGenData.map(item => convertToAITask(item, 'img_gen_messages'));
                logger.log(`Converted ${imageTasks.length} image tasks`);

                // Add to the main list
                convertedTasks.push(...imageTasks);
            }
        } catch (error) {
            logger.error('Error fetching from img_gen_messages:', error);
        }

        // Keep only tasks that are valid and have content
        convertedTasks = convertedTasks.filter(task =>
            task.prompt && task.prompt.trim() !== '' &&
            task.id && task.type
        );

        logger.log(`Total converted tasks before sorting and limiting: ${convertedTasks.length}`);
        logger.log(`Task type distribution: Image=${convertedTasks.filter(t => t.type === 'image').length}, Text=${convertedTasks.filter(t => t.type === 'text').length}`);

        // Separate image and text tasks
        const textTasks = convertedTasks.filter(task => task.type === 'text');

        // Sort all by creation date
        textTasks.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        // Make sure we always include the image tasks, and fill the rest with text tasks
        const textTasksToInclude = limit - imageTasks.length > 0 ?
            textTasks.slice(0, limit - imageTasks.length) :
            [];

        // Combine with priority for image tasks
        const finalTasks = [...imageTasks, ...textTasksToInclude];

        // Final sort by date
        finalTasks.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        logger.log(`Final task count: ${finalTasks.length}`);
        logger.log(`Final task type distribution: Image=${finalTasks.filter(t => t.type === 'image').length}, Text=${finalTasks.filter(t => t.type === 'text').length}`);

        return finalTasks;
    } catch (error) {
        logger.error('Error in fetchAndConvertTasks:', error);
        return [];
    }
};

/**
 * Creates AITasks in the swarm tasks table from converted tasks
 */
export const createSwarmTasks = async (tasks: AITask[]): Promise<string[]> => {
    try {
        const client = getSwarmSupabase();
        const createdIds: string[] = [];

        // Check for existing tasks to avoid duplicates
        for (const task of tasks) {
            try {
                // Use regular select instead of maybeSingle to avoid the PGRST116 error
                const { data: existingTasks, error: checkError } = await client
                    .from('tasks')
                    .select('id')
                    .eq('prompt', task.prompt);

                if (checkError) {
                    logger.error('Error checking for existing task:', checkError);
                    continue;
                }

                // If no existing tasks or empty array, insert the new task
                if (!existingTasks || existingTasks.length === 0) {
                    // Remove existing ID to let Postgres generate a new one
                    const taskToInsert = { ...task };
                    delete taskToInsert.id;

                    // Insert new task
                    const { data: insertedTask, error: insertError } = await client
                        .from('tasks')
                        .insert(taskToInsert)
                        .select('id')
                        .single();

                    if (insertError) {
                        logger.error('Error inserting task:', insertError);
                        continue;
                    }

                    if (insertedTask) {
                        createdIds.push(insertedTask.id);
                    }
                }
            } catch (error) {
                logger.error('Error processing task in createSwarmTasks:', error);
                continue;
            }
        }

        return createdIds;
    } catch (error) {
        logger.error('Error in createSwarmTasks:', error);
        return [];
    }
};

/**
 * Get queued tasks that haven't been assigned to any node
 */
export const getQueuedTasks = async (limit: number = 20): Promise<AITask[]> => {
    try {
        const client = getSwarmSupabase();
        const { data, error } = await client
            .from('tasks')
            .select('*')
            .eq('status', 'pending')
            .is('node_id', null)
            .order('created_at', { ascending: true })
            .limit(limit);

        if (error) {
            logger.error('Error fetching queued tasks:', error);
            return [];
        }

        return data as AITask[] || [];
    } catch (error) {
        logger.error('Error in getQueuedTasks:', error);
        return [];
    }
};

/**
 * Assigns tasks to a specific node with a balanced distribution of task types
 */
export const assignTasksToNode = async (nodeId: string, limit: number = 5): Promise<AITask[]> => {
    try {
        const client = getSwarmSupabase();

        // Calculate the ideal distribution of tasks
        const imageTaskLimit = Math.ceil(limit * 0.4); // 40% should be image tasks (2 out of 5)
        const textTaskLimit = limit - imageTaskLimit;   // 60% should be text tasks (3 out of 5)

        // Find pending tasks that aren't assigned to any node, grouped by type
        const { data: imageTasksData, error: imageError } = await client
            .from('tasks')
            .select('*')
            .eq('status', 'pending')
            .eq('type', 'image')
            .is('node_id', null)
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
            .order('created_at', { ascending: true })
            .limit(textTaskLimit);

        if (textError) {
            logger.error('Error fetching pending text tasks:', textError);
            return [];
        }

        // If one type is undersupplied, get more of the other type
        let imageTasks = imageTasksData || [];
        let textTasks = textTasksData || [];

        if (imageTasks.length < imageTaskLimit && textTasks.length > textTaskLimit) {
            // Get more text tasks to fill the quota
            const additionalTextNeeded = Math.min(imageTaskLimit - imageTasks.length, textTasks.length - textTaskLimit);
            textTasks = textTasksData?.slice(0, textTaskLimit + additionalTextNeeded) || [];
        } else if (textTasks.length < textTaskLimit && imageTasks.length > imageTaskLimit) {
            // Get more image tasks to fill the quota
            const additionalImageNeeded = Math.min(textTaskLimit - textTasks.length, imageTasks.length - imageTaskLimit);
            imageTasks = imageTasksData?.slice(0, imageTaskLimit + additionalImageNeeded) || [];
        }

        // If we still don't have enough tasks, try to refresh tasks from source tables
        const assignedTasks = [...imageTasks, ...textTasks];

        if (assignedTasks.length < limit) {
            // Try to refresh and create new tasks
            await refreshTasks(limit * 2); // Get more tasks than needed

            // After refresh, try to fetch tasks again
            const remainingNeeded = limit - assignedTasks.length;

            // Fetch any remaining tasks regardless of type
            const { data: remainingTasks, error: remainingError } = await client
                .from('tasks')
                .select('*')
                .eq('status', 'pending')
                .is('node_id', null)
                .not('id', 'in', `(${assignedTasks.map(t => t.id).join(',')})`)
                .order('created_at', { ascending: true })
                .limit(remainingNeeded);

            if (!remainingError && remainingTasks && remainingTasks.length > 0) {
                assignedTasks.push(...remainingTasks);
            }
        }

        if (assignedTasks.length === 0) {
            return [];
        }

        // Assign tasks to node
        const taskIds = assignedTasks.map(task => task.id);

        const { error: updateError } = await client
            .from('tasks')
            .update({ node_id: nodeId, status: 'pending' })
            .in('id', taskIds);

        if (updateError) {
            logger.error('Error assigning tasks to node:', updateError);
            return [];
        }

        // Return assigned tasks with updated status
        return assignedTasks.map(task => ({
            ...task,
            node_id: nodeId,
            status: 'pending' as TaskStatus
        }));
    } catch (error) {
        logger.error('Error in assignTasksToNode:', error);
        return [];
    }
};

/**
 * Processes a task and updates its status
 */
export const processTask = async (
    taskId: string,
    estimatedTime: number
): Promise<{ success: boolean, result?: string }> => {
    try {
        const client = getSwarmSupabase();

        // Get task details
        const { data: task, error: fetchError } = await client
            .from('tasks')
            .select('*')
            .eq('id', taskId)
            .single();

        if (fetchError || !task) {
            logger.error('Error fetching task to process:', fetchError);
            return { success: false };
        }

        // Start processing
        await client
            .from('tasks')
            .update({
                status: 'processing',
                updated_at: new Date().toISOString()
            })
            .eq('id', taskId);

        // Simulate processing time based on task type
        const processingTime = task.type === 'image' ? 30 : 15;
        await new Promise(resolve => setTimeout(resolve, processingTime * 1000));

        // Generate a result based on task type
        let result = '';
        if (task.type === 'text') {
            result = `Generated text response for prompt: "${task.prompt.substring(0, 50)}${task.prompt.length > 50 ? '...' : ''}"`;
        } else if (task.type === 'image') {
            result = `https://example.com/generated-image-${taskId}.png`;
        } else {
            result = `Processed ${task.type} task: "${task.prompt.substring(0, 30)}${task.prompt.length > 30 ? '...' : ''}"`;
        }

        // Mark as completed
        await client
            .from('tasks')
            .update({
                status: 'completed',
                result,
                updated_at: new Date().toISOString(),
                compute_time: processingTime
            })
            .eq('id', taskId);

        return { success: true, result };
    } catch (error) {
        logger.error('Error processing task:', error);

        try {
            // Mark as failed
            const client = getSwarmSupabase();
            await client
                .from('tasks')
                .update({
                    status: 'failed',
                    updated_at: new Date().toISOString()
                })
                .eq('id', taskId);
        } catch (updateError) {
            logger.error('Error updating failed task status:', updateError);
        }

        return { success: false };
    }
};

/**
 * Refreshes tasks by fetching new ones from source tables and adding them to swarm tasks
 */
export const refreshTasks = async (limit: number = 20): Promise<number> => {
    try {
        // Fetch tasks from source tables (Freedom AI and Image Gen)
        const convertedTasks = await fetchAndConvertTasks(limit);

        if (convertedTasks.length === 0) {
            return 0;
        }

        // Create tasks in swarm tasks table
        const createdIds = await createSwarmTasks(convertedTasks);

        return createdIds.length;
    } catch (error) {
        logger.error('Error in refreshTasks:', error);
        return 0;
    }
}; 