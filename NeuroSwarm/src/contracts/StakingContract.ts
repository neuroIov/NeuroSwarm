import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { getOrCreateAssociatedTokenAccount } from '@solana/spl-token';

// Define the expected metric interfaces
interface EconomicMetrics {
    totalStaked: number;
    activeStakers: number;
    rewardDistribution: number;
    slashEvents: number;
    networkUtilization: number;
}

interface GovernanceMetrics {
    delegatedStakes: number;
    activeValidators: number;
}

interface NetworkMetrics {
    economicMetrics: EconomicMetrics;
    governanceMetrics?: GovernanceMetrics;
    healthScore?: number;
}

interface Alert {
    type: string;
    severity: string;
    message: string;
}

interface MonitoringService {
    updateMetrics(metrics: Partial<NetworkMetrics>): void;
    addAlert(alert: Alert): void;
}

interface SecurityService {
    validateRequest(staker: string, action: string): Promise<boolean>;
    validateEmergencyAction(authority: string, action: string): Promise<boolean>;
}

interface StakeInfo {
    amount: bigint;
    lockedUntil: number;
    lastReward: number;
    slashHistory: {
        amount: bigint;
        reason: string;
        timestamp: number;
    }[];
    delegatedTo?: string;
}

export class StakingContract {
    private connection: Connection;
    private authority: Keypair;
    private tokenMint: PublicKey;
    private stakes: Map<string, StakeInfo> = new Map();
    private totalStaked: bigint = BigInt(0);
    private stakingStats: {
        totalStaked: bigint;
        activeStakers: number;
        maxStake: bigint;
    } = {
        totalStaked: BigInt(0),
        activeStakers: 0,
        maxStake: BigInt(0)
    };
    private monitoring: MonitoringService;
    private security: SecurityService;
    private minStake: bigint = BigInt(1000) * BigInt(1e9);
    private maxStake: bigint = BigInt(100000) * BigInt(1e9);
    private emergencyPaused: boolean = false;
    private validators: Set<string> = new Set();
    private validatorRotationInterval: number = 7 * 24 * 60 * 60 * 1000;
    private lastRotationTime: number = Date.now();

    constructor(
        connection: Connection,
        authority: Keypair,
        tokenMint: PublicKey,
        monitoring: MonitoringService,
        security: SecurityService
    ) {
        this.connection = connection;
        this.authority = authority;
        this.tokenMint = tokenMint;
        this.monitoring = monitoring;
        this.security = security;
        this.updateStats();
    }

    public async getStake(staker: PublicKey): Promise<bigint> {
        const stakeKey = staker.toBase58();
        if (!stakeKey) throw new Error('Invalid staker public key');
        const stakeInfo = this.stakes.get(stakeKey);
        return stakeInfo ? (stakeInfo.delegatedTo ? BigInt(0) : stakeInfo.amount) : BigInt(0);
    }

    public async stake(staker: PublicKey, amount: bigint): Promise<boolean> {
        if (this.emergencyPaused) {
            throw new Error('Staking is paused');
        }

        if (amount < this.minStake || amount > this.maxStake) {
            throw new RangeError(`Stake amount must be between ${this.minStake} and ${this.maxStake}`);
        }

        const canStake = await this.security.validateRequest(staker.toBase58(), 'stake');
        if (!canStake) {
            throw new Error('Security check failed for staking');
        }

        try {
            await getOrCreateAssociatedTokenAccount(
                this.connection,
                this.authority,
                this.tokenMint,
                staker
            );

            const stakeKey = staker.toBase58();
            const existingStake = this.stakes.get(stakeKey);
            const stakeInfo: StakeInfo = existingStake
                ? { ...existingStake, amount: existingStake.amount + amount }
                : {
                    amount: amount,
                    lockedUntil: Date.now() + (86400000 * 7),
                    lastReward: Date.now(),
                    slashHistory: [],
                    delegatedTo: undefined
                };

            this.stakes.set(stakeKey, stakeInfo);
            this.totalStaked += amount;

            this.updateValidators();
            this.updateStats();

            this.monitoring.updateMetrics({
                economicMetrics: {
                    totalStaked: Number(this.totalStaked) / 1e9,
                    activeStakers: this.stakes.size,
                    rewardDistribution: 0,
                    slashEvents: 0,
                    networkUtilization: 0
                }
            });

            return true;
        } catch (error: unknown) {
            console.error('Staking failed:', error);
            throw error;
        }
    }

