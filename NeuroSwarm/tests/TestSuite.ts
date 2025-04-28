import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { MonitoringService } from '../src/services/MonitoringService';
import { SecurityService } from '../src/services/SecurityService';
import { TaskScheduler } from '../src/services/TaskScheduler';
import { EconomicController } from '../src/services/EconomicController';
import { StakingContract } from '../src/contracts/StakingContract';
import { TokenVesting } from '../src/contracts/TokenVesting';
import { RateLimiter } from '../src/services/RateLimiter';
import { RewardService } from '../src/services/RewardService';
import { MonitoringDashboard } from '../src/services/MonitoringDashboard';

class TestSuite {
    private connection: Connection;
    private authority: Keypair;
    private tokenMint: PublicKey;
    
    // Services
    private monitoring: MonitoringService;
    private security: SecurityService;
    private rateLimiter: RateLimiter;
    private taskScheduler: TaskScheduler;
    private staking: StakingContract;
    private vesting: TokenVesting;
    private rewards: RewardService;
    private economics: EconomicController;
    private dashboard: MonitoringDashboard;

    constructor() {
        // Initialize Solana connection
        this.connection = new Connection('http://localhost:8899', 'confirmed');
        this.authority = Keypair.generate();
        this.tokenMint = new PublicKey('YOUR_TOKEN_MINT');

        // Initialize services
        this.monitoring = new MonitoringService();
        this.security = new SecurityService(this.monitoring);
        this.rateLimiter = new RateLimiter();
        
        this.vesting = new TokenVesting(
            this.connection,
            this.authority,
            this.tokenMint
        );

        this.staking = new StakingContract(
            this.connection,
            this.authority,
            this.tokenMint,
            this.monitoring,
            this.security
        );

        this.rewards = new RewardService(
            this.vesting,
            this.monitoring,
            {
                baseReward: BigInt(100) * BigInt(1e9),
                complexityMultiplier: 1.5,
                stakingMultiplier: 2.0,
                performanceMultiplier: 1.2,
                minStake: BigInt(1000) * BigInt(1e9)
            }
        );

        this.taskScheduler = new TaskScheduler(
            this.rateLimiter,
            this.security,
            this.monitoring
        );

        this.economics = new EconomicController(
            this.monitoring,
            this.security,
            this.staking,
            this.rewards,
            this.rateLimiter
        );

        this.dashboard = new MonitoringDashboard(
            this.monitoring,
            this.economics,
            this.taskScheduler,
            this.security
        );
    }

    async runAllTests() {
        console.log('Starting test suite...');

        try {
            await this.testTokenVesting();
            await this.testStaking();
            await this.testTaskScheduling();
            await this.testRewards();
            await this.testSecurity();
            await this.testEconomics();
            await this.testMonitoring();
            await this.testLoadScenarios();
            await this.testErrorScenarios();
            
            console.log('All tests completed successfully!');
        } catch (error) {
            console.error('Test suite failed:', error);
            throw error;
        }
    }

    private async testTokenVesting() {
        console.log('Testing token vesting...');

        // Test vesting schedule creation
        const beneficiary = Keypair.generate().publicKey;
        await this.vesting.createVestingSchedule(
            beneficiary,
            Math.floor(Date.now() / 1000),
            86400, // 1 day cliff
            86400 * 30, // 30 day vesting
            3600, // 1 hour intervals
            BigInt(1000) * BigInt(1e9)
        );

        // Verify schedule
        const schedule = await this.vesting.getVestingSchedule(beneficiary);
        if (!schedule) throw new Error('Vesting schedule not created');

        // Test emergency pause
        await this.vesting.emergencyPause();
        try {
            await this.vesting.createVestingSchedule(
                beneficiary,
                Math.floor(Date.now() / 1000),
                0,
                86400,
                3600,
                BigInt(100) * BigInt(1e9)
            );
            throw new Error('Should not allow vesting while paused');
        } catch (error) {
            if (!(error instanceof Error) || !error.message.includes('paused')) {
                throw error;
            }
        }
    }

    private async testStaking() {
        console.log('Testing staking...');

        // Test stake
        const staker = Keypair.generate().publicKey;
        await this.staking.stake(
            staker,
            BigInt(1000) * BigInt(1e9)
        );

        // Verify stake
        const stakeInfo = await this.staking.getStakeInfo(staker);
        if (!stakeInfo) throw new Error('Stake not created');

        // Test slashing
        await this.staking.slash(
            staker,
            BigInt(100) * BigInt(1e9),
            'Test slash'
        );

        // Verify slash
        const updatedStakeInfo = await this.staking.getStakeInfo(staker);
        if (!updatedStakeInfo || updatedStakeInfo.amount >= stakeInfo.amount) {
            throw new Error('Slash failed');
        }
    }

