import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { getSwarmSupabase } from '@/lib/supabase-client';

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
    maxUptime: number;
    lastSyncTime: number | null; // Track when we last synced to database
}

// Load from storage helper
const loadUptimeFromStorage = (nodeId: string | null): {
    totalUptime: number,
    remainingFreeTierTime: number,
    lastSyncTime: number | null
} => {
    if (!nodeId) return { totalUptime: 0, remainingFreeTierTime: 0, lastSyncTime: null };

    try {
        const storedData = localStorage.getItem(`node-uptime-${nodeId}`);
        if (storedData) {
            const parsedData = JSON.parse(storedData);
            return {
                totalUptime: parsedData.totalUptime || 0,
                remainingFreeTierTime: parsedData.remainingFreeTierTime ?? 0,
                lastSyncTime: parsedData.lastSyncTime || null
            };
        }
    } catch (e) {
        console.error('Error loading uptime from storage:', e);
    }

    return { totalUptime: 0, remainingFreeTierTime: 0, lastSyncTime: null };
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
    lastSyncTime: null,
};

// Enhanced sync helper with retry logic
export const syncUptimeToDatabase = async (nodeId: string, totalUptimeSeconds: number): Promise<boolean> => {
    if (!nodeId) return false;

    try {
        const client = getSwarmSupabase();
        console.log(`Syncing uptime to database for nodeId ${nodeId}: ${totalUptimeSeconds} seconds`);
        
        const { data, error } = await client
            .from('devices')
            .update({ 
                uptime: totalUptimeSeconds, 
                last_seen: new Date().toISOString() 
            })
            .eq('id', nodeId)
            .select('uptime');

        if (error) {
            console.error('Error syncing uptime to database:', error);
            return false;
        } else {
            console.log('Successfully updated uptime in database:', data);
            return true;
        }
    } catch (error) {
        console.error('Error syncing uptime to database:', error);
        return false;
    }
};

// Load uptime directly from the database
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

// Enhanced function to check for and process any pending sync operations
export const checkPendingSyncOperations = async () => {
    const pendingSyncKeys = Object.keys(localStorage).filter(key => 
        key.startsWith('node-uptime-sync-pending-')
    );
    
    if (pendingSyncKeys.length === 0) return;
    
    console.log(`Found ${pendingSyncKeys.length} pending sync operations`);
    
    for (const key of pendingSyncKeys) {
        try {
            const nodeId = key.replace('node-uptime-sync-pending-', '');
            const pendingData = JSON.parse(localStorage.getItem(key) || '{}');
            
            if (pendingData.totalUptime && nodeId) {
                console.log(`Processing pending sync for node ${nodeId}: ${pendingData.totalUptime} seconds`);
                
                // Try to sync to database
                const success = await syncUptimeToDatabase(nodeId, pendingData.totalUptime);
                
                if (success) {
                    // Remove the pending sync entry only if successful
                    localStorage.removeItem(key);
                    console.log(`Successfully processed pending sync for node ${nodeId}`);
                } else {
                    console.log(`Failed to process pending sync for node ${nodeId}, will retry later`);
                }
            }
        } catch (error) {
            console.error(`Error processing pending sync operation for key ${key}:`, error);
        }
    }
};

// Function to get the most recently active node ID
export const getLastActiveNodeId = (): string | null => {
    try {
        const nodeId = localStorage.getItem('last-active-node-id');
        return nodeId;
    } catch (e) {
        console.error('Error getting last active node ID:', e);
        return null;
    }
};

// Function to save the last active node ID
export const saveLastActiveNodeId = (nodeId: string): void => {
    try {
        localStorage.setItem('last-active-node-id', nodeId);
    } catch (e) {
        console.error('Error saving last active node ID:', e);
    }
};

