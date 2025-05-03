import { createSlice, createAsyncThunk, PayloadAction, Dispatch, AnyAction } from '@reduxjs/toolkit';
import { AITask, TaskStatus } from '@/services/types';
import {
    getRecentTasks,
    updateTaskStatus,
    getPendingTasks
} from '@/services/taskService';
import { assignTasksToNode, refreshAndStoreTasks } from '@/services/swarmTaskService';
import { taskCache } from '@/services/taskCacheService';
import { taskPollingService } from '@/services/taskPollingService';
import { TASK_PROCESSING_CONFIG } from '@/services/config';
import { AppDispatch } from '@/store';
import { getSwarmSupabase } from '@/lib/supabase-client';
import { logger } from '@/utils/logger';

export interface TasksState {
    allTasks: AITask[];
    assignedTasks: AITask[];
    currentTask: AITask | null;
    isLoading: boolean;
    error: string | null;
    lastFetchTime: number;
}

const initialState: TasksState = {
    allTasks: [],
    assignedTasks: [],
    currentTask: null,
    isLoading: false,
    error: null,
    lastFetchTime: 0
};

// Function to check if we should fetch tasks or use cached data
const shouldFetchTasks = (state: TasksState, forceRefresh: boolean = false): boolean => {
    const now = Date.now();
    const timeSinceLastFetch = now - state.lastFetchTime;
    const hasTasks = state.allTasks.length > 0;

    // Always fetch if forced, no tasks, or last fetch was more than polling interval
    return forceRefresh || !hasTasks || timeSinceLastFetch > TASK_PROCESSING_CONFIG.POLLING_INTERVAL;
};

// Initialize polling service
let pollingInitialized = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const initPollingService = (dispatch: any) => {
    if (pollingInitialized) return;

    taskPollingService.setCallbacks({
        onNewTasks: (tasks) => {
            dispatch(addNewTasks(tasks));
        },
        onTasksFetched: (count) => {
            if (count > 0) {
                dispatch(fetchTasks({ forceRefresh: false }));
            }
        },
        onError: (error) => {
            console.error('Task polling error:', error);
        }
    });

    taskPollingService.start();
    pollingInitialized = true;
};

// Local helper function for task fetching  
const fetchAndConvertTasks = async (limit: number): Promise<AITask[]> => {
    // Just use getRecentTasks directly now that it fetches from the main tasks table
    return await getRecentTasks(limit);
};

// Async thunks
export const fetchTasks = createAsyncThunk(
    'tasks/fetchTasks',
    async ({ forceRefresh = false }: { forceRefresh?: boolean } = {}, { getState, dispatch, rejectWithValue }) => {
        try {
            // Initialize polling service if not already done
            initPollingService(dispatch);

            const state = getState() as { tasks: TasksState };

            // Check if we should fetch tasks or use cached data
            if (!forceRefresh && !shouldFetchTasks(state.tasks, forceRefresh)) {
                // Reduce logging frequency
                if (Math.random() < 0.1) {
                    console.log('Using cached tasks - fetch skipped');
                }
                return taskCache.tasks.slice(0, 20);
            }

            // Use the cached tasks if available
            if (taskCache.tasks.length > 0 && !taskCache.isStale && !forceRefresh) {
                // Reduce logging frequency
                if (Math.random() < 0.2) {
                    console.log(`Using ${taskCache.tasks.length} cached tasks`);
                }
                return taskCache.tasks.slice(0, 20);
            }

            // Fetch new tasks using our optimized function
            const tasks = await fetchAndConvertTasks(20);

            // Only log task fetching if we actually got new tasks or on occasion
            if (tasks.length > 0 || Math.random() < 0.2) {
                console.log(`Fetched ${tasks.length} tasks total`);

                // More detailed logs less frequently
                if (Math.random() < 0.3) {
                    console.log(`Image tasks: ${tasks.filter(t => t.type === "image").length}`);
                    console.log(`Text tasks: ${tasks.filter(t => t.type === "text").length}`);
                }
            }

            return tasks;
        } catch (error) {
            return rejectWithValue((error as Error).message);
        }
    }
);

