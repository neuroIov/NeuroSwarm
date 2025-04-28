import { PublicKey } from '@solana/web3.js';
import { MonitoringService } from './MonitoringService';
import { SecurityService } from './SecurityService';
import { StakingContract } from '../contracts/StakingContract';
import { RewardService } from './RewardService';
import { RateLimiter } from './RateLimiter';

interface EconomicMetrics {
    circulatingSupply: bigint;
    totalStaked: bigint;
    totalRewardsDistributed: bigint;
    activeNodes: number;
    averageReward: number;
    networkUtilization: number;
}

interface StakingMetrics {
    stakedAmount: bigint;
    stakingStartTime: number;
    lastRewardTime: number;
    totalRewards: bigint;
    slashCount: number;
    cooldownStartTime?: number;
    rewardVelocity: number; // New: Tracks reward claim frequency
}

interface StakingStats {
    totalStaked: bigint;
    activeStakers: number;
    maxStake: bigint;
}

interface RewardStats {
    totalDistributed: bigint;
    remaining: bigint;
}

interface SimulationResult {
    projectedSupply: bigint;
    projectedStake: bigint;
    projectedRewards: bigint;
    stabilityScore: number;
}

export class EconomicController {
    private monitoring: MonitoringService;
    private security: SecurityService;
    private staking: StakingContract;
    private rewards: RewardService;
    private rateLimiter: RateLimiter;
    
    private nodeStakingMetrics: Map<string, StakingMetrics> = new Map();
    private readonly STAKE_COOLDOWN_PERIOD = 7 * 24 * 60 * 60 * 1000; // 7 days
    private readonly MAX_DAILY_REWARDS = BigInt(1000) * BigInt(1e9); // 1000 tokens
    private readonly SLASH_THRESHOLD = 3; // Number of violations before slashing
    private readonly SLASH_PERCENTAGE = 0.1; // 10% of stake
    private readonly MAX_REWARD_VELOCITY = 5; // Max 5 rewards per day
    
    private maxCirculatingSupply: bigint = BigInt(500_000_000) * BigInt(1e9);
    private inflationRate: number = 0.05; // 5% annual inflation
    private lastMetricsUpdate: number = 0;
    private metrics: EconomicMetrics = {
        circulatingSupply: BigInt(0),
        totalStaked: BigInt(0),
        totalRewardsDistributed: BigInt(0),
        activeNodes: 0,
        averageReward: 0,
        networkUtilization: 0
    };
    private rewardAdjustmentFactor: number = 1.0; // Dynamic reward multiplier

    constructor(
        monitoring: MonitoringService,
        security: SecurityService,
        staking: StakingContract,
        rewards: RewardService,
        rateLimiter: RateLimiter
    ) {
        this.monitoring = monitoring;
        this.security = security;
        this.staking = staking;
        this.rewards = rewards;
        this.rateLimiter = rateLimiter;
        this.startMetricsUpdates();
    }

    private startMetricsUpdates() {
        setInterval(async () => {
            await this.updateMetrics();
            await this.checkSlashingConditions();
            this.adjustRewardsDynamically();
        }, 60000); // Every minute
    }

    private async updateMetrics() {
        const now = Date.now();
        if (now - this.lastMetricsUpdate < 60000) return;

        const stakingStats: StakingStats = this.staking.getStakingStats();
        const rewardStats: RewardStats = await this.rewards.getDistributionStats();

        this.metrics = {
            circulatingSupply: this.calculateCirculatingSupply(now),
            totalStaked: stakingStats.totalStaked,
            totalRewardsDistributed: rewardStats.totalDistributed,
            activeNodes: stakingStats.activeStakers,
            averageReward: stakingStats.activeStakers > 0 
                ? Number(rewardStats.totalDistributed) / stakingStats.activeStakers / 1e9 
                : 0,
            networkUtilization: this.calculateNetworkUtilization(stakingStats)
        };

        this.monitoring.updateMetrics({
            economicMetrics: { ...this.metrics },
            healthScore: this.calculateHealthScore(stakingStats)
        });

        this.lastMetricsUpdate = now;
    }

    private calculateCirculatingSupply(now: number): bigint {
        const timeElapsed = (now - this.lastMetricsUpdate) / (365 * 24 * 60 * 60 * 1000);
        const inflationFactor = 1 + this.inflationRate * timeElapsed;
        return BigInt(Math.floor(Number(this.maxCirculatingSupply) * inflationFactor));
    }

