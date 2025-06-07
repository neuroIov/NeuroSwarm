// taskService.js - Core functions for task operations

import { getSwarmSupabase } from '@/lib/supabase-client';
import { AITask, TaskStatus } from './types';
import { logger } from '../utils/logger';
import { TASK_PROCESSING_CONFIG } from './config';
import { recordTaskEarning, processReferralRewards } from './earningsService';

// Simple cache to track current processing task
const taskProcessingState = {
    currentTask: null,
    isProcessing: false
};

/**
 * Get pending unassigned tasks (where user_id is null)
 * Maintains proper distribution of task types (40% image, 60% text)
 */
export const getPendingUnassignedTasks = async (limit = 20) => {
    try {
        const client = getSwarmSupabase();
        if (!client) {
            logger.error('Supabase client is not initialized');
            return [];
        }

        // Calculate distribution limits
        const imageLimit = Math.ceil(limit * 0.4); 
        const textLimit = limit - imageLimit;     

        // Get pending unassigned image tasks
        const { data: imageTasks, error: imageError } = await client
            .from('tasks')
            .select('*')
            .eq('status', 'pending')
            .is('user_id', null)
            .eq('type', 'image')
            .order('created_at', { ascending: true })
            .limit(imageLimit);

        if (imageError) {
            logger.error('Error fetching pending image tasks:', imageError);
            return [];
        }

        // Get pending unassigned text tasks
        const { data: textTasks, error: textError } = await client
            .from('tasks')
            .select('*')
            .eq('status', 'pending')
            .is('user_id', null)
            .eq('type', 'text')
            .order('created_at', { ascending: true })
            .limit(textLimit);

        if (textError) {
            logger.error('Error fetching pending text tasks:', textError);
            return [];
        }

        // Combine and interleave tasks for better distribution
        const tasks = [];
        const maxLength = Math.max((imageTasks || []).length, (textTasks || []).length);

        for (let i = 0; i < maxLength; i++) {
            if (i < (imageTasks || []).length) {
                tasks.push(imageTasks[i]);
            }
            if (i < (textTasks || []).length) {
                tasks.push(textTasks[i]);
            }

            // Don't exceed the limit
            if (tasks.length >= limit) break;
        }

        logger.log(`Found ${tasks.length} pending unassigned tasks (${(imageTasks || []).length} image, ${(textTasks || []).length} text)`);
        return tasks;
    } catch (error) {
        logger.error('Error fetching pending unassigned tasks:', error);
        return [];
    }
};

/**
 * Assign a batch of tasks to a user
 */
export const assignTasksToUser = async (userId, nodeId, batchSize = 5) => {
    try {
        if (!userId) {
            logger.error('Cannot assign tasks: No user ID provided');
            return [];
        }

        const client = getSwarmSupabase();
        if (!client) {
            logger.error('Supabase client is not initialized');
            return [];
        }

        // Get pending unassigned tasks
        const pendingTasks = await getPendingUnassignedTasks(batchSize * 2);
        if (pendingTasks.length === 0) {
            logger.log('No pending unassigned tasks available for assignment');
            return [];
        }

        // Take only the batch size we need
        const tasksToAssign = pendingTasks.slice(0, batchSize);
        const taskIds = tasksToAssign.map(task => task.id);
        const timestamp = new Date().toISOString();

        // Update all tasks in one batch operation
        const { error } = await client
            .from('tasks')
            .update({
                user_id: userId,
                node_id: nodeId,
                updated_at: timestamp
            })
            .in('id', taskIds)
            .is('user_id', null); // Only update if still unassigned

        if (error) {
            logger.error('Error assigning tasks to user:', error);
            return [];
        }

        // Re-fetch the assigned tasks to confirm assignment
        const { data: assignedTasks, error: fetchError } = await client
            .from('tasks')
            .select('*')
            .in('id', taskIds)
            .eq('user_id', userId);

        if (fetchError) {
            logger.error('Error fetching assigned tasks:', fetchError);
            return [];
        }

        const imageCount = (assignedTasks || []).filter(t => t.type === 'image').length;
        const textCount = (assignedTasks || []).filter(t => t.type === 'text').length;

        logger.log(`Successfully assigned ${(assignedTasks || []).length} tasks to user ${userId}`);
        logger.log(`Task distribution: ${imageCount} images, ${textCount} text tasks`);

        return assignedTasks || [];
    } catch (error) {
        logger.error('Error in assignTasksToUser:', error);
        return [];
    }
};

/**
 * Process a task sequentially - change status to processing, wait, then complete
 */
