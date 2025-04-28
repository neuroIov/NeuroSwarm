import { PublicKey } from '@solana/web3.js';
import { TokenVesting } from '../contracts/TokenVesting';
import { MonitoringService } from './MonitoringService';

interface RewardConfig {
    baseReward: bigint;
    complexityMultiplier: number;
    stakingMultiplier: number;
    performanceMultiplier: number;
    minStake: bigint;
}

export class RewardService {
    private vesting: TokenVesting;
    private monitoring: MonitoringService;
    private config: RewardConfig;
    private totalDistributed: bigint = BigInt(0);
    private rewardCap: bigint = BigInt(4500000) * BigInt(1e9); // 4.5M tokens for initial distribution
    private emergencyPaused: boolean = false;

    constructor(
        vesting: TokenVesting,
        monitoring: MonitoringService,
        config: RewardConfig
    ) {
        this.vesting = vesting;
        this.monitoring = monitoring;
        this.config = config;
    }

    async calculateReward(
        nodeId: PublicKey,
        taskComplexity: number,
        stake: bigint,
        performance: number
    ): Promise<bigint> {
        if (this.emergencyPaused) {
            throw new Error('Reward distribution is paused');
        }

        if (stake < this.config.minStake) {
            throw new Error('Insufficient stake for rewards');
        }

        // Base calculation with complexity
        let reward = this.config.baseReward;
        reward = reward * BigInt(Math.floor(taskComplexity * this.config.complexityMultiplier));

        // Apply staking multiplier
        const stakeMultiplier = Math.min(
            Number(stake) / Number(this.config.minStake) * this.config.stakingMultiplier,
            3.0 // Cap at 3x
        );
        reward = reward * BigInt(Math.floor(stakeMultiplier * 100)) / BigInt(100);

        // Apply performance multiplier
        const perfMultiplier = Math.min(performance * this.config.performanceMultiplier, 2.0);
        reward = reward * BigInt(Math.floor(perfMultiplier * 100)) / BigInt(100);

        // Check against remaining allocation
        if (this.totalDistributed + reward > this.rewardCap) {
            reward = this.rewardCap - this.totalDistributed;
            if (reward <= BigInt(0)) {
                throw new Error('Reward cap reached');
            }
        }

        return reward;
    }

    async distributeReward(nodeId: PublicKey, reward: bigint): Promise<boolean> {
        if (this.emergencyPaused) {
            throw new Error('Reward distribution is paused');
        }

        try {
            // Create vesting schedule for the reward
            await this.vesting.createVestingSchedule(
                nodeId,
                Math.floor(Date.now() / 1000), // Start now
                0,                             // No cliff
                86400 * 7,                    // 7 day vesting
                3600,                         // Release every hour
                reward
            );

            this.totalDistributed += reward;
            
            // Update monitoring
            this.monitoring.getState().updateMetrics({
                totalRewardsDistributed: Number(this.totalDistributed) / 1e9,
                remainingRewards: Number(this.rewardCap - this.totalDistributed) / 1e9
            });

            return true;
        } catch (error) {
            console.error('Failed to distribute reward:', error);
            throw error;
        }
    }

    async emergencyPause(): Promise<void> {
        this.emergencyPaused = true;
        await this.vesting.emergencyPause();
        this.monitoring.getState().addAlert('Reward distribution emergency paused');
    }

    async emergencyUnpause(): Promise<void> {
        this.emergencyPaused = false;
        await this.vesting.emergencyUnpause();
        this.monitoring.getState().addAlert('Reward distribution resumed');
    }

    getDistributionStats() {
        return {
            totalDistributed: this.totalDistributed,
            remaining: this.rewardCap - this.totalDistributed,
            isPaused: this.emergencyPaused
        };
    }
}
