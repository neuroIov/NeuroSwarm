import { create } from 'zustand';
import { Connection, PublicKey } from '@solana/web3.js';
import { RateLimiter } from '../services/RateLimiter';
import { TaskValidator } from '../services/TaskValidator';
import { SecurityService, IStakingContract } from './SecurityService';
import { StakingContract } from '../contracts/StakingContract';
import { TaskScheduler } from '../core/TaskScheduler';
import { AlertHistory, EconomicMetrics } from '../types';

interface NodePerformance {
    nodeId: string;
    successRate: number;
    avgResponseTime: number;
    lastHeartbeat: number;
    resourceUtilization: {
        cpu: number;
        memory: number;
        bandwidth: number;
    };
    taskCompletionTrend: number[]; // New: Tracks recent completion rates
}

interface NetworkMetrics {
    totalNodes: number;
    activeNodes: number;
    totalTasks: number;
    completedTasks: number;
    averageTaskTime: number;
    networkLoad: number;
    errorRate: number;
    lastUpdate: number;
    healthScore?: number;
    taskThroughput: number; // New: Tasks per minute
    latencyVariance: number; // New: Variation in response times
}

interface AlertConfig {
    highLoadThreshold: number;
    highErrorRateThreshold: number;
    nodeInactivityThreshold: number;
    taskTimeoutThreshold: number;
}

interface Prediction {
    time: number;
    networkLoad: number;
    errorRate: number;
    healthScore: number;
}

interface MonitoringState {
    metrics: NetworkMetrics;
    alerts: AlertHistory[];
    nodePerformance: Map<string, NodePerformance>;
    config: AlertConfig & {
        criticalLoadThreshold: number;
        criticalErrorRateThreshold: number;
        criticalInactivityThreshold: number;
        criticalTaskFailureRate: number;
        autoRecoveryAttempts: number;
        healthScoreThreshold: number;
    };
    economicMetrics?: EconomicMetrics;
    healthScore?: number;
    updateMetrics: (metrics: Partial<NetworkMetrics> & { economicMetrics?: EconomicMetrics; healthScore?: number }) => void;
    addAlert: (alert: Omit<AlertHistory, 'id' | 'timestamp'>) => void;
    clearAlerts: () => void;
}

export const useMonitoringStore = create<MonitoringState>((set) => ({
    nodePerformance: new Map(),
    metrics: {
        totalNodes: 0,
        activeNodes: 0,
        totalTasks: 0,
        completedTasks: 0,
        averageTaskTime: 0,
        networkLoad: 0,
        errorRate: 0,
        lastUpdate: Date.now(),
        taskThroughput: 0,
        latencyVariance: 0
    },
    alerts: [],
    config: {
        criticalLoadThreshold: 95,
        criticalErrorRateThreshold: 0.1,
        criticalInactivityThreshold: 15 * 60 * 1000,
        criticalTaskFailureRate: 0.2,
        autoRecoveryAttempts: 3,
        healthScoreThreshold: 0.7,
        highLoadThreshold: 80,
        highErrorRateThreshold: 0.05,
        nodeInactivityThreshold: 5 * 60 * 1000,
        taskTimeoutThreshold: 10 * 60 * 1000
    },
    updateMetrics: (newMetrics) => set((state) => ({
        metrics: { ...state.metrics, ...newMetrics, lastUpdate: Date.now() },
        economicMetrics: newMetrics.economicMetrics || state.economicMetrics,
        healthScore: newMetrics.healthScore !== undefined ? newMetrics.healthScore : state.healthScore
    })),
    addAlert: (alert) => set((state) => ({
        alerts: [...state.alerts, { 
            id: crypto.randomUUID(), 
            timestamp: Date.now(), 
            ...alert 
        }]
    })),
    clearAlerts: () => set({ alerts: [] }),
}));

