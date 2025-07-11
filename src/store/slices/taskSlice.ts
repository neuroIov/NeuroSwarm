// taskSlice.js - Redux slice for task management

import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { logger } from '@/utils/logger';
import { RootState } from '@/store'; 
import { TASK_PROCESSING_CONFIG } from '@/services/config';
import { v4 as uuidv4 } from 'uuid';
import { AITask } from '@/services/types';
import proxyTaskService from '@/services/proxyTaskService';
import { recordTaskEarning } from '@/services/earningsService';

// Simple polling controller
let pollingInterval: NodeJS.Timeout | null = null;

// Create a reference to the store for polling
let storeRef: { getState: () => RootState } | null = null;

// Track current task processing state
let isProcessingTask = false;
let currentProcessingTaskId: string | null = null;
let uptimeSeconds = 0;
let uptimeTimer: NodeJS.Timeout | null = null;
let lastTaskGenTime = 0;

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
                }
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

            // Find any tasks that are stuck in processing state
            const now = new Date();
            const stuckTasks = state.assignedTasks.filter(task => {
                if (task.status !== 'processing' || !task.updated_at) {
                    return false;
                }
                
                // Calculate seconds since last update
                const updatedAt = new Date(task.updated_at);
                const timeDiff = (now.getTime() - updatedAt.getTime()) / 1000;
                
                // Task is stuck if it's been processing for more than 10 minutes
                return timeDiff > 600;
            });

            if (stuckTasks.length === 0) {
                return;
            }
            
            logger.warn(`Found ${stuckTasks.length} stuck tasks for user ${userId}`);
            
            // Reset stuck tasks to failed
            stuckTasks.forEach(task => {
                const index = state.assignedTasks.findIndex(t => t.id === task.id);
                if (index !== -1) {
                    logger.warn(`Marking stuck task ${task.id} as failed`);
                        state.assignedTasks[index].status = 'failed';
                    state.assignedTasks[index].updated_at = now.toISOString();
                }
            });
            
            // Clear current task if it's one of the stuck tasks
            if (state.currentTask && stuckTasks.some(task => task.id === state.currentTask?.id)) {
                state.currentTask = null;
                state.isProcessing = false;
            }

            logger.log(`Successfully recovered ${stuckTasks.length} stuck tasks`);
        },
        addGeneratedTasks: (state, action) => {
            const newTasks = action.payload;
            
            // Add tasks to assigned tasks if they don't exist already
            newTasks.forEach(task => {
                const exists = state.assignedTasks.some(t => t.id === task.id);
                if (!exists) {
                    state.assignedTasks.push(task);
                }
            });
        }
    },
    extraReducers: (builder) => {
        builder
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
                        logger.log(`Added ${newTasks.length} new tasks to the queue`);
                    }
                }

                state.lastFetchTime = Date.now();
            })
            .addCase(fetchAndAssignTasks.rejected, (state, action) => {
                state.isLoading = false;
                state.error = action.error.message || 'Failed to assign tasks';
            })
            .addCase(processNextTask.pending, (state) => {
                state.isProcessing = true;
            })
            .addCase(processNextTask.fulfilled, (state) => {
                // Reset processing state if task completed
                state.isProcessing = false;
            })
            .addCase(processNextTask.rejected, (state) => {
                state.isProcessing = false;
            });
    }
});

export const { setCurrentTask, updateTaskStatus, clearAssignedTasks, setProcessingStatus, cleanupProcessingTasks, recoverStuckTasks, addGeneratedTasks } = taskSlice.actions;

/**
 * Generate random proxy tasks based on hardware tier
 */