export const fetchAndAssignTasks = createAsyncThunk(
    'tasks/fetchAndAssignTasks',
    async (nodeId: string, { getState, rejectWithValue, dispatch }) => {
        try {
            // Initialize polling service if not already done
            initPollingService(dispatch);

            // Get the current user ID from the session state
            const state = getState() as { session: { userProfile: { id: string } } };
            const userId = state.session?.userProfile?.id;

            if (!userId) {
                logger.warn('No user ID available for task assignment');
            }

            // Try to refresh tasks from source if needed (this is an efficient operation)
            await refreshAndStoreTasks();

            // Use the swarmTaskService to assign tasks to node and user (with specified limit and proper distribution)
            const assignedTasks = await assignTasksToNode(nodeId, 5, userId);

            // If we successfully assigned tasks, return them
            if (assignedTasks.length > 0) {
                logger.log(`Successfully assigned ${assignedTasks.length} tasks to node ${nodeId} and user ${userId || 'guest'}`);
                return assignedTasks;
            }

            // If no tasks were assigned, try fallback to pending tasks as a last resort
            logger.log('No tasks assigned through primary method, trying fallback');

            // Get pending tasks from regular task service (limit to 5)
            const pendingTasks = await getPendingTasks(5);

            if (pendingTasks.length === 0) {
                logger.log('No pending tasks available for assignment');
                return [];
            }

            // Create assigned tasks with user_id and node_id
            const tasksWithNodeId = pendingTasks.map(task => ({
                ...task,
                node_id: nodeId,
                user_id: userId || task.user_id,
                status: 'pending' as TaskStatus
            }));

            if (tasksWithNodeId.length === 0) {
                return [];
            }

            // Update all tasks in a single batch operation to reduce API calls
            // Create a batch update object for all tasks
            const client = getSwarmSupabase();
            const taskIds = tasksWithNodeId.map(task => task.id);
            const timestamp = new Date().toISOString();

            // Single update operation for all tasks
            const { error: updateError } = await client
                .from('tasks')
                .update({
                    user_id: userId,
                    node_id: nodeId,
                    updated_at: timestamp
                })
                .in('id', taskIds);

            if (updateError) {
                logger.error('Error updating tasks in batch:', updateError);
                return rejectWithValue('Failed to update tasks');
            }

            logger.log(`Successfully assigned ${tasksWithNodeId.length} tasks via fallback method`);

            // Return properly formatted tasks
            return tasksWithNodeId.map(task => ({
                ...task,
                updated_at: timestamp
            }));
        } catch (error) {
            return rejectWithValue((error as Error).message);
        }
    }
);

export const updateTask = createAsyncThunk(
    'tasks/updateTask',
    async ({
        taskId,
        status,
        result
    }: {
        taskId: string;
        status: TaskStatus;
        result?: string
    }, { rejectWithValue }) => {
        try {
            await updateTaskStatus(taskId, status, result);

            // Update the task in the cache
            taskCache.updateTask(taskId, { status, result });

            return { taskId, status, result };
        } catch (error) {
            return rejectWithValue((error as Error).message);
        }
    }
);

