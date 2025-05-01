export const SWARM_TABLES = ['tasks']
export const TASK_TABLES = ['img_gen_messages', 'freedomai_messages',]

// Configuration for task processing
export const TASK_PROCESSING_CONFIG = {
    // Processing time in seconds for different task types
    PROCESSING_TIME: {
        image: 30,
        text: 15,
        inference: 20
    },

    // Ideal distribution percentages for different task types
    DISTRIBUTION: {
        image: 0.4,
        text: 0.6
    },

    // Cache and debounce settings
    CACHE_TTL: 30000,
    DEBOUNCE_TIME: 1500,

    // Request limits
    REQUEST_LIMITS: {
        batch_size: 50,
        min_refresh_interval: 15000
    }
};


