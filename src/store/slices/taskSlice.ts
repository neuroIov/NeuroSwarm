// taskSlice.js - Redux slice for task management

import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import {
    getPendingUnassignedTasks,
    assignTasksToUser,
    processTask,
    getUserAssignedTasks
} from '@/services/taskService';
import { logger } from '@/utils/logger';
import { RootState } from '@/store'; // Fix import path for RootState
import { TASK_PROCESSING_CONFIG } from '@/services/config';
import { getSwarmSupabase } from '@/lib/supabase-client';

// Simple polling controller
let pollingInterval: NodeJS.Timeout | null = null;

// Create a reference to the store for polling
let storeRef: { getState: () => RootState } | null = null;

// Track current task processing state
let isProcessingTask = false;
let currentProcessingTaskId: string | null = null;

// Enhanced mutex for task processing with lock timeout
const taskProcessingLock = {
    isLocked: false,
    currentTaskId: null,
    lockTime: 0,

    acquire(taskId) {
        if (this.isLocked) {
            // Get the current task type and hardware tier to calculate appropriate timeout
            const state = storeRef?.getState();
            const rewardTier = state?.node?.rewardTier || 'cpu';
            
            // Calculate max processing time plus a 90s buffer for lock timeout
            const maxProcessingTime = Math.max(
                TASK_PROCESSING_CONFIG.PROCESSING_TIME.image * TASK_PROCESSING_CONFIG.HARDWARE_MULTIPLIERS[rewardTier],
                TASK_PROCESSING_CONFIG.PROCESSING_TIME.text * TASK_PROCESSING_CONFIG.HARDWARE_MULTIPLIERS[rewardTier]
            ) * 1000; // Convert to milliseconds
            
            const lockTimeout = maxProcessingTime + 90000; // 90s buffer
            
            // Check for stale locks based on calculated timeout
            if (Date.now() - this.lockTime > lockTimeout) {
                logger.warn(`Force releasing stale lock on task ${this.currentTaskId} after ${(Date.now() - this.lockTime) / 1000}s (max expected: ${lockTimeout / 1000}s)`);
                this.release();
            } else {
                return false;
            }
        }

        this.isLocked = true;
        this.currentTaskId = taskId;
        this.lockTime = Date.now();
        logger.log(`Acquired processing lock for task ${taskId}`);
        return true;
    },

    release() {
        logger.log(`Released processing lock for task ${this.currentTaskId}`);
        this.isLocked = false;
        this.currentTaskId = null;
        return true;
    }
};

export const setStoreRef = (store: { getState: () => RootState }) => {
    storeRef = store;
};

