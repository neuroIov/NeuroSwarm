import { PublicKey } from '@solana/web3.js';
import { create } from 'zustand';
import { logger } from '../utils/logger';
import { ContractService } from '../services/ContractService';
import { SolanaService } from '../services/SolanaService';

interface NodeMetrics {
    taskCount: number;
    successRate: number;
    averageExecutionTime: number;
    totalEarnings: number;
}

interface ResourceUsage {
    cpuUsage: number;
    memoryUsage: number;
    gpuUsage: number;
    networkBandwidth: number;
}

interface NodeState {
    // State properties
    isActive: boolean;
    isRunning: boolean;
    metrics: NodeMetrics;
    earnings: number;
    totalEarnings: number;
    publicKey: string | null;
    startTime: number | null;
    nodeId: string | null;
    cpuUsage: number;
    memoryUsage: number;
    networkUsage: number;
    successRate: number;
    completedTasks: number;
    
    // Actions
    setActive: (status: boolean) => void;
    updateMetrics: (metrics: Partial<NodeMetrics>) => void;
    updateEarnings: (amount: number) => void;
    setPublicKey: (key: string) => void;
    setStartTime: (time: number | null) => void;
    getUptime: () => number;
    setNodeId: (id: string) => void;
    setCpuUsage: (usage: number) => void;
    setMemoryUsage: (usage: number) => void;
    setNetworkUsage: (usage: number) => void;
    setSuccessRate: (rate: number) => void;
    setCompletedTasks: (count: number) => void;
    startNode: () => void;
    stopNode: () => void;
}

// Initialize store with secure defaults
// Load initial state from Supabase if available
const loadPersistedState = () => {
    try {
        // Check if we have stored values in sessionStorage
        const storedWalletAddress = sessionStorage.getItem('walletAddress');
        const storedIsActive = sessionStorage.getItem('nodeActive') === 'true';
        const storedIsRunning = sessionStorage.getItem('nodeRunning') === 'true';
        const storedStartTime = sessionStorage.getItem('nodeStartTime');
        const storedEarnings = sessionStorage.getItem('nodeEarnings');
        const storedNodeId = sessionStorage.getItem('nodeId');
        const storedCpuUsage = sessionStorage.getItem('cpuUsage');
        const storedMemoryUsage = sessionStorage.getItem('memoryUsage');
        const storedNetworkUsage = sessionStorage.getItem('networkUsage');
        const storedSuccessRate = sessionStorage.getItem('successRate');
        const storedCompletedTasks = sessionStorage.getItem('completedTasks');
        
        return {
            isActive: storedIsActive || false,
            isRunning: storedIsRunning || false,
            earnings: storedEarnings ? parseFloat(storedEarnings) : 0,
            totalEarnings: storedEarnings ? parseFloat(storedEarnings) : 0,
            publicKey: storedWalletAddress || null, // Store as string to match interface
            startTime: storedStartTime ? parseInt(storedStartTime) : null,
            nodeId: storedNodeId || null,
            cpuUsage: storedCpuUsage ? parseFloat(storedCpuUsage) : 30.0, // Default values
            memoryUsage: storedMemoryUsage ? parseFloat(storedMemoryUsage) : 40.0,
            networkUsage: storedNetworkUsage ? parseFloat(storedNetworkUsage) : 400.0,
            successRate: storedSuccessRate ? parseFloat(storedSuccessRate) : 100.0,
            completedTasks: storedCompletedTasks ? parseInt(storedCompletedTasks) : 0,
            metrics: {
                taskCount: storedCompletedTasks ? parseInt(storedCompletedTasks) : 0,
                successRate: storedSuccessRate ? parseFloat(storedSuccessRate) : 100.0,
                averageExecutionTime: 0,
                totalEarnings: storedEarnings ? parseFloat(storedEarnings) : 0,
            }
        };
    } catch (error) {
        logger.error('Error loading persisted state:', error);
        return {
            isActive: false,
            isRunning: false,
            metrics: {
                taskCount: 0,
                successRate: 100,
                averageExecutionTime: 0,
                totalEarnings: 0,
            },
            earnings: 0,
            totalEarnings: 0,
            publicKey: null,
            startTime: null,
            nodeId: null,
            cpuUsage: 30.0,
            memoryUsage: 40.0,
            networkUsage: 400.0,
            successRate: 100.0,
            completedTasks: 0,
        };
    }
};