    private calculateNetworkUtilization(stakingStats: StakingStats): number {
        if (stakingStats.activeStakers === 0) return 0;
        return Math.min(1, Number(stakingStats.totalStaked) / (Number(stakingStats.maxStake) * stakingStats.activeStakers));
    }

    private calculateHealthScore(stakingStats: StakingStats): number {
        if (stakingStats.activeStakers === 0) return 0;

        const stakingScore = Number(stakingStats.totalStaked) / Number(this.maxCirculatingSupply);
        const utilizationScore = this.metrics.networkUtilization;
        const distributionScore = Math.min(1, this.metrics.averageReward / (1000 * 1e9));

        return (stakingScore * 0.4 + utilizationScore * 0.3 + distributionScore * 0.3) * 100;
    }

    async checkEconomicHealth(): Promise<{
        healthy: boolean;
        issues: string[];
        recommendations: string[];
    }> {
        const issues: string[] = [];
        const recommendations: string[] = [];

        const stakingStats: StakingStats = this.staking.getStakingStats();
        const rewardStats: RewardStats = await this.rewards.getDistributionStats();

        if (stakingStats.totalStaked < this.maxCirculatingSupply / BigInt(10)) {
            issues.push('Low staking participation');
            recommendations.push('Increase staking rewards');
        }

        if (rewardStats.remaining < this.maxCirculatingSupply / BigInt(100)) {
            issues.push('Low remaining rewards');
            recommendations.push('Plan next reward phase');
        }

        if (this.metrics.networkUtilization < 0.3) {
            issues.push('Low network utilization');
            recommendations.push('Adjust task incentives');
        }

        if (stakingStats.activeStakers > 0 && 
            Number(stakingStats.totalStaked) / stakingStats.activeStakers > Number(stakingStats.maxStake) * 0.8) {
            issues.push('Potential stake concentration');
            recommendations.push('Monitor centralization risks');
        }

        return {
            healthy: issues.length === 0,
            issues,
            recommendations
        };
    }

    async emergencyPause(): Promise<void> {
        await this.staking.emergencyPause();
        await this.rewards.emergencyPause();
        this.monitoring.addAlert({
            type: 'economic',
            severity: 'critical',
            message: 'Economic systems emergency paused'
        });
    }

    async emergencyUnpause(): Promise<void> {
        await this.staking.emergencyUnpause();
        await this.rewards.emergencyUnpause();
        this.monitoring.addAlert({
            type: 'economic',
            severity: 'medium',
            message: 'Economic systems resumed'
        });
    }

    public async verifyStake(nodeId: PublicKey): Promise<boolean> {
        const nodeKey = nodeId.toBase58();
        const canVerify = await this.rateLimiter.checkRateLimit('stake_verification', nodeKey);
        if (!canVerify) throw new Error('Rate limit exceeded for stake verification');

        const stake = await this.staking.getStake(nodeId);
        let metrics = this.nodeStakingMetrics.get(nodeKey);

        if (!metrics) {
            metrics = {
                stakedAmount: stake,
                stakingStartTime: Date.now(),
                lastRewardTime: Date.now(),
                totalRewards: BigInt(0),
                slashCount: 0,
                rewardVelocity: 0
            };
            this.nodeStakingMetrics.set(nodeKey, metrics);
            return true;
        }

        if (stake < metrics.stakedAmount) throw new Error('Stake amount has decreased');
        metrics.stakedAmount = stake;
        this.nodeStakingMetrics.set(nodeKey, metrics);
        return true;
    }

    public async initiateStakeWithdrawal(nodeId: PublicKey): Promise<void> {
        const nodeKey = nodeId.toBase58();
        const metrics = this.nodeStakingMetrics.get(nodeKey);
        if (!metrics) throw new Error('No staking metrics found for node');

        metrics.cooldownStartTime = Date.now();
        this.monitoring.addAlert({
            type: 'economic',
            severity: 'medium',
            message: `Stake withdrawal initiated for node ${nodeKey}`
        });
        this.nodeStakingMetrics.set(nodeKey, metrics);
    }

    public async canWithdrawStake(nodeId: PublicKey): Promise<boolean> {
        const nodeKey = nodeId.toBase58();
        const metrics = this.nodeStakingMetrics.get(nodeKey);
        if (!metrics || !metrics.cooldownStartTime) return false;

        return Date.now() >= metrics.cooldownStartTime + this.STAKE_COOLDOWN_PERIOD;
    }

