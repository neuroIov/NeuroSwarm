import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { AITask, TaskStatus } from '@/services/types';
import {
    getRecentTasks,
    updateTaskStatus,
    getPendingTasks
} from '@/services/taskService';
import { assignTasksToNode, refreshTasks } from '@/services/swarmTaskService';

export interface TasksState {
    allTasks: AITask[];
    assignedTasks: AITask[];
    currentTask: AITask | null;
    isLoading: boolean;
    error: string | null;
}

const initialState: TasksState = {
    allTasks: [],
    assignedTasks: [],
    currentTask: null,
    isLoading: false,
    error: null,
};

// Async thunks
export const fetchTasks = createAsyncThunk(
    'tasks/fetchTasks',
    async (_, { rejectWithValue }) => {
        try {
            // Use fetchAndConvertTasks from swarmTaskService to get tasks from all sources
            const tasks = await getRecentTasks(50);

            // Log details for debugging
            console.log(`Tasks fetched from getRecentTasks: ${tasks.length}`);

            // If we only got a few tasks, try to fetch directly using fetchAndConvertTasks
            if (tasks.length <= 1) {
                const { fetchAndConvertTasks } = await import('@/services/swarmTaskService');
                console.log('Trying to fetch tasks directly with fetchAndConvertTasks');
                const directTasks = await fetchAndConvertTasks(50);
                console.log(`Directly fetched tasks: ${directTasks.length}`);
                return directTasks;
            }

            return tasks;
        } catch (error) {
            return rejectWithValue((error as Error).message);
        }
    }
);

export const fetchAndAssignTasks = createAsyncThunk(
    'tasks/fetchAndAssignTasks',
    async (nodeId: string, { rejectWithValue }) => {
        try {
            // Try to refresh tasks from source tables first
            await refreshTasks(20);

            // Use the swarmTaskService to assign tasks to node (strict limit of 5)
            const assignedTasks = await assignTasksToNode(nodeId, 5);

            // If no tasks were assigned, try fallback to regular pending tasks
            if (assignedTasks.length === 0) {
                // Get pending tasks from regular task service
                const pendingTasks = await getPendingTasks(5);

                // Create assigned tasks
                return pendingTasks.map(task => ({
                    ...task,
                    node_id: nodeId,
                    status: 'pending' as TaskStatus
                }));
            }

            return assignedTasks;
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