export class MonitoringService {
    private metrics: NetworkMetrics = {
        totalNodes: 0,
        activeNodes: 0,
        totalTasks: 0,
        completedTasks: 0,
        averageTaskTime: 0,
        networkLoad: 0,
        errorRate: 0,
        lastUpdate: Date.now(),
        healthScore: 0,
        taskThroughput: 0,
        latencyVariance: 0
    };
    private alerts: AlertHistory[] = [];
    private readonly maxAlerts = 1000;
    private recoveryAttempts = new Map<string, number>();
    private lastHealthCheck = Date.now();
    private monitoringInterval: NodeJS.Timeout | null = null;
    private nodePerformance = new Map<string, NodePerformance>();
    private historicalMetrics: NetworkMetrics[] = []; // For predictive analytics
    private readonly maxHistory = 60; // Last hour of data (1-minute intervals)

    constructor(
        private readonly security: SecurityService,
        private readonly taskScheduler: TaskScheduler,
        private readonly stakingContract: StakingContract
    ) {
        this.startMonitoring();
    }

    startMonitoring(intervalMs: number = 60000): void {
        if (this.monitoringInterval) clearInterval(this.monitoringInterval);

        this.monitoringInterval = setInterval(async () => {
            await this.updateNetworkMetrics();
            await this.checkAlerts();
            await this.runPredictiveAnalytics();
        }, intervalMs);
    }

    stopMonitoring(): void {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
    }

