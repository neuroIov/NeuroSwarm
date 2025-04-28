import { MonitoringService } from './MonitoringService';
import { EconomicController } from './EconomicController';
import { TaskScheduler } from './TaskScheduler';
import { SecurityService } from './SecurityService';

interface NetworkMetrics {
    timestamp: number;
    activeNodes: number;
    taskCount: number;
    successRate: number;
    avgLatency: number;
    networkLoad: number;
}

interface SecurityMetrics {
    timestamp: number;
    bannedNodes: number;
    rateLimit: {
        exceeded: number;
        remaining: number;
    };
    slashEvents: number;
    validationFailures: number;
}

interface EconomicMetrics {
    timestamp: number;
    totalStaked: bigint;
    rewardsDistributed: bigint;
    networkUtilization: number;
    healthScore: number;
}

export class MonitoringDashboard {
    private monitoring: MonitoringService;
    private economics: EconomicController;
    private scheduler: TaskScheduler;
    private security: SecurityService;

    private networkHistory: NetworkMetrics[] = [];
    private securityHistory: SecurityMetrics[] = [];
    private economicHistory: EconomicMetrics[] = [];
    private alertSubscribers: ((alert: string) => void)[] = [];

    constructor(
        monitoring: MonitoringService,
        economics: EconomicController,
        scheduler: TaskScheduler,
        security: SecurityService
    ) {
        this.monitoring = monitoring;
        this.economics = economics;
        this.scheduler = scheduler;
        this.security = security;
        this.startMonitoring();
    }

    private startMonitoring() {
        // Update metrics every minute
        setInterval(() => this.updateMetrics(), 60000);

        // Check system health every 5 minutes
        setInterval(() => this.checkSystemHealth(), 300000);

        // Cleanup old data every hour
        setInterval(() => this.cleanupOldData(), 3600000);
    }

    private async updateMetrics() {
        const timestamp = Date.now();

        // Update network metrics
        this.networkHistory.push({
            timestamp,
            activeNodes: this.scheduler.getActiveNodesCount(),
            taskCount: this.scheduler.getTaskCount(),
            successRate: this.scheduler.getSuccessRate(),
            avgLatency: this.scheduler.getAverageLatency(),
            networkLoad: this.scheduler.calculateNetworkLoad()
        });

        // Update security metrics
        this.securityHistory.push({
            timestamp,
            bannedNodes: this.security.getBannedNodesCount(),
            rateLimit: this.security.getRateLimitStats(),
            slashEvents: this.security.getSlashEventsCount(),
            validationFailures: this.security.getValidationFailuresCount()
        });

        // Update economic metrics
        const economicStats = this.economics.getMetrics();
        this.economicHistory.push({
            timestamp,
            totalStaked: economicStats.totalStaked,
            rewardsDistributed: economicStats.totalRewardsDistributed,
            networkUtilization: economicStats.networkUtilization,
            healthScore: await this.calculateHealthScore()
        });

        // Update monitoring service
        this.monitoring.getState().updateMetrics({
            network: this.getLatestNetworkMetrics(),
            security: this.getLatestSecurityMetrics(),
            economic: this.getLatestEconomicMetrics()
        });
    }

    private async checkSystemHealth() {
        const networkHealth = this.checkNetworkHealth();
        const securityHealth = this.checkSecurityHealth();
        const economicHealth = await this.economics.checkEconomicHealth();

        if (!networkHealth.healthy) {
            this.raiseAlert('Network Health Issues', networkHealth.issues);
        }

        if (!securityHealth.healthy) {
            this.raiseAlert('Security Concerns', securityHealth.issues);
        }

        if (!economicHealth.healthy) {
            this.raiseAlert('Economic Health Issues', economicHealth.issues);
        }

        // Update overall system health
        const overallHealth = {
            healthy: networkHealth.healthy && securityHealth.healthy && economicHealth.healthy,
            timestamp: Date.now(),
            components: {
                network: networkHealth,
                security: securityHealth,
                economic: economicHealth
            }
        };

        this.monitoring.getState().updateSystemHealth(overallHealth);
    }