export const useNodeStore = create<NodeState>((set, get) => ({
    ...loadPersistedState(),
    setActive: (active) => {
        const currentTime = Date.now();
        const startTime = active ? currentTime : null;
        
        // Persist the active state and start time to sessionStorage
        sessionStorage.setItem('nodeActive', active.toString());
        if (startTime) {
            sessionStorage.setItem('nodeStartTime', startTime.toString());
        } else {
            sessionStorage.removeItem('nodeStartTime');
        }
        
        set({ 
            isActive: active,
            startTime: active ? currentTime : null
        });
        
        // Attempt to record node status in Supabase if we have a public key
        const publicKey = get().publicKey;
        if (publicKey) {
            try {
                // This would be implemented in SupabaseService
                // supabaseService.updateNodeStatus(publicKey, active);
                logger.log(`Node status updated in Supabase: ${active ? 'active' : 'inactive'}`);
            } catch (error) {
                logger.error('Failed to update node status in Supabase:', error);
            }
        }
    },
    
    startNode: () => {
        set({ isRunning: true });
        sessionStorage.setItem('nodeRunning', 'true');
        logger.log('Node started running');
    },
    
    stopNode: () => {
        set({ isRunning: false });
        sessionStorage.setItem('nodeRunning', 'false');
        logger.log('Node stopped running');
    },
    
    setNodeId: (id) => {
        set({ nodeId: id });
        sessionStorage.setItem('nodeId', id);
        logger.log(`Node ID set to: ${id}`);
    },
    
    setCpuUsage: (usage) => {
        set({ cpuUsage: usage });
        sessionStorage.setItem('cpuUsage', usage.toString());
    },
    
    setMemoryUsage: (usage) => {
        set({ memoryUsage: usage });
        sessionStorage.setItem('memoryUsage', usage.toString());
    },
    
    setNetworkUsage: (usage) => {
        set({ networkUsage: usage });
        sessionStorage.setItem('networkUsage', usage.toString());
    },
    
    setSuccessRate: (rate) => {
        set({ successRate: rate });
        sessionStorage.setItem('successRate', rate.toString());
    },
    
    setCompletedTasks: (count) => {
        set({ completedTasks: count });
        sessionStorage.setItem('completedTasks', count.toString());
    },
    updateMetrics: (newMetrics) => 
        set((state) => ({ 
            metrics: { ...state.metrics, ...newMetrics }
        })),
    updateEarnings: (amount) => {
        set((state) => {
            const newEarnings = state.earnings + amount;
            const newTotalEarnings = state.totalEarnings + amount;
            
            // Persist earnings to sessionStorage
            sessionStorage.setItem('nodeEarnings', newEarnings.toString());
            sessionStorage.setItem('totalEarnings', newTotalEarnings.toString());
            
            // Update completed tasks count
            const newTaskCount = state.completedTasks + 1;
            sessionStorage.setItem('completedTasks', newTaskCount.toString());
            sessionStorage.setItem('taskCount', newTaskCount.toString());
            
            return { 
                earnings: newEarnings,
                totalEarnings: newTotalEarnings,
                completedTasks: newTaskCount,
                taskCount: newTaskCount,
                metrics: {
                    ...state.metrics,
                    totalEarnings: newTotalEarnings,
                    taskCount: newTaskCount
                }
            };
        });
        
        // If we have a Solana integration, we would record this on-chain
        const publicKey = get().publicKey;
        if (publicKey) {
            try {
                // This would be implemented in SolanaService
                // We would need to convert the publicKey string to a Solana PublicKey
                // const solanaPublicKey = new PublicKey(publicKey);
                // solanaService.recordEarnings(solanaPublicKey, amount);
                logger.log(`Earnings recorded for Solana wallet: ${amount} NLOV`);
            } catch (error) {
                logger.error('Failed to record earnings on Solana:', error);
            }
        }
    },
    setPublicKey: (key) => {
        // Persist wallet address to sessionStorage
        if (key) {
            sessionStorage.setItem('walletAddress', key);
        } else {
            sessionStorage.removeItem('walletAddress');
        }
        
        set({ publicKey: key });
    },
    setStartTime: (time) => {
        // Persist start time to sessionStorage
        if (time) {
            sessionStorage.setItem('nodeStartTime', time.toString());
        } else {
            sessionStorage.removeItem('nodeStartTime');
        }
        
        set({ startTime: time });
    },
    getUptime: () => {
        const state = get();
        if (!state.startTime || !state.isActive) return 0;
        return Math.floor((Date.now() - state.startTime) / 1000);
    }
}));

