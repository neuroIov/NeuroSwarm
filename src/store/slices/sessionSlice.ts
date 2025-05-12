// src/store/slices/sessionSlice.ts
import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import { getSwarmSupabase } from '@/lib/supabase-client';
import { Activity, AuthMethod, UserProfile } from '@/types/session';
import { SubscriptionTier, subscriptionTiers, getTierByName } from '@/types/subscriptionTiers';


// Helper function to create a unique referral code
const createUniqueReferralCode = async (userId: string, walletAddress: string): Promise<string> => {
  // Create a unique string to hash
  const combined = `${userId}-${walletAddress}-${Date.now()}`;

  // Use Web Crypto API (available in browsers) instead of Node.js crypto
  const encoder = new TextEncoder();
  const data = encoder.encode(combined);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);

  // Convert to hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  // Return first 8 characters of the hash
  return hashHex.substring(0, 8);
};

// Types for referrals and rewards
export interface Referral {
  id: string;
  referrer_id: string;
  referred_id: string;
  referred_at: string;
  referred_name: string | null;
  tier_level: 'tier_1' | 'tier_2' | 'tier_3';
  user_profile?: {
    user_name: string | null;
    wallet_address: string;
  };
}

export interface ReferralReward {
  id: string;
  referral_id: string;
  reward_type: 'signup' | 'task_completion' | 'others';
  reward_amount: number;
  reward_timestamp: string;
  claimed: boolean;
  claimed_at: string | null;
  referral?: Referral;
}

