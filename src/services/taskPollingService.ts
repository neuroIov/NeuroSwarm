import { getQueuedTasks, assignTasksToUser } from './swarmTaskService';
import { TASK_PROCESSING_CONFIG } from './config';
import { logger } from '../utils/logger';
import { taskCache } from './taskCacheService';
import { AITask } from './types';
import { getPendingUnassignedTasks } from './taskService';
import { store } from '@/store';
import {
    fetchPendingTasks,
    fetchAndAssignTasks,
    processNextTask,
    setStoreRef,
    startTaskPolling,
    startTaskProcessing,
    recoverStuckTasks
} from '@/store/slices/taskSlice';

// Initialize store reference for taskSlice
// This allows the Redux slice to access the store for polling operations
setStoreRef(store);

// Note: This service now integrates with the Redux task management system.
// Core task operations (fetching, assigning, processing) are now handled through
// Redux actions while maintaining the existing polling infrastructure.

type PollingCallbacks = {
    onNewTasks?: (tasks: AITask[]) => void;
    onTasksFetched?: (count: number) => void;
    onError?: (error: Error | unknown) => void;
};

class TaskPollingService {
    private pollingInterval: number | NodeJS.Timeout | null = null;
    private callbacks: PollingCallbacks = {};
    private isPolling = false;
    private isCurrentlyFetching = false;
    private lastPollTime = 0;
    private consecutiveEmptyFetches = 0;
    private consecutiveErrors = 0;
    private hasActiveTaskProcessing = false;

    /**
     * Start polling for new tasks
     */
    start(callbacks?: PollingCallbacks, customInterval?: number): void {
        // Don't start if already polling
        if (this.isPolling) {
            logger.log('Task polling is already active');
            return;
        }

        if (callbacks) {
            this.callbacks = callbacks;
        }

        this.isPolling = true;

        // First poll with 3-second delay to allow app to initialize
        setTimeout(() => this.poll(), 3000);

        // Calculate polling interval with adaptive timing
        const baseInterval = customInterval || TASK_PROCESSING_CONFIG.POLLING_INTERVAL;

        // Use a longer initial interval to avoid startup congestion
        const initialInterval = baseInterval * 1.5;

        this.pollingInterval = setInterval(() => {
            this.adaptivePolling();
        }, initialInterval);

        logger.log(`Started task polling service (base interval: ${baseInterval / 1000}s)`);
    }

    /**
     * Adaptively schedule polling based on system conditions
     */
    private adaptivePolling(): void {
        // Skip if already fetching
        if (this.isCurrentlyFetching) {
            logger.log('Already fetching tasks, skipping this poll');
            return;
        }

        // If we have a processing task, use longer intervals
        if (taskCache.isProcessingTask) {
            // If we're processing a task, only poll 1/3 of the time
            if (Math.random() > 0.3) {
                return;
            }
        }

        // Apply exponential backoff if we keep getting empty results
        if (this.consecutiveEmptyFetches > 2) {
            const backoffFactor = Math.min(this.consecutiveEmptyFetches - 1, 4); // Max 4x backoff
            if (Math.random() > 1 / backoffFactor) {
                this.consecutiveEmptyFetches--; // Slowly recover
                return;
            }
        }

        // Check if we should throttle based on cache conditions
        if (taskCache.shouldThrottleFetch) {
            logger.log('Throttling task poll based on cache conditions');
            return;
        }

        // Don't poll if we're actively processing a task (let it finish first)
        if (this.hasActiveTaskProcessing) {
            logger.log('Task processing active, deferring poll');
            return;
        }

        // Perform the actual poll
        this.poll();
    }

    /**
     * Stop polling for new tasks
     */
    stop(): void {
        if (!this.isPolling) return;

        if (this.pollingInterval) {
            clearInterval(this.pollingInterval as NodeJS.Timeout);
            this.pollingInterval = null;
        }

        this.isPolling = false;
        logger.log('Stopped task polling service');
    }

    /**
     * Set active task processing state to coordinate polling
     */
    setActiveTaskProcessing(active: boolean): void {
        this.hasActiveTaskProcessing = active;
    }