    public async unstake(staker: PublicKey): Promise<boolean> {
        if (this.emergencyPaused) {
            throw new Error('Unstaking is paused');
        }

        const stakeKey = staker.toBase58();
        if (!stakeKey) throw new Error('Invalid staker public key');
        const stakeInfo = this.stakes.get(stakeKey);
        if (!stakeInfo) {
            throw new Error('No stake found');
        }

        if (Date.now() < stakeInfo.lockedUntil) {
            throw new Error('Stake is still locked');
        }

        try {
            if (stakeInfo.delegatedTo) {
                throw new Error('Cannot unstake delegated stake');
            }

            this.totalStaked -= stakeInfo.amount;
            this.stakes.delete(stakeKey);

            this.updateValidators();
            this.updateStats();

            this.monitoring.updateMetrics({
                economicMetrics: {
                    totalStaked: Number(this.totalStaked) / 1e9,
                    activeStakers: this.stakes.size,
                    rewardDistribution: 0,
                    slashEvents: 0,
                    networkUtilization: 0
                }
            });

            return true;
        } catch (error: unknown) {
            console.error('Unstaking failed:', error);
            throw error;
        }
    }

    public async slash(staker: PublicKey, amount: bigint, reason: string): Promise<boolean> {
        if (this.emergencyPaused) {
            throw new Error('Contract is paused');
        }

        const stakeKey = staker.toBase58();
        if (!stakeKey) throw new Error('Invalid staker public key');
        const stakeInfo = this.stakes.get(stakeKey);
        if (!stakeInfo) {
            throw new Error('No stake found for node');
        }

        if (amount > stakeInfo.amount) {
            amount = stakeInfo.amount;
        }

        try {
            stakeInfo.amount -= amount;
            this.totalStaked -= amount;

            stakeInfo.slashHistory.push({
                amount,
                reason,
                timestamp: Date.now()
            });

            if (stakeInfo.amount < this.minStake) {
                await this.unstake(staker);
            } else {
                this.stakes.set(stakeKey, stakeInfo);
            }

            this.updateValidators();
            this.updateStats();

            this.monitoring.addAlert({
                type: 'economic',
                severity: 'high',
                message: `Slashed ${amount} tokens from ${stakeKey} for ${reason}`
            });

            this.monitoring.updateMetrics({
                economicMetrics: {
                    totalStaked: Number(this.totalStaked) / 1e9,
                    activeStakers: this.stakes.size,
                    rewardDistribution: 0,
                    slashEvents: 0,
                    networkUtilization: 0
                }
            });

            return true;
        } catch (error: unknown) {
            console.error('Slashing failed:', error);
            throw error;
        }
    }

    public async getStakeInfo(staker: PublicKey): Promise<StakeInfo | null> {
        const stakeKey = staker.toBase58();
        if (!stakeKey) return null;
        return this.stakes.get(stakeKey) || null;
    }

    public async emergencyPause(): Promise<void> {
        if (!await this.security.validateEmergencyAction(this.authority.publicKey.toBase58(), 'pause')) {
            throw new Error('Unauthorized emergency pause attempt');
        }

        this.emergencyPaused = true;
        this.monitoring.addAlert({
            type: 'system',
            severity: 'critical',
            message: 'Staking contract emergency paused'
        });
    }

    public async emergencyUnpause(): Promise<void> {
        if (!await this.security.validateEmergencyAction(this.authority.publicKey.toBase58(), 'unpause')) {
            throw new Error('Unauthorized emergency unpause attempt');
        }

        this.emergencyPaused = false;
        this.monitoring.addAlert({
            type: 'system',
            severity: 'medium',
            message: 'Staking contract resumed'
        });
    }

