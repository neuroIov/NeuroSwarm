import { create } from 'zustand';
import type { DeviceSpecs, TaskRequirements, TaskResult } from '../services/SolanaService';
import { PublicKey, Keypair } from '@solana/web3.js';
import { SolanaService } from '../services/SolanaService';

// Define NetworkState for Zustand store
export interface NetworkState {
    totalNodes: number;
    activeNodes: number;
    networkLoad: number;
    networkEfficiency: number;
    rewardPool: number;
    updateStats: (stats: Partial<NetworkState> | ((state: NetworkState) => Partial<NetworkState>)) => void;
}

export const useNetworkStore = create<NetworkState>((set) => ({
    totalNodes: 1000,
    activeNodes: 800,
    networkLoad: 65,
    networkEfficiency: 85,
    rewardPool: 1_000_000,
    updateStats: (updater) => set((state) => ({
        ...state,
        ...(typeof updater === 'function' ? updater(state) : updater)
    })),
}));

// Interface definitions
interface NodeInfo {
    specs: DeviceSpecs;
    lastHeartbeat: number;
    partitionId: string;
    peers: Set<string>;
    load: number;
}

interface TaskAssignment {
    taskId: string;
    nodeId: string;
    assignedAt: number;
}

export class ComputeNetwork {
    private nodes: Map<string, NodeInfo>;
    private tasks: Map<string, TaskRequirements>;
    private results: Map<string, TaskResult>;
    private solanaService: SolanaService;
    private taskAssignments: Map<string, TaskAssignment>;
    private partitions: Map<string, Set<string>>;
    private readonly heartbeatInterval = 60000; // 1 minute
    private readonly maxPeers = 10; // Peer limit for efficiency
    private payer: Keypair; // Added payer for Solana transactions

    constructor(payer: Keypair, endpoint?: string) {
        this.nodes = new Map();
        this.tasks = new Map();
        this.results = new Map();
        this.taskAssignments = new Map();
        this.partitions = new Map();
        
        // Initialize Supabase service
        const supabaseService = new SupabaseService(
            import.meta.env.VITE_SUPABASE_URL || '',
            import.meta.env.VITE_SUPABASE_KEY || ''
        );
        
        this.solanaService = new SolanaService(endpoint || undefined, payer, supabaseService);
        this.payer = payer;
        this.startCoordination();
    }

    private startCoordination(): void {
        setInterval(() => {
            this.checkHeartbeats();
            this.optimizeTopology();
        }, this.heartbeatInterval);
    }

    async registerDevice(ownerPubkey: PublicKey, specs: DeviceSpecs): Promise<string> {
        if (!this.validateDeviceSpecs(specs)) {
            throw new Error('Device does not meet minimum requirements');
        }

        const deviceId = ownerPubkey.toBase58();
        this.nodes.set(deviceId, {
            specs,
            lastHeartbeat: Date.now(),
            partitionId: 'default',
            peers: new Set(),
            load: 0
        });

        await this.solanaService.registerDevice(ownerPubkey, specs, this.payer); // Added payer
        this.discoverPeers(deviceId);
        await this.updateNetworkStats(); // Await async method
        return deviceId;
    }

    async submitTask(ownerPubkey: PublicKey, taskType: string, requirements: TaskRequirements): Promise<string> {
        if (!this.validateTaskRequirements(requirements)) {
            throw new Error('Invalid task requirements');
        }

        const taskId = `${ownerPubkey.toBase58()}-${Date.now()}`;
        this.tasks.set(taskId, requirements);

        const assignedNode = await this.assignTask(taskId, requirements); // Await the promise
        if (!assignedNode) {
            throw new Error('No suitable node available for task');
        }

        await this.solanaService.submitTask(ownerPubkey, taskType, requirements, this.payer); // Added payer
        await this.updateNetworkStats(); // Await async method
        return taskId;
    }

    async submitResult(taskId: string, result: TaskResult): Promise<boolean> {
        if (!this.tasks.has(taskId)) {
            throw new Error('Task not found');
        }

        const assignment = this.taskAssignments.get(taskId);
        if (!assignment) {
            throw new Error('Task not assigned');
        }

        this.results.set(taskId, result);

        // Generate a proof of task completion
        const proofData = {
            taskId,
            timestamp: Date.now(),
            computeTime: result.computeTime,
            hashRate: result.hashRate,
            success: result.success
        };

        // Submit the task proof to the contract
        await this.solanaService.submitTaskProof(proofData, this.payer);

        const node = this.nodes.get(assignment.nodeId);
        if (node) {
            node.load -= this.calculateTaskLoad(this.tasks.get(taskId)!);
            this.nodes.set(assignment.nodeId, node);
        }

        this.taskAssignments.delete(taskId);
        await this.updateNetworkStats(); // Await async method
        return result.success;
    }

    private validateDeviceSpecs(specs: DeviceSpecs): boolean {
        return specs.vram >= 8 && specs.hashRate >= 50;
    }

    private validateTaskRequirements(requirements: TaskRequirements): boolean {
        return requirements.minVram >= 8 && requirements.minHashRate >= 50;
    }

    private async assignTask(taskId: string, requirements: TaskRequirements): Promise<string | null> {
        const suitableNodes = Array.from(this.nodes.entries())
            .filter(([_, node]) => this.canHandleTask(node.specs, requirements))
            .sort(([, a], [, b]) => a.load - b.load);

        if (suitableNodes.length === 0) return null;

        const [nodeId, node] = suitableNodes[0];
        node.load += this.calculateTaskLoad(requirements);
        this.nodes.set(nodeId, node);

        this.taskAssignments.set(taskId, {
            taskId,
            nodeId,
            assignedAt: Date.now()
        });

        return nodeId;
    }

