// taskService.js - Core functions for task operations

import { getSwarmSupabase } from '@/lib/supabase-client';
import { AITask, TaskStatus } from './types';
import { logger } from '../utils/logger';
import { TASK_PROCESSING_CONFIG, calculateProcessingTime } from './config';
import { recordTaskEarning, processReferralRewards } from './earningsService';
import { store } from '@/store';

// Enhanced task processing state with locks
const taskProcessingState = {
    currentTask: null,
    isProcessing: false,
    locks: new Map<string, {
        acquiredAt: number,
        userId: string,
        nodeId: string
    }>(),

    // Try to acquire a lock for a task
    acquireLock(taskId: string, userId: string, nodeId: string): boolean {
        const now = Date.now();
        const lockTimeout = 5 * 60 * 1000; // 5 minutes timeout

        // Clear expired locks
        this.locks.forEach((lock, id) => {
            if (now - lock.acquiredAt > lockTimeout) {
                this.locks.delete(id);
                logger.warn(`Cleared expired lock for task ${id}`);
            }
        });

        // Check if task is already locked
        const existingLock = this.locks.get(taskId);
        if (existingLock) {
            // If locked by same user+node, allow it
            if (existingLock.userId === userId && existingLock.nodeId === nodeId) {
                return true;
            }
            return false;
        }

        // Acquire new lock
        this.locks.set(taskId, {
            acquiredAt: now,
            userId,
            nodeId
        });
        logger.log(`Lock acquired for task ${taskId} by user ${userId} on node ${nodeId}`);
        return true;
    },

    // Release a lock
    releaseLock(taskId: string, userId: string, nodeId: string): void {
        const lock = this.locks.get(taskId);
        if (lock && lock.userId === userId && lock.nodeId === nodeId) {
            this.locks.delete(taskId);
            logger.log(`Lock released for task ${taskId}`);
        }
    }
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

        // Check if node is active
        const state = store.getState();
        if (!state.node?.isActive) {
            logger.warn('Cannot assign tasks: Node is not active');
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
    // Check if the node is active before processing
    const state = store.getState();
    if (!state.node?.isActive) {
        logger.warn(`Cannot process task ${taskId}: Node is not active`);
        return { success: false, message: 'NODE_INACTIVE' };
    }
    
    // Try to acquire a lock for this task
    if (!taskProcessingState.acquireLock(taskId, userId, state.node?.nodeId || '')) {
        logger.log(`Task ${taskId} is locked by another user/node, skipping`);
        return { success: false, message: 'TASK_LOCKED' };
    }

    // Prevent processing multiple tasks simultaneously
    if (taskProcessingState.isProcessing) {
        taskProcessingState.releaseLock(taskId, userId, state.node?.nodeId || '');
        logger.log(`Already processing task ${taskProcessingState.currentTask?.id}, skipping ${taskId}`);
        return { success: false, message: 'ALREADY_PROCESSING' };
    }

    try {
        const client = getSwarmSupabase();
        if (!client) {
            logger.error('Supabase client is not initialized');
            return { success: false, message: 'SUPABASE_NOT_INITIALIZED' };
        }

        // First check if the task exists and belongs to this user
        const { data: task, error: fetchError } = await client
            .from('tasks')
            .select('*')
            .eq('id', taskId)
            .eq('user_id', userId)
            .single();

        if (fetchError || !task) {
            logger.error(`Task ${taskId} not found or not assigned to user ${userId}`);
            return { success: false, message: 'TASK_NOT_FOUND' };
        }

        // Check if task is already completed or failed
        if (task.status === 'completed') {
            logger.log(`Task ${taskId} is already completed, skipping`);
            return { success: true, result: task.result };
        }
        
        if (task.status === 'failed') {
            logger.log(`Task ${taskId} is marked as failed, attempting recovery`);
            // Continue processing to attempt recovery
        }

        // Set as currently processing task
        taskProcessingState.isProcessing = true;
        taskProcessingState.currentTask = task;
        
        // Update status to processing
        // Only update if task is in pending state to prevent overwriting completed tasks
        if (task.status === 'pending') {
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
                return { success: false, message: 'UPDATE_ERROR' };
            }
        }
        
        // Keep checking if node is still active during processing
        // Register monitoring interval to check node status
        let processingCancelled = false;
        const nodeActiveCheckInterval = setInterval(() => {
            const currentState = store.getState();
            if (!currentState.node?.isActive) {
                processingCancelled = true;
                logger.warn(`Node deactivated while processing task ${taskId}, marking for cancellation`);
                clearInterval(nodeActiveCheckInterval);
                
                // Immediately try to update the task status back to pending
                try {
                    client
                        .from('tasks')
                        .update({
                            status: 'pending',
                            updated_at: new Date().toISOString(),
                            user_id: null,  // Release the task so others can pick it up
                            node_id: null   // Clear the node ID
                        })
                        .eq('id', taskId)
                        .eq('user_id', userId)
                        .then(({ error }) => {
                            if (error) {
                                logger.error(`Error resetting task ${taskId} after node deactivation:`, error);
                            } else {
                                logger.warn(`Task ${taskId} reset to pending due to node deactivation`);
                            }
                        });
                } catch (resetError) {
                    logger.error(`Error handling task reset on deactivation:`, resetError);
                }
            }
        }, 1000); // Check every second
        
        // Determine processing time based on task type
        // Get current device's reward tier or default to CPU
        const rewardTier = state.node?.rewardTier || 'cpu'; 
        
        // Calculate processing time based on task type and hardware tier
        const processingTime = calculateProcessingTime(task.type as 'image' | 'text', rewardTier as 'webgpu' | 'wasm' | 'webgl' | 'cpu'); // seconds
        
        // Log detailed timing information to help debug stuck task detection
        const stuckDetectionTime = processingTime + 60; // 60s buffer (increased from 20s)
        logger.log(`Processing ${task.type} task ${taskId} for ${processingTime} seconds (${rewardTier} hardware tier)`);
        logger.log(`Task will be considered stuck after ${stuckDetectionTime} seconds with current settings`);

        // Wait for processing time to complete
        await new Promise<void>(resolve => {
            const timeoutId = setTimeout(resolve, processingTime * 1000);
            
            // Check every second if processing was cancelled due to node deactivation
            const cancellationCheckInterval = setInterval(() => {
                if (processingCancelled) {
                    clearTimeout(timeoutId);
                    clearInterval(cancellationCheckInterval);
                    resolve();
                }
            }, 500);
        });
        
        // Clear the node active check interval
        clearInterval(nodeActiveCheckInterval);

        // If node was deactivated during processing, reset task and exit
        if (processingCancelled) {
            try {
                // Mark task as pending, clear user_id and node_id so it can be picked up again
                await client
                    .from('tasks')
                    .update({
                        status: 'pending',
                        updated_at: new Date().toISOString(),
                        user_id: null,  // Release the task so others can pick it up
                        node_id: null   // Clear the node ID
                    })
                    .eq('id', taskId)
                    .eq('user_id', userId);
                
                logger.warn(`Task ${taskId} reset to pending due to node deactivation`);
                
                // Clear processing state
                taskProcessingState.isProcessing = false;
                taskProcessingState.currentTask = null;
                
                return { success: false, message: 'NODE_DEACTIVATED' };
            } catch (resetError) {
                logger.error(`Error resetting task ${taskId} after cancellation:`, resetError);
                
                // Clear processing state even on error
                taskProcessingState.isProcessing = false;
                taskProcessingState.currentTask = null;
                
                return { success: false, message: 'RESET_ERROR' };
            }
        }

        // Generate simple result based on task type
        const result = task.type === 'image'
            ? `https://example.com/generated-image-${taskId}.png`
            : `Generated text for prompt: "${task.prompt?.substring(0, 30) || 'No prompt'}..."`;

        // Before updating, check current task status to handle race conditions with recovery
        const { data: currentTask } = await client
            .from('tasks')
            .select('status')
            .eq('id', taskId)
            .single();
            
        // If task has been completed by another process or manually, don't overwrite
        if (currentTask?.status === 'completed') {
            logger.log(`Task ${taskId} was already completed by another process, skipping update`);
            taskProcessingState.isProcessing = false;
            taskProcessingState.currentTask = null;
            return { success: true };
        }
            
        // Update task as completed - use a more robust update that works even if task was marked failed
        // First, insert the completed task into task_proof table
        const taskProofData = {
            id: taskId,  // Primary key from the original task
            status: 'completed',  // Always completed when moving to proof
            type: task.type,
            prompt: task.prompt || null,
            result: result || null,
            user_id: userId,  // Add user_id as seen in screenshots
            node_id: task.node_id || null,  // Add node_id from original task
            created_at: new Date().toISOString(),
            compute_time: Math.round(processingTime) // Round to nearest integer
        };

        // Log the data we're trying to insert
        logger.log('Attempting to insert into task_proof:', taskProofData);

        const { error: proofError } = await client
            .from('task_proof')
            .insert(taskProofData);

        if (proofError) {
            logger.error(`Error inserting into task_proof for task ${taskId}:`, proofError);
            taskProcessingState.isProcessing = false;
            taskProcessingState.currentTask = null;
            return { success: false, message: 'PROOF_INSERT_ERROR' };
        }

        // Then delete the task from tasks table since it's now in task_proof
        const { error: deleteError } = await client
            .from('tasks')
            .delete()
            .eq('id', taskId)
            .eq('user_id', userId)
            .in('status', ['processing', 'failed', 'pending']); // Allow deleting from any of these states

        if (deleteError) {
            logger.error(`Error deleting completed task ${taskId}:`, deleteError);
            taskProcessingState.isProcessing = false;
            taskProcessingState.currentTask = null;
            return { success: false, message: 'TASK_DELETE_ERROR' };
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

        // Clear processing state and release lock
        taskProcessingState.isProcessing = false;
        taskProcessingState.currentTask = null;
        taskProcessingState.releaseLock(taskId, userId, state.node?.nodeId || '');

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
                    updated_at: new Date().toISOString(),
                    user_id: null,  // Release the task
                    node_id: null   // Clear the node ID
                })
                .eq('id', taskId)
                .eq('user_id', userId);
        } catch (updateError) {
            logger.error('Error marking task as failed:', updateError);
        }

        // Clear processing state and release lock
        taskProcessingState.isProcessing = false;
        taskProcessingState.currentTask = null;
        taskProcessingState.releaseLock(taskId, userId, state.node?.nodeId || '');

        return { success: false, message: 'PROCESSING_ERROR' };
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