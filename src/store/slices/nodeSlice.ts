import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface NodeState {
    isActive: boolean;
    nodeId: string | null;
    nodeName: string | null;
    nodeType: 'desktop' | 'laptop' | 'tablet' | 'mobile' | null;
    rewardTier: 'webgpu' | 'wasm' | 'webgl' | 'cpu' | null;
    cpuUsage: number;
    memoryUsage: number;
    networkUsage: number;
    tasksCompleted: number;
    successRate: number;
}

const initialState: NodeState = {
    isActive: false,
    nodeId: null,
    nodeName: null,
    nodeType: null,
    rewardTier: null,
    cpuUsage: 0,
    memoryUsage: 0,
    networkUsage: 0,
    tasksCompleted: 0,
    successRate: 100,
};

export const nodeSlice = createSlice({
    name: 'node',
    initialState,
    reducers: {
        startNode: (state, action: PayloadAction<{
            nodeId: string,
            nodeName: string,
            nodeType: 'desktop' | 'laptop' | 'tablet' | 'mobile',
            rewardTier: 'webgpu' | 'wasm' | 'webgl' | 'cpu'
        }>) => {
            const { nodeId, nodeName, nodeType, rewardTier } = action.payload;
            state.isActive = true;
            state.nodeId = nodeId;
            state.nodeName = nodeName;
            state.nodeType = nodeType;
            state.rewardTier = rewardTier;
        },
        stopNode: (state) => {
            state.isActive = false;
            state.cpuUsage = 0;
            state.memoryUsage = 0;
            state.networkUsage = 0;
        },
        updateNodeMetrics: (state, action: PayloadAction<{
            cpuUsage?: number;
            memoryUsage?: number;
            networkUsage?: number;
        }>) => {
            if (action.payload.cpuUsage !== undefined) {
                state.cpuUsage = action.payload.cpuUsage;
            }
            if (action.payload.memoryUsage !== undefined) {
                state.memoryUsage = action.payload.memoryUsage;
            }
            if (action.payload.networkUsage !== undefined) {
                state.networkUsage = action.payload.networkUsage;
            }
        },
        incrementTasksCompleted: (state) => {
            state.tasksCompleted += 1;
        },
        updateSuccessRate: (state, action: PayloadAction<number>) => {
            state.successRate = action.payload;
        },
    },
});

export const {
    startNode,
    stopNode,
    updateNodeMetrics,
    incrementTasksCompleted,
    updateSuccessRate
} = nodeSlice.actions;

export default nodeSlice.reducer; 