export const taskSlice = createSlice({
    name: 'tasks',
    initialState: {
        allTasks: [],
        assignedTasks: [],
        currentTask: null,
        isLoading: false,
        isProcessing: false,
        error: null,
        lastFetchTime: 0
    },
    reducers: {
        setCurrentTask: (state, action) => {
            state.currentTask = action.payload;
        },
        updateTaskStatus: (state, action) => {
            const { taskId, status, result } = action.payload;

            // Update in assigned tasks
            const assignedIndex = state.assignedTasks.findIndex(t => t.id === taskId);
            if (assignedIndex !== -1) {
                state.assignedTasks[assignedIndex].status = status;
                if (result) state.assignedTasks[assignedIndex].result = result;
            }

            // Update in all tasks
            const allIndex = state.allTasks.findIndex(t => t.id === taskId);
            if (allIndex !== -1) {
                state.allTasks[allIndex].status = status;
                if (result) state.allTasks[allIndex].result = result;

                // Remove completed/failed tasks from global list
                if (status === 'completed' || status === 'failed') {
                    state.allTasks = state.allTasks.filter(t => t.id !== taskId);
                }
            }

            // Update current task if it's the same task
            if (state.currentTask?.id === taskId) {
                state.currentTask = {
                    ...state.currentTask,
                    status,
                    ...(result && { result })
                };

                // If task is completed or failed, set processing to false
                if (status === 'completed' || status === 'failed') {
                    state.isProcessing = false;
                } else if (status === 'processing') {
                    state.isProcessing = true;
                }
            }

            // Clear current task if it's completed or failed and find next
            if (state.currentTask?.id === taskId && (status === 'completed' || status === 'failed')) {
                // Look for next pending task
                const nextTask = state.assignedTasks.find(t => t.status === 'pending');
                state.currentTask = nextTask || null;
            }
        },
        clearAssignedTasks: (state) => {
            state.assignedTasks = [];
            state.currentTask = null;
        },
        setProcessingStatus: (state, action) => {
            state.isProcessing = action.payload;
        },
        cleanupProcessingTasks: (state) => {
            // Get user ID from the state to ensure we only reset our tasks
            const rootState = storeRef?.getState();
            const userId = rootState?.session?.userProfile?.id;
            
            if (!userId) {
                logger.warn('Cannot cleanup tasks: Missing user ID');
                return state;
            }

            // Find any tasks that are in processing state for this user
            const processingTasks = state.assignedTasks.filter(task => 
                task.status === 'processing' && task.user_id === userId
            );
            
            if (processingTasks.length === 0) {
                return state;
            }
            
            logger.warn(`Node stopping: Cleaning up ${processingTasks.length} processing tasks for user ${userId}`);
            
            // Reset processing tasks to pending in local state
            processingTasks.forEach(task => {
                const index = state.assignedTasks.findIndex(t => t.id === task.id);
                if (index !== -1) {
                    logger.warn(`Resetting task ${task.id} (${task.type}) from processing to pending`);
                    state.assignedTasks[index].status = 'pending';
                    // Clear user and node assignment in local state too
                    state.assignedTasks[index].user_id = null;
                    state.assignedTasks[index].node_id = null;
                }
                
                // Also update in database - reset to pending and release the task
                updateTaskStatusInDatabase(task.id, 'pending', userId, true);
            });
            
            // Clear current task and processing state
            if (state.currentTask && processingTasks.some(task => task.id === state.currentTask?.id)) {
                state.currentTask = null;
            }
            state.isProcessing = false;
            
            // Clear global task processing state
            isProcessingTask = false;
            currentProcessingTaskId = null;
            taskProcessingLock.release();
            
            logger.log(`Successfully cleaned up ${processingTasks.length} processing tasks`);
            
            return state;
        },
        recoverStuckTasks: (state) => {
            // Get user ID from the state to ensure we only reset our tasks
            const rootState = storeRef?.getState();
            const userId = rootState?.session?.userProfile?.id;
            
            if (!userId) {
                logger.warn('Cannot recover tasks: Missing user ID');
                return state;
            }

            // Find tasks stuck in processing state for this user
            const stuckTasks = state.assignedTasks.filter(task => 
                task.status === 'processing' && task.user_id === userId
            );

            if (stuckTasks.length === 0) {
                return state;
            }
            
            logger.warn(`Attempting recovery of ${stuckTasks.length} potentially stuck tasks`);
            
            // Mark stuck tasks as needing retry rather than immediately failed
            // This gives the task a chance to complete if it's just taking longer than expected
            stuckTasks.forEach(task => {
                const index = state.assignedTasks.findIndex(t => t.id === task.id);
                if (index !== -1) {
                    // Instead of marking as failed, we're just updating processing state
                    // The task will be retried in the processing loop
                    logger.warn(`Task ${task.id} appears stuck (${task.type} task), will reset processing state`);
                    state.assignedTasks[index].status = 'pending';
                    state.assignedTasks[index].retry_count = (state.assignedTasks[index].retry_count || 0) + 1;

                    // Only mark as failed if this is the second or third retry
                    if (state.assignedTasks[index].retry_count > 2) {
                        logger.error(`Task ${task.id} has failed ${state.assignedTasks[index].retry_count} recovery attempts, marking as failed`);
                        state.assignedTasks[index].status = 'failed';
                        
                        // Also update in global tasks list if needed
                        const globalIndex = state.allTasks.findIndex(t => t.id === task.id);
                        if (globalIndex !== -1) {
                            state.allTasks[globalIndex].status = 'failed';
                        }
                    }
                    
                    // Update task in database to match our local state
                    const updatedStatus = state.assignedTasks[index].status;
                    // Release the task if it's going back to pending so others can pick it up
                    const releaseTask = updatedStatus === 'pending';
                    updateTaskStatusInDatabase(task.id, updatedStatus, userId, releaseTask);
                }
            });

            // Reset processing state if current task was stuck
            if (state.currentTask?.status === 'processing' && 
                stuckTasks.some(task => task.id === state.currentTask?.id)) {
                // Look for next pending task
                const nextTask = state.assignedTasks.find(t => t.status === 'pending');
                state.currentTask = nextTask || null;
                state.isProcessing = false;
            }

            // Clear global task processing state
            isProcessingTask = false;
            currentProcessingTaskId = null;
            taskProcessingLock.release();

            logger.log(`Processed recovery for ${stuckTasks.length} tasks`);

            return state;
        }
    },
    extraReducers: (builder) => {
        builder
            // Fetch pending tasks
            .addCase(fetchPendingTasks.pending, (state) => {
                state.isLoading = true;
            })
            .addCase(fetchPendingTasks.fulfilled, (state, action) => {
                state.isLoading = false;
                state.allTasks = action.payload;
                state.lastFetchTime = Date.now();
            })
            .addCase(fetchPendingTasks.rejected, (state, action) => {
                state.isLoading = false;
                state.error = action.payload;
            })

            // Assign tasks to user
            .addCase(fetchAndAssignTasks.pending, (state) => {
                state.isLoading = true;
            })
            .addCase(fetchAndAssignTasks.fulfilled, (state, action) => {
                state.isLoading = false;

                // Add newly assigned tasks
                if (action.payload.length > 0) {
                    // Only add tasks not already in the list
                    const newTasks = action.payload.filter(
                        newTask => !state.assignedTasks.some(task => task.id === newTask.id)
                    );

                    if (newTasks.length > 0) {
                        state.assignedTasks = [...state.assignedTasks, ...newTasks];

                        // Set first pending task as current if none is selected
                        if (!state.currentTask) {
                            const firstPending = newTasks.find(t => t.status === 'pending');
                            if (firstPending) state.currentTask = firstPending;
                        }
                    }
                }
            })
            .addCase(fetchAndAssignTasks.rejected, (state, action) => {
                state.isLoading = false;
                state.error = action.payload;
            })

            // Process task
            .addCase(processNextTask.pending, (state) => {
                state.isProcessing = true;
            })
            .addCase(processNextTask.fulfilled, (state, action) => {
                state.isProcessing = false;

                // Task status updates are handled via the updateTaskStatus reducer
                // This gets called when the task updates
            })
            .addCase(processNextTask.rejected, (state) => {
                state.isProcessing = false;
            });
    }
});

