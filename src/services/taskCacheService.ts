import { AITask } from './types';
import { logger } from '@/utils/logger';
import { safeStorage } from '@/utils/storage';
import { TASK_PROCESSING_CONFIG } from './config';

// Define a type for task processing result
interface TaskProcessingResult {
    success: boolean;
    result?: string;
}

type LocalCache = {
    tasks: AITask[];
    lastFetchTime: number;
    addedToSwarm: Set<string>; // Track which task prompts have been added to Swarm DB
    processingTask: AITask | null; // Track currently processing task
    lastSuccessfulFetch: number; // Track last successful fetch time
    fetchFailureCount: number; // Track consecutive fetch failures
    processingPromises: Map<string, Promise<TaskProcessingResult>>; // Track task processing promises
};

class TaskCacheService {
    private _cache: LocalCache = {
        tasks: [],
        lastFetchTime: 0,
        addedToSwarm: new Set<string>(),
        processingTask: null,
        lastSuccessfulFetch: 0,
        fetchFailureCount: 0,
        processingPromises: new Map()
    };

    // Minimum time between API calls in milliseconds
    private readonly MIN_FETCH_INTERVAL = 15000; // 15 seconds

    // Maximum time cache is considered valid
    private readonly MAX_CACHE_AGE = 120000; // 2 minutes

    constructor() {
        this.loadFromLocalStorage();
    }

    /**
     * Get all tasks from cache
     */
    get tasks(): AITask[] {
        return this._cache.tasks;
    }

    /**
     * Get timestamp of last fetch
     */
    get lastFetchTime(): number {
        return this._cache.lastFetchTime;
    }

    /**
     * Get currently processing task
     */
    get processingTask(): AITask | null {
        return this._cache.processingTask;
    }

    /**
     * Set currently processing task with proper locking
     */
    setProcessingTask(task: AITask | null): boolean {
        // If we're trying to set null (clear) but the current task is different than what was provided
        // This prevents race conditions when multiple tasks are being processed
        if (!task && this._cache.processingTask && task?.id !== this._cache.processingTask.id) {
            return false;
        }

        // If we're trying to set a task, but there's already a different task processing
        if (task && this._cache.processingTask && task.id !== this._cache.processingTask.id) {
            logger.warn(`Cannot set processing task ${task.id} - already processing ${this._cache.processingTask.id}`);
            return false;
        }

        this._cache.processingTask = task;
        this.saveToLocalStorage();
        return true;
    }

    /**
     * Store a task processing promise by task ID
     */
    setProcessingPromise(taskId: string, promise: Promise<TaskProcessingResult>): void {
        this._cache.processingPromises.set(taskId, promise);
    }

    /**
     * Get a task processing promise by task ID
     */
    getProcessingPromise(taskId: string): Promise<TaskProcessingResult> | undefined {
        return this._cache.processingPromises.get(taskId);
    }

    /**
     * Check if we're already processing a task
     */
    get isProcessingTask(): boolean {
        return this._cache.processingTask !== null;
    }

    /**
     * Get ID of currently processing task, if any
     */
    get processingTaskId(): string | null {
        return this._cache.processingTask?.id || null;
    }

    /**
     * Check if cache is stale and needs refreshing
     */
    get isStale(): boolean {
        const now = Date.now();

        // Cache is stale if it's older than MAX_CACHE_AGE
        const isTooOld = now - this._cache.lastSuccessfulFetch > this.MAX_CACHE_AGE;

        // Cache is stale if we have no tasks
        const isEmpty = this._cache.tasks.length === 0;

        // Cache is stale if we've had fetch failures but not too recently
        const isRecoveryNeeded = this._cache.fetchFailureCount > 0 &&
            now - this._cache.lastFetchTime > this.MIN_FETCH_INTERVAL * 2;

        return isTooOld || isEmpty || isRecoveryNeeded;
    }

    /**
     * Check if we should throttle API calls
     */
    get shouldThrottleFetch(): boolean {
        // Don't throttle if we're processing a task - we need to keep checking for status updates
        if (this.isProcessingTask) {
            return false;
        }

        const now = Date.now();

        // Always throttle if we've fetched very recently
        const isTooSoon = now - this._cache.lastFetchTime < this.MIN_FETCH_INTERVAL;

        // Don't throttle if cache is empty
        const hasNoTasks = this._cache.tasks.length === 0;

        // Apply exponential backoff for consecutive failures
        const backoffTime = this.MIN_FETCH_INTERVAL * Math.pow(2, this._cache.fetchFailureCount);
        const isBackingOff = this._cache.fetchFailureCount > 0 &&
            now - this._cache.lastFetchTime < backoffTime;

        return (isTooSoon || isBackingOff) && !hasNoTasks;
    }