interface Task {
    id: string;
    type: 'compute' | 'storage' | 'inference';
    data: unknown;
    requirements: {
        minCpu: number;
        minMemory: number;
        minGpu?: number;
    };
}

export class ComputeNode {
    private nodeId: string;
    private metrics: NodeMetrics;
    private resourceUsage: ResourceUsage;
    private stake: number;
    private earnings: number;
    private maxLoad: number;
    private ownerKey: PublicKey | null;
    private isActive: boolean;
    private taskHistory: Map<string, { success: boolean; executionTime: number }>;
    private updateInterval: ReturnType<typeof setInterval> | null;
    private contractService: ContractService | null;
    private solanaService: SolanaService | null;
    private devicePublicKey: PublicKey | null;

    constructor(nodeId: string, contractService?: ContractService, solanaService?: SolanaService) {
        this.nodeId = nodeId;
        this.metrics = {
            taskCount: 0,
            successRate: 100,
            averageExecutionTime: 0,
            totalEarnings: 0
        };
        this.resourceUsage = {
            cpuUsage: 0,
            memoryUsage: 0,
            gpuUsage: 0,
            networkBandwidth: 0
        };
        this.stake = 0;
        this.earnings = 0;
        this.maxLoad = 90;
        this.ownerKey = null;
        this.isActive = true;
        this.taskHistory = new Map();
        this.updateInterval = null;
        this.contractService = contractService || null;
        this.solanaService = solanaService || null;
        this.devicePublicKey = null;
        
        // Don't automatically start monitoring - wait for explicit call
    }

    // Make startMonitoring public so it can be called from App.tsx
    public async startMonitoring(): Promise<void> {
        if (this.updateInterval) return;
        
        // Start monitoring resource usage immediately to prevent UI hanging
        this.updateInterval = setInterval(() => {
            this.updateResourceUsage();
            
            // Poll for available tasks if connected to blockchain
            if (this.contractService && this.devicePublicKey) {
                this.pollForTasks().catch(err => logger.error('Error polling tasks:', err));
            }
        }, 5000);
        
        // Update UI state to show node is active immediately
        this.isActive = true;
        
        // Update the resource usage immediately to show activity
        this.updateResourceUsage();
        
        // Start tracking uptime if we have a contract service with Supabase
        if (this.contractService && this.ownerKey) {
            // Check if the contract service has a Supabase service
            if ('supabaseService' in this.contractService && this.contractService.supabaseService) {
                const nodeId = this.nodeId;
                const walletAddress = this.ownerKey.toString();
                
                // Start tracking uptime
                this.contractService.supabaseService.trackNodeUptime(nodeId, walletAddress)
                    .catch(err => logger.error('Failed to start tracking uptime:', err));
            }
            
            // Register device on the blockchain if not already registered - do this in the background
            // Use setTimeout to make this truly non-blocking and allow the UI to update first
            if (this.contractService && this.ownerKey && !this.devicePublicKey) {
                setTimeout(() => {
                    this.registerDeviceAsync().catch(error => {
                        logger.error('Failed to register device on blockchain:', error);
                    });
                }, 100); // Small delay to ensure UI updates first
            }
        }
    }