/**
 * Helper function to update task status directly in the database
 * Used for cleanup operations when node is stopped
 */
const updateTaskStatusInDatabase = async (taskId: string, status: string, userId?: string, releaseTask = false) => {
    try {
        const supabase = getSwarmSupabase();
        if (!supabase) {
            logger.error('Supabase client not available for task status update');
            return null;
        }
        
        // Prepare update payload
        const updateData: any = {
            status,
            updated_at: new Date().toISOString()
        };
        
        // If releaseTask is true, set user_id and node_id to null
        if (releaseTask) {
            updateData.user_id = null;
            updateData.node_id = null;
        }
        
        // Build the update query
        let query = supabase
            .from('tasks')
            .update(updateData)
            .eq('id', taskId);
            
        // Add user_id filter if provided
        if (userId) {
            query = query.eq('user_id', userId);
        }
        
        // Execute the update and return the data
        const { data, error } = await query.select('id, status, type').single();
            
        if (error) {
            logger.error(`Failed to update task ${taskId} status to ${status} in database:`, error);
            return null;
        } else {
            const action = releaseTask ? "released back to pool" : "updated";
            logger.log(`Task ${taskId} ${action} with status ${status} in database`);
            return data;
        }
    } catch (err) {
        logger.error(`Error updating task status in database:`, err);
        return null;
    }
};

