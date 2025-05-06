export const SWARM_TABLES = ['tasks']
export const TASK_TABLES = ['img_gen_messages', 'freedomai_messages',]

// Configuration for task processing
export const TASK_PROCESSING_CONFIG = {
    // Processing time in seconds for different task types
    PROCESSING_TIME: {
        image: 10,
        text: 5,
        inference: 20
    },
    EARNINGS_NLOVE: {
        image: 2,
        text: 1,
    },

    // Ideal distribution percentages for different task types
    DISTRIBUTION: {
        image: 0.4,
        text: 0.6
    },

    // Cache and debounce settings
    CACHE_TTL: 30000, // 30 seconds
    DEBOUNCE_TIME: 1500,
    POLLING_INTERVAL: 20000, // 20 seconds for checking new tasks

    // Request limits
    REQUEST_LIMITS: {
        batch_size: 50,
        min_refresh_interval: 15000
    },

    // Local storage keys
    STORAGE_KEYS: {
        CACHED_TASKS: 'neuroswarm_cached_tasks',
        LAST_FETCH_TIMESTAMP: 'neuroswarm_last_fetch_timestamp',
        ADDED_TO_SWARM: 'neuroswarm_tasks_added_to_swarm'
    }
};


