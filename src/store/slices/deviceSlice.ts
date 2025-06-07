import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { getSwarmSupabase } from '@/lib/supabase-client';

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
}

const initialState: DeviceState = {
    currentDeviceId: null,
    devices: [],
    loading: false,
    error: null,
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
            });
    },
});

export const { setCurrentDevice, clearCurrentDevice } = deviceSlice.actions;
export default deviceSlice.reducer; 