// Async thunks
export const fetchPendingTasks = createAsyncThunk(
    'tasks/fetchPendingTasks',
    async (_, { rejectWithValue, getState }) => {
        try {
            // Check if node is active before fetching
            const state = getState() as RootState;
            if (!state.node?.isActive) {
                logger.log('Node is inactive, skipping task fetch');
                return [];
            }
            
            const tasks = await getPendingUnassignedTasks(20);
            return tasks;
        } catch (error) {
            logger.error('Error fetching pending tasks:', error);
            return rejectWithValue(error.message);
        }
    }
);

interface AssignTasksParams {
    userId: string;
    nodeId: string;
    batchSize?: number;
}

export const fetchAndAssignTasks = createAsyncThunk(
    'tasks/fetchAndAssignTasks',
    async ({ userId, nodeId, batchSize = 5 }: AssignTasksParams, { rejectWithValue, getState }) => {
        try {
            if (!userId) {
                return rejectWithValue('No user ID provided');
            }

            // Check if node is active before assigning tasks
            const state = getState() as RootState;
            if (!state.node?.isActive) {
                logger.log('Node is inactive, skipping task assignment');
                return [];
            }

            // Avoid duplicate requests
            if (isProcessingTask) {
                logger.log('Already processing a task, skipping task assignment');
                return [];
            }

            const assignedTasks = await assignTasksToUser(userId, nodeId, batchSize);
            return assignedTasks;
        } catch (error) {
            logger.error('Error assigning tasks to user:', error);
            return rejectWithValue(error.message);
        }
    }
);

export const processNextTask = createAsyncThunk(
    'tasks/processNextTask',
    async (_, { getState, dispatch, rejectWithValue }) => {
        let taskToProcess = null;

        try {
            // Get current state
            const state = getState() as RootState;
            const userId = state.session?.userProfile?.id;
            
            // Check if node is active before processing
            if (!state.node?.isActive) {
                logger.log('Node is inactive, skipping task processing');
                return rejectWithValue('NODE_INACTIVE');
            }

            if (!userId) {
                return rejectWithValue('No user ID available');
            }

            // Get the current task or find next pending task
            taskToProcess = state.tasks.currentTask;

            if (!taskToProcess || taskToProcess.status !== 'pending') {
                logger.warn('No valid task to process');
                return rejectWithValue('No pending tasks to process');
            }

            // Try to acquire lock - if already processing, don't start another task
            if (!taskProcessingLock.acquire(taskToProcess.id)) {
                logger.warn(`Cannot process task ${taskToProcess.id} - processing lock could not be acquired`);
                return rejectWithValue('Processing lock could not be acquired');
            }

            // Set global processing state
            isProcessingTask = true;
            currentProcessingTaskId = taskToProcess.id;

            // Step 1: Mark as processing
            dispatch(updateTaskStatus({
                taskId: taskToProcess.id,
                status: 'processing'
            }));

            // Step 2: Process task
            logger.log(`Starting to process task ${taskToProcess.id}`);
            const result = await processTask(taskToProcess.id, userId);

            // Step 3: Update status based on result
            if (result.success) {
                dispatch(updateTaskStatus({
                    taskId: taskToProcess.id,
                    status: 'completed',
                    result: result.result
                }));
                logger.log(`Task ${taskToProcess.id} completed successfully`);
            } else if (result.message === 'ALREADY_PROCESSING') {
                // Don't mark as failed if it was just skipped due to another task processing
                // Just leave it in pending state to try again later
                dispatch(updateTaskStatus({
                    taskId: taskToProcess.id,
                    status: 'pending'
                }));
                logger.log(`Task ${taskToProcess.id} skipped (another task is processing)`);
            } else {
                dispatch(updateTaskStatus({
                    taskId: taskToProcess.id,
                    status: 'failed'
                }));
                logger.warn(`Task ${taskToProcess.id} processing failed`);
            }

            return result;
        } catch (error) {
            // Mark task as failed
            if (taskToProcess) {
                dispatch(updateTaskStatus({
                    taskId: taskToProcess.id,
                    status: 'failed'
                }));
            }

            logger.error(`Error processing task: ${error.message || error}`);
            return rejectWithValue(error.message || 'Unknown error');
        } finally {
            // Always clean up
            isProcessingTask = false;
            currentProcessingTaskId = null;
            taskProcessingLock.release();
        }
    }
);