    /**
     * Register device on the blockchain asynchronously
     * This method is called in the background to avoid UI hanging
     */
    private async registerDeviceAsync(): Promise<void> {
        if (!this.contractService || !this.ownerKey) return;
        
        try {
            // Get device specs for registration - don't await to prevent blocking
            this.getDeviceSpecs().then(async specs => {
                try {
                    // Make sure owner key is available
                    if (!this.ownerKey) {
                        throw new Error('Owner key is not available');
                    }
                    
                    // Register device on the blockchain
                    // Ensure specs properties are not null
                    const gpuModel = specs.gpuModel || 'Unknown GPU';
                    const vram = specs.vram || 0;
                    const hashRate = specs.hashRate || 0;
                    
                    const result = await this.contractService.registerDevice(
                        gpuModel,
                        vram,
                        hashRate
                    );
                    
                    // Store the device ID for future reference
                    // Handle both string and PublicKey return types
                    if (typeof result === 'string') {
                        this.devicePublicKey = new PublicKey(result);
                    } else if (result) {
                        // If it's already a PublicKey or TransactionSignature
                        this.devicePublicKey = new PublicKey(result.toString());
                    }
                    logger.log(`Device registered with ID: ${result}`);
                    
                    // Stake some tokens if available - also in a non-blocking way
                    setTimeout(() => {
                        this.stakeTokens().catch(err => {
                            logger.error('Error staking tokens:', err);
                        });
                    }, 500);
                } catch (registerError) {
                    logger.error('Failed to register device on blockchain:', registerError);
                }
            }).catch(error => {
                logger.error('Failed to get device specs:', error);
            });
        } catch (error: any) {
            logger.error('Failed to register device on blockchain:', error);
            // Don't rethrow to prevent blocking the UI thread
        }
    }
    
    private updateResourceUsage(): void {
        // Try to get real system metrics if available
        if (this.solanaService) {
            try {
                // Use the device ID to get real metrics from the blockchain
                if (this.devicePublicKey) {
                    this.solanaService.getDeviceStatus(this.devicePublicKey.toString())
                        .then(status => {
                            // Update with real metrics from blockchain
                            this.resourceUsage = {
                                cpuUsage: status.cpuUsage,
                                memoryUsage: 100 - status.availableVram, // Convert available to used
                                gpuUsage: status.currentLoad,
                                networkBandwidth: 400 // Default value for network
                            };
                        })
                        .catch(error => {
                            logger.error('Error fetching device status:', error);
                            // Fall back to baseline values on error
                            this.setBaselineResourceUsage();
                        });
                } else {
                    // No device ID yet, use baseline values
                    this.setBaselineResourceUsage();
                }
            } catch (error) {
                logger.error('Error updating resource usage:', error);
                this.setBaselineResourceUsage();
            }
        } else {
            // No blockchain connection, use baseline values
            this.setBaselineResourceUsage();
        }
    }
    
    // Set baseline resource usage values when real data is not available
    private setBaselineResourceUsage(): void {
        this.resourceUsage = {
            cpuUsage: 30,
            memoryUsage: 40,
            gpuUsage: 25,
            networkBandwidth: 400
        };
    }

    stopMonitoring(): void {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        this.isActive = false;
        
        // Stop tracking uptime if we have a contract service with Supabase
        if (this.contractService && this.ownerKey) {
            // Check if the contract service has a Supabase service
            if ('supabaseService' in this.contractService && this.contractService.supabaseService) {
                const nodeId = this.nodeId;
                
                // Update uptime on disconnect
                this.contractService.supabaseService.updateNodeUptimeOnDisconnect(nodeId)
                    .catch(err => logger.error('Failed to update uptime on disconnect:', err));
            }
        }
    }

    canAcceptTask(task: Task): boolean {
        if (!this.isActive || !this.ownerKey) return false;

        const { requirements } = task;
        const { cpuUsage, memoryUsage, gpuUsage } = this.resourceUsage;

        return (
            cpuUsage < this.maxLoad - requirements.minCpu &&
            memoryUsage < this.maxLoad - requirements.minMemory &&
            (!requirements.minGpu || gpuUsage < this.maxLoad - requirements.minGpu)
        );
    }

    getResourceUsage(): ResourceUsage {
        return { ...this.resourceUsage };
    }

    getMetrics(): NodeMetrics {
        return { ...this.metrics };
    }

    getStake(): number {
        return this.stake;
    }

    getEarnings(): number {
        return this.earnings;
    }

    getNodeId(): string {
        return this.nodeId;
    }

    public setOwner(publicKey: PublicKey): void {
        this.ownerKey = publicKey;
    }

    getOwner(): PublicKey | null {
        return this.ownerKey;
    }

    setStake(amount: number): void {
        if (amount < 0) throw new Error('Stake amount cannot be negative');
        this.stake = amount;
    }

    addEarnings(amount: number): void {
        if (amount < 0) throw new Error('Earnings amount cannot be negative');
        this.earnings += amount;
        this.metrics.totalEarnings += amount;
    }

