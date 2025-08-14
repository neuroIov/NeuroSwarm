// Task Pipeline Configuration
export const TASK_CONFIG = {
  // Task type distribution weights
  DISTRIBUTION: {
    image: 0.4,    // 40% chance
    text: 0.3,     // 30% chance
    three_d: 0.2,  // 20% chance
    video: 0.1     // 10% chance
  },

  // Base reward amounts (in NLOV tokens)
  BASE_REWARDS: {
    image: 10,
    text: 5,
    three_d: 15,
    video: 30
  },

  // Hardware tier multipliers
  HARDWARE_MULTIPLIERS: {
    webgpu: 2.0,
    wasm: 1.6,
    webgl: 1.3,
    cpu: 1.0
  },

  COMPLETION_TIMES: {
    webgpu: {
      image: 130,
      text: 65,
      three_d: 195,
      video: 390
    },
    wasm: {
      image: 156,
      text: 78,
      three_d: 233,
      video: 465
    },
    webgl: {
      image: 178,
      text: 89,
      three_d: 266,
      video: 533
    },
    cpu: {
      image: 200,
      text: 100,
      three_d: 300,
      video: 600
    }
  },
  


  // Task completion times based on hardware tier (in seconds)
  // COMPLETION_TIMES: {
  //   webgpu: {
  //     image: 15,
  //     text: 15,
  //     three_d: 15,
  //     video: 15
  //   },
  //   wasm: {
  //     image: 15,
  //     text: 15,
  //     three_d: 15,
  //     video: 15
  //   },
  //   webgl: {
  //     image: 15,
  //     text: 15,
  //     three_d: 15,
  //     video: 15
  //   },
  //   cpu: {
  //     image: 15,
  //     text: 15,
  //     three_d: 15,
  //     video: 15
  //   }
  // },

  // Task generation settings - OPTIMIZED FOR MEMORY
  GENERATION: {
    MIN_TASKS: 1,
    MAX_TASKS: 3, // Reduced from 5 to 3
    GENERATION_INTERVAL: 60000, // Increased to 60 seconds (was 30)
    PROCESSING_INTERVAL: 10000,  // Increased to 10 seconds (was 5) - OPTIMIZED FOR PERFORMANCE
    MAX_CONCURRENT_PROCESSING: 1, // Max tasks processing at once (only 1 task)
    PENDING_QUEUE_SIZE: 2 // Reduced from 4 to 2
  }
};

// Model mappings
export const TASK_MODELS = {
  image: 'stable-diffusion-xl',
  text: 'llama-3-8b',
  three_d: '3d-diffusion',
  video: 'stable-video-diffusion'
};

// Sample prompts for proxy tasks
export const SAMPLE_PROMPTS = {
  image: [
    'Generate a realistic landscape with mountains',
    'Create a futuristic cityscape at sunset',
    'Design a minimalist tech logo',
    'Render a cozy coffee shop interior',
    'Generate abstract art with vibrant colors'
  ],
  text: [
    'Write a creative story about space exploration',
    'Generate a product description for smart watch',
    'Create a professional email template',
    'Write a blog post about sustainable living',
    'Generate marketing copy for new app'
  ],
  three_d: [
    'Create a 3D model of modern chair',
    'Generate low-poly character design',
    'Model a futuristic vehicle',
    'Create architectural visualization',
    'Generate organic shapes and forms'
  ],
  video: [
    'Generate short animation of flowing water',
    'Create product showcase video',
    'Generate abstract motion graphics',
    'Create time-lapse style video',
    'Generate particle effects animation'
  ]
};

// Storage keys for persistence
export const STORAGE_KEYS = {
  NODE_STATE: 'swarm_node_state',
  TASK_STATE: 'swarm_task_state',
  EARNINGS_STATE: 'swarm_earnings_state'
};

// Utility functions
export const generateTaskId = () => {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

export const formatUptime = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours}h ${minutes}m ${secs}s`;
};

export const formatUptimeShort = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export const logger = {
  log: (message: string, data?: unknown) => {
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      console.log(`[SwarmNode] ${message}`, data || '');
    }
  },
  error: (message: string, error?: unknown) => {
    if (typeof window !== 'undefined') {
      console.error(`[SwarmNode] ${message}`, error || '');
    }
  }
};