export const generateProxyTasks = createAsyncThunk(
    'tasks/generateProxyTasks',
    async (_, { getState, dispatch }) => {
        const state = getState() as RootState;
        const userId = state.session?.userProfile?.id;
        const nodeId = state.node?.nodeId;
        const isActive = state.node?.isActive;
        
        if (!userId || !nodeId || !isActive) {
            return [];
        }
        
        // Generate random task count based on hardware tier
        const hardwareTier = state.node?.rewardTier || 'cpu';
        const taskTypes: ('image' | 'text' | '3d' | 'video')[] = ['image', 'text', '3d', 'video'];
        const tasks: AITask[] = [];
        
        // Generate 2-5 tasks
        const taskCount = Math.floor(Math.random() * 3) + 2;
        
        for (let i = 0; i < taskCount; i++) {
            // Select random task type with weighted distribution
            const randomValue = Math.random();
            let selectedType: typeof taskTypes[number];
            
            if (randomValue < TASK_PROCESSING_CONFIG.DISTRIBUTION.image) {
                selectedType = 'image';
            } else if (randomValue < TASK_PROCESSING_CONFIG.DISTRIBUTION.image + TASK_PROCESSING_CONFIG.DISTRIBUTION.text) {
                selectedType = 'text';
            } else if (randomValue < TASK_PROCESSING_CONFIG.DISTRIBUTION.image + TASK_PROCESSING_CONFIG.DISTRIBUTION.text + TASK_PROCESSING_CONFIG.DISTRIBUTION.three_d) {
                selectedType = 'three_d';
            } else {
                selectedType = 'video';
            }
            
            // Create new task
            const task: AITask = {
                id: uuidv4(),
                type: selectedType,
                status: 'pending',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                compute_time: 0,
                user_id: userId,
                node_id: nodeId,
                model: selectedType === 'image' ? 'stable-diffusion-xl' : 
                       selectedType === 'text' ? 'llama-3-8b' : 
                       selectedType === 'three_d' ? '3d-diffusion' : 
                       'stable-video-diffusion',
                prompt: `Generate a ${selectedType === 'image' ? 'realistic image' : 
                          selectedType === 'text' ? 'creative text' : 
                          selectedType === 'three_d' ? '3D model' : 
                          'short video'} of ${Math.random().toString(36).substring(7)}`
            };
            
            tasks.push(task);
        }
        
        if (tasks.length > 0) {
            dispatch(addGeneratedTasks(tasks));
            logger.log(`Generated ${tasks.length} proxy tasks`);
        }
        
            return tasks;
    }
);

// Async thunks
export const fetchAndAssignTasks = createAsyncThunk(
    'tasks/fetchAndAssignTasks',
    async ({ userId, nodeId, batchSize = 5 }, { rejectWithValue, getState, dispatch }) => {
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

            // Generate proxy tasks instead of fetching from API
            const now = Date.now();
            if (now - lastTaskGenTime > 120000) { // Generate new tasks every 2 minutes max
                lastTaskGenTime = now;
                return await dispatch(generateProxyTasks()).unwrap();
            }
            
            return [];
        } catch (error) {
            logger.error('Error generating proxy tasks:', error);
            return rejectWithValue(error.message);
        }
    }
);