    async executeTask(task: Task): Promise<boolean> {
        if (!this.canAcceptTask(task)) {
            logger.log(`Node ${this.nodeId} cannot accept task ${task.id} due to insufficient resources`);
            return false;
        }
        
        try {
            // Start tracking execution time
            const taskStartTime = Date.now();
            
            // Store original resource values to restore later
            const originalCpuUsage = this.resourceUsage.cpuUsage;
            const originalGpuUsage = this.resourceUsage.gpuUsage;
            const originalMemoryUsage = this.resourceUsage.memoryUsage;
            
            // Get real task requirements and adjust resource usage accordingly
            const cpuRequirement = task.requirements.minCpu || 20;
            const memoryRequirement = task.requirements.minMemory || 15;
            const gpuRequirement = task.requirements.minGpu || 30;
            
            // Update resource usage based on actual task requirements
            this.resourceUsage.cpuUsage = Math.min(100, originalCpuUsage + cpuRequirement);
            this.resourceUsage.memoryUsage = Math.min(100, originalMemoryUsage + memoryRequirement);
            this.resourceUsage.gpuUsage = Math.min(100, originalGpuUsage + gpuRequirement);
            
            // Execute the actual task on the blockchain
            let success = false;
            let executionTime = 0;
            
            if (this.solanaService) {
                try {
                    // Submit the task to the blockchain for execution
                    // Use submitTaskProof since we already have this method implemented
                    const proof = {
                        taskId: task.id,
                        timestamp: Date.now(),
                        computeTime: 0, // Will be updated after execution
                        hashRate: (await this.getDeviceSpecs()).hashRate,
                        success: true
                    };
                    
                    // Get the wallet for signing
                    const wallet = await this.getWalletForSigning();
                    
                    // Submit the task proof to the blockchain
                    await this.solanaService.submitTaskProof(proof, wallet);
                    success = true;
                    executionTime = Date.now() - taskStartTime;
                    
                    // Update the proof with the actual execution time
                    proof.computeTime = executionTime;
                    
                    // Submit the updated proof
                    await this.solanaService.submitTaskProof(proof, wallet);
                } catch (error) {
                    logger.error(`Error executing task ${task.id} on blockchain:`, error);
                    success = false;
                    executionTime = Date.now() - taskStartTime;
                }
            } else {
                // Fallback if blockchain connection is not available
                logger.warn('No blockchain connection available for task execution');
                success = false;
                executionTime = 1000; // Default value
            }
            
            // Update metrics
            this.metrics.taskCount++;
            
            // Update task history
            this.taskHistory.set(task.id, {
                success,
                executionTime
            });
            
            // Calculate success rate based on last 100 tasks
            const recentTasks = Array.from(this.taskHistory.values()).slice(-100);
            const successfulTasks = recentTasks.filter(t => t.success).length;
            this.metrics.successRate = recentTasks.length > 0 ? (successfulTasks / recentTasks.length) * 100 : 100;
            
            // Calculate average execution time
            const totalExecutionTime = recentTasks.reduce((sum, t) => sum + t.executionTime, 0);
            this.metrics.averageExecutionTime = recentTasks.length > 0 ? totalExecutionTime / recentTasks.length : 0;
            
            if (success) {
                // Get device specs for earnings calculation
                const deviceSpecs = await this.getDeviceSpecs();
                
                // Base earnings rate per task 
                // For a 24-hour period, wanna target 10-100 NLOV total
                // Assuming 3 tasks per minute = 4320 tasks per day
                // Target per-task earnings: 0.0023 - 0.023 NLOV per task
                const baseEarnings = 0.005; // Base rate of 0.005 NLOV per task
                
                // Apply device-specific multiplier
                let deviceMultiplier = 1.0;
                if (deviceSpecs.vram > 0) {
                    // Higher VRAM = higher earnings
                    deviceMultiplier += (deviceSpecs.vram / 8192) * 0.5;
                }
                
                // Apply hash rate multiplier
                const hashRateMultiplier = Math.min(1.5, deviceSpecs.hashRate / 500);
                
                // Apply execution time bonus (faster = better)
                const timeMultiplier = Math.max(0.8, 1.0 - (executionTime / 3000));
                
                // Calculate final earnings (much more conservative)
                const earnings = baseEarnings * deviceMultiplier * hashRateMultiplier * timeMultiplier;
                
                // Cap earnings to ensure we stay within target range
                const cappedEarnings = Math.min(0.023, earnings);
                
                // Update earnings
                this.addEarnings(cappedEarnings);
                
                // Submit proof to the blockchain if connected
                if (this.solanaService && this.contractService) {
                    try {
                        // Get the wallet for signing transactions
                        const wallet = await this.getWalletForSigning();
                        
                        // Submit the proof to the blockchain with real wallet signing
                        const proofTx = await this.solanaService.submitTaskProof(
                            {
                                taskId: task.id,
                                timestamp: Date.now(),
                                computeTime: executionTime,
                                hashRate: deviceSpecs.hashRate,
                                success: true
                            },
                            wallet // Use real wallet for signing
                        );
                        
                        logger.log(`Task proof submitted with transaction: ${proofTx}`);
                        
                        // Get earnings data from the blockchain
                        const nodeId = this.nodeId;
                        const ownerWalletAddress = this.ownerKey ? this.ownerKey.toString() : undefined;
                        
                        // Fetch real earnings data from the blockchain
                        const earningsData = await this.solanaService.getNodeEarnings(nodeId, ownerWalletAddress);
                        
                        // Use the real earnings amount from the blockchain
                        const realEarnings = earningsData.totalEarnings > 0 ? 
                            (earningsData.totalEarnings / earningsData.completedTasks) : // Average per task if available
                            0.1; // Default fallback value
                        
                        // Update the global state
                        const store = useNodeStore.getState();
                        store.updateEarnings(realEarnings);
                        store.updateMetrics({
                            taskCount: this.metrics.taskCount,
                            successRate: this.metrics.successRate,
                            averageExecutionTime: this.metrics.averageExecutionTime,
                            totalEarnings: this.metrics.totalEarnings
                        });
                        
                        // Record earnings in Supabase if available
                        if (this.ownerKey) {
                            // Use the Supabase service from the contract service if available
                            if ('supabaseService' in this.contractService) {
                                // @ts-ignore - We're checking for the property existence above
                                await this.contractService.supabaseService.recordEarnings(
                                    this.ownerKey ? this.ownerKey.toBase58() : '',
                                    realEarnings,
                                    1
                                ).catch((err: any) => logger.error('Failed to record earnings:', err));
                            }
                        }
                    } catch (error) {
                        logger.error('Failed to submit proof:', error);
                    }
                }
                
                logger.log(`Task ${task.id} completed successfully. Earned ${cappedEarnings.toFixed(6)} NLOV`);
            } else {
                logger.log(`Task ${task.id} failed`);
            }
            
            // Restore resource usage to slightly higher than before (simulating some residual load)
            this.resourceUsage.cpuUsage = Math.min(100, originalCpuUsage + 5);
            this.resourceUsage.memoryUsage = Math.min(100, originalMemoryUsage + 3);
            this.resourceUsage.gpuUsage = Math.min(100, originalGpuUsage + 7);
            
            return success;
        } catch (error) {
            logger.error('Error executing task:', error);
            return false;
        }
    }

