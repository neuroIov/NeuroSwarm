import { PublicKey } from '@solana/web3.js';
import { create } from 'zustand';
import { ComputeNode } from './ComputeNode';

interface Task {
    id: string;
    complexity: number;
    reward: number;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    assignedNode?: string;
    startTime?: number;
    endTime?: number;
}

interface TaskState {
    tasks: Record<string, Task>;
    addTask: (task: Task) => void;
    updateTask: (id: string, updates: Partial<Task>) => void;
    removeTask: (id: string) => void;
}

export const useTaskStore = create<TaskState>((set) => ({
    tasks: {},
    addTask: (task) => set((state) => ({
        tasks: { ...state.tasks, [task.id]: task }
    })),
    updateTask: (id, updates) => set((state) => ({
        tasks: {
            ...state.tasks,
            [id]: { ...state.tasks[id], ...updates }
        }
    })),
    removeTask: (id) => set((state) => {
        const { [id]: _, ...rest } = state.tasks;
        return { tasks: rest };
    })
}));

export class TaskManager {
    private nodes: Map<string, ComputeNode>;
    private dynamicPricing: boolean;
    
    constructor(dynamicPricing: boolean = true) {
        this.nodes = new Map();
        this.dynamicPricing = dynamicPricing;
    }

    registerNode(node: ComputeNode, nodeId: string): void {
        this.nodes.set(nodeId, node);
    }

    unregisterNode(nodeId: string): void {
        this.nodes.delete(nodeId);
    }

    // Dynamic pricing based on network load and task complexity
    calculateTaskPrice(complexity: number): number {
        if (!this.dynamicPricing) {
            return complexity * 0.1; // Base price
        }

        const networkLoad = this.calculateNetworkLoad();
        const demandMultiplier = 1 + (networkLoad * 0.5); // 1.0-1.5x based on load
        const basePrice = complexity * 0.1;
        
        return basePrice * demandMultiplier;
    }

    private calculateNetworkLoad(): number {
        if (this.nodes.size === 0) return 0;

        let totalLoad = 0;
        this.nodes.forEach(node => {
            const state = useTaskStore.getState();
            const nodeTasks = Object.values(state.tasks).filter(
                task => task.assignedNode === node.nodeId && task.status === 'processing'
            );
            totalLoad += nodeTasks.length;
        });

        return Math.min(totalLoad / (this.nodes.size * 3), 1); // Assume max 3 tasks per node
    }

    // Fair task distribution algorithm
    async distributeTask(taskId: string, complexity: number): Promise<string | null> {
        const availableNodes = Array.from(this.nodes.entries())
            .filter(([_, node]) => node.canAcceptTask())
            .sort(() => Math.random() - 0.5); // Simple random distribution for now

        if (availableNodes.length === 0) {
            return null;
        }

        const [nodeId, node] = availableNodes[0];
        const success = await node.executeTask(taskId, complexity);
        
        if (success) {
            useTaskStore.getState().updateTask(taskId, {
                status: 'processing',
                assignedNode: nodeId,
                startTime: Date.now()
            });
            return nodeId;
        }

        return null;
    }

    // Verification and reward distribution
    async verifyAndRewardTask(taskId: string): Promise<boolean> {
        const task = useTaskStore.getState().tasks[taskId];
        if (!task || task.status !== 'processing') {
            return false;
        }

        const node = this.nodes.get(task.assignedNode!);
        if (!node) {
            return false;
        }

        const proof = await node.generateProof(taskId);
        // In production, verify the proof here
        
        useTaskStore.getState().updateTask(taskId, {
            status: 'completed',
            endTime: Date.now()
        });

        // Calculate and distribute reward
        const executionTime = (task.endTime! - task.startTime!);
        const reward = this.calculateReward(executionTime, task.complexity);
        
        return true;
    }

    private calculateReward(executionTime: number, complexity: number): number {
        const BASE_REWARD = 0.01; // Base reward per millisecond
        const timeMultiplier = Math.min(executionTime / 1000, 10); // Cap at 10 seconds
        const complexityMultiplier = Math.log2(complexity + 1); // Logarithmic scaling
        
        return BASE_REWARD * timeMultiplier * complexityMultiplier;
    }
}