    /**
     * Get tasks by type from cache
     */
    getTasksByType(type: string): AITask[] {
        return this._cache.tasks.filter(task => task.type === type);
    }

    /**
     * Set cached tasks and record fetch status
     */
    setTasks(tasks: AITask[], success: boolean = true): void {
        // Replace the tasks, but keep the currently processing task in the list
        if (this._cache.processingTask) {
            const processingTaskId = this._cache.processingTask.id;

            // Keep the processing task if it's not in the new list
            if (!tasks.some(task => task.id === processingTaskId)) {
                const existingProcessingTask = this._cache.tasks.find(task => task.id === processingTaskId);
                if (existingProcessingTask) {
                    tasks.push(existingProcessingTask);
                }
            } else {
                // Update status of processing task to reflect it's being processed
                const taskIndex = tasks.findIndex(task => task.id === processingTaskId);
                if (taskIndex !== -1 && tasks[taskIndex].status !== 'processing') {
                    tasks[taskIndex] = {
                        ...tasks[taskIndex],
                        status: 'processing'
                    };
                }
            }
        }

        this._cache.tasks = tasks;
        this._cache.lastFetchTime = Date.now();

        if (success) {
            this._cache.lastSuccessfulFetch = Date.now();
            this._cache.fetchFailureCount = 0;
        } else {
            this._cache.fetchFailureCount++;
            logger.warn(`Task fetch failed, consecutive failures: ${this._cache.fetchFailureCount}`);
        }

        this.saveToLocalStorage();
    }

    /**
     * Find a task in the cache by ID
     */
    getTaskById(taskId: string): AITask | undefined {
        return this._cache.tasks.find(task => task.id === taskId);
    }

    /**
     * Get tasks that haven't been added to Swarm DB yet
     */
    getTasksNotInSwarm(): AITask[] {
        return this._cache.tasks.filter(task =>
            task.prompt && !this._cache.addedToSwarm.has(this.normalizePrompt(task.prompt))
        );
    }

    /**
     * Mark tasks as added to Swarm database to avoid duplication
     */
    markTasksAddedToSwarm(tasks: AITask[]): void {
        tasks.forEach(task => {
            if (task.prompt) {
                this._cache.addedToSwarm.add(this.normalizePrompt(task.prompt));
            }
        });
        this.saveToLocalStorage();
    }

    /**
     * Add new tasks to cache without duplicates
     */
    addTasks(newTasks: AITask[]): AITask[] {
        const existingIds = new Set(this._cache.tasks.map(task => task.id));

        // Filter out tasks that already exist in cache
        const uniqueNewTasks = newTasks.filter(task => !existingIds.has(task.id));

        if (uniqueNewTasks.length > 0) {
            this._cache.tasks = [...this._cache.tasks, ...uniqueNewTasks];
            this._cache.lastFetchTime = Date.now();
            this._cache.lastSuccessfulFetch = Date.now();
            this._cache.fetchFailureCount = 0;
            this.saveToLocalStorage();
        }

        return uniqueNewTasks;
    }

    /**
     * Get tasks newer than the provided timestamp
     */
    getTasksNewerThan(timestamp: number): AITask[] {
        return this._cache.tasks.filter(task => {
            const taskTime = new Date(task.created_at).getTime();
            return taskTime > timestamp;
        });
    }

    /**
     * Remove a task from the cache by ID
     */
    removeTask(taskId: string): void {
        // Don't remove the task if it's currently processing
        if (this._cache.processingTask?.id === taskId) {
            return;
        }

        this._cache.tasks = this._cache.tasks.filter(task => task.id !== taskId);
        this._cache.processingPromises.delete(taskId);
        this.saveToLocalStorage();
    }

    /**
     * Update a task in the cache
     */
    updateTask(taskId: string, updates: Partial<AITask>): void {
        // Update in the main tasks list
        const taskIndex = this._cache.tasks.findIndex(task => task.id === taskId);

        if (taskIndex !== -1) {
            // Create updated task
            const updatedTask = {
                ...this._cache.tasks[taskIndex],
                ...updates
            };

            // If the task is being marked as completed or failed, make sure it's not our processing task
            if (
                (updates.status === 'completed' || updates.status === 'failed') &&
                this._cache.processingTask?.id === taskId
            ) {
                this._cache.processingTask = null;
            }

            // Update in the array
            this._cache.tasks[taskIndex] = updatedTask;
        } else if (updates.status !== 'completed' && updates.status !== 'failed') {
            // If the task isn't in our list but isn't being marked as completed/failed,
            // we should add it to track it
            logger.warn(`Task ${taskId} not found in cache but being updated with status ${updates.status}`);

            // Add it only if we have enough info
            if ('id' in updates && 'status' in updates && 'type' in updates) {
                this._cache.tasks.push(updates as AITask);
            }
        }

        // Also update in processing task if it's the same
        if (this._cache.processingTask?.id === taskId) {
            this._cache.processingTask = {
                ...this._cache.processingTask,
                ...updates
            };
        }

        this.saveToLocalStorage();
    }

