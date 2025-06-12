import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { getSwarmSupabase } from '@/lib/supabase-client';
import { cleanupProcessingTasks } from './taskSlice';
import { logger } from '@/utils/logger';

export interface Device {
    id: string;
    status: 'offline' | 'online' | 'busy';
    gpu_model: string;
    vram: number;
    hash_rate: number;
    owner: string;
    created_at: string;
    last_seen: string;
    uptime: number;
    stake_amount: number;
    performance_score: number;
    reward_tier: 'webgpu' | 'wasm' | 'webgl' | 'cpu' | null;
    device_name?: string | null;
}

interface DeviceState {
    currentDeviceId: string | null;
    devices: Device[];
    loading: boolean;
    error: string | null;
    isActive: boolean; // Track if node is active
}

const initialState: DeviceState = {
    currentDeviceId: null,
    devices: [],
    loading: false,
    error: null,
    isActive: false, // Default to inactive
};

export const createDevice = createAsyncThunk(
    'device/createDevice',
    async (deviceData: {
        gpu_model: string;
        vram: number;
        hash_rate: number;
        reward_tier: 'webgpu' | 'wasm' | 'webgl' | 'cpu' | null;
        device_name?: string | null;
    }) => {
        const client = getSwarmSupabase();
        const { data: { user } } = await client.auth.getUser();

        if (!user) throw new Error('User not authenticated');

        const { data, error } = await client
            .from('devices')
            .insert([{
                ...deviceData,
                owner: user.id,
            }])
            .select('id')
            .single();

        if (error) throw error;
        return data;
    }
);

export const fetchUserDevices = createAsyncThunk(
    'device/fetchUserDevices',
    async () => {
        const client = getSwarmSupabase();
        const { data: { user } } = await client.auth.getUser();

        if (!user) throw new Error('User not authenticated');

        const { data, error } = await client
            .from('devices')
            .select('*')
            .eq('owner', user.id);

        if (error) throw error;
        return data;
    }
);

// Async thunk to update device status in database
export const updateDeviceStatus = createAsyncThunk(
    'device/updateDeviceStatus',
    async ({ deviceId, status, isActive = true }: { 
        deviceId: string, 
        status: 'offline' | 'online' | 'busy',
        isActive?: boolean
    }, { dispatch }) => {
        try {
            const client = getSwarmSupabase();
            if (!deviceId) throw new Error('No device ID provided');
    
            // Update device status in database
            const { error } = await client
                .from('devices')
                .update({ 
                    status,
                    last_seen: new Date().toISOString()
                })
                .eq('id', deviceId);
    
            if (error) throw error;
            
            // If device is being deactivated, clean up any processing tasks
            if (!isActive) {
                logger.log(`Device ${deviceId} is being deactivated, cleaning up tasks`);
                dispatch(cleanupProcessingTasks());
            }
    
            return { deviceId, status, isActive };
        } catch (error) {
            console.error('Error updating device status:', error);
            throw error;
        }
    }
);

const deviceSlice = createSlice({
    name: 'device',
    initialState,
    reducers: {
        setCurrentDevice: (state, action) => {
            state.currentDeviceId = action.payload;
        },
        clearCurrentDevice: (state) => {
            state.currentDeviceId = null;
        },
        setNodeActive: (state, action) => {
            state.isActive = action.payload;
            logger.log(`Node active state set to: ${action.payload}`);
        },
    },
    extraReducers: (builder) => {
        builder
            // Create Device
            .addCase(createDevice.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(createDevice.fulfilled, (state, action) => {
                state.loading = false;
                state.currentDeviceId = action.payload.id;
            })
            .addCase(createDevice.rejected, (state, action) => {
                state.loading = false;
                state.error = action.error.message || 'Failed to create device';
            })
            // Fetch Devices
            .addCase(fetchUserDevices.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(fetchUserDevices.fulfilled, (state, action) => {
                state.loading = false;
                state.devices = action.payload;
            })
            .addCase(fetchUserDevices.rejected, (state, action) => {
                state.loading = false;
                state.error = action.error.message || 'Failed to fetch devices';
            })
            // Update device status
            .addCase(updateDeviceStatus.fulfilled, (state, action) => {
                state.isActive = action.payload.isActive;
                
                // Update the device status in the devices array
                if (state.devices.length > 0) {
                    const deviceIndex = state.devices.findIndex(
                        device => device.id === action.payload.deviceId
                    );
                    
                    if (deviceIndex !== -1) {
                        state.devices[deviceIndex].status = action.payload.status;
                        state.devices[deviceIndex].last_seen = new Date().toISOString();
                    }
                }
                
                logger.log(`Device status updated: ${action.payload.status}, isActive: ${action.payload.isActive}`);
            });
    },
});

export const { setCurrentDevice, clearCurrentDevice, setNodeActive } = deviceSlice.actions;
export default deviceSlice.reducer; 