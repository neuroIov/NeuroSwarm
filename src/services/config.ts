export const SWARM_TABLES = ['tasks']
export const TASK_TABLES = ['img_gen_messages', 'freedomai_messages',]

// Configuration for task processing
export const TASK_PROCESSING_CONFIG = {
    // Processing time in seconds for different task types
    PROCESSING_TIME: {
        image: 300,
        text: 150,
    },
    // Hardware-specific time multipliers - lower means faster processing
    HARDWARE_MULTIPLIERS: {
        webgpu: 0.65,
        wasm: 0.775,
        webgl: 0.8875,
        cpu: 1.0
    },

    // Earnings per task for different task types
    EARNINGS_NLOVE: {
        image: 8,
        text: 4,
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

/**
 * Calculate task processing time based on task type and hardware tier
 * @param taskType 'image' | 'text' - The type of task
 * @param hardwareTier 'webgpu' | 'wasm' | 'webgl' | 'cpu' - The hardware tier
 * @returns Processing time in seconds
 */
export const calculateProcessingTime = (
    taskType: 'image' | 'text',
    hardwareTier: 'webgpu' | 'wasm' | 'webgl' | 'cpu'
): number => {
    const baseTime = TASK_PROCESSING_CONFIG.PROCESSING_TIME[taskType];
    const multiplier = TASK_PROCESSING_CONFIG.HARDWARE_MULTIPLIERS[hardwareTier];
    return baseTime * multiplier;
};


