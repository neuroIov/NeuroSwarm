import { refreshAndStoreTasks } from './swarmTaskService';
import { TASK_PROCESSING_CONFIG } from './config';
import { logger } from '../utils/logger';
import { taskCache } from './taskCacheService';
import { AITask } from './types';
import { getRecentTasks } from './taskService';

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

            // First fetch new tasks - handle errors gracefully
            let tasks: AITask[] = [];
            try {
                tasks = await getRecentTasks(batchSize);
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

            // Then create any new tasks in the swarm table - but less frequently
            // Only refresh and store tasks if:
            // 1. We haven't done it recently
            // 2. We don't have many tasks cached already
            // 3. Random chance to avoid all clients refreshing simultaneously
            const shouldRefreshTasks = (
                timeSinceLastPoll > 60000 || // At least 1 minute since last poll
                tasks.length < 5 ||          // Few tasks available
                Math.random() < 0.2          // 20% random chance
            );

            let newTasksCreated = 0;

            if (shouldRefreshTasks) {
                try {
                    newTasksCreated = await refreshAndStoreTasks();
                } catch (refreshError) {
                    logger.error('Error refreshing tasks:', refreshError);
                }
            }

            // Call callbacks if provided and something changed
            if (newTasksCreated > 0 && this.callbacks.onNewTasks) {
                this.callbacks.onNewTasks(taskCache.tasks.slice(0, newTasksCreated));
            }

            if (this.callbacks.onTasksFetched && tasks.length !== startTaskCount) {
                this.callbacks.onTasksFetched(tasks.length);
            }

            // Only log when something meaningful happens or occasionally for feedback
            const shouldLog = newTasksCreated > 0 ||
                tasks.length !== startTaskCount ||
                Math.random() < 0.1; // 10% chance to log anyway

            if (shouldLog) {
                logger.log(`Poll complete: ${tasks.length} tasks in cache${newTasksCreated > 0 ? `, ${newTasksCreated} new tasks added` : ''}`);
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