    private canHandleTask(specs: DeviceSpecs, requirements: TaskRequirements): boolean {
        return specs.vram >= requirements.minVram && specs.hashRate >= requirements.minHashRate;
    }

    private calculateTaskLoad(requirements: TaskRequirements): number {
        return (requirements.minVram * requirements.minHashRate) / 100;
    }

    private checkHeartbeats(): void {
        const now = Date.now();
        for (const [nodeId, node] of this.nodes) {
            if (now - node.lastHeartbeat > this.heartbeatInterval * 2) {
                this.handlePartition(nodeId);
            } else {
                this.updatePartition(nodeId);
            }
        }
        this.updateNetworkStats(); // No await needed here as it's called within an async context
    }

    private handlePartition(nodeId: string): void {
        const node = this.nodes.get(nodeId);
        if (!node) return;

        const newPartitionId = `partition-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        node.partitionId = newPartitionId;
        this.nodes.set(nodeId, node);

        const partition = this.partitions.get(newPartitionId) || new Set();
        partition.add(nodeId);
        this.partitions.set(newPartitionId, partition);

        console.log(`Node ${nodeId} moved to partition ${newPartitionId} due to missed heartbeat`);
    }

    private updatePartition(nodeId: string): void {
        const node = this.nodes.get(nodeId);
        if (!node) return;

        node.lastHeartbeat = Date.now();
        const partition = this.partitions.get(node.partitionId) || new Set();
        partition.add(nodeId);
        this.partitions.set(node.partitionId, partition);

        if (node.partitionId !== 'default' && partition.size < 3 && node.lastHeartbeat > Date.now() - this.heartbeatInterval) {
            this.mergePartition(node.partitionId, 'default');
        }
    }

    private mergePartition(fromPartitionId: string, toPartitionId: string): void {
        const fromPartition = this.partitions.get(fromPartitionId);
        if (!fromPartition) return;

        const toPartition = this.partitions.get(toPartitionId) || new Set();
        for (const nodeId of fromPartition) {
            const node = this.nodes.get(nodeId);
            if (node) {
                node.partitionId = toPartitionId;
                this.nodes.set(nodeId, node);
                toPartition.add(nodeId);
            }
        }
        this.partitions.set(toPartitionId, toPartition);
        this.partitions.delete(fromPartitionId);
        console.log(`Merged partition ${fromPartitionId} into ${toPartitionId}`);
    }

    private discoverPeers(nodeId: string): void {
        const node = this.nodes.get(nodeId);
        if (!node) return;

        const potentialPeers = Array.from(this.nodes.entries())
            .filter(([id, n]) => id !== nodeId && n.partitionId === node.partitionId && n.peers.size < this.maxPeers)
            .sort(([, a], [, b]) => a.load - b.load);

        const newPeers = potentialPeers.slice(0, this.maxPeers - node.peers.size);
        for (const [peerId] of newPeers) {
            node.peers.add(peerId);
            const peer = this.nodes.get(peerId);
            if (peer) {
                peer.peers.add(nodeId);
                this.nodes.set(peerId, peer);
            }
        }
        this.nodes.set(nodeId, node);
    }

    private optimizeTopology(): void {
        const avgLoad = Array.from(this.nodes.values()).reduce((sum, node) => sum + node.load, 0) / this.nodes.size || 1;
        for (const [nodeId, node] of this.nodes) {
            if (node.load > avgLoad * 1.5) {
                this.redistributeLoad(nodeId);
            }
            if (node.peers.size < 3) {
                this.discoverPeers(nodeId);
            }
        }
        this.updateNetworkStats(); // No await needed here as it's called within an async context
    }

    private async redistributeLoad(nodeId: string): Promise<void> {
        const node = this.nodes.get(nodeId);
        if (!node) return;

        const assignments = Array.from(this.taskAssignments.values()).filter(a => a.nodeId === nodeId);
        const excessTasks = assignments.slice(0, Math.ceil(assignments.length / 2));

        for (const assignment of excessTasks) {
            const task = this.tasks.get(assignment.taskId);
            if (task) {
                const newNodeId = await this.assignTask(assignment.taskId, task); // Await the assignment
                if (newNodeId && newNodeId !== nodeId) {
                    node.load -= this.calculateTaskLoad(task);
                    this.taskAssignments.set(assignment.taskId, { ...assignment, nodeId: newNodeId });
                }
            }
        }
        this.nodes.set(nodeId, node);
    }

    private async updateNetworkStats(): Promise<void> {
        const activeNodes = Array.from(this.nodes.values()).filter(n => 
            Date.now() - n.lastHeartbeat < this.heartbeatInterval * 2).length;
        const networkLoad = this.nodes.size > 0 ? 
            Array.from(this.nodes.values()).reduce((sum, n) => sum + n.load, 0) / this.nodes.size : 0;
        const networkEfficiency = this.calculateNetworkEfficiency();

        useNetworkStore.getState().updateStats({
            totalNodes: this.nodes.size,
            activeNodes,
            networkLoad,
            networkEfficiency,
            rewardPool: this.calculateRewardPool()
        });
    }

    private calculateNetworkEfficiency(): number {
        const completedTasks = Array.from(this.results.values()).filter(r => r.success).length;
        const totalTasks = this.tasks.size;
        return totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 85;
    }

    private calculateRewardPool(): number {
        const basePool = useNetworkStore.getState().rewardPool;
        const efficiencyFactor = this.calculateNetworkEfficiency() / 100;
        return basePool * efficiencyFactor;
    }
}