    /**
     * Check for available unassigned tasks in the swarm database
     * @returns The number of available tasks
     */
    private async checkAvailableTasks(): Promise<number> {
        try {
            // Get a small sample of unassigned tasks to check availability
            const availableTasks = await getQueuedTasks(10);
            return availableTasks.length;
        } catch (error) {
            logger.error('Error checking available tasks:', error);
            return 0;
        }
    }

    /**
     * Poll for new tasks
     */
    private async poll(): Promise<void> {
        // Prevent multiple simultaneous polls
        if (this.isCurrentlyFetching) {
            return;
        }

        // Check if we polled very recently
        const now = Date.now();
        const timeSinceLastPoll = now - this.lastPollTime;

        if (timeSinceLastPoll < 5000) { // Less than 5 seconds ago
            if (Math.random() < 0.1) { // Only log occasionally
                logger.log('Polling too frequently, skipping this poll');
            }
            return;
        }

        this.lastPollTime = now;
        this.isCurrentlyFetching = true;

        try {
            const startTaskCount = taskCache.tasks.length;

            // Use a smaller batch size when fetching to reduce load
            const batchSize = 20; // Standard size for global view

            // Don't fetch if we're actively processing a task (let it finish first)
            if (this.hasActiveTaskProcessing) {
                logger.log('Task processing active, skipping fetch');
                this.isCurrentlyFetching = false;
                return;
            }

            // Check for stuck tasks and recover them (every 5 polls)
            if (Math.random() < 0.2) { // 20% chance to check for stuck tasks
                // Get Redux state to check for stuck tasks
                const state = store.getState();
                const processingTasks = state.tasks.assignedTasks.filter(t => t.status === 'processing');

                if (processingTasks.length > 0) {
                    const oldestProcessingTime = Math.min(
                        ...processingTasks.map(t =>
                            new Date(t.updated_at || 0).getTime()
                        )
                    );

                    // Calculate max task processing time to determine if task is truly stuck
                    // Get max processing time based on task type and hardware tier
                    const state = store.getState();
                    const rewardTier = state.node?.rewardTier || 'cpu';
                    const maxProcessingTime = Math.max(
                        TASK_PROCESSING_CONFIG.PROCESSING_TIME.image * TASK_PROCESSING_CONFIG.HARDWARE_MULTIPLIERS[rewardTier],
                        TASK_PROCESSING_CONFIG.PROCESSING_TIME.text * TASK_PROCESSING_CONFIG.HARDWARE_MULTIPLIERS[rewardTier]
                    ) * 1000; // Convert to milliseconds
                    
                    // Add a larger 60 seconds buffer to accommodate any delays
                    const stuckThreshold = maxProcessingTime + 60000;
                    
                    // Only recover tasks that have been processing longer than the max time + buffer
                    if (now - oldestProcessingTime > stuckThreshold) {
                        logger.warn(`Found stuck tasks in processing state (oldest: ${(now - oldestProcessingTime) / 1000}s, threshold: ${stuckThreshold / 1000}s), recovering...`);
                        store.dispatch(recoverStuckTasks());
                    }
                }
            }

            // First fetch new tasks - handle errors gracefully
            let tasks: AITask[] = [];
            try {
                // Use the Redux store's fetchPendingTasks action
                await store.dispatch(fetchPendingTasks());

                // Get tasks from the service directly for the cache
                tasks = await getPendingUnassignedTasks(batchSize);
                taskCache.setTasks(tasks, true); // Mark as successful fetch
                this.consecutiveErrors = 0;
            } catch (fetchError) {
                logger.error('Error fetching tasks:', fetchError);
                this.consecutiveErrors++;

                // Use cached tasks if available
                tasks = taskCache.tasks;
                taskCache.setTasks(tasks, false); // Mark as failed fetch

                // If we fail too many times, notify but don't stop
                if (this.consecutiveErrors >= 3) {
                    logger.error(`Failed to fetch tasks ${this.consecutiveErrors} times in a row`);
                    this.callbacks.onError?.(new Error('Consecutive fetch failures'));
                }
            }

            // Track empty fetches to adapt polling frequency
            if (tasks.length === 0) {
                this.consecutiveEmptyFetches++;
            } else {
                this.consecutiveEmptyFetches = 0;
            }

            // Check available tasks in the swarm database instead of refreshing
            // Only check if:
            // 1. We haven't done it recently
            // 2. We don't have many tasks cached already
            // 3. Random chance to avoid all clients checking simultaneously
            const shouldCheckAvailability = (
                timeSinceLastPoll > 60000 || // At least 1 minute since last poll
                tasks.length < 5 ||          // Few tasks available
                Math.random() < 0.2          // 20% random chance
            );

            let availableTaskCount = 0;

            if (shouldCheckAvailability) {
                try {
                    availableTaskCount = await this.checkAvailableTasks();

                    if (availableTaskCount > 0) {
                        logger.log(`Found ${availableTaskCount} unassigned tasks available in the swarm database`);

                        // Notify about available tasks
                        if (this.callbacks.onNewTasks) {
                            const availableTasks = await getQueuedTasks(5);
                            this.callbacks.onNewTasks(availableTasks);
                        }
                    }
                } catch (checkError) {
                    logger.error('Error checking available tasks:', checkError);
                }
            }

            // Call callbacks if something changed
            if (this.callbacks.onTasksFetched && tasks.length !== startTaskCount) {
                this.callbacks.onTasksFetched(tasks.length);
            }

            // Only log when something meaningful happens or occasionally for feedback
            const shouldLog = availableTaskCount > 0 ||
                tasks.length !== startTaskCount ||
                Math.random() < 0.1; // 10% chance to log anyway

            if (shouldLog) {
                logger.log(`Poll complete: ${tasks.length} tasks in cache${availableTaskCount > 0 ? `, ${availableTaskCount} unassigned tasks available` : ''}`);
            }
        } catch (error) {
            logger.error('Error during task polling:', error);

            if (this.callbacks.onError) {
                this.callbacks.onError(error);
            }
        } finally {
            this.isCurrentlyFetching = false;
        }
    }