export const processNextTask = createAsyncThunk(
    'tasks/processNextTask',
    async (_, { getState, dispatch, rejectWithValue }) => {
        try {
            const state = getState() as RootState;
            const userId = state.session?.userProfile?.id;
            const nodeId = state.node?.nodeId;

            // Exit conditions
            if (!userId || !nodeId || !state.node?.isActive) {
                logger.warn('Cannot process task: Node inactive or user not logged in');
                return rejectWithValue('Node is not active');
            }

            if (isProcessingTask) {
                logger.log(`Already processing task ${currentProcessingTaskId}, skipping`);
                return rejectWithValue({ success: false, message: 'ALREADY_PROCESSING' });
            }

            // Find next pending task
            let taskToProcess = state.tasks.currentTask;

            // If no current task or current task is not pending, find one
            if (!taskToProcess || taskToProcess.status !== 'pending') {
                const pendingTask = state.tasks.assignedTasks.find(task => task.status === 'pending');
                
                if (!pendingTask) {
                    logger.log('No pending tasks available to process');
                    return rejectWithValue({ success: false, message: 'NO_PENDING_TASKS' });
                }

                taskToProcess = pendingTask;
                dispatch(setCurrentTask(pendingTask));
            }

            // Try to acquire processing lock
            if (!taskProcessingLock.acquire(taskToProcess.id)) {
                logger.warn(`Could not acquire processing lock for task ${taskToProcess.id}`);
                return rejectWithValue({ success: false, message: 'Processing lock could not be acquired' });
            }

            // Set global processing state
            isProcessingTask = true;
            currentProcessingTaskId = taskToProcess.id;

            // Step 1: Mark as processing
            dispatch(updateTaskStatus({
                taskId: taskToProcess.id,
                status: 'processing'
            }));

            // Step 2: Process task using proxy service
            logger.log(`Starting to process task ${taskToProcess.id}`);
            const result = await proxyTaskService.processTask(taskToProcess.id, userId);

            // Step 3: Update status based on result
            if (result.success) {
                dispatch(updateTaskStatus({
                    taskId: taskToProcess.id,
                    status: 'completed',
                    result: result.result
                }));
                logger.log(`Task ${taskToProcess.id} completed successfully`);
                
                // Record earnings based on task type and hardware tier
                const taskType = taskToProcess.type;
                const hardwareTier = state.node?.rewardTier || 'cpu';
                
                // Record earnings
                try {
                    await recordTaskEarning(taskToProcess.id, userId, taskType);
                    logger.log(`Recorded earnings for task ${taskToProcess.id}`);
                } catch (err) {
                    logger.error(`Failed to record earnings for task ${taskToProcess.id}:`, err);
                }
            } else if (result.message === 'ALREADY_PROCESSING') {
                // Don't mark as failed if it was just skipped due to another task processing
                // Just leave it in pending state to try again later
                dispatch(updateTaskStatus({
                    taskId: taskToProcess.id,
                    status: 'pending'
                }));
            } else {
                // Mark as failed for other errors
                dispatch(updateTaskStatus({
                    taskId: taskToProcess.id,
                    status: 'failed'
                }));
                logger.warn(`Task ${taskToProcess.id} failed: ${result.message || 'Unknown error'}`);
            }

            // Release processing lock and reset state
            taskProcessingLock.release();
            isProcessingTask = false;
            currentProcessingTaskId = null;

            return result;
        } catch (error) {
            // Clean up if there was an error
            logger.error('Error processing task:', error);
            
            // Release lock and reset state
            taskProcessingLock.release();
            isProcessingTask = false;
            currentProcessingTaskId = null;
            
            return rejectWithValue(error);
        }
    }
);

/**
 * Initialize uptime tracking for proxy tasks
 */
export const startUptimeTracking = () => {
    if (uptimeTimer) {
        clearInterval(uptimeTimer);
    }
    
    uptimeSeconds = 0;
    uptimeTimer = setInterval(() => {
        const state = storeRef?.getState();
        if (state?.node?.isActive) {
            uptimeSeconds++;
            
            // Every 10 minutes (600 seconds), generate tasks
            if (uptimeSeconds > 0 && uptimeSeconds % 600 === 0) {
                const now = Date.now();
                if (now - lastTaskGenTime > 590000) { // Prevent multiple generations
                    lastTaskGenTime = now;
                    generateProxyTasks();
                }
            }
        }
    }, 1000);
};

/**
 * Stop uptime tracking
 */
export const stopUptimeTracking = () => {
    if (uptimeTimer) {
        clearInterval(uptimeTimer);
        uptimeTimer = null;
    }
};

export const startTaskPolling = (dispatch, userId, nodeId) => {
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
    
    // Check for tasks immediately
    if (userId && nodeId) {
        dispatch(fetchAndAssignTasks({ userId, nodeId }));
    }

    // Start uptime tracking
    startUptimeTracking();
    
    // Start polling with increasing interval if fetch fails
    let consecutiveFailures = 0;
    
    pollingInterval = setInterval(() => {
        if (!userId || !nodeId) {
                return;
        }
        
        // Skip if already processing
        const state = storeRef?.getState();
        if (state?.tasks?.isProcessing) {
            return;
        }

        // Dispatch with backoff on failure
        dispatch(fetchAndAssignTasks({ userId, nodeId }))
            .unwrap()
            .then(() => {
                consecutiveFailures = 0;
            })
            .catch(() => {
                consecutiveFailures++;
            });
            
    }, TASK_PROCESSING_CONFIG.POLLING_INTERVAL);
    
    return pollingInterval;
};

export const stopTaskPolling = () => {
        if (pollingInterval) {
            clearInterval(pollingInterval);
            pollingInterval = null;
        }
    
    // Stop uptime tracking
    stopUptimeTracking();
};

export default taskSlice.reducer;