type SessionState = {
  sessionId: string | null;
  userId: string | null;
  authMethod: AuthMethod;
  walletAddress: string | null;
  userProfile: UserProfile | null;
  startTime: string | null;
  activities: Activity[];
  referrals: Referral[];
  referralRewards: ReferralReward[];
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
  referrals: [],
  referralRewards: [],
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

// Async thunk to generate and update referral code
export const generateReferralCode = createAsyncThunk(
  'session/generateReferralCode',
  async (userId: string, { getState, rejectWithValue }) => {
    try {
      const state = getState() as { session: SessionState };
      const walletAddress = state.session.walletAddress;

      if (!walletAddress) {
        throw new Error('Wallet address not found. Unable to generate referral code.');
      }

      const referralCode = await createUniqueReferralCode(userId, walletAddress);
      const supabase = getSwarmSupabase();

      console.log(`Generating referral code for user ${userId}: ${referralCode}`);

      const { data, error } = await supabase
        .from('user_profiles')
        .update({ referral_code: referralCode })
        .eq('id', userId)
        .select()
        .single();

      if (error) {
        console.error(`Error updating referral code: ${error.message}`);
        throw new Error(error.message);
      }

      console.log('Referral code generated successfully:', data);
      return data;
    } catch (error) {
      console.error('Error in generateReferralCode:', error);
      return rejectWithValue((error as Error).message);
    }
  }
);

// Async thunk to verify a referral code
export const verifyReferralCode = createAsyncThunk(
  'session/verifyReferralCode',
  async (referralCode: string, { rejectWithValue }) => {
    try {
      const supabase = getSwarmSupabase();

      console.log(`Verifying referral code: ${referralCode}`);

      const { data: referrerId, error } = await supabase.rpc('verify_referral_code', {
        code: referralCode
      });

      if (error) {
        console.error(`Error verifying referral code: ${error.message}`);
        throw new Error(error.message);
      }

      console.log('Referral code verification result:', referrerId);
      return { isValid: !!referrerId, referrerId };
    } catch (error) {
      console.error('Error in verifyReferralCode:', error);
      return rejectWithValue((error as Error).message);
    }
  }
);

// Async thunk to create referral relationship
export const createReferralRelationship = createAsyncThunk(
  'session/createReferralRelationship',
  async ({ referrerCode, referredId }: { referrerCode: string; referredId: string }, { rejectWithValue }) => {
    try {
      const supabase = getSwarmSupabase();

      console.log(`Creating referral relationship: ${referrerCode} -> ${referredId}`);

      const { data: result, error } = await supabase.rpc('create_referral_relationship', {
        p_referrer_code: referrerCode,
        p_referred_id: referredId
      });

      if (error) {
        console.error(`Error creating referral relationship: ${error.message}`);
        throw new Error(error.message);
      }

      console.log('Referral relationship created:', result);
      return result;
    } catch (error) {
      console.error('Error in createReferralRelationship:', error);
      return rejectWithValue((error as Error).message);
    }
  }
);

// Async thunk to fetch user's referrals
export const fetchUserReferrals = createAsyncThunk(
  'session/fetchUserReferrals',
  async (userId: string, { rejectWithValue }) => {
    try {
      const supabase = getSwarmSupabase();

      console.log(`Fetching referrals for user: ${userId}`);

      // Use the new stored procedure to get referrals
      const { data, error } = await supabase
        .rpc('get_user_referrals_jsonb', { p_user_id: userId });

      if (error) {
        console.error(`Error fetching referrals: ${error.message}`);
        throw new Error(error.message);
      }

      // Fetch additional user details for each referral
      const referrals = data || [];
      const referredIds = referrals.map((ref: any) => ref.referred_user_id);

      if (referredIds.length > 0) {
        const { data: userProfiles, error: profilesError } = await supabase
          .from('user_profiles')
          .select('id, user_name, wallet_address')
          .in('id', referredIds);

        if (!profilesError && userProfiles) {
          // Map the user profiles to the referrals
          const enrichedReferrals = referrals.map((ref: any) => {
            const userProfile = userProfiles.find(profile => profile.id === ref.referred_user_id);
            return {
              id: ref.referral_id,
              referrer_id: userId,
              referred_id: ref.referred_user_id,
              referred_at: ref.referral_date,
              referred_name: ref.referred_user_name,
              tier_level: ref.tier_level,
              user_profile: userProfile || undefined
            };
          });

          console.log(`Fetched ${enrichedReferrals.length} referrals`);
          return enrichedReferrals as unknown as Referral[];
        }
      }

      // Return basic referrals if no additional data could be fetched
      const mappedReferrals = referrals.map((ref: any) => ({
        id: ref.referral_id,
        referrer_id: userId,
        referred_id: ref.referred_user_id,
        referred_at: ref.referral_date,
        referred_name: ref.referred_user_name,
        tier_level: ref.tier_level
      }));

      console.log(`Fetched ${mappedReferrals.length} referrals`);
      return mappedReferrals as unknown as Referral[];
    } catch (error) {
      console.error('Error in fetchUserReferrals:', error);
      return rejectWithValue((error as Error).message);
    }
  }
);

// Async thunk to fetch user's referral rewards
export const fetchReferralRewards = createAsyncThunk(
  'session/fetchReferralRewards',
  async (userId: string, { rejectWithValue }) => {
    try {
      const supabase = getSwarmSupabase();

      console.log(`Fetching referral rewards for user: ${userId}`);

      // First get all referrals for this user
      const { data: referrals, error: referralsError } = await supabase
        .from('referrals')
        .select('id')
        .eq('referrer_id', userId);

      if (referralsError) {
        console.error(`Error fetching referral ids: ${referralsError.message}`);
        throw new Error(referralsError.message);
      }

      if (!referrals.length) {
        console.log('No referrals found, returning empty rewards array');
        return [] as ReferralReward[];
      }

      // Get the referral IDs
      const referralIds = referrals.map(ref => ref.id);

      // Then get all rewards for those referrals
      const { data: rewards, error: rewardsError } = await supabase
        .from('referral_rewards')
        .select(`
          id,
          referral_id,
          reward_type,
          reward_amount,
          reward_timestamp,
          claimed,
          claimed_at,
          referral:referral_id (
            id,
            referrer_id,
            referred_id,
            referred_at,
            referred_name,
            user_profile:referred_id (
              user_name,
              wallet_address
            )
          )
        `)
        .in('referral_id', referralIds)
        .order('reward_timestamp', { ascending: false });

      if (rewardsError) {
        console.error(`Error fetching rewards: ${rewardsError.message}`);
        throw new Error(rewardsError.message);
      }

      console.log(`Fetched ${rewards?.length || 0} rewards`);
      return rewards as unknown as ReferralReward[];
    } catch (error) {
      console.error('Error in fetchReferralRewards:', error);
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
      })

      // Handle generateReferralCode
      .addCase(generateReferralCode.pending, (state) => {
        state.loading = true;
        state.error = null;
        console.log('Generating referral code...');
      })
      .addCase(generateReferralCode.fulfilled, (state, action) => {
        state.loading = false;
        state.userProfile = action.payload;
        console.log('Referral code generated successfully');
      })
      .addCase(generateReferralCode.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
        console.error(`Failed to generate referral code: ${action.payload}`);
      })

      // Handle verifyReferralCode
      .addCase(verifyReferralCode.pending, (state) => {
        state.loading = true;
        state.error = null;
        console.log('Verifying referral code...');
      })
      .addCase(verifyReferralCode.fulfilled, (state) => {
        state.loading = false;
        console.log('Referral code verified successfully');
      })
      .addCase(verifyReferralCode.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
        console.error(`Failed to verify referral code: ${action.payload}`);
      })

      // Handle createReferralRelationship
      .addCase(createReferralRelationship.pending, (state) => {
        state.loading = true;
        state.error = null;
        console.log('Creating referral relationship...');
      })
      .addCase(createReferralRelationship.fulfilled, (state) => {
        state.loading = false;
        console.log('Referral relationship created successfully');
      })
      .addCase(createReferralRelationship.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
        console.error(`Failed to create referral relationship: ${action.payload}`);
      })

      // Handle fetchUserReferrals
      .addCase(fetchUserReferrals.pending, (state) => {
        state.loading = true;
        state.error = null;
        console.log('Fetching user referrals...');
      })
      .addCase(fetchUserReferrals.fulfilled, (state, action) => {
        state.loading = false;
        state.referrals = action.payload;
        console.log('User referrals fetched successfully');
      })
      .addCase(fetchUserReferrals.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
        console.error(`Failed to fetch user referrals: ${action.payload}`);
      })

      // Handle fetchReferralRewards
      .addCase(fetchReferralRewards.pending, (state) => {
        state.loading = true;
        state.error = null;
        console.log('Fetching referral rewards...');
      })
      .addCase(fetchReferralRewards.fulfilled, (state, action) => {
        state.loading = false;
        state.referralRewards = action.payload;
        console.log('Referral rewards fetched successfully');
      })
      .addCase(fetchReferralRewards.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
        console.error(`Failed to fetch referral rewards: ${action.payload}`);
      });
  },
});

export const { startSession, logActivity, endSession, setError } = sessionSlice.actions;
export default sessionSlice.reducer;