    async verifyTaskSignature(signature: string, taskId: string): Promise<boolean> {
        if (!this.solanaService || !signature || typeof signature !== 'string') return false;
        
        try {
            // Use SolanaService to verify the signature on-chain
            return await this.solanaService.verifySignature(signature, taskId);
        } catch (error) {
            logger.error('Failed to verify task signature:', error);
            return false;
        }
    }

    async generateProofOfWork(task: Task, result: unknown): Promise<string> {
        if (!this.solanaService) {
            throw new Error('Cannot generate proof: not connected to blockchain');
        }
        
        const timestamp = Date.now();
        
        try {
            // Generate a cryptographic proof using the Solana service
            const proof = await this.solanaService.generateTaskProof({
                taskId: task.id,
                nodeId: this.nodeId,
                timestamp,
                result
            });
            
            return proof;
        } catch (error) {
            logger.error('Failed to generate proof of work:', error);
            throw error;
        }
    }
    
    // New methods for blockchain integration
    
    private async getDeviceSpecs(): Promise<{
        gpuModel: string;
        vram: number;
        hashRate: number;
    }> {
        // Get actual device specs
        try {
            const gpu = await this.detectGPU();
            return {
                gpuModel: gpu.model || 'CPU',
                vram: gpu.memory || 0,
                hashRate: this.calculateHashRate(gpu)
            };
        } catch (error) {
            logger.error('Failed to get device specs:', error);
            return {
                gpuModel: 'CPU',
                vram: 0,
                hashRate: 100 // Default hash rate
            };
        }
    }
    