    public getStakingStats(): {
        totalStaked: bigint;
        activeStakers: number;
        maxStake: bigint;
        minStake: bigint;
        isPaused: boolean;
    } {
        return {
            totalStaked: this.totalStaked,
            activeStakers: this.stakes.size,
            maxStake: this.stakingStats.maxStake,
            minStake: this.minStake,
            isPaused: this.emergencyPaused
        };
    }

    private updateStats(): void {
        let maxStake: bigint = BigInt(0);
        for (const info of this.stakes.values()) {
            if (info.amount > maxStake && !info.delegatedTo) {
                maxStake = info.amount;
            }
        }

        this.stakingStats = {
            totalStaked: this.totalStaked,
            activeStakers: this.stakes.size,
            maxStake
        };
    }

    public async delegateStake(delegator: PublicKey, delegatee: PublicKey): Promise<boolean> {
        if (this.emergencyPaused) {
            throw new Error('Delegation is paused');
        }

        const delegatorKey = delegator.toBase58();
        const delegateeKey = delegatee.toBase58();
        if (!delegatorKey || !delegateeKey) throw new Error('Invalid public key');

        const stakeInfo = this.stakes.get(delegatorKey);

        if (!stakeInfo || stakeInfo.delegatedTo) {
            throw new Error('No stake to delegate or already delegated');
        }

        if (Date.now() < stakeInfo.lockedUntil) {
            throw new Error('Stake is still locked');
        }

        try {
            stakeInfo.delegatedTo = delegateeKey;
            this.stakes.set(delegatorKey, stakeInfo);

            this.updateValidators();

            this.monitoring.updateMetrics({
                governanceMetrics: {
                    delegatedStakes: Array.from(this.stakes.values()).filter(s => s.delegatedTo).length,
                    activeValidators: this.validators.size
                },
                economicMetrics: {
                    totalStaked: Number(this.totalStaked) / 1e9,
                    activeStakers: this.stakes.size,
                    rewardDistribution: 0,
                    slashEvents: 0,
                    networkUtilization: 0
                }
            });

            return true;
        } catch (error: unknown) {
            console.error('Delegation failed:', error);
            throw error;
        }
    }

    private updateValidators(): void {
        const now = Date.now();
        if (now - this.lastRotationTime > this.validatorRotationInterval) {
            this.validators.clear();
            for (const [key, info] of this.stakes) {
                if (!info.delegatedTo && info.amount >= this.minStake) {
                    this.validators.add(key);
                }
            }
            this.lastRotationTime = now;
            this.monitoring.updateMetrics({
                governanceMetrics: {
                    delegatedStakes: Array.from(this.stakes.values()).filter(s => s.delegatedTo).length, // Added
                    activeValidators: this.validators.size
                },
                economicMetrics: {
                    totalStaked: Number(this.totalStaked) / 1e9,
                    activeStakers: this.stakes.size,
                    rewardDistribution: 0,
                    slashEvents: 0,
                    networkUtilization: 0
                }
            });
        } else {
            let changed = false;
            for (const key of this.validators) {
                const info = this.stakes.get(key);
                if (!info || info.delegatedTo || info.amount < this.minStake) {
                    this.validators.delete(key);
                    changed = true;
                }
            }
            for (const [key, info] of this.stakes) {
                if (!this.validators.has(key) && !info.delegatedTo && info.amount >= this.minStake) {
                    this.validators.add(key);
                    changed = true;
                }
            }
            if (changed) {
                this.monitoring.updateMetrics({
                    governanceMetrics: {
                        delegatedStakes: Array.from(this.stakes.values()).filter(s => s.delegatedTo).length, // Added
                        activeValidators: this.validators.size
                    },
                    economicMetrics: {
                        totalStaked: Number(this.totalStaked) / 1e9,
                        activeStakers: this.stakes.size,
                        rewardDistribution: 0,
                        slashEvents: 0,
                        networkUtilization: 0
                    }
                });
            }
        }
    }

    public getActiveValidators(): string[] {
        return Array.from(this.validators);
    }
}