export const processTask = async (taskId, userId) => {
    // Prevent processing multiple tasks simultaneously
    if (taskProcessingState.isProcessing) {
        logger.log(`Already processing task ${taskProcessingState.currentTask?.id}, skipping ${taskId}`);
        return { success: false };
    }

    try {
        const client = getSwarmSupabase();
        if (!client) {
            logger.error('Supabase client is not initialized');
            return { success: false };
        }

        // First check if the task exists and belongs to this user
        const { data: task, error: fetchError } = await client
            .from('tasks')
            .select('*')
            .eq('id', taskId)
            .eq('user_id', userId)
            .eq('status', 'pending')
            .single();

        if (fetchError || !task) {
            logger.error(`Task ${taskId} not found or not assigned to user ${userId}`);
            return { success: false };
        }

        // Set as currently processing task
        taskProcessingState.isProcessing = true;
        taskProcessingState.currentTask = task;

        // Update status to processing
        const { error: updateError } = await client
            .from('tasks')
            .update({
                status: 'processing',
                updated_at: new Date().toISOString()
            })
            .eq('id', taskId)
            .eq('user_id', userId);

        if (updateError) {
            logger.error(`Error updating task ${taskId} to processing:`, updateError);
            taskProcessingState.isProcessing = false;
            taskProcessingState.currentTask = null;
            return { success: false };
        }

        // Determine processing time based on task type
        const processingTime = task.type === 'image' ? TASK_PROCESSING_CONFIG.PROCESSING_TIME.image : TASK_PROCESSING_CONFIG.PROCESSING_TIME.text; // seconds
        logger.log(`Processing ${task.type} task ${taskId} for ${processingTime} seconds`);

        // Wait for processing time to complete
        await new Promise(resolve => setTimeout(resolve, processingTime * 1000));

        // Generate simple result based on task type
        const result = task.type === 'image'
            ? `https://example.com/generated-image-${taskId}.png`
            : `Generated text for prompt: "${task.prompt?.substring(0, 30) || 'No prompt'}..."`;

        // Update task as completed
        const { error: completeError } = await client
            .from('tasks')
            .update({
                status: 'completed',
                result,
                updated_at: new Date().toISOString(),
                compute_time: processingTime,
                output_tokens: task.type === 'text' ? Math.ceil(result.length / 4) : 0
            })
            .eq('id', taskId)
            .eq('user_id', userId);

        if (completeError) {
            logger.error(`Error completing task ${taskId}:`, completeError);
            taskProcessingState.isProcessing = false;
            taskProcessingState.currentTask = null;
            return { success: false };
        }

        logger.log(`Successfully completed task ${taskId} in ${processingTime}s`);

        // Get user wallet address for recording earnings
        // Determine amount based on task type
        const amount = task.type === 'image'
            ? TASK_PROCESSING_CONFIG.EARNINGS_NLOVE.image
            : TASK_PROCESSING_CONFIG.EARNINGS_NLOVE.text;

        // Record earnings for the completed task
        const earningResult = await recordTaskEarning(taskId, userId, task.type);

        if (earningResult.success) {
            logger.log(`Successfully recorded earnings for task ${taskId}`);

            // Process referral rewards if task earning was successful
            const referralResult = await processReferralRewards(userId, amount);
            if (referralResult.success) {
                logger.log(`Successfully processed referral rewards for user ${userId}`);
            } else {
                logger.error(`Failed to process referral rewards for user ${userId}: ${referralResult.message || 'Unknown error'}`);
            }
        } else {
            logger.error(`Failed to record earnings for task ${taskId}: ${earningResult.message || 'Unknown error'}`);
        }

        // Clear processing state
        taskProcessingState.isProcessing = false;
        taskProcessingState.currentTask = null;

        return { success: true, result };
    } catch (error) {
        logger.error(`Error processing task ${taskId}:`, error);

        // Try to mark the task as failed
        try {
            const client = getSwarmSupabase();
            await client
                .from('tasks')
                .update({
                    status: 'failed',
                    updated_at: new Date().toISOString()
                })
                .eq('id', taskId)
                .eq('user_id', userId);
        } catch (updateError) {
            logger.error('Error marking task as failed:', updateError);
        }

        // Clear processing state
        taskProcessingState.isProcessing = false;
        taskProcessingState.currentTask = null;

        return { success: false };
    }
};

/**
 * Get user's assigned tasks
 */
export const getUserAssignedTasks = async (userId, limit = 10) => {
    try {
        const client = getSwarmSupabase();
        if (!client) {
            logger.error('Supabase client is not initialized');
            return [];
        }

        const { data, error } = await client
            .from('tasks')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: true })
            .limit(limit);

        if (error) {
            logger.error('Error fetching user assigned tasks:', error);
            return [];
        }

        return data || [];
    } catch (error) {
        logger.error('Error in getUserAssignedTasks:', error);
        return [];
    }
};