    /**
     * Force an immediate poll
     */
    forcePoll(): Promise<void> {
        return this.poll();
    }

    /**
     * Set callbacks for polling events
     */
    setCallbacks(callbacks: PollingCallbacks): void {
        this.callbacks = callbacks;
    }
}

// Create a singleton instance
export const taskPollingService = new TaskPollingService();

/**
 * Initialize task polling and processing for the current user
 */
export const initializeTaskServices = (userId: string, nodeId: string) => {
    if (!userId) {
        logger.error('Cannot initialize task services: No user ID provided');
        return;
    }

    logger.log(`Initializing task services for user ${userId} on node ${nodeId}`);

    // Start polling for new tasks (using Redux implementation)
    const stopPolling = startTaskPolling(store.dispatch, userId, nodeId);

    // Start task processing pipeline (using Redux implementation)
    const stopProcessing = startTaskProcessing(store.dispatch, userId);

    return {
        stopPolling,
        stopProcessing
    };
};

/**
 * Manual trigger to assign new tasks to the current user
 */
export const manuallyAssignTasks = async (userId: string, nodeId: string, batchSize = 5) => {
    if (!userId) {
        logger.error('Cannot assign tasks: No user ID provided');
        return [];
    }

    try {
        // Signal that we're about to perform task assignment
        taskPollingService.setActiveTaskProcessing(true);

        // Use the Redux action to assign tasks
        const result = await store.dispatch(
            fetchAndAssignTasks({ userId, nodeId, batchSize })
        ).unwrap();

        return result;
    } catch (error) {
        logger.error('Error manually assigning tasks:', error);
        return [];
    } finally {
        // Signal that we're done with task assignment
        taskPollingService.setActiveTaskProcessing(false);
    }
};

/**
 * Process a single task from the queue
 */
export const processSingleTask = async () => {
    try {
        // Signal that we're about to process a task
        taskPollingService.setActiveTaskProcessing(true);

        // Use the Redux action to process the next task
        const result = await store.dispatch(processNextTask()).unwrap();
        return result;
    } catch (error) {
        logger.error('Error processing single task:', error);
        return { success: false };
    } finally {
        // Signal that we're done with task processing
        taskPollingService.setActiveTaskProcessing(false);
    }
}; 