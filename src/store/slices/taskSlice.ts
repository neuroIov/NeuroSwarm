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

            // Clear current task if it's completed or failed
            if (state.currentTask?.id === taskId && (status === 'completed' || status === 'failed')) {
                // Look for next pending task
                const nextTask = state.assignedTasks.find(t => t.status === 'pending');
                state.currentTask = nextTask || null;
            }
        },
        clearAssignedTasks: (state) => {
            state.assignedTasks = [];
            state.currentTask = null;
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
                // Do nothing on pending
            })
            .addCase(processNextTask.fulfilled, (state, action) => {
                if (action.payload.success) {
                    // The task status update is handled by the updateTaskStatus reducer
                    // Just ensure we have a current task
                    if (!state.currentTask) {
                        const nextTask = state.assignedTasks.find(t => t.status === 'pending');
                        if (nextTask) state.currentTask = nextTask;
                    }
                }
            })
            .addCase(processNextTask.rejected, (state) => {
                // Just ensure we have a current task
                if (!state.currentTask) {
                    const nextTask = state.assignedTasks.find(t => t.status === 'pending');
                    if (nextTask) state.currentTask = nextTask;
                }
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

            const assignedTasks = await assignTasksToUser(userId, nodeId, batchSize);
            return assignedTasks;
        } catch (error) {
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

            if (!userId) {
                return rejectWithValue('No user ID available');
            }

            // Get the current task or find next pending task
            let taskToProcess = state.tasks.currentTask;

            if (!taskToProcess || taskToProcess.status !== 'pending') {
                taskToProcess = state.tasks.assignedTasks.find(t => t.status === 'pending');

                if (taskToProcess) {
                    dispatch(setCurrentTask(taskToProcess));
                } else {
                    return rejectWithValue('No pending tasks to process');
                }
            }

            // Process the task
            const result = await processTask(taskToProcess.id, userId);

            // Update the task status in the store
            if (result.success) {
                dispatch(updateTaskStatus({
                    taskId: taskToProcess.id,
                    status: 'completed',
                    result: result.result
                }));
            } else {
                dispatch(updateTaskStatus({
                    taskId: taskToProcess.id,
                    status: 'failed'
                }));
            }

            return result;
        } catch (error) {
            return rejectWithValue(error.message);
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
        dispatch(fetchPendingTasks());

        // If we have less than 3 pending tasks left, fetch more
        if (storeRef) {
            const state = storeRef.getState();
            const pendingTaskCount = state.tasks.assignedTasks.filter(t => t.status === 'pending').length;

            if (pendingTaskCount < 3 && userId) {
                dispatch(fetchAndAssignTasks({ userId, nodeId }));
            }
        }
    }, 20000);

    return () => {
        if (pollingInterval) {
            clearInterval(pollingInterval);
        }
    };
};

// Process tasks continuously (one after another)
export const startTaskProcessing = (dispatch, userId) => {
    const processLoop = async () => {
        try {
            // Get current state
            if (!storeRef) return;

            const state = storeRef.getState();
            const hasPendingTasks = state.tasks.assignedTasks.some(t => t.status === 'pending');
            const isProcessing = state.tasks.assignedTasks.some(t => t.status === 'processing');

            // If we have pending tasks and nothing is processing, start the next task
            if (hasPendingTasks && !isProcessing) {
                await dispatch(processNextTask()).unwrap();
            }

            // Check if we should fetch more tasks
            const pendingTaskCount = state.tasks.assignedTasks.filter(t => t.status === 'pending').length;
            if (pendingTaskCount < 3 && userId) {
                const nodeId = state.tasks.assignedTasks[0]?.node_id || 'default-node';
                await dispatch(fetchAndAssignTasks({ userId, nodeId }));
            }
        } catch (error) {
            logger.error('Error in task processing loop:', error);
        } finally {
            // Continue the loop after a small delay
            setTimeout(processLoop, 5000);
        }
    };

    // Start the processing loop
    processLoop();
};

export const { setCurrentTask, updateTaskStatus, clearAssignedTasks } = taskSlice.actions;

export default taskSlice.reducer;