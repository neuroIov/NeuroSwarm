import { AITask } from './types';
import { logger } from '../utils/logger';
import { TASK_PROCESSING_CONFIG } from './config';

type LocalCache = {
    tasks: AITask[];
    lastFetchTime: number;
    addedToSwarm: Set<string>; // Track which task prompts have been added to Swarm DB
    processingTask: AITask | null; // Track currently processing task
    lastSuccessfulFetch: number; // Track last successful fetch time
    fetchFailureCount: number; // Track consecutive fetch failures
};

class TaskCacheService {
    private _cache: LocalCache = {
        tasks: [],
        lastFetchTime: 0,
        addedToSwarm: new Set<string>(),
        processingTask: null,
        lastSuccessfulFetch: 0,
        fetchFailureCount: 0
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
     * Set currently processing task
     */
    setProcessingTask(task: AITask | null): void {
        this._cache.processingTask = task;
        this.saveToLocalStorage();
    }

    /**
     * Check if we're already processing a task
     */
    get isProcessingTask(): boolean {
        return this._cache.processingTask !== null;
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
        if (this._cache.processingTask?.id === taskId) {
            this._cache.processingTask = null;
        }

        this._cache.tasks = this._cache.tasks.filter(task => task.id !== taskId);
        this.saveToLocalStorage();
    }

    /**
     * Update a task in the cache
     */
    updateTask(taskId: string, updates: Partial<AITask>): void {
        // Update in the main tasks list
        this._cache.tasks = this._cache.tasks.map(task =>
            task.id === taskId ? { ...task, ...updates } : task
        );

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
            localStorage.setItem(
                TASK_PROCESSING_CONFIG.STORAGE_KEYS.CACHED_TASKS,
                JSON.stringify(this._cache.tasks)
            );

            // Save timestamps
            localStorage.setItem(
                TASK_PROCESSING_CONFIG.STORAGE_KEYS.LAST_FETCH_TIMESTAMP,
                this._cache.lastFetchTime.toString()
            );

            localStorage.setItem(
                'task_cache_last_successful_fetch',
                this._cache.lastSuccessfulFetch.toString()
            );

            // Save processing task
            if (this._cache.processingTask) {
                localStorage.setItem(
                    'task_cache_processing_task',
                    JSON.stringify(this._cache.processingTask)
                );
            } else {
                localStorage.removeItem('task_cache_processing_task');
            }

            // Save the set of added prompts
            localStorage.setItem(
                TASK_PROCESSING_CONFIG.STORAGE_KEYS.ADDED_TO_SWARM,
                JSON.stringify(Array.from(this._cache.addedToSwarm))
            );

            localStorage.setItem(
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
            const cachedTasksJson = localStorage.getItem(TASK_PROCESSING_CONFIG.STORAGE_KEYS.CACHED_TASKS);
            const lastFetchTimeStr = localStorage.getItem(TASK_PROCESSING_CONFIG.STORAGE_KEYS.LAST_FETCH_TIMESTAMP);
            const addedToSwarmJson = localStorage.getItem(TASK_PROCESSING_CONFIG.STORAGE_KEYS.ADDED_TO_SWARM);
            const lastSuccessfulFetchStr = localStorage.getItem('task_cache_last_successful_fetch');
            const processingTaskJson = localStorage.getItem('task_cache_processing_task');
            const fetchFailureCountStr = localStorage.getItem('task_cache_fetch_failure_count');

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
        this.saveToLocalStorage();
    }
}

// Create a singleton instance
export const taskCache = new TaskCacheService(); 