    private checkNetworkHealth() {
        const latest = this.getLatestNetworkMetrics();
        const issues: string[] = [];

        if (latest.activeNodes < 5) {
            issues.push('Low node count');
        }
        if (latest.successRate < 0.95) {
            issues.push('Low task success rate');
        }
        if (latest.avgLatency > 1000) {
            issues.push('High network latency');
        }
        if (latest.networkLoad > 0.9) {
            issues.push('Network overload');
        }

        return {
            healthy: issues.length === 0,
            issues
        };
    }

    private checkSecurityHealth() {
        const latest = this.getLatestSecurityMetrics();
        const issues: string[] = [];

        if (latest.bannedNodes > 0) {
            issues.push('Banned nodes detected');
        }
        if (latest.rateLimit.exceeded > 100) {
            issues.push('High rate limit violations');
        }
        if (latest.slashEvents > 0) {
            issues.push('Slash events detected');
        }
        if (latest.validationFailures > 50) {
            issues.push('High validation failure rate');
        }

        return {
            healthy: issues.length === 0,
            issues
        };
    }

    private async calculateHealthScore(): Promise<number> {
        const networkScore = this.calculateNetworkScore();
        const securityScore = this.calculateSecurityScore();
        const economicScore = this.calculateEconomicScore();

        return (networkScore * 0.4 + securityScore * 0.3 + economicScore * 0.3);
    }

    private calculateNetworkScore(): number {
        const latest = this.getLatestNetworkMetrics();
        return (
            (Math.min(latest.activeNodes, 100) / 100) * 0.3 +
            (latest.successRate) * 0.4 +
            (1 - Math.min(latest.avgLatency / 1000, 1)) * 0.3
        ) * 100;
    }

    private calculateSecurityScore(): number {
        const latest = this.getLatestSecurityMetrics();
        return Math.max(0, 100 -
            (latest.bannedNodes * 5) -
            (latest.rateLimit.exceeded / 10) -
            (latest.slashEvents * 2) -
            (latest.validationFailures / 2)
        );
    }

    private calculateEconomicScore(): number {
        const latest = this.getLatestEconomicMetrics();
        return latest.healthScore;
    }

    private cleanupOldData() {
        const cutoff = Date.now() - (7 * 24 * 60 * 60 * 1000); // Keep 7 days of data
        this.networkHistory = this.networkHistory.filter(m => m.timestamp > cutoff);
        this.securityHistory = this.securityHistory.filter(m => m.timestamp > cutoff);
        this.economicHistory = this.economicHistory.filter(m => m.timestamp > cutoff);
    }

    private raiseAlert(type: string, issues: string[]) {
        const alert = `[${type}] ${issues.join(', ')}`;
        this.monitoring.getState().addAlert(alert);
        this.alertSubscribers.forEach(subscriber => subscriber(alert));
    }

    // Public API
    subscribeToAlerts(callback: (alert: string) => void) {
        this.alertSubscribers.push(callback);
    }

    getLatestNetworkMetrics(): NetworkMetrics {
        return this.networkHistory[this.networkHistory.length - 1];
    }

    getLatestSecurityMetrics(): SecurityMetrics {
        return this.securityHistory[this.securityHistory.length - 1];
    }

    getLatestEconomicMetrics(): EconomicMetrics {
        return this.economicHistory[this.economicHistory.length - 1];
    }

    getHistoricalData(timeframe: '1h' | '24h' | '7d') {
        const cutoff = Date.now() - (
            timeframe === '1h' ? 3600000 :
            timeframe === '24h' ? 86400000 :
            604800000
        );

        return {
            network: this.networkHistory.filter(m => m.timestamp > cutoff),
            security: this.securityHistory.filter(m => m.timestamp > cutoff),
            economic: this.economicHistory.filter(m => m.timestamp > cutoff)
        };
    }
}
