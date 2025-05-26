import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { getSwarmSupabase } from '@/lib/supabase-client';

// --- Removed: FREE_TIER_LIMIT_SECONDS ---

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
    startTime: number | null;
    currentSessionUptime: number;
    totalUptime: number;
    remainingFreeTierTime: number;
    maxUptime: number; // ✅ Added for tier logic
}

// Updated: load from storage helper (no longer relies on constant)
const loadUptimeFromStorage = (nodeId: string | null): {
    totalUptime: number,
    remainingFreeTierTime: number
} => {
    if (!nodeId) return { totalUptime: 0, remainingFreeTierTime: 0 };

    try {
        const storedData = localStorage.getItem(`node-uptime-${nodeId}`);
        if (storedData) {
            const parsedData = JSON.parse(storedData);
            return {
                totalUptime: parsedData.totalUptime || 0,
                remainingFreeTierTime: parsedData.remainingFreeTierTime ?? 0
            };
        }
    } catch (e) {
        console.error('Error loading uptime from storage:', e);
    }

    return { totalUptime: 0, remainingFreeTierTime: 0 };
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
    startTime: null,
    currentSessionUptime: 0,
    totalUptime: 0,
    remainingFreeTierTime: 0,
    maxUptime: 4 * 60 * 60, // fallback default 4 hours
};

// Sync helper
export const syncUptimeToDatabase = async (nodeId: string, totalUptimeSeconds: number) => {
    if (!nodeId) return;

    try {
        const client = getSwarmSupabase();
        console.log(`Syncing uptime to database for nodeId ${nodeId}: ${totalUptimeSeconds} seconds`);
        const { data, error } = await client
            .from('devices')
            .update({ uptime: totalUptimeSeconds, last_seen: new Date().toISOString() })
            .eq('id', nodeId)
            .select('uptime');

        if (error) {
            console.error('Error syncing uptime to database:', error);
        } else {
            console.log('Successfully updated uptime in database:', data);
        }
    } catch (error) {
        console.error('Error syncing uptime to database:', error);
    }
};

// Load uptime directly from the database instead of local storage
export const loadUptimeFromDatabase = async (nodeId: string): Promise<number> => {
    if (!nodeId) return 0;

    try {
        const client = getSwarmSupabase();
        const { data, error } = await client
            .from('devices')
            .select('uptime')
            .eq('id', nodeId)
            .single();

        if (error) {
            console.error('Error loading uptime from database:', error);
            return 0;
        }

        console.log(`Loaded uptime from database for nodeId ${nodeId}:`, data?.uptime || 0);
        return data?.uptime || 0;
    } catch (error) {
        console.error('Error loading uptime from database:', error);
        return 0;
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
            maxUptime: number, // ✅ Required input from session
            storedUptime?: number
        }>) => {
            const { nodeId, nodeName, nodeType, rewardTier, maxUptime, storedUptime } = action.payload;

            // Use the provided storedUptime (from database) if available, otherwise use local storage
            const savedData = loadUptimeFromStorage(nodeId);
            const totalUptime = storedUptime !== undefined ? storedUptime : savedData.totalUptime;
            const remainingFreeTierTime = Math.max(0, maxUptime - totalUptime);

            state.isActive = true;
            state.nodeId = nodeId;
            state.nodeName = nodeName;
            state.nodeType = nodeType;
            state.rewardTier = rewardTier;
            state.startTime = Date.now();
            state.currentSessionUptime = 0;
            state.totalUptime = totalUptime;
            state.remainingFreeTierTime = remainingFreeTierTime;
            state.maxUptime = maxUptime;

            // Store in both localStorage and database
            localStorage.setItem(`node-uptime-${nodeId}`, JSON.stringify({
                totalUptime,
                remainingFreeTierTime
            }));

            // Also sync to database to ensure consistency
            syncUptimeToDatabase(nodeId, totalUptime);
        },
        stopNode: (state) => {
            if (state.startTime && state.nodeId) {
                const sessionUptime = Math.floor((Date.now() - state.startTime) / 1000);
                const newTotalUptime = state.totalUptime + sessionUptime;
                const newRemainingFreeTierTime = Math.max(0, state.maxUptime - newTotalUptime);

                // Store in both localStorage and database
                localStorage.setItem(`node-uptime-${state.nodeId}`, JSON.stringify({
                    totalUptime: newTotalUptime,
                    remainingFreeTierTime: newRemainingFreeTierTime
                }));

                // Log before syncing to database
                console.log(`Stopping node ${state.nodeId} with total uptime: ${newTotalUptime} seconds`);
                syncUptimeToDatabase(state.nodeId, newTotalUptime);

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
            if (state.isActive && state.startTime) {
                const currentTime = Date.now();
                const elapsedSeconds = Math.floor((currentTime - state.startTime) / 1000);
                state.currentSessionUptime = elapsedSeconds;

                const totalUsed = state.totalUptime + elapsedSeconds;

                if (totalUsed >= state.maxUptime) {
                    state.remainingFreeTierTime = 0;
                    state.isActive = false;
                    state.startTime = null;

                    if (state.nodeId) {
                        syncUptimeToDatabase(state.nodeId, state.totalUptime);
                    }
                } else {
                    state.remainingFreeTierTime = Math.max(0, state.maxUptime - totalUsed);
                }
            }
        },
        syncUptime: (state) => {
            if (state.isActive && state.startTime && state.nodeId) {
                const currentSessionUptime = Math.floor((Date.now() - state.startTime) / 1000);
                const newTotalUptime = state.totalUptime + currentSessionUptime;
                syncUptimeToDatabase(state.nodeId, newTotalUptime);
            }
        },
        resetFreeTime: (state) => {
            state.remainingFreeTierTime = state.maxUptime;
            if (state.nodeId) {
                localStorage.setItem(`node-uptime-${state.nodeId}`, JSON.stringify({
                    totalUptime: state.totalUptime,
                    remainingFreeTierTime: state.maxUptime
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
