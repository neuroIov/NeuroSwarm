import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { getSwarmSupabase } from '@/lib/supabase-client';

// Constants
export const FREE_TIER_LIMIT_SECONDS = 4 * 60 * 60; // 4 hours in seconds

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
    // New uptime fields
    startTime: number | null;
    currentSessionUptime: number;
    totalUptime: number;
    remainingFreeTierTime: number;
}

// Helper to load uptime from localStorage
const loadUptimeFromStorage = (nodeId: string | null): {
    totalUptime: number,
    remainingFreeTierTime: number
} => {
    if (!nodeId) return { totalUptime: 0, remainingFreeTierTime: FREE_TIER_LIMIT_SECONDS };

    try {
        const storedData = localStorage.getItem(`node-uptime-${nodeId}`);
        if (storedData) {
            const parsedData = JSON.parse(storedData);
            return {
                totalUptime: parsedData.totalUptime || 0,
                remainingFreeTierTime: parsedData.remainingFreeTierTime !== undefined
                    ? parsedData.remainingFreeTierTime
                    : FREE_TIER_LIMIT_SECONDS - (parsedData.totalUptime || 0)
            };
        }
    } catch (e) {
        console.error('Error loading uptime from storage:', e);
    }

    return { totalUptime: 0, remainingFreeTierTime: FREE_TIER_LIMIT_SECONDS };
};

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
    // New uptime fields
    startTime: null,
    currentSessionUptime: 0,
    totalUptime: 0,
    remainingFreeTierTime: FREE_TIER_LIMIT_SECONDS,
};

// Helper function to sync uptime to Supabase
export const syncUptimeToDatabase = async (nodeId: string, totalUptimeSeconds: number) => {
    if (!nodeId) return;

    try {
        const client = getSwarmSupabase();
        await client
            .from('devices')
            .update({ uptime: totalUptimeSeconds, last_seen: new Date().toISOString() })
            .eq('id', nodeId);
    } catch (error) {
        console.error('Error syncing uptime to database:', error);
    }
};

export const nodeSlice = createSlice({
    name: 'node',
    initialState,
    reducers: {
        startNode: (state, action: PayloadAction<{
            nodeId: string,
            nodeName: string,
            nodeType: 'desktop' | 'laptop' | 'tablet' | 'mobile',
            rewardTier: 'webgpu' | 'wasm' | 'webgl' | 'cpu',
            storedUptime?: number
        }>) => {
            const { nodeId, nodeName, nodeType, rewardTier, storedUptime } = action.payload;

            // Load saved uptime data from localStorage
            const savedData = loadUptimeFromStorage(nodeId);

            // Use stored uptime from database if provided, otherwise use localStorage value
            const totalUptime = storedUptime !== undefined ? storedUptime : savedData.totalUptime;

            // Calculate remaining free tier time
            const remainingFreeTierTime = Math.max(0, FREE_TIER_LIMIT_SECONDS - totalUptime);

            state.isActive = true;
            state.nodeId = nodeId;
            state.nodeName = nodeName;
            state.nodeType = nodeType;
            state.rewardTier = rewardTier;
            state.startTime = Date.now();
            state.currentSessionUptime = 0;
            state.totalUptime = totalUptime;
            state.remainingFreeTierTime = remainingFreeTierTime;

            // Store current values in localStorage
            localStorage.setItem(`node-uptime-${nodeId}`, JSON.stringify({
                totalUptime,
                remainingFreeTierTime
            }));
        },
        stopNode: (state) => {
            // Calculate final uptime for this session
            if (state.startTime && state.nodeId) {
                const sessionUptime = Math.floor((Date.now() - state.startTime) / 1000);
                const newTotalUptime = state.totalUptime + sessionUptime;
                const newRemainingFreeTierTime = Math.max(0, state.remainingFreeTierTime - sessionUptime);

                // Update localStorage
                localStorage.setItem(`node-uptime-${state.nodeId}`, JSON.stringify({
                    totalUptime: newTotalUptime,
                    remainingFreeTierTime: newRemainingFreeTierTime
                }));

                // Sync to database
                syncUptimeToDatabase(state.nodeId, newTotalUptime);

                // Update state
                state.totalUptime = newTotalUptime;
                state.remainingFreeTierTime = newRemainingFreeTierTime;
            }

            state.isActive = false;
            state.startTime = null;
            state.currentSessionUptime = 0;
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
        updateUptime: (state) => {
            // Only update if node is active and has a start time
            if (state.isActive && state.startTime) {
                const currentTime = Date.now();
                const elapsedSeconds = Math.floor((currentTime - state.startTime) / 1000);
                state.currentSessionUptime = elapsedSeconds;

                // Check if we need to stop the node because free tier time is up
                if (state.remainingFreeTierTime <= 0) {
                    state.isActive = false;
                    state.startTime = null;

                    // Sync to database before stopping
                    if (state.nodeId) {
                        syncUptimeToDatabase(state.nodeId, state.totalUptime);
                    }
                } else {
                    // Update remaining free tier time
                    state.remainingFreeTierTime = Math.max(0, FREE_TIER_LIMIT_SECONDS - (state.totalUptime + elapsedSeconds));
                }
            }
        },
        syncUptime: (state) => {
            // Used to manually trigger uptime sync to database
            if (state.isActive && state.startTime && state.nodeId) {
                const currentSessionUptime = Math.floor((Date.now() - state.startTime) / 1000);
                const newTotalUptime = state.totalUptime + currentSessionUptime;

                // Update database without stopping the node
                syncUptimeToDatabase(state.nodeId, newTotalUptime);
            }
        },
        resetFreeTime: (state) => {
            // For testing/development purposes
            state.remainingFreeTierTime = FREE_TIER_LIMIT_SECONDS;
            if (state.nodeId) {
                localStorage.setItem(`node-uptime-${state.nodeId}`, JSON.stringify({
                    totalUptime: state.totalUptime,
                    remainingFreeTierTime: FREE_TIER_LIMIT_SECONDS
                }));
            }
        }
    },
});

export const {
    startNode,
    stopNode,
    updateNodeMetrics,
    incrementTasksCompleted,
    updateSuccessRate,
    updateUptime,
    syncUptime,
    resetFreeTime
} = nodeSlice.actions;

export default nodeSlice.reducer; 