export const taskSlice = createSlice({
    name: 'tasks',
    initialState,
    reducers: {
        setCurrentTask: (state, action: PayloadAction<AITask | null>) => {
            state.currentTask = action.payload;
        },
        updateTaskProgress: (state, action: PayloadAction<{
            taskId: string;
            status: TaskStatus;
            result?: string;
        }>) => {
            const { taskId, status, result } = action.payload;

            // Update in all tasks
            const taskIndex = state.allTasks.findIndex(task => task.id === taskId);
            if (taskIndex !== -1) {
                state.allTasks[taskIndex].status = status;
                if (result) {
                    state.allTasks[taskIndex].result = result;
                }
            }

            // Update in assigned tasks
            const assignedTaskIndex = state.assignedTasks.findIndex(task => task.id === taskId);
            if (assignedTaskIndex !== -1) {
                state.assignedTasks[assignedTaskIndex].status = status;
                if (result) {
                    state.assignedTasks[assignedTaskIndex].result = result;
                }

                // If task is completed or failed, remove it from current task if it's the current one
                if ((status === 'completed' || status === 'failed') && state.currentTask?.id === taskId) {
                    state.currentTask = null;
                }
            }
        },
        clearAssignedTasks: (state) => {
            state.assignedTasks = [];
            state.currentTask = null;
        },
        addNewTasks: (state, action: PayloadAction<AITask[]>) => {
            // Add new tasks to the assigned tasks list
            const newTasks = action.payload.filter(
                newTask => !state.assignedTasks.some(task => task.id === newTask.id)
            );

            if (newTasks.length > 0) {
                state.assignedTasks = [...state.assignedTasks, ...newTasks];

                // Set current task if none is active
                if (!state.currentTask && newTasks.some(task => task.status === 'pending')) {
                    const firstPendingTask = newTasks.find(task => task.status === 'pending');
                    if (firstPendingTask) {
                        state.currentTask = firstPendingTask;
                    }
                }
            }
        },
    },
    extraReducers: (builder) => {
        builder
            // Fetch tasks cases
            .addCase(fetchTasks.pending, (state) => {
                state.isLoading = true;
                state.error = null;
            })
            .addCase(fetchTasks.fulfilled, (state, action) => {
                state.isLoading = false;
                state.lastFetchTime = Date.now();

                // Only add tasks that are not already in the completed assigned tasks
                const completedAssignedTaskIds = state.assignedTasks
                    .filter(t => t.status === 'completed' || t.status === 'failed')
                    .map(t => t.id);

                // Don't filter out pending tasks - they should always be visible
                const pendingTasksFromPayload = action.payload.filter(task => task.status === 'pending');
                const otherTasksFromPayload = action.payload.filter(task =>
                    task.status !== 'pending' && !completedAssignedTaskIds.includes(task.id)
                );

                // Prioritize pending tasks, then add other tasks
                state.allTasks = [...pendingTasksFromPayload, ...otherTasksFromPayload];

                // Log the task breakdown for debugging
                console.log(`Global tasks updated: ${state.allTasks.length} total, ${pendingTasksFromPayload.length} pending, ${otherTasksFromPayload.length} other`);
            })
            .addCase(fetchTasks.rejected, (state, action) => {
                state.isLoading = false;
                state.error = action.payload as string;
                // Don't clear existing tasks on error
            })

            // Fetch and assign tasks cases
            .addCase(fetchAndAssignTasks.pending, (state) => {
                state.isLoading = true;
                state.error = null;
            })
            .addCase(fetchAndAssignTasks.fulfilled, (state, action) => {
                state.isLoading = false;

                // If there are new tasks, add them to assigned tasks
                if (action.payload.length > 0) {
                    // Filter out tasks that are already in the assigned tasks list
                    const newTasks = action.payload.filter(
                        newTask => !state.assignedTasks.some(task => task.id === newTask.id)
                    );

                    state.assignedTasks = [...state.assignedTasks, ...newTasks];

                    // Add assigned tasks to all tasks if they don't exist already
                    newTasks.forEach(task => {
                        if (!state.allTasks.some(t => t.id === task.id)) {
                            state.allTasks.push(task);
                        }
                    });

                    // Set the first pending task as current if there's no current task
                    if (!state.currentTask) {
                        const firstPendingTask = state.assignedTasks.find(task => task.status === 'pending');
                        if (firstPendingTask) {
                            state.currentTask = firstPendingTask;
                        }
                    }
                }
            })
            .addCase(fetchAndAssignTasks.rejected, (state, action) => {
                state.isLoading = false;
                state.error = action.payload as string;
            })

            // Update task cases
            .addCase(updateTask.fulfilled, (state, action) => {
                const { taskId, status, result } = action.payload;

                // Update in all tasks
                const taskIndex = state.allTasks.findIndex(task => task.id === taskId);
                if (taskIndex !== -1) {
                    state.allTasks[taskIndex].status = status;
                    if (result) {
                        state.allTasks[taskIndex].result = result;
                    }

                    // If task is completed or failed, remove it from global tasks list
                    // This will allow new pending tasks to become visible
                    if (status === 'completed' || status === 'failed') {
                        state.allTasks = state.allTasks.filter(task => task.id !== taskId);

                        // After removing, check if we need to fetch more tasks
                        if (state.allTasks.length < 30) {
                            console.log('Task completed, global task count reduced - will fetch more tasks on next refresh');
                        }
                    }
                }

                // Update in assigned tasks
                const assignedTaskIndex = state.assignedTasks.findIndex(task => task.id === taskId);
                if (assignedTaskIndex !== -1) {
                    state.assignedTasks[assignedTaskIndex].status = status;
                    if (result) {
                        state.assignedTasks[assignedTaskIndex].result = result;
                    }
                }

                // If the current task is completed or failed, move to the next pending task
                if ((status === 'completed' || status === 'failed') && state.currentTask?.id === taskId) {
                    const nextPendingTask = state.assignedTasks.find(task => task.status === 'pending');
                    state.currentTask = nextPendingTask || null;
                }
            })
    },
});

export const {
    setCurrentTask,
    updateTaskProgress,
    clearAssignedTasks,
    addNewTasks
} = taskSlice.actions;

export default taskSlice.reducer; 