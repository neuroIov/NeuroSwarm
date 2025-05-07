// src/store/slices/sessionSlice.ts
import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import { getSwarmSupabase } from '@/lib/supabase-client';
import { Activity, AuthMethod, UserProfile } from '@/types/session';

type SessionState = {
  sessionId: string | null;
  userId: string | null;
  authMethod: AuthMethod;
  walletAddress: string | null;
  userProfile: UserProfile | null;
  startTime: string | null;
  activities: Activity[];
  loading: boolean;
  error: string | null;
};

const initialState: SessionState = {
  sessionId: null,
  userId: null,
  authMethod: null,
  walletAddress: null,
  userProfile: null,
  startTime: null,
  activities: [],
  loading: false,
  error: null,
};

// Async thunk to fetch or create user profile
export const fetchOrCreateUserProfile = createAsyncThunk(
  'session/fetchOrCreateUserProfile',
  async (walletAddress: string, { rejectWithValue }) => {
    try {
      const supabase = getSwarmSupabase();

      console.log(`Attempting to fetch user profile for wallet: ${walletAddress}`);

      // First try to get the existing user
      const { data: userProfile, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('wallet_address', walletAddress)
        .single();

      // If user doesn't exist, create a new profile
      if (error || !userProfile) {
        console.log(`No existing profile found. Creating new profile for wallet: ${walletAddress}`);

        const { data: newUser, error: insertError } = await supabase
          .from('user_profiles')
          .insert({ wallet_address: walletAddress })
          .select()
          .single();

        if (insertError) {
          console.error(`Error creating user profile: ${insertError.message}`);
          throw new Error(insertError.message);
        }

        console.log('New user profile created:', newUser);
        return newUser;
      }

      console.log('Existing user profile found:', userProfile);
      return userProfile;
    } catch (error) {
      console.error('Error in fetchOrCreateUserProfile:', error);
      return rejectWithValue((error as Error).message);
    }
  }
);

// Async thunk to update username
export const updateUsername = createAsyncThunk(
  'session/updateUsername',
  async ({ userId, username }: { userId: string; username: string }, { rejectWithValue }) => {
    try {
      const supabase = getSwarmSupabase();

      console.log(`Updating username for user ${userId} to "${username}"`);

      const { data, error } = await supabase
        .from('user_profiles')
        .update({ user_name: username })
        .eq('id', userId)
        .select()
        .single();

      if (error) {
        console.error(`Error updating username: ${error.message}`);
        throw new Error(error.message);
      }

      console.log('Username updated successfully:', data);
      return data;
    } catch (error) {
      console.error('Error in updateUsername:', error);
      return rejectWithValue((error as Error).message);
    }
  }
);

const sessionSlice = createSlice({
  name: 'session',
  initialState,
  reducers: {
    startSession(state, action: PayloadAction<{ userId: string; authMethod: AuthMethod; walletAddress?: string }>) {
      const { userId, authMethod, walletAddress } = action.payload;
      state.sessionId = crypto.randomUUID();
      state.userId = userId;
      state.authMethod = authMethod;
      state.walletAddress = walletAddress || null;
      state.startTime = new Date().toISOString();
      state.activities = [];
      state.error = null;

      console.log(`Started new session: ${state.sessionId}`);
      console.log(`User type: ${authMethod || 'guest'}, User ID: ${userId}`);

      if (authMethod === null) {
        console.log('Guest session - no wallet connected');
      }
    },
    logActivity(state, action: PayloadAction<{ type: string; details: Record<string, unknown> }>) {
      const newActivity = {
        type: action.payload.type,
        timestamp: new Date().toISOString(),
        details: action.payload.details,
      };

      state.activities.push(newActivity);
      console.log(`Activity logged: ${newActivity.type}`, newActivity.details);
    },
    endSession(state) {
      console.log(`Ending session: ${state.sessionId}`);
      Object.assign(state, initialState);
    },
    setError(state, action: PayloadAction<string>) {
      state.error = action.payload;
      console.error(`Session error: ${action.payload}`);
    },
  },
  extraReducers: (builder) => {
    builder
      // Handle fetchOrCreateUserProfile
      .addCase(fetchOrCreateUserProfile.pending, (state) => {
        state.loading = true;
        state.error = null;
        console.log('Fetching user profile...');
      })
      .addCase(fetchOrCreateUserProfile.fulfilled, (state, action) => {
        state.loading = false;
        state.userProfile = action.payload;
        console.log('User profile loaded successfully');
      })
      .addCase(fetchOrCreateUserProfile.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
        console.error(`Failed to load user profile: ${action.payload}`);
      })

      // Handle updateUsername
      .addCase(updateUsername.pending, (state) => {
        state.loading = true;
        state.error = null;
        console.log('Updating username...');
      })
      .addCase(updateUsername.fulfilled, (state, action) => {
        state.loading = false;
        state.userProfile = action.payload;
        console.log('Username updated successfully');
      })
      .addCase(updateUsername.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
        console.error(`Failed to update username: ${action.payload}`);
      });
  },
});

export const { startSession, logActivity, endSession, setError } = sessionSlice.actions;
export default sessionSlice.reducer;