    private async validateRewardDistribution(nodeId: PublicKey, amount: bigint): Promise<void> {
        const nodeKey = nodeId.toBase58();
        const metrics = this.nodeStakingMetrics.get(nodeKey);
        if (!metrics) throw new Error('No staking metrics found for node');

        // Anti-exploit: Check reward velocity
        const dailyClaims = metrics.rewardVelocity;
        if (dailyClaims >= this.MAX_REWARD_VELOCITY) {
            throw new Error('Reward velocity limit exceeded');
        }

        const timeSinceLastReward = Date.now() - metrics.lastRewardTime;
        if (timeSinceLastReward < 3600000) throw new Error('Reward claiming too frequent');

        const maxReward = (metrics.stakedAmount * BigInt(Math.floor(0.01 * 100))) / BigInt(100);
        if (amount > maxReward) throw new Error('Reward amount exceeds maximum allowed');

        const dailyRewards = await this.getDailyRewards(nodeId);
        if (dailyRewards + amount > this.MAX_DAILY_REWARDS) throw new Error('Daily reward limit exceeded');

        const performance = await this.security.getNodePerformance(nodeId);
        if (performance.successRate < 0.95) throw new Error('Node performance below threshold');
    }

    public async distributeRewards(nodeId: PublicKey, amount: bigint): Promise<boolean> {
        const nodeKey = nodeId.toBase58();
        const canDistribute = await this.rateLimiter.checkRateLimit('reward_distribution', nodeKey);
        if (!canDistribute) throw new Error('Rate limit exceeded for reward distribution');

        const metrics = this.nodeStakingMetrics.get(nodeKey);
        if (!metrics) throw new Error('No staking metrics found for node');

        try {
            await this.validateRewardDistribution(nodeId, amount);

            // Optimize reward distribution with dynamic adjustment
            const optimizedAmount = BigInt(Math.floor(Number(amount) * this.rewardAdjustmentFactor));
            let taxedAmount = optimizedAmount;

            if (optimizedAmount > this.MAX_DAILY_REWARDS / BigInt(10)) {
                const taxRate = 0.2;
                const threshold = this.MAX_DAILY_REWARDS / BigInt(10);
                const excess = optimizedAmount - threshold;
                taxedAmount = threshold + (excess * BigInt(Math.floor((1 - taxRate) * 100))) / BigInt(100);
            }

            const now = Date.now();
            const dailyRewards = await this.getDailyRewards(nodeId);
            if (dailyRewards + taxedAmount > this.MAX_DAILY_REWARDS) throw new Error('Daily reward cap exceeded');

            metrics.lastRewardTime = now;
            metrics.totalRewards += taxedAmount;
            metrics.rewardVelocity = this.calculateRewardVelocity(nodeKey, now);

            const cooldownHours = Math.min(24, Math.floor(Number(taxedAmount) / Number(this.MAX_DAILY_REWARDS) * 24));
            const nextRewardTime = now + (cooldownHours * 3600000);

            this.monitoring.recordEvent('reward_distribution', {
                type: 'economic',
                severity: 'low',
                message: `Rewards distributed to node ${nodeKey}`,
                data: {
                    originalAmount: amount.toString(),
                    taxedAmount: taxedAmount.toString(),
                    adjustmentFactor: this.rewardAdjustmentFactor,
                    cooldownHours
                }
            });

            this.nodeStakingMetrics.set(nodeKey, { ...metrics, nextRewardTime });

            await this.rewards.distributeReward(nodeId, taxedAmount);
            return true;
        } catch (error) {
            this.monitoring.recordEvent('reward_distribution_failed', {
                type: 'economic',
                severity: 'medium',
                message: `Reward distribution failed for node ${nodeKey}`,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }

    private calculateRewardVelocity(nodeKey: string, now: number): number {
        const metrics = this.nodeStakingMetrics.get(nodeKey);
        if (!metrics) return 0;

        const oneDayAgo = now - 24 * 60 * 60 * 1000;
        return metrics.lastRewardTime > oneDayAgo ? metrics.rewardVelocity + 1 : 1;
    }

    private async getDailyRewards(nodeId: PublicKey): Promise<bigint> {
        const nodeKey = nodeId.toBase58();
        const metrics = this.nodeStakingMetrics.get(nodeKey);
        if (!metrics) return BigInt(0);

        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
        return metrics.lastRewardTime < oneDayAgo ? BigInt(0) : metrics.totalRewards;
    }

    private async checkSlashingConditions(): Promise<void> {
        for (const [nodeKey, metrics] of this.nodeStakingMetrics) {
            const nodeId = new PublicKey(nodeKey);
            const violations = this.security.getViolationHistory(nodeKey);
            const recentViolations = violations.filter(
                v => v.timestamp > Date.now() - 24 * 60 * 60 * 1000
            );

            // Enhanced slashing conditions
            const severityScore = recentViolations.reduce((sum, v) => 
                sum + (v.severity === 'high' ? 3 : v.severity === 'medium' ? 2 : 1), 0);

            if (recentViolations.length >= this.SLASH_THRESHOLD || severityScore >= 6) {
                await this.slashStake(nodeId, severityScore);
            }

            // Anti-exploit: Check for reward gaming
            if (metrics.rewardVelocity > this.MAX_REWARD_VELOCITY) {
                await this.slashStake(nodeId, 5, 'Reward gaming detected');
            }
        }
    }

    private async slashStake(nodeId: PublicKey, severityScore: number = 3, reason?: string): Promise<void> {
        const nodeKey = nodeId.toBase58();
        const metrics = this.nodeStakingMetrics.get(nodeKey);
        if (!metrics) return;

        const baseSlash = this.SLASH_PERCENTAGE * severityScore / 3; // Scale with severity
        const slashPercentage = Math.min(0.5, baseSlash); // Cap at 50%
        const slashAmount = (metrics.stakedAmount * BigInt(Math.floor(slashPercentage * 100))) / BigInt(100);

        metrics.stakedAmount -= slashAmount;
        metrics.slashCount++;

        await this.staking.slash(nodeId, slashAmount, reason || `Excessive violations (severity: ${severityScore})`);

        this.monitoring.addAlert({
            type: 'economic',
            severity: 'high',
            message: `Slashed ${slashAmount} tokens from node ${nodeKey} (Reason: ${reason || 'Violations'})`
        });

        this.nodeStakingMetrics.set(nodeKey, metrics);
    }

    private adjustRewardsDynamically(): void {
        const health = this.calculateHealthScore(this.staking.getStakingStats());
        const utilization = this.metrics.networkUtilization;

        // Increase rewards if network health is low or utilization is low
        this.rewardAdjustmentFactor = Math.max(0.5, Math.min(2.0, 1.0 + (50 - health) / 100 + (0.5 - utilization)));
        
        this.monitoring.updateMetrics({
            economicMetrics: { rewardAdjustmentFactor: this.rewardAdjustmentFactor }
        });
    }

    public async simulateEconomy(days: number): Promise<SimulationResult> {
        const now = Date.now();
        const endTime = now + days * 24 * 60 * 60 * 1000;
        let projectedSupply = this.metrics.circulatingSupply;
        let projectedStake = this.metrics.totalStaked;
        let projectedRewards = this.metrics.totalRewardsDistributed;
        let dailyStakeGrowth = Number(projectedStake) * 0.001; // 0.1% daily growth
        let dailyRewardDistribution = Number(this.MAX_DAILY_REWARDS) * this.metrics.activeNodes;

        for (let t = now; t < endTime; t += 24 * 60 * 60 * 1000) {
            projectedSupply = this.calculateCirculatingSupply(t);
            projectedStake += BigInt(Math.floor(dailyStakeGrowth));
            projectedRewards += BigInt(Math.floor(dailyRewardDistribution * this.rewardAdjustmentFactor));

            // Simulate slashing (1% of nodes slashed daily)
            const slashedNodes = Math.floor(this.metrics.activeNodes * 0.01);
            const slashImpact = Number(projectedStake) * this.SLASH_PERCENTAGE * slashedNodes;
            projectedStake -= BigInt(Math.floor(slashImpact));

            dailyStakeGrowth *= 1.001; // Slight growth acceleration
            dailyRewardDistribution *= 0.995; // Slight reward decay
        }

        const stabilityScore = Math.min(100, 
            50 * (1 - Math.abs(Number(projectedStake) / Number(projectedSupply) - 0.5)) + 
            50 * (1 - Math.abs(dailyRewardDistribution / Number(this.MAX_DAILY_REWARDS) - 1)));

        return {
            projectedSupply,
            projectedStake,
            projectedRewards,
            stabilityScore
        };
    }

    getMetrics(): EconomicMetrics {
        return { ...this.metrics };
    }
}