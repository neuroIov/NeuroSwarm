import { getSwarmSupabase, getTaskSupabase } from '@/lib/supabase-client';
import { AITask, TaskStatus, TaskType } from './types';
import { logger } from '../utils/logger';
import { TASK_TABLES } from './config';

const taskUpdateQueue = new Map<string, Partial<AITask>>();
const BATCH_SIZE = 50;
const UPDATE_INTERVAL = 5000;

// const startUpdateLoop = (): void => {
//     setInterval(async () => {
//         if (taskUpdateQueue.size === 0) return;
//         await processBatchUpdates();
//     }, UPDATE_INTERVAL);
// };

// const processBatchUpdates = async (): Promise<void> => {
//     const updates = Array.from(taskUpdateQueue.entries()).slice(0, BATCH_SIZE);
//     if (updates.length === 0) return;

//     try {
//         const client = getClient();
//         await Promise.all(
//             updates.map(async ([taskId, update]) => {
//                 const { error } = await client
//                     .from('tasks')
//                     .update(update)
//                     .eq('id', taskId);
//                 if (error) throw error;
//                 taskUpdateQueue.delete(taskId);
//             })
//         );
//     } catch (error) {
//         logger.error('Error processing batch updates:', error);
//     }
// };

export const convertToAITask = (item: Record<string, unknown>, sourceTable: string): AITask => {
    const id = item.id as string || crypto.randomUUID();
    let content = '';
    let type: TaskType = 'inference';
    let model = 'neural-engine';

    if (sourceTable === 'freedomai_conversations') {
        content = (item.title || item.content || 'AI Conversation') as string;
        type = 'text';
        model = 'freedom-ai';
    } else if (sourceTable === 'freedomai_messages') {
        content = (item.content || item.message || 'AI Message') as string;
        type = 'text';
        model = (item.model || 'freedom-ai') as string;
    } else if (sourceTable === 'img_gen_messages') {
        content = (item.prompt || item.content || 'Image Generation') as string;
        type = 'image';
        model = (item.model || 'neuro-image-gen') as string;
    } else if (sourceTable === 'music_gen_messages') {
        content = (item.prompt || item.content || 'Music Generation') as string;
        type = 'inference';
        model = (item.model || 'neuro-music-gen') as string;
    } else if (item.content) {
        content = item.content as string;
    } else if (item.message) {
        content = item.message as string;
    } else if (item.prompt) {
        content = item.prompt as string;
    } else if (item.text) {
        content = item.text as string;
    } else if (item.title) {
        content = item.title as string;
    } else if (item.data) {
        content = typeof item.data === 'string' ? item.data : JSON.stringify(item.data);
    }

    const timestamp = (item.created_at || item.timestamp || new Date().toISOString()) as string;

    return {
        id,
        type,
        status: 'pending',
        created_at: timestamp,
        updated_at: (item.updated_at || timestamp) as string,
        compute_time: 0,
        blockchain_task_id: '',
        node_id: '',
        user_id: (item.user_id || item.owner_id || '') as string,
        model,
        params: JSON.stringify({
            model,
            temperature: 0.7,
            max_tokens: 1000,
        }),
        input_tokens: content ? Math.ceil(content.length / 4) : 100,
        output_tokens: 0,
        prompt: content || `Processing ${sourceTable} item...`,
        result: '',
        gpu_usage: 0,
        reward_amount: 0,
        completion_signature: '',
    };
};

export const getRecentTasks = async (limit: number = 50, offset: number = 0): Promise<AITask[]> => {
    try {
        const tasksClient = getTaskSupabase();
        let allTasks: AITask[] = [];

        if (tasksClient) {
            try {
                // Collect tasks from all tables
                for (const table of TASK_TABLES) {
                    try {
                        const { data, error } = await tasksClient
                            .from(table)
                            .select('*')
                            .order('created_at', { ascending: false })
                            .limit(limit);

                        if (!error && data && data.length > 0) {
                            logger.log(`Found ${data.length} tasks in ${table} table of tasks project`);
                            const convertedTasks = data.map(item => convertToAITask(item, table));
                            allTasks = [...allTasks, ...convertedTasks];
                        }
                    } catch (tableError) {
                        logger.warn(`Error accessing '${table}' table in tasks project:`, tableError);
                    }
                }

                // If we collected tasks from multiple sources, return them
                if (allTasks.length > 0) {
                    // Sort by creation date
                    allTasks.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

                    // Get pending tasks - these should be prioritized
                    const pendingTasks = allTasks.filter(task => task.status === 'pending');
                    logger.log(`Found ${pendingTasks.length} pending tasks from external sources`);

                    // Ensure at least one image task is included if available
                    const imageTasks = allTasks.filter(task => task.type === 'image');
                    const pendingImageTasks = imageTasks.filter(task => task.status === 'pending');

                    const textTasks = allTasks.filter(task => task.type === 'text');
                    const pendingTextTasks = textTasks.filter(task => task.status === 'pending');

                    // Build the final list with priority for pending tasks
                    let finalTasks: AITask[] = [];

                    // First add pending image tasks (up to 5)
                    finalTasks = [...finalTasks, ...pendingImageTasks.slice(0, 5)];

                    // Then add pending text tasks (up to 15)
                    finalTasks = [...finalTasks, ...pendingTextTasks.slice(0, 15)];

                    // If we still have room, add other tasks
                    const remainingSlots = limit - finalTasks.length;
                    if (remainingSlots > 0) {
                        // Add any remaining tasks, prioritizing recent ones
                        const otherTasks = allTasks.filter(
                            task => !finalTasks.some(t => t.id === task.id)
                        );
                        finalTasks = [...finalTasks, ...otherTasks.slice(0, remainingSlots)];
                    }

                    // Re-sort by creation date
                    finalTasks.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

                    logger.log(`Final tasks count: ${finalTasks.length} (Pending: ${finalTasks.filter(t => t.status === 'pending').length})`);
                    logger.log(`Final task type distribution: Image=${finalTasks.filter(t => t.type === 'image').length}, Text=${finalTasks.filter(t => t.type === 'text').length}`);

                    return finalTasks.slice(0, limit);
                }
            } catch (tasksError) {
                logger.error('Error fetching from tasks project:', tasksError);
            }
        }

        // Fallback to swarm tasks table if no tasks were found
        const client = getSwarmSupabase();

        // Get pending tasks first (higher priority)
        const { data: pendingTaskData, error: pendingTaskError } = await client
            .from('tasks')
            .select('*')
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(Math.ceil(limit * 0.7)); // 70% of the limit for pending tasks

        let combinedTasks: AITask[] = [];

        if (!pendingTaskError && pendingTaskData && pendingTaskData.length > 0) {
            combinedTasks = [...pendingTaskData as AITask[]];
        }

        // Fill remaining slots with other tasks (completed, processing, etc.)
        const remainingSlots = limit - combinedTasks.length;
        if (remainingSlots > 0) {
            const { data: otherTaskData, error: otherTaskError } = await client
                .from('tasks')
                .select('*')
                .not('status', 'eq', 'pending')
                .order('created_at', { ascending: false })
                .limit(remainingSlots);

            if (!otherTaskError && otherTaskData && otherTaskData.length > 0) {
                combinedTasks = [...combinedTasks, ...(otherTaskData as AITask[])];
            }
        }

        if (combinedTasks.length > 0) {
            logger.log(`Fetched ${combinedTasks.length} tasks from swarm tasks table (Pending: ${combinedTasks.filter(t => t.status === 'pending').length})`);
            return combinedTasks;
        }

        return [];
    } catch (error) {
        logger.error('Error in getRecentTasks:', error);
        return [];
    }
};

export const getPendingTasks = async (limit: number = 20): Promise<AITask[]> => {
    try {
        const client = getSwarmSupabase();
        const { data, error } = await client
            .from('tasks')
            .select('*')
            .eq('status', 'pending')
            .order('created_at', { ascending: true })
            .limit(limit);

        if (error) throw error;
        return (data as AITask[]) || [];
    } catch (error) {
        logger.error('Error fetching pending tasks:', error);
        return [];
    }
};

export const updateTaskStatus = async (taskId: string, status: TaskStatus, result?: string): Promise<void> => {
    const updates: Partial<AITask> = { status, updated_at: new Date().toISOString() };
    if (result) updates.result = result;

    try {
        const client = getSwarmSupabase();
        const { error } = await client
            .from('tasks')
            .update(updates)
            .eq('id', taskId);

        if (error) throw error;
    } catch (error) {
        logger.error('Error updating task status:', error);
        throw new Error(`Failed to update task status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
};

export const updateTaskBlockchainDetails = async (taskId: string, updates: Partial<AITask>): Promise<void> => {
    taskUpdateQueue.set(taskId, {
        ...taskUpdateQueue.get(taskId),
        ...updates,
        updated_at: new Date().toISOString(),
    });
};

export const logTaskProof = async (proofData: { taskId: string; timestamp: number; success: boolean; signature: string }): Promise<void> => {
    try {
        const client = getSwarmSupabase();
        const { error } = await client
            .from('task_proofs')
            .insert({
                task_id: proofData.taskId,
                timestamp: new Date(proofData.timestamp).toISOString(),
                success: proofData.success,
                signature: proofData.signature,
            });

        if (error) throw error;
    } catch (error) {
        logger.error('Error logging task proof:', error);
        throw new Error(`Failed to log task proof: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
};