// Start simple polling for tasks
export const startTaskPolling = (dispatch, userId, nodeId) => {
    if (pollingInterval) {
        clearInterval(pollingInterval);
    }
    
    // Track consecutive empty polls for backoff
    let consecutiveEmptyPolls = 0;
    let currentPollingInterval = 20000; // Start with 20 seconds
    const MAX_POLLING_INTERVAL = 120000; // Max 2 minutes

    // First fetch immediately
    dispatch(fetchPendingTasks());

    // Assign initial batch of tasks if we have a user ID
    if (userId) {
        dispatch(fetchAndAssignTasks({ userId, nodeId }));
    }

    const pollWithBackoff = () => {
        // Skip polling if node is inactive
        if (storeRef) {
            const state = storeRef.getState();
            if (!state.node?.isActive) {
                logger.log('Node is inactive, skipping poll');
                return;
            }
        }
        
        // Don't poll if we're actively processing a task
        if (isProcessingTask) {
            logger.log('Skipping poll while task is processing');
            return;
        }

        dispatch(fetchPendingTasks())
            .then((action) => {
                // Check if we got any tasks
                const fetchedTasks = action.payload || [];
                
                if (fetchedTasks.length === 0) {
                    consecutiveEmptyPolls++;
                    
                    // Apply exponential backoff up to the maximum
                    if (consecutiveEmptyPolls > 2) {
                        // Increase interval with each empty poll, capped at MAX_POLLING_INTERVAL
                        currentPollingInterval = Math.min(
                            currentPollingInterval * 1.5, 
                            MAX_POLLING_INTERVAL
                        );
                        
                        logger.log(`Increasing polling interval to ${currentPollingInterval}ms after ${consecutiveEmptyPolls} empty polls`);
                        
                        // Reset the interval with the new timing
                        if (pollingInterval) {
                            clearInterval(pollingInterval);
                            pollingInterval = setInterval(pollWithBackoff, currentPollingInterval);
                        }
                    }
                } else {
                    // Reset backoff if we found tasks
                    if (consecutiveEmptyPolls > 0) {
                        consecutiveEmptyPolls = 0;
                        
                        // If we were in backoff mode, reset to normal interval
                        if (currentPollingInterval > 20000) {
                            currentPollingInterval = 20000;
                            logger.log('Resetting polling interval to 20000ms after finding tasks');
                            
                            // Reset the interval with the normal timing
                            if (pollingInterval) {
                                clearInterval(pollingInterval);
                                pollingInterval = setInterval(pollWithBackoff, currentPollingInterval);
                            }
                        }
                    }
                }
                
                // If we have less than 3 pending tasks left, fetch more
                if (storeRef) {
                    const state = storeRef.getState();
                    const pendingTaskCount = state.tasks.assignedTasks.filter(t => t.status === 'pending').length;

                    if (pendingTaskCount < 3 && userId && !isProcessingTask) {
                        dispatch(fetchAndAssignTasks({ userId, nodeId }));
                    }
                }
            })
            .catch(err => {
                logger.error('Error during task polling:', err);
            });
    };

    // Set up polling interval with the initial interval
    pollingInterval = setInterval(pollWithBackoff, currentPollingInterval);

    // Return a function to stop polling
    return () => {
        if (pollingInterval) {
            clearInterval(pollingInterval);
            pollingInterval = null;
        }
    };
};