    private async testTaskScheduling() {
        console.log('Testing task scheduling...');

        // Create test task
        const input = new Float32Array([1, 2, 3, 4, 5]);
        const shader = 'test_shader';
        const taskId = await this.taskScheduler.submitTask(
            input,
            shader,
            'high'
        );

        // Verify task creation
        const task = this.taskScheduler.getTaskStatus(taskId);
        if (!task) throw new Error('Task not created');

        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Check task status
        const processedTask = this.taskScheduler.getTaskStatus(taskId);
        if (!processedTask || processedTask.status === 'pending') {
            throw new Error('Task not processed');
        }
    }

    private async testRewards() {
        console.log('Testing rewards...');

        // Test reward calculation
        const nodeId = Keypair.generate().publicKey;
        const reward = await this.rewards.calculateReward(
            nodeId,
            100, // complexity
            BigInt(1000) * BigInt(1e9), // stake
            0.95 // performance
        );

        if (reward <= BigInt(0)) throw new Error('Invalid reward calculation');

        // Test distribution
        const success = await this.rewards.distributeReward(nodeId, reward);
        if (!success) throw new Error('Reward distribution failed');

        // Verify distribution
        const stats = this.rewards.getDistributionStats();
        if (stats.totalDistributed < reward) {
            throw new Error('Reward not properly tracked');
        }
    }

    private async testSecurity() {
        console.log('Testing security...');

        // Test rate limiting
        const testId = 'test_operation';
        const results = await Promise.all(
            Array(10).fill(0).map(() => 
                this.rateLimiter.checkRateLimit('test_operation', testId)
            )
        );

        if (results.every(r => r)) {
            throw new Error('Rate limiting not working');
        }

        // Test security validations
        const validationResult = await this.security.validateRequest({
            type: 'task_submission',
            nodeId: 'test_node',
            timestamp: Date.now()
        });

        if (!validationResult.valid) {
            throw new Error('Valid request rejected');
        }
    }

    private async testEconomics() {
        console.log('Testing economics...');

        // Test economic health check
        const health = await this.economics.checkEconomicHealth();
        
        // Initial state should have some issues
        if (health.healthy) {
            throw new Error('New system should not be perfectly healthy');
        }

        // Verify metrics
        const metrics = this.economics.getMetrics();
        if (
            metrics.circulatingSupply <= BigInt(0) ||
            metrics.totalStaked < BigInt(0) ||
            metrics.activeNodes < 0
        ) {
            throw new Error('Invalid economic metrics');
        }
    }

    private async testMonitoring() {
        console.log('Testing monitoring...');

        // Test alert system
        let alertReceived = false;
        this.dashboard.subscribeToAlerts(() => {
            alertReceived = true;
        });

        // Trigger an alert condition
        await this.staking.slash(
            Keypair.generate().publicKey,
            BigInt(1000) * BigInt(1e9),
            'Test slash'
        );

        // Verify alert
        if (!alertReceived) {
            throw new Error('Alert system not working');
        }

        // Test metrics collection
        const networkMetrics = this.dashboard.getLatestNetworkMetrics();
        const securityMetrics = this.dashboard.getLatestSecurityMetrics();
        const economicMetrics = this.dashboard.getLatestEconomicMetrics();

        if (!networkMetrics || !securityMetrics || !economicMetrics) {
            throw new Error('Metrics collection not working');
        }
    }

    private async testLoadScenarios() {
        console.log('Testing load scenarios...');

        // Simulate high load
        const tasks = await Promise.all(
            Array(100).fill(0).map(() => 
                this.taskScheduler.submitTask(
                    new Float32Array([1, 2, 3]),
                    'test_shader',
                    'medium'
                )
            )
        );

        // Verify system stability
        const networkLoad = this.taskScheduler.calculateNetworkLoad();
        if (networkLoad <= 0) {
            throw new Error('Network load not properly calculated');
        }

        // Check task completion
        await new Promise(resolve => setTimeout(resolve, 5000));
        const completedTasks = tasks.map(id => 
            this.taskScheduler.getTaskStatus(id)
        ).filter(task => task?.status === 'completed');

        if (completedTasks.length === 0) {
            throw new Error('No tasks completed under load');
        }
    }

    private async testErrorScenarios() {
        console.log('Testing error scenarios...');

        // Test invalid stake amount
        try {
            await this.staking.stake(
                Keypair.generate().publicKey,
                BigInt(0)
            );
            throw new Error('Should not allow zero stake');
        } catch (error) {
            if (!(error instanceof Error) || !error.message.includes('amount')) {
                throw error;
            }
        }

        // Test invalid task
        try {
            await this.taskScheduler.submitTask(
                new Float32Array(0),
                '',
                'high'
            );
            throw new Error('Should not allow empty task');
        } catch (error) {
            if (!(error instanceof Error) || !error.message.includes('invalid')) {
                throw error;
            }
        }

        // Test emergency pause
        await this.economics.emergencyPause();
        try {
            await this.staking.stake(
                Keypair.generate().publicKey,
                BigInt(1000) * BigInt(1e9)
            );
            throw new Error('Should not allow operations while paused');
        } catch (error) {
            if (!(error instanceof Error) || !error.message.includes('paused')) {
                throw error;
            }
        }
    }
}

// Export for use in test runner
export const testSuite = new TestSuite();
