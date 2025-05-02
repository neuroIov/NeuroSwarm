import { getSwarmSupabase } from '@/lib/supabase-client';

export interface UserProfile {
    id: string;
    wallet_address: string;
    total_earnings: number;
    total_tasks_completed: number;
    reputation_score: number;
    joined_at: string;
}

/**
 * Get a user profile by wallet address
 */
export const getUserByWallet = async (walletAddress: string): Promise<UserProfile | null> => {
    try {
        const supabase = getSwarmSupabase();

        const { data, error } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('wallet_address', walletAddress)
            .single();

        if (error) {
            console.error('Error fetching user profile:', error);
            return null;
        }

        return data;
    } catch (error) {
        console.error('Unexpected error:', error);
        return null;
    }
};

/**
 * Create a new user profile with the given wallet address
 */
export const createUserProfile = async (walletAddress: string): Promise<UserProfile | null> => {
    try {
        const supabase = getSwarmSupabase();

        const { data, error } = await supabase
            .from('user_profiles')
            .insert({ wallet_address: walletAddress })
            .select()
            .single();

        if (error) {
            console.error('Error creating user profile:', error);
            return null;
        }

        return data;
    } catch (error) {
        console.error('Unexpected error:', error);
        return null;
    }
};

/**
 * Update a user's reputation score
 */
export const updateUserReputation = async (
    walletAddress: string,
    newScore: number
): Promise<boolean> => {
    try {
        const supabase = getSwarmSupabase();

        // Ensure score is within valid range (0-100)
        const validScore = Math.max(0, Math.min(100, newScore));

        const { error } = await supabase
            .from('user_profiles')
            .update({ reputation_score: validScore })
            .eq('wallet_address', walletAddress);

        if (error) {
            console.error('Error updating reputation score:', error);
            return false;
        }

        return true;
    } catch (error) {
        console.error('Unexpected error:', error);
        return false;
    }
};

/**
 * Update user's total earnings
 */
export const updateUserEarnings = async (
    walletAddress: string,
    earnings: number
): Promise<boolean> => {
    try {
        const supabase = getSwarmSupabase();

        // First get current earnings
        const { data: currentUser, error: fetchError } = await supabase
            .from('user_profiles')
            .select('total_earnings')
            .eq('wallet_address', walletAddress)
            .single();

        if (fetchError || !currentUser) {
            console.error('Error fetching current earnings:', fetchError);
            return false;
        }

        // Add to current earnings
        const newEarnings = (currentUser.total_earnings || 0) + earnings;

        // Update with new total
        const { error } = await supabase
            .from('user_profiles')
            .update({ total_earnings: newEarnings })
            .eq('wallet_address', walletAddress);

        if (error) {
            console.error('Error updating earnings:', error);
            return false;
        }

        return true;
    } catch (error) {
        console.error('Unexpected error:', error);
        return false;
    }
};

/**
 * Increment tasks completed counter
 */
export const incrementTasksCompleted = async (walletAddress: string): Promise<boolean> => {
    try {
        const supabase = getSwarmSupabase();

        // First get current count
        const { data: currentUser, error: fetchError } = await supabase
            .from('user_profiles')
            .select('total_tasks_completed')
            .eq('wallet_address', walletAddress)
            .single();

        if (fetchError || !currentUser) {
            console.error('Error fetching tasks completed:', fetchError);
            return false;
        }

        // Increment count
        const newCount = (currentUser.total_tasks_completed || 0) + 1;

        // Update with new count
        const { error } = await supabase
            .from('user_profiles')
            .update({ total_tasks_completed: newCount })
            .eq('wallet_address', walletAddress);

        if (error) {
            console.error('Error updating tasks completed:', error);
            return false;
        }

        return true;
    } catch (error) {
        console.error('Unexpected error:', error);
        return false;
    }
}; 