    private async detectGPU(): Promise<{ model: string; memory: number }> {
        // In a browser environment, we could use WebGL to detect GPU
        // For now, return a placeholder
        return {
            model: 'Generic GPU',
            memory: 4096 // 4GB VRAM
        };
    }
    
    private calculateHashRate(gpu: { model: string; memory: number }): number {
        // Simple hash rate calculation based on GPU memory
        // In a real implementation, this would benchmark the actual device
        return gpu.memory ? (gpu.memory / 1024) * 100 : 100;
    }
    
    private async stakeTokens(): Promise<void> {
        if (!this.contractService || !this.solanaService || !this.ownerKey) return;

        try {
            // Get token account for owner
            const tokenAccount = await this.solanaService.getTokenAccount(this.ownerKey);
            if (!tokenAccount) {
                logger.log('No token account found for staking');
                return;
            }

            // Stake a fixed amount of tokens (10 NLOV)
            const stakeAmount = 10;
            
            // Get the wallet for signing transactions
            try {
                const wallet = await this.getWalletForSigning();
                
                // Use the real wallet for staking tokens
                await this.solanaService.stakeTokens(
                    this.ownerKey,
                    stakeAmount,
                    wallet, // Use the real wallet instead of a temporary keypair
                    tokenAccount
                );

                this.stake += stakeAmount;
                console.log(`Staked ${stakeAmount} tokens successfully`);
            } catch (walletError) {
                console.error('Failed to get wallet for signing:', walletError);
            }
        } catch (error) {
            console.error('Failed to stake tokens:', error);
        }
    }
    
    // Get the wallet for signing transactions
    private async getWalletForSigning(): Promise<any> {
        // Check if SolanaService has a wallet adapter
        if (this.solanaService && 'walletAdapter' in this.solanaService) {
            // We're checking for the property existence above
            const walletAdapter = this.solanaService.walletAdapter as any;
            if (walletAdapter && typeof walletAdapter.signTransaction === 'function') {
                return {
                    publicKey: this.ownerKey,
                    // Use the wallet adapter's signing methods
                    sign: async (message: any) => walletAdapter.signMessage && walletAdapter.signMessage(message),
                    signTransaction: async (tx: any) => walletAdapter.signTransaction && walletAdapter.signTransaction(tx),
                    signAllTransactions: async (txs: any[]) => walletAdapter.signAllTransactions && walletAdapter.signAllTransactions(txs)
                };
            }
        }
        
        // If no wallet adapter is available, throw an error
        throw new Error('No wallet available for signing transactions');
    }
    
    private async pollForTasks(): Promise<void> {
        if (!this.solanaService || !this.contractService || !this.devicePublicKey) return;

        try {
            // Get available tasks from blockchain
            const tasks = await this.solanaService.getAvailableTasks();
            
            // Filter tasks that match this device's capabilities
            const deviceSpecs = await this.getDeviceSpecs();
            const suitableTasks = tasks.filter(task => {
                const reqs = task.requirements;
                return (!reqs.minVram || deviceSpecs.vram >= reqs.minVram) &&
                       (!reqs.minHashRate || deviceSpecs.hashRate >= reqs.minHashRate);
            });

            // Process the first suitable task
            if (suitableTasks.length > 0) {
                const task = suitableTasks[0];
                // Convert the Solana Task to the local Task interface format
                const localTask: Task = {
                    id: task.id,
                    type: 'compute', // Default type since Solana Task doesn't have this
                    data: task.requirements, // Use requirements as data
                    requirements: {
                        minCpu: task.requirements.minVram || 0,
                        minMemory: task.requirements.minHashRate || 0,
                        minGpu: 0
                    }
                };
                await this.executeTask(localTask);
            }
        } catch (error) {
            console.error('Error polling for tasks:', error);
        }
    }
}