    /**
     * Normalize a prompt for consistent comparison
     */
    private normalizePrompt(prompt: string): string {
        return prompt.trim().toLowerCase().replace(/\s+/g, ' ');
    }

    /**
     * Save cache to localStorage
     */
    private saveToLocalStorage(): void {
        try {
            // Save tasks array
            safeStorage.setItem(
                TASK_PROCESSING_CONFIG.STORAGE_KEYS.CACHED_TASKS,
                JSON.stringify(this._cache.tasks)
            );

            // Save timestamps
            safeStorage.setItem(
                TASK_PROCESSING_CONFIG.STORAGE_KEYS.LAST_FETCH_TIMESTAMP,
                this._cache.lastFetchTime.toString()
            );

            safeStorage.setItem(
                'task_cache_last_successful_fetch',
                this._cache.lastSuccessfulFetch.toString()
            );

            // Save processing task
            if (this._cache.processingTask) {
                safeStorage.setItem(
                    'task_cache_processing_task',
                    JSON.stringify(this._cache.processingTask)
                );
            } else {
                safeStorage.removeItem('task_cache_processing_task');
            }

            // Save the set of added prompts
            safeStorage.setItem(
                TASK_PROCESSING_CONFIG.STORAGE_KEYS.ADDED_TO_SWARM,
                JSON.stringify(Array.from(this._cache.addedToSwarm))
            );

            safeStorage.setItem(
                'task_cache_fetch_failure_count',
                this._cache.fetchFailureCount.toString()
            );
        } catch (error) {
            logger.error('Error saving task cache to localStorage:', error);
        }
    }

    /**
     * Load cache from localStorage
     */
    private loadFromLocalStorage(): void {
        try {
            const cachedTasksJson = safeStorage.getItem(TASK_PROCESSING_CONFIG.STORAGE_KEYS.CACHED_TASKS);
            const lastFetchTimeStr = safeStorage.getItem(TASK_PROCESSING_CONFIG.STORAGE_KEYS.LAST_FETCH_TIMESTAMP);
            const addedToSwarmJson = safeStorage.getItem(TASK_PROCESSING_CONFIG.STORAGE_KEYS.ADDED_TO_SWARM);
            const lastSuccessfulFetchStr = safeStorage.getItem('task_cache_last_successful_fetch');
            const processingTaskJson = safeStorage.getItem('task_cache_processing_task');
            const fetchFailureCountStr = safeStorage.getItem('task_cache_fetch_failure_count');

            if (cachedTasksJson) {
                this._cache.tasks = JSON.parse(cachedTasksJson);
            }

            if (lastFetchTimeStr) {
                this._cache.lastFetchTime = parseInt(lastFetchTimeStr, 10);
            }

            if (lastSuccessfulFetchStr) {
                this._cache.lastSuccessfulFetch = parseInt(lastSuccessfulFetchStr, 10);
            }

            if (processingTaskJson) {
                this._cache.processingTask = JSON.parse(processingTaskJson);
            }

            if (fetchFailureCountStr) {
                this._cache.fetchFailureCount = parseInt(fetchFailureCountStr, 10);
            }

            if (addedToSwarmJson) {
                this._cache.addedToSwarm = new Set(JSON.parse(addedToSwarmJson));
            }

            logger.log(`Loaded task cache: ${this._cache.tasks.length} tasks`);
        } catch (error) {
            logger.error('Error loading task cache from localStorage:', error);
        }
    }

    /**
     * Clear the entire cache
     */
    clearCache(): void {
        this._cache.tasks = [];
        this._cache.lastFetchTime = 0;
        this._cache.lastSuccessfulFetch = 0;
        this._cache.addedToSwarm = new Set();
        this._cache.processingTask = null;
        this._cache.fetchFailureCount = 0;
        this._cache.processingPromises.clear();
        this.saveToLocalStorage();
    }
}

// Create a singleton instance
export const taskCache = new TaskCacheService(); 