// Helper function to save uptime data to localStorage
const saveUptimeToStorage = (nodeId: string, totalUptime: number, remainingFreeTierTime: number, lastSyncTime: number | null = null) => {
    try {
        localStorage.setItem(`node-uptime-${nodeId}`, JSON.stringify({
            totalUptime,
            remainingFreeTierTime,
            lastSyncTime: lastSyncTime || Date.now()
        }));
    } catch (error) {
        console.error('Error saving uptime to storage:', error);
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
            maxUptime: number,
            storedUptime?: number
        }>) => {
            const { nodeId, nodeName, nodeType, rewardTier, maxUptime, storedUptime } = action.payload;

            // Use the provided storedUptime (from database) if available, otherwise use local storage
            const savedData = loadUptimeFromStorage(nodeId);
            const totalUptime = storedUptime !== undefined ? storedUptime : savedData.totalUptime;
            const remainingFreeTierTime = Math.max(0, maxUptime - totalUptime);

            // Don't start if no time remaining
            if (remainingFreeTierTime <= 0) {
                console.warn(`Cannot start node ${nodeId}: No remaining time (${remainingFreeTierTime} seconds)`);
                return;
            }

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
            state.lastSyncTime = savedData.lastSyncTime;

            // Store in localStorage
            saveUptimeToStorage(nodeId, totalUptime, remainingFreeTierTime, state.lastSyncTime);
            
            // Save as last active node
            saveLastActiveNodeId(nodeId);

            // Sync to database to ensure consistency
            syncUptimeToDatabase(nodeId, totalUptime);

            console.log(`Started node ${nodeName} (${nodeId}) with ${remainingFreeTierTime} seconds remaining`);
        },
        
        stopNode: (state) => {
            if (state.startTime && state.nodeId) {
                const sessionUptime = Math.floor((Date.now() - state.startTime) / 1000);
                const newTotalUptime = state.totalUptime + sessionUptime;
                const newRemainingFreeTierTime = Math.max(0, state.maxUptime - newTotalUptime);

                // Store in localStorage
                saveUptimeToStorage(state.nodeId, newTotalUptime, newRemainingFreeTierTime);

                console.log(`Stopping node ${state.nodeId} with total uptime: ${newTotalUptime} seconds`);
                
                // Try to sync to database
                syncUptimeToDatabase(state.nodeId, newTotalUptime).then(success => {
                    if (!success) {
                        // Store the failed sync attempt in localStorage to retry later
                        localStorage.setItem(`node-uptime-sync-pending-${state.nodeId}`, JSON.stringify({
                            totalUptime: newTotalUptime,
                            timestamp: Date.now()
                        }));
                    }
                });

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
                    // Time limit reached - stop the node and sync final uptime
                    state.remainingFreeTierTime = 0;
                    
                    // Calculate the exact uptime at the limit
                    const finalUptime = state.maxUptime;
                    
                    // Update the total uptime to the max limit
                    state.totalUptime = finalUptime;
                    
                    // Mark node as inactive
                    state.isActive = false;
                    state.startTime = null;
                    state.currentSessionUptime = 0;

                    // Sync the final uptime to database
                    if (state.nodeId) {
                        console.log(`Time limit reached for node ${state.nodeId}. Final uptime: ${finalUptime} seconds`);
                        
                        syncUptimeToDatabase(state.nodeId, finalUptime).then(success => {
                            if (!success) {
                                // Store pending sync if failed
                                localStorage.setItem(`node-uptime-sync-pending-${state.nodeId}`, JSON.stringify({
                                    totalUptime: finalUptime,
                                    timestamp: Date.now()
                                }));
                            }
                        });
                        
                        // Update localStorage
                        saveUptimeToStorage(state.nodeId, finalUptime, 0);
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
                
                // Update the state with the new total uptime
                state.totalUptime = newTotalUptime;
                state.remainingFreeTierTime = Math.max(0, state.maxUptime - newTotalUptime);
                state.lastSyncTime = Date.now();
                
                // Reset the session timer to avoid double-counting
                state.startTime = Date.now();
                state.currentSessionUptime = 0;
                
                // Update localStorage
                saveUptimeToStorage(state.nodeId, newTotalUptime, state.remainingFreeTierTime, state.lastSyncTime);
                
                // Sync to database
                syncUptimeToDatabase(state.nodeId, newTotalUptime).then(success => {
                    if (!success) {
                        // Store pending sync if failed
                        localStorage.setItem(`node-uptime-sync-pending-${state.nodeId}`, JSON.stringify({
                            totalUptime: newTotalUptime,
                            timestamp: Date.now()
                        }));
                    }
                });
                
                console.log(`Synced uptime for node ${state.nodeId}. New total: ${newTotalUptime} seconds, Remaining: ${state.remainingFreeTierTime} seconds`);
            }
        },
        
        resetFreeTime: (state) => {
            state.remainingFreeTierTime = state.maxUptime;
            state.totalUptime = 0;
            if (state.nodeId) {
                saveUptimeToStorage(state.nodeId, 0, state.maxUptime);
                // Also sync the reset to database
                syncUptimeToDatabase(state.nodeId, 0);
            }
        },
        
        setUptimeFromDatabase: (state, action: PayloadAction<number>) => {
            // Only update the uptime in the Redux store if the node is not currently active
            if (!state.isActive) {
                state.totalUptime = action.payload;
                state.remainingFreeTierTime = Math.max(0, state.maxUptime - action.payload);

                // Update localStorage if we have a nodeId
                if (state.nodeId) {
                    saveUptimeToStorage(state.nodeId, state.totalUptime, state.remainingFreeTierTime);
                }
                
                console.log(`Updated uptime in Redux store for node ${state.nodeId}: ${action.payload} seconds`);
            } else {
                console.log(`Node ${state.nodeId} is active - not updating uptime from database`);
            }
        },
        
        switchCurrentNode: (state, action: PayloadAction<{
            nodeId: string,
            nodeName: string,
            nodeType: 'desktop' | 'laptop' | 'tablet' | 'mobile',
            rewardTier: 'webgpu' | 'wasm' | 'webgl' | 'cpu',
            uptime: number,
            maxUptime: number
        }>) => {
            const { nodeId, nodeName, nodeType, rewardTier, uptime, maxUptime } = action.payload;
            
            // Only allow switching if the node is not active
            if (!state.isActive) {
                // Reset all node-related state first
                state.nodeId = null;
                state.nodeName = null;
                state.nodeType = null;
                state.rewardTier = null;
                state.totalUptime = 0;
                state.currentSessionUptime = 0;
                
                // Now set the new node's data
                state.nodeId = nodeId;
                state.nodeName = nodeName;
                state.nodeType = nodeType;
                state.rewardTier = rewardTier;
                state.totalUptime = uptime;
                state.maxUptime = maxUptime;
                state.remainingFreeTierTime = Math.max(0, maxUptime - uptime);
                
                // Save as last selected node
                saveLastActiveNodeId(nodeId);
                
                console.log(`Switched to node ${nodeName} (${nodeId}) with uptime: ${uptime} seconds, remaining: ${state.remainingFreeTierTime} seconds`);
            } else {
                console.warn(`Cannot switch nodes while node ${state.nodeName} (${state.nodeId}) is active`);
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
    resetFreeTime,
    setUptimeFromDatabase,
    switchCurrentNode
} = nodeSlice.actions;

export default nodeSlice.reducer;
