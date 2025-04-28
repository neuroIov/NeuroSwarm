export interface EconomicMetrics {
    totalStaked: number | bigint;
    activeStakers: number;
    rewardDistribution: {
        total: bigint;
        perStaker: Map<string, bigint>;
    };
    slashEvents: {
        count: number;
        totalSlashed: bigint;
    };
    networkUtilization: number;
    circulatingSupply?: bigint;
    totalRewardsDistributed?: bigint;
    activeNodes?: number;
    averageReward?: number;
}

export interface AlertHistory {
    id: string;
    timestamp: number;
    type: 'security' | 'performance' | 'economic' | 'system';
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    data?: unknown;
}

export interface TaskScheduler {
    pauseNewTasks(): Promise<void>;
    resumeTasks(): Promise<void>;
    retryFailedTasks(): Promise<void>;
    scheduleTask(task: any): Promise<void>;
}