    private async updateNetworkMetrics(): Promise<void> {
        try {
            const queueStatus = await this.taskScheduler.getQueueStatus();
            const activeNodes = await this.taskScheduler.getActiveNodes();
            const networkLoad = await this.calculateNetworkLoad();
            const errorRate = await this.calculateErrorRate();
            const nodePerformance = await this.calculateNodePerformance();
            const economicHealth = await this.calculateEconomicHealth();
            const taskThroughput = await this.calculateTaskThroughput();
            const latencyVariance = this.calculateLatencyVariance(nodePerformance);

            const healthScore = this.calculateHealthScore({
                networkLoad,
                errorRate,
                nodePerformance,
                economicHealth
            });

            this.metrics = {
                totalNodes: queueStatus.totalTasks > 0 ? activeNodes.length : 0,
                activeNodes: activeNodes.length,
                totalTasks: queueStatus.totalTasks,
                completedTasks: queueStatus.completedTasks,
                averageTaskTime: this.metrics.averageTaskTime, // Updated in nodePerformance
                networkLoad,
                errorRate,
                lastUpdate: Date.now(),
                healthScore,
                taskThroughput,
                latencyVariance
            };

            useMonitoringStore.getState().updateMetrics({
                ...this.metrics,
                economicMetrics: economicHealth,
                healthScore
            });

            useMonitoringStore.getState().nodePerformance.clear();
            for (const [nodeId, perf] of nodePerformance) {
                useMonitoringStore.getState().nodePerformance.set(nodeId, perf);
            }

            // Store for historical analysis
            this.historicalMetrics.push({ ...this.metrics });
            if (this.historicalMetrics.length > this.maxHistory) this.historicalMetrics.shift();
        } catch (error) {
            console.error('Error updating network metrics:', error);
            await this.handleCriticalAlert(
                'networkMetrics',
                'system',
                'critical',
                `Metrics update failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                async () => { await this.attemptHealthRecovery(); }
            );
        }
    }

    private async checkAlerts(): Promise<void> {
        const { metrics, config } = useMonitoringStore.getState();

        if (metrics.networkLoad > config.criticalLoadThreshold) {
            await this.handleCriticalAlert(
                'networkLoad',
                'performance',
                'critical',
                `Critical network load: ${metrics.networkLoad}%`,
                async () => { await this.attemptLoadReduction(); }
            );
        } else if (metrics.networkLoad > config.highLoadThreshold) {
            this.addAlert({
                type: 'performance',
                severity: 'high',
                message: `High network load: ${metrics.networkLoad}%`
            });
        }

        if (metrics.errorRate > config.criticalErrorRateThreshold) {
            await this.handleCriticalAlert(
                'errorRate',
                'performance',
                'critical',
                `Critical error rate: ${(metrics.errorRate * 100).toFixed(2)}%`,
                async () => { await this.attemptErrorRecovery(); }
            );
        } else if (metrics.errorRate > config.highErrorRateThreshold) {
            this.addAlert({
                type: 'performance',
                severity: 'high',
                message: `High error rate: ${(metrics.errorRate * 100).toFixed(2)}%`
            });
        }

        const inactiveTime = Date.now() - metrics.lastUpdate;
        if (inactiveTime > config.criticalInactivityThreshold) {
            await this.handleCriticalAlert(
                'nodeInactivity',
                'system',
                'critical',
                `Critical inactivity: No updates for ${Math.floor(inactiveTime / 1000)}s`,
                async () => { await this.attemptHealthRecovery(); }
            );
        } else if (inactiveTime > config.nodeInactivityThreshold) {
            this.addAlert({
                type: 'system',
                severity: 'medium',
                message: `Inactivity: No updates for ${Math.floor(inactiveTime / 1000)}s`
            });
        }

        if (metrics.latencyVariance > 1000) { // High variance threshold
            this.addAlert({
                type: 'performance',
                severity: 'medium',
                message: `High latency variance detected: ${metrics.latencyVariance.toFixed(2)}ms`
            });
        }
    }

    private async calculateNetworkLoad(): Promise<number> {
        const queueStatus = await this.taskScheduler.getQueueStatus();
        const activeNodes = await this.taskScheduler.getActiveNodes();
        return activeNodes.length > 0 ? (queueStatus.processingTasks / activeNodes.length) * 100 : 0;
    }

    private async calculateErrorRate(): Promise<number> {
        const queueStatus = await this.taskScheduler.getQueueStatus();
        return queueStatus.totalTasks > 0 ? queueStatus.failedTasks / queueStatus.totalTasks : 0;
    }

    private async calculateNodePerformance(): Promise<Map<string, NodePerformance>> {
        const performance = new Map<string, NodePerformance>();
        const nodes = await this.taskScheduler.getActiveNodes();
        
        for (const nodeId of nodes) {
            const stats = await this.taskScheduler.getNodeStats(nodeId);
            const existingPerf = this.nodePerformance.get(nodeId) || { taskCompletionTrend: [] };
            const trend = [...existingPerf.taskCompletionTrend, stats.successRate];
            if (trend.length > 10) trend.shift(); // Keep last 10 measurements

            const perf: NodePerformance = {
                nodeId,
                successRate: stats.successRate,
                avgResponseTime: stats.avgResponseTime,
                lastHeartbeat: stats.lastHeartbeat,
                resourceUtilization: stats.resourceUtilization,
                taskCompletionTrend: trend
            };

            performance.set(nodeId, perf);
            this.nodePerformance.set(nodeId, perf);
        }

        return performance;
    }

    private async calculateEconomicHealth(): Promise<EconomicMetrics> {
        const stats = this.stakingContract.getStakingStats();
        return {
            circulatingSupply: BigInt(0), // Placeholder
            totalStaked: stats.totalStaked,
            totalRewardsDistributed: BigInt(0), // Placeholder
            activeNodes: stats.activeStakers,
            averageReward: 0, // Placeholder
            networkUtilization: await this.calculateNetworkUtilization()
        };
    }

    private calculateHealthScore(metrics: {
        networkLoad: number;
        errorRate: number;
        nodePerformance: Map<string, NodePerformance>;
        economicHealth: EconomicMetrics;
    }): number {
        const loadScore = Math.max(0, 1 - metrics.networkLoad / 100);
        const errorScore = Math.max(0, 1 - metrics.errorRate);
        const perfScore = Array.from(metrics.nodePerformance.values())
            .reduce((sum, perf) => sum + perf.successRate, 0) / (metrics.nodePerformance.size || 1);
        const economicScore = metrics.economicHealth.networkUtilization;

        return (loadScore * 0.25 + errorScore * 0.25 + perfScore * 0.25 + economicScore * 0.25) * 100;
    }

    private async calculateNetworkUtilization(): Promise<number> {
        const stats = this.stakingContract.getStakingStats();
        return stats.activeStakers > 0 ? Number(stats.totalStaked) / Number(stats.maxStake * BigInt(stats.activeStakers)) : 0;
    }

    private async calculateTaskThroughput(): Promise<number> {
        const queueStatus = await this.taskScheduler.getQueueStatus();
        const elapsed = (Date.now() - this.metrics.lastUpdate) / 60000; // Minutes
        return elapsed > 0 ? queueStatus.completedTasks / elapsed : 0;
    }

    private calculateLatencyVariance(nodePerformance: Map<string, NodePerformance>): number {
        const responseTimes = Array.from(nodePerformance.values()).map(p => p.avgResponseTime);
        if (responseTimes.length < 2) return 0;

        const mean = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
        const variance = responseTimes.reduce((sum, time) => sum + Math.pow(time - mean, 2), 0) / responseTimes.length;
        return Math.sqrt(variance);
    }

    private async runPredictiveAnalytics(): Promise<Prediction[]> {
        if (this.historicalMetrics.length < 5) return [];

        const predictions: Prediction[] = [];
        const recentMetrics = this.historicalMetrics.slice(-5); // Last 5 minutes

        const loadTrend = this.calculateTrend(recentMetrics.map(m => m.networkLoad));
        const errorTrend = this.calculateTrend(recentMetrics.map(m => m.errorRate));
        const healthTrend = this.calculateTrend(recentMetrics.map(m => m.healthScore || 0));

        for (let i = 1; i <= 5; i++) { // Predict next 5 minutes
            const time = Date.now() + i * 60000;
            const predictedLoad = Math.max(0, Math.min(100, recentMetrics[recentMetrics.length - 1].networkLoad + loadTrend * i));
            const predictedError = Math.max(0, Math.min(1, recentMetrics[recentMetrics.length - 1].errorRate + errorTrend * i));
            const predictedHealth = Math.max(0, Math.min(100, (recentMetrics[recentMetrics.length - 1].healthScore || 0) + healthTrend * i));

            predictions.push({ time, networkLoad: predictedLoad, errorRate: predictedError, healthScore: predictedHealth });

            if (predictedLoad > 90 || predictedError > 0.08 || predictedHealth < 60) {
                this.addAlert({
                    type: 'predictive',
                    severity: 'high',
                    message: `Predicted issue in ${i} min: Load=${predictedLoad.toFixed(2)}%, Error=${(predictedError * 100).toFixed(2)}%, Health=${predictedHealth.toFixed(2)}`
                });
                await this.attemptPreemptiveRecovery(predictedLoad, predictedError);
            }
        }

        return predictions;
    }

    private calculateTrend(values: number[]): number {
        if (values.length < 2) return 0;
        const x = Array.from({ length: values.length }, (_, i) => i);
        const meanX = x.reduce((a, b) => a + b, 0) / x.length;
        const meanY = values.reduce((a, b) => a + b, 0) / values.length;
        const numerator = x.reduce((sum, xi, i) => sum + (xi - meanX) * (values[i] - meanY), 0);
        const denominator = x.reduce((sum, xi) => sum + Math.pow(xi - meanX, 2), 0);
        return denominator > 0 ? numerator / denominator : 0;
    }

    public addAlert(alert: Omit<AlertHistory, 'id' | 'timestamp'>): void {
        if (this.alerts.length >= this.maxAlerts) this.alerts.shift();
        useMonitoringStore.getState().addAlert(alert);
    }

    public clearAlerts(): void {
        useMonitoringStore.getState().clearAlerts();
    }

    public getMetrics(): NetworkMetrics {
        return useMonitoringStore.getState().metrics;
    }

    public getAlerts(): AlertHistory[] {
        return useMonitoringStore.getState().alerts;
    }

    public updateMetrics(metrics: Partial<NetworkMetrics> & { economicMetrics?: EconomicMetrics; healthScore?: number }): void {
        useMonitoringStore.getState().updateMetrics(metrics);
    }

    private async handleCriticalAlert(id: string, type: string, severity: string, message: string, recoveryAction: () => Promise<void>): Promise<void> {
        const attempts = this.recoveryAttempts.get(id) || 0;
        const config = useMonitoringStore.getState().config;

        this.addAlert({ type, severity, message });

        if (attempts < config.autoRecoveryAttempts) {
            try {
                await recoveryAction();
                this.recoveryAttempts.set(id, attempts + 1);
                this.addAlert({
                    type: 'system',
                    severity: 'low',
                    message: `${message} - Recovery attempt ${attempts + 1} succeeded`
                });
            } catch (error) {
                this.addAlert({
                    type: 'system',
                    severity: 'critical',
                    message: `${message} - Recovery failed: ${error instanceof Error ? error.message : 'Unknown error'}`
                });
            }
        } else {
            this.addAlert({
                type: 'system',
                severity: 'critical',
                message: `${message} - Max recovery attempts reached`
            });
        }
    }

    private async attemptLoadReduction(): Promise<void> {
        await this.taskScheduler.cancelLowPriorityTasks(); // Hypothetical method
        await this.security.pauseOperations();
        await new Promise(resolve => setTimeout(resolve, 3000));
        await this.security.resumeOperations();
    }

    private async attemptErrorRecovery(): Promise<void> {
        const failedTasks = (await this.taskScheduler.getQueueStatus()).failedTasks;
        if (failedTasks > 0) {
            await this.taskScheduler.retryFailedTasks(); // Hypothetical method
        }
    }

    private async attemptNodeRecovery(nodeId: string): Promise<void> {
        const validated = await this.security.validateNode(nodeId);
        if (!validated) {
            await this.stakingContract.slash(new PublicKey(nodeId), BigInt(100) * BigInt(1e9), 'Node recovery failed');
        }
    }

    private async attemptPerformanceRecovery(nodeId: string): Promise<void> {
        const stake = await this.stakingContract.getStake(new PublicKey(nodeId));
        if (stake > BigInt(0)) {
            await this.stakingContract.slash(new PublicKey(nodeId), stake / BigInt(10), 'Poor performance');
            this.addAlert({
                type: 'performance',
                severity: 'high',
                message: `Node ${nodeId} slashed for poor performance`
            });
        }
    }

    private async attemptHealthRecovery(): Promise<void> {
        this.addAlert({
            type: 'system',
            severity: 'high',
            message: 'Initiating system health recovery'
        });

        await this.security.pauseOperations();
        await this.taskScheduler.cancelLowPriorityTasks(); // Hypothetical method
        await new Promise(resolve => setTimeout(resolve, 5000));
        await this.security.resumeOperations();
        await this.taskScheduler.resumeTasks(); // Hypothetical method

        this.addAlert({
            type: 'system',
            severity: 'medium',
            message: 'System health recovery completed'
        });
    }

    private async attemptPreemptiveRecovery(predictedLoad: number, predictedError: number): Promise<void> {
        if (predictedLoad > 90) {
            await this.taskScheduler.adjustTaskPriority('high'); // Hypothetical method
            this.addAlert({
                type: 'predictive',
                severity: 'medium',
                message: 'Preemptively adjusting task priorities due to high predicted load'
            });
        }
        if (predictedError > 0.08) {
            await this.attemptErrorRecovery();
            this.addAlert({
                type: 'predictive',
                severity: 'medium',
                message: 'Preemptively retrying tasks due to high predicted error rate'
            });
        }
    }
}

export const monitoringService = new MonitoringService(
    new SecurityService(
        { maxRequestsPerMinute: 100, maxConcurrentTasks: 50, maxNodeFailures: 3 },
        new RateLimiter(),
        {} as IStakingContract
    ),
    new TaskScheduler(
        new RateLimiter(),
        new SecurityService(
            { maxRequestsPerMinute: 100, maxConcurrentTasks: 50, maxNodeFailures: 3 },
            new RateLimiter(),
            {} as IStakingContract
        ),
        new TaskValidator(new SecurityService({ maxRequestsPerMinute: 100, maxConcurrentTasks: 50, maxNodeFailures: 3 }))
    ),
    new StakingContract(
        new Connection(process.env.VITE_NETWORK || 'https://api.testnet.solana.com'),
        Keypair.generate(),
        new PublicKey('TokenkegQfeZyiNwAJbNbGKpfXDcWqB2h6bZ6g5b5f'),
        {} as MonitoringService,
        new SecurityService({ maxRequestsPerMinute: 100, maxConcurrentTasks: 50, maxNodeFailures: 3 })
    )
);