// Process tasks in a loop
export const startTaskProcessing = (dispatch, userId) => {
    let processingInterval = null;
    let isProcessing = false;
    let lastProcessingAttempt = 0;

    const processLoop = async () => {
        // Prevent multiple simultaneous processing
        if (isProcessing || isProcessingTask) {
            return;
        }

        // Check if node is active
        if (storeRef) {
            const state = storeRef.getState();
            if (!state.node?.isActive) {
                // If node is not active, do not process tasks
                return;
            }
        }
        
        // Throttle processing attempts (not more than once every 3 seconds)
        const now = Date.now();
        if (now - lastProcessingAttempt < 3000) {
            return;
        }

        lastProcessingAttempt = now;

        try {
            isProcessing = true;

            const state = storeRef?.getState();
            if (!state || !state.node.isActive) {
                isProcessing = false;
                return;
            }

            // Check for any tasks stuck in processing state
            // Calculate max processing time based on task type and hardware tier
            const rewardTier = state.node?.rewardTier || 'cpu';
            
            // Calculate the maximum time any task should take based on current hardware
            const maxProcessingTime = Math.max(
                TASK_PROCESSING_CONFIG.PROCESSING_TIME.image * TASK_PROCESSING_CONFIG.HARDWARE_MULTIPLIERS[rewardTier],
                TASK_PROCESSING_CONFIG.PROCESSING_TIME.text * TASK_PROCESSING_CONFIG.HARDWARE_MULTIPLIERS[rewardTier]
            ) * 1000; // Convert to milliseconds
            
            // Add a 60-second buffer to accommodate any delays
            const stuckThreshold = maxProcessingTime + 60000;
            
            const stuckTasks = state.tasks.assignedTasks.filter(
                t => t.status === 'processing' &&
                    Date.now() - new Date(t.updated_at || 0).getTime() > stuckThreshold
            );

            if (stuckTasks.length > 0) {
                logger.warn(`Found ${stuckTasks.length} tasks stuck in processing state, recovering...`);
                dispatch(recoverStuckTasks());
                isProcessing = false;
                return;
            }

            // Check if we have a pending task to process
            const pendingTask = state.tasks.assignedTasks.find(t => t.status === 'pending');

            if (pendingTask && !isProcessingTask) {
                logger.log(`Found pending task ${pendingTask.id}, will process`);
                // Process one task at a time
                await dispatch(processNextTask()).unwrap();

                // Wait a bit before processing the next task
                setTimeout(() => {
                    isProcessing = false;
                }, 3000);
            } else {
                isProcessing = false;
            }
        } catch (error) {
            logger.error('Error in task processing loop:', error);
            isProcessing = false;
        }
    };

    // Initial process immediately
    processLoop();

    // Set up interval for continuous processing (check every 5 seconds)
    processingInterval = setInterval(processLoop, 5000);

    // Return a function to stop processing
    return () => {
        if (processingInterval) {
            clearInterval(processingInterval);
            processingInterval = null;
        }
        
        // Clean up any processing tasks when stopping
        dispatch(cleanupProcessingTasks());
    };
};

export const {
    setCurrentTask,
    updateTaskStatus,
    clearAssignedTasks,
    setProcessingStatus,
    recoverStuckTasks,
    cleanupProcessingTasks
} = taskSlice.actions;
export default taskSlice.reducer;