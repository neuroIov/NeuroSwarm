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

export const getRecentTasks = async (limit: number = 20, offset: number = 0): Promise<AITask[]> => {
    try {
        // We only need to fetch from the tasks table now
        const client = getSwarmSupabase();

        // Calculate image and text task limits with 40/60 ratio
        const imageTaskLimit = Math.ceil(limit * 0.4); // 40% image tasks
        const textTaskLimit = limit - imageTaskLimit;   // 60% text tasks

        // First, get unassigned pending text tasks
        const { data: pendingTextTasks, error: textError } = await client
            .from('tasks')
            .select('*')
            .eq('status', 'pending')
            .is('user_id', null)
            .eq('type', 'text')
            .order('created_at', { ascending: false })
            .limit(textTaskLimit);

        if (textError) {
            logger.error('Error fetching pending text tasks:', textError);
        }

        // Get unassigned pending image tasks
        const { data: pendingImageTasks, error: imageError } = await client
            .from('tasks')
            .select('*')
            .eq('status', 'pending')
            .is('user_id', null)
            .eq('type', 'image')
            .order('created_at', { ascending: false })
            .limit(imageTaskLimit);

        if (imageError) {
            logger.error('Error fetching pending image tasks:', imageError);
        }

        // Create arrays with proper null checks
        const textTasks = pendingTextTasks || [];
        const imageTasks = pendingImageTasks || [];

        logger.log(`Found ${textTasks.length} unassigned text tasks and ${imageTasks.length} unassigned image tasks`);

        // If we don't have enough tasks of one type, get more of the other type
        let finalTextLimit = textTasks.length;
        let finalImageLimit = imageTasks.length;

        if (textTasks.length < textTaskLimit && imageTasks.length > imageTaskLimit) {
            // Get more image tasks if we don't have enough text tasks
            finalImageLimit = Math.min(imageTasks.length, imageTaskLimit + (textTaskLimit - textTasks.length));
        } else if (imageTasks.length < imageTaskLimit && textTasks.length > textTaskLimit) {
            // Get more text tasks if we don't have enough image tasks
            finalTextLimit = Math.min(textTasks.length, textTaskLimit + (imageTaskLimit - imageTasks.length));
        }

        // Interleave tasks for balanced distribution
        const finalTasks: AITask[] = [];
        const maxTasks = Math.max(finalTextLimit, finalImageLimit);

        for (let i = 0; i < maxTasks; i++) {
            // Add image task first (if available) to maintain 40/60 distribution 
            if (i < finalImageLimit) {
                finalTasks.push(imageTasks[i] as AITask);
            }

            // Add text task (if available)
            if (i < finalTextLimit) {
                finalTasks.push(textTasks[i] as AITask);
            }
        }

        // If we still need more tasks to reach our limit, get assigned tasks
        const remainingSlots = limit - finalTasks.length;

        if (remainingSlots > 0) {
            const { data: assignedTasks, error: assignedError } = await client
                .from('tasks')
                .select('*')
                .not('user_id', 'is', null)
                .order('created_at', { ascending: false })
                .limit(remainingSlots);

            if (!assignedError && assignedTasks && assignedTasks.length > 0) {
                finalTasks.push(...assignedTasks as AITask[]);
                logger.log(`Added ${assignedTasks.length} assigned tasks to fill remaining slots`);
            }
        }

        // Make sure we don't return more than the requested limit
        const limitedTasks = finalTasks.slice(0, limit);

        // Log distribution stats
        const imageTaskCount = limitedTasks.filter(t => t.type === 'image').length;
        const textTaskCount = limitedTasks.filter(t => t.type === 'text').length;
        const unassignedCount = limitedTasks.filter(t => !t.user_id).length;
        const assignedCount = limitedTasks.filter(t => t.user_id).length;

        logger.log(`Final tasks: ${limitedTasks.length} total (${imageTaskCount} image, ${textTaskCount} text)`);
        logger.log(`Breakdown: ${unassignedCount} unassigned, ${assignedCount} assigned`);

        return limitedTasks;
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

