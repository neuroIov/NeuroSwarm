export type TaskType = 'image' | 'video' | 'model' | 'text' | 'three_d' | 'inference' | 'training' | 'data_processing';
export type TaskStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface TaskProcessingResult {
    success: boolean;
    result?: string;
    message?: string;
}

export interface AITask {
    id: string;
    type: TaskType;
    status: TaskStatus;
    created_at: string;
    updated_at?: string;
    compute_time: number;
    blockchain_task_id?: string;
    node_id?: string;
    user_id?: string;
    model?: string;
    params?: string;
    input_tokens?: number;
    output_tokens?: number;
    prompt?: string;
    result?: string;
    gpu_usage?: number;
    reward_amount?: number;
    completion_signature?: string;
}

export interface Device {
    id: string;
    status: 'available' | 'busy' | 'offline';
    specs: {
        gpuModel: string;
        vram: number;
        hashRate: number;
    };
    gpuModel: string;
    vram: number;
    hashRate: number;
    owner: string;
    last_seen: string;
}

export interface TaskStats {
    total_tasks: number;
    avg_compute_time: number;
    success_rate: number;
}

export interface EarningHistory {
    id: string;
    date: string;
    amount: number;
    tasks: number;
    wallet_address: string;
    transaction_hash?: string;
}

export interface NetworkStats {
    total_nodes: number;
    active_nodes: number;
    network_load: number;
    reward_pool: number;
    uptime_seconds: number;
    change_24h: {
        total_nodes: number;
        active_nodes: number;
        network_load: number;
        reward_pool: number;
        uptime_seconds: number;
    };
}

export interface ReferralReward {
    id: string;
    amount: number;
    source: string;
    timestamp: string;
    tier: number;
    user_id: string;
}

export interface ReferralUser {
    id: string;
    referrer_id: string;
    referred_id: string;
    created_at: string;
    tier: number;
}

export interface ReferralStats {
    referral_code: string;
    referral_link: string;
    direct_referrals: number;
    indirect_referrals: number;
    total_rewards: number;
    recent_referrals: ReferralUser[];
    recent_rewards: ReferralReward[];
} 