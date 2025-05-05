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
            // Check for stale locks (over 2 minutes)
            if (Date.now() - this.lockTime > 120000) {
                logger.warn(`Force releasing stale lock on task ${this.currentTaskId}`);
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
        recoverStuckTasks: (state) => {
            // Find tasks stuck in processing state
            const stuckTasks = state.assignedTasks.filter(task => task.status === 'processing');

            // Mark them as failed
            stuckTasks.forEach(task => {
                const index = state.assignedTasks.findIndex(t => t.id === task.id);
                if (index !== -1) {
                    state.assignedTasks[index].status = 'failed';

                    // Also remove from global tasks list if it exists there
                    const globalIndex = state.allTasks.findIndex(t => t.id === task.id);
                    if (globalIndex !== -1) {
                        state.allTasks[globalIndex].status = 'failed';
                    }
                }
            });

            // Reset processing state if current task was stuck
            if (state.currentTask?.status === 'processing') {
                // Look for next pending task
                const nextTask = state.assignedTasks.find(t => t.status === 'pending');
                state.currentTask = nextTask || null;
                state.isProcessing = false;
            }

            // Clear global task processing state
            isProcessingTask = false;
            currentProcessingTaskId = null;

            if (stuckTasks.length > 0) {
                console.log(`Recovered ${stuckTasks.length} stuck tasks`);
            }

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

// Async thunks
export const fetchPendingTasks = createAsyncThunk(
    'tasks/fetchPendingTasks',
    async (_, { rejectWithValue }) => {
        try {
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
    async ({ userId, nodeId, batchSize = 5 }: AssignTasksParams, { rejectWithValue }) => {
        try {
            if (!userId) {
                return rejectWithValue('No user ID provided');
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

    // First fetch immediately
    dispatch(fetchPendingTasks());

    // Assign initial batch of tasks if we have a user ID
    if (userId) {
        dispatch(fetchAndAssignTasks({ userId, nodeId }));
    }

    // Set up polling interval (every 20 seconds)
    pollingInterval = setInterval(() => {
        // Don't poll if we're actively processing a task
        if (isProcessingTask) {
            logger.log('Skipping poll while task is processing');
            return;
        }

        dispatch(fetchPendingTasks());

        // If we have less than 3 pending tasks left, fetch more
        if (storeRef) {
            const state = storeRef.getState();
            const pendingTaskCount = state.tasks.assignedTasks.filter(t => t.status === 'pending').length;

            if (pendingTaskCount < 3 && userId && !isProcessingTask) {
                dispatch(fetchAndAssignTasks({ userId, nodeId }));
            }
        }
    }, 20000);

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
            const stuckTasks = state.tasks.assignedTasks.filter(
                t => t.status === 'processing' &&
                    Date.now() - new Date(t.updated_at || 0).getTime() > 60000 // Stuck for over 1 minute
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
    };
};

export const {
    setCurrentTask,
    updateTaskStatus,
    clearAssignedTasks,
    setProcessingStatus,
    recoverStuckTasks
} = taskSlice.actions;
export default taskSlice.reducer;