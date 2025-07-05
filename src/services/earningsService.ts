import { getSwarmSupabase } from '@/lib/supabase-client';
import { logger } from '../utils/logger';
import { TASK_PROCESSING_CONFIG } from './config';

/**
 * Record earnings for a completed task
 * @param {string} taskId - The ID of the completed task
 * @param {string} userId - User's ID
 * @param {string} taskType - Type of task ('image' or 'text')
 * @returns {Promise<{success: boolean, earningId?: string}>}
 */
export const recordTaskEarning = async (taskId, userId, taskType) => {
    try {
        if (!taskId || !userId || !taskType) {
            logger.error('Cannot record earnings: Missing required parameters');
            return { success: false };
        }

        const client = getSwarmSupabase();
        if (!client) {
            logger.error('Supabase client is not initialized');
            return { success: false };
        }

        // Determine amount based on task type
        const amount = taskType === 'image'
            ? TASK_PROCESSING_CONFIG.EARNINGS_NLOVE.image
            : TASK_PROCESSING_CONFIG.EARNINGS_NLOVE.text;

        // Check if an earning already exists for this task
        const { data: existingEarning, error: checkError } = await client
            .from('earnings')
            .select('id')
            .eq('task_id', taskId)
            .maybeSingle();

        if (checkError) {
            logger.error('Error checking existing earnings:', checkError);
            return { success: false };
        }

        if (existingEarning) {
            logger.log(`Earnings already recorded for task ${taskId}`);
            return { success: false, message: 'Earnings already recorded for this task' };
        }

        // Insert earnings record while task still exists in tasks table
        const { data: earning, error: insertError } = await client
            .from('earnings')
            .insert({
                user_id: userId,
                amount: amount,
                task_id: taskId,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                earning_type: 'task'
            })
            .select('*')
            .single();

        if (insertError) {
            logger.error('Error recording task earnings:', insertError);
            return { success: false };
        }

        logger.log(`Successfully recorded ${amount} NLOVE earnings for task ${taskId}`);

        // Update earnings_history to track task count and pending amount
        try {
            // Get the latest earnings history record for this user
            const { data: latestHistory, error: fetchError } = await client
                .from('earnings_history')
                .select('*')
                .eq('user_id', userId)
                .eq('payout_status', 'pending')
                .order('timestamp', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (fetchError) {
                logger.error('Error fetching earnings history:', fetchError);
                // Don't fail the whole operation if just the history update fails
            } else if (latestHistory) {
                // Update existing record
                const { error: updateError } = await client
                    .from('earnings_history')
                    .update({
                        amount: latestHistory.amount + amount,
                        task_count: latestHistory.task_count + 1,
                        timestamp: new Date().toISOString()
                    })
                    .eq('id', latestHistory.id);

                if (updateError) {
                    logger.error('Error updating earnings history:', updateError);
                }
            } else {
                // Create new history record
                const { error: insertHistoryError } = await client
                    .from('earnings_history')
                    .insert({
                        user_id: userId,
                        amount: amount,
                        task_count: 1,
                        timestamp: new Date().toISOString(),
                        payout_status: 'pending'
                    });

                if (insertHistoryError) {
                    logger.error('Error creating earnings history record:', insertHistoryError);
                }
            }
        } catch (historyError) {
            logger.error('Error updating earnings history:', historyError);
            // Don't fail the whole operation if just the history update fails
        }

        return { success: true, earningId: earning.id };
    } catch (error) {
        logger.error('Error in recordTaskEarning:', error);
        return { success: false };
    }
};

/**
 * Get user's total earnings
 * @param {string} userId - User ID from profile
 * @returns {Promise<{totalEarnings: number, pendingEarnings: number, completedTasks: number}>}
 */
export const getUserEarnings = async (userId) => {
    try {
        if (!userId) {
            logger.error('Cannot get user earnings: No user ID provided');
            return { totalEarnings: 0, pendingEarnings: 0, completedTasks: 0 };
        }

        const client = getSwarmSupabase();
        if (!client) {
            logger.error('Supabase client is not initialized');
            return { totalEarnings: 0, pendingEarnings: 0, completedTasks: 0 };
        }

        // Calculate total earnings directly from earnings table
        const { data: earningsData, error: earningsError } = await client
            .from('earnings')
            .select('amount, earning_type')
            .eq('user_id', userId);

        if (earningsError) {
            logger.error('Error fetching earnings data:', earningsError);
            return { totalEarnings: 0, pendingEarnings: 0, completedTasks: 0 };
        }

        // Calculate total earnings from all earnings records
        const totalEarnings = earningsData?.reduce((sum, record) => sum + Number(record.amount), 0) || 0;

        // Count completed tasks from earnings records
        const completedTasks = earningsData?.filter(record => record.earning_type === 'task').length || 0;

        // Get latest earnings history for pending amount
        const { data: earningsHistory, error: historyError } = await client
            .from('earnings_history')
            .select('*')
            .eq('user_id', userId)
            .eq('payout_status', 'pending')
            .order('timestamp', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (historyError) {
            logger.error('Error fetching earnings history:', historyError);
            return { totalEarnings, pendingEarnings: 0, completedTasks };
        }

        // Get pending earnings from history or default to 0
        const pendingEarnings = earningsHistory?.amount || 0;

        return {
            totalEarnings,
            pendingEarnings,
            completedTasks
        };
    } catch (error) {
        logger.error('Error in getUserEarnings:', error);
        return { totalEarnings: 0, pendingEarnings: 0, completedTasks: 0 };
    }
};

export const getUserTotalEarnings = async (userId) => {
    try {
        if (!userId) {
            logger.error('Cannot get user total earnings: No user ID provided');
            return 0;
        }

        const client = getSwarmSupabase();
        if (!client) {
            logger.error('Supabase client is not initialized');
            return 0;
        }

        // Calculate total earnings directly from earnings table
        const { data: earningsData, error: earningsError } = await client
            .from('earnings')
            .select('amount')
            .eq('user_id', userId);

        if (earningsError) {
            logger.error('Error fetching earnings data:', earningsError);
            return 0;
        }

        // Sum all earnings
        const totalEarnings = earningsData?.reduce((sum, record) => sum + Number(record.amount), 0) || 0;
        return totalEarnings;
    } catch (error) {
        logger.error('Error in getUserTotalEarnings:', error);
        return 0;
    }
}

/**
 * Get list of user's earnings transactions
 * @param {string} userId - User ID from profile
 * @param {number} limit - Number of records to return
 * @param {number} offset - Offset for pagination
 * @returns {Promise<Array>} List of earnings records
 */
export const getUserEarningsTransactions = async (userId, limit = 20, offset = 0) => {
    try {
        if (!userId) {
            logger.error('Cannot get earnings transactions: No user ID provided');
            return [];
        }

        const client = getSwarmSupabase();
        if (!client) {
            logger.error('Supabase client is not initialized');
            return [];
        }

        // Query earnings directly by user_id instead of wallet address
        const { data: transactions, error } = await client
            .from('earnings')
            .select(`
                id,
                amount,
                created_at,
                transaction_hash,
                earning_type,
                updated_at,
                tasks (
                    id,
                    type,
                    status,
                    prompt
                )
            `)
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) {
            logger.error('Error fetching earnings transactions:', error);
            return [];
        }

        return transactions || [];
    } catch (error) {
        logger.error('Error in getUserEarningsTransactions:', error);
        return [];
    }
};

/**
 * Process referral rewards when a user earns from completed tasks
 * @param {string} userId - The ID of the user who completed the task
 * @param {number} amount - The amount earned from the task 
 * @returns {Promise<{success: boolean, message?: string}>}
 */
export const processReferralRewards = async (userId, amount) => {
    try {
        if (!userId || !amount) {
            logger.error('Cannot process referral rewards: Missing required parameters');
            return { success: false, message: 'Missing required parameters' };
        }

        const client = getSwarmSupabase();
        if (!client) {
            logger.error('Supabase client is not initialized');
            return { success: false, message: 'Supabase client not initialized' };
        }

        // Call the RPC function to process referral rewards
        const { error } = await client
            .rpc('process_referral_rewards', {
                p_user_id: userId,
                p_earning_amount: amount
            });

        if (error) {
            logger.error('Error processing referral rewards:', error);
            return { success: false, message: error.message };
        }

        logger.log(`Successfully processed referral rewards for user ${userId}`);
        return { success: true };
    } catch (error) {
        logger.error('Error in processReferralRewards:', error);
        return { success: false, message: error.message };
    }
};

/**
 * Claim referral rewards for a user
 * @param {string} userId - The ID of the user claiming rewards
 * @param {string} rewardId - The ID of the reward being claimed
 * @returns {Promise<{success: boolean, message?: string, earningId?: string}>}
 */
export const claimReferralReward = async (userId, rewardId) => {
    try {
        if (!userId || !rewardId) {
            logger.error('Cannot claim referral reward: Missing required parameters');
            return { success: false, message: 'Missing required parameters' };
        }

        const client = getSwarmSupabase();
        if (!client) {
            logger.error('Supabase client is not initialized');
            return { success: false, message: 'Supabase client not initialized' };
        }

        // Get the reward details
        const { data: reward, error: rewardError } = await client
            .from('referral_rewards')
            .select('*')
            .eq('id', rewardId)
            .eq('claimed', false)
            .single();

        if (rewardError || !reward) {
            logger.error('Error fetching reward or reward already claimed:', rewardError);
            return { success: false, message: 'Reward not found or already claimed' };
        }

        // Store the reward amount before updating
        const rewardAmount = reward.reward_amount;

        // 1. Mark reward as claimed
        const { error: updateError } = await client
            .from('referral_rewards')
            .update({
                claimed: true,
                claimed_at: new Date().toISOString(),
                reward_amount: 0  // Reset amount to 0 since it's claimed
            })
            .eq('id', rewardId);

        if (updateError) {
            logger.error('Error updating reward:', updateError);
            return { success: false, message: 'Failed to update reward status' };
        }

        // 2. Add the earnings entry with type "referral"
        const { data: earning, error: insertError } = await client
            .from('earnings')
            .insert({
                user_id: userId, // Use user_id instead of user_address
                amount: rewardAmount,
                task_id: null,  // No task associated with referral earnings
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                earning_type: 'referral'  // Mark as referral type
            })
            .select('*')
            .single();

        if (insertError) {
            logger.error('Error recording referral earning:', insertError);
            // Try to revert the reward update
            await client
                .from('referral_rewards')
                .update({
                    claimed: false,
                    claimed_at: null,
                    reward_amount: rewardAmount
                })
                .eq('id', rewardId);
            return { success: false, message: 'Failed to record referral earning' };
        }

        // 3. Update the earnings history
        const { data: latestHistory, error: fetchError } = await client
            .from('earnings_history')
            .select('*')
            .eq('user_id', userId)
            .order('timestamp', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (fetchError) {
            logger.error('Error fetching earnings history:', fetchError);
            return { success: false, message: 'Failed to fetch earnings history' };
        }

        try {
            if (latestHistory && latestHistory.payout_status === 'pending') {
                // Update existing record
                const { error: updateHistoryError } = await client
                    .from('earnings_history')
                    .update({
                        amount: latestHistory.amount + rewardAmount,
                        timestamp: new Date().toISOString()
                    })
                    .eq('id', latestHistory.id);

                if (updateHistoryError) {
                    throw new Error(`Failed to update earnings history: ${updateHistoryError.message}`);
                }
            } else {
                // Create new history record
                const { error: insertHistoryError } = await client
                    .from('earnings_history')
                    .insert({
                        user_id: userId,
                        amount: rewardAmount,
                        task_count: 0,  // No tasks associated with this earning
                        timestamp: new Date().toISOString(),
                        payout_status: 'pending'
                    });

                if (insertHistoryError) {
                    throw new Error(`Failed to create earnings history: ${insertHistoryError.message}`);
                }
            }
        } catch (historyError) {
            logger.error('Error updating earnings history:', historyError);
            // The claim was successful, but history update failed
            // This is not critical, so we'll log but still return success
            logger.warn('Warning: Earnings history update failed but claim was successful');
        }

        logger.log(`Successfully claimed referral reward ${rewardId} for user ${userId}`);
        return { success: true, earningId: earning.id };
    } catch (error) {
        logger.error('Error in claimReferralReward:', error);
        return { success: false, message: error.message };
    }
};

// Add a debug function to check if data is properly fetched
export const debugEarningsData = async (userId) => {
    try {
        if (!userId) {
            return { error: 'No user ID provided' };
        }

        const client = getSwarmSupabase();
        if (!client) {
            return { error: 'Supabase client is not initialized' };
        }

        // Check user profile
        const { data: userProfile, error: profileError } = await client
            .from('user_profiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (profileError) {
            return { error: `Error fetching user profile: ${profileError.message}` };
        }

        // Check earnings
        const { data: earnings, error: earningsError } = await client
            .from('earnings')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(5);

        if (earningsError) {
            return { error: `Error fetching earnings: ${earningsError.message}` };
        }

        // Check earnings history
        const { data: history, error: historyError } = await client
            .from('earnings_history')
            .select('*')
            .eq('user_id', userId)
            .order('timestamp', { ascending: false })
            .limit(5);

        if (historyError) {
            return { error: `Error fetching earnings history: ${historyError.message}` };
        }

        return {
            userProfile: userProfile || null,
            earnings: earnings || [],
            earnings_count: earnings?.length || 0,
            history: history || [],
            history_count: history?.length || 0
        };
    } catch (error) {
        return { error: `Unexpected error: ${error.message}` };
    }
};

// Add a test function to create a sample earning
export const createTestEarning = async (userId) => {
    try {
        if (!userId) {
            return { success: false, error: 'No user ID provided' };
        }

        const client = getSwarmSupabase();
        if (!client) {
            return { success: false, error: 'Supabase client is not initialized' };
        }

        // Create a test earning record with a small amount
        const testAmount = 0.1; // Small test amount

        // Create a test earning record
        const { data: earning, error: insertError } = await client
            .from('earnings')
            .insert({
                user_id: userId,
                amount: testAmount,
                task_id: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                earning_type: 'test'
            })
            .select('*')
            .single();

        if (insertError) {
            logger.error('Error creating test earning:', insertError);
            return { success: false, error: insertError.message };
        }

        // Add to earnings history - this is the only place we should update history for this earning
        const { data: latestHistory, error: fetchError } = await client
            .from('earnings_history')
            .select('*')
            .eq('user_id', userId)
            .eq('payout_status', 'pending')
            .order('timestamp', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (!fetchError && latestHistory && latestHistory.payout_status === 'pending') {
            // Update existing record
            await client
                .from('earnings_history')
                .update({
                    amount: latestHistory.amount + testAmount,
                    task_count: latestHistory.task_count + 1, // Increment task count for test earnings too
                    timestamp: new Date().toISOString()
                })
                .eq('id', latestHistory.id);
        } else {
            // Create new history record
            await client
                .from('earnings_history')
                .insert({
                    user_id: userId,
                    amount: testAmount,
                    task_count: 1, // Start with 1 for first test earning
                    timestamp: new Date().toISOString(),
                    payout_status: 'pending'
                });
        }

        return { success: true, earning };
    } catch (error) {
        logger.error('Error in createTestEarning:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Handle daily check-in for a user
 * @param {string} userId - User ID from profile
 * @returns {Promise<{status: "checked_in" | "already_checked_in" | "error", streak?: number, amount?: number, error?: string}>}
 */
export const handleDailyCheckIn = async (userId: string) => {
    try {
        if (!userId) {
            return { status: "error" as const, error: "No user ID provided" };
        }

        const client = getSwarmSupabase();
        if (!client) {
            return { status: "error" as const, error: "Supabase client not initialized" };
        }

        const today = new Date();
        const todayStr = today.toISOString().split("T")[0];
        const yesterday = new Date();
        yesterday.setDate(today.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split("T")[0];

        // 1. Fetch user's current check-in state
        const { data: row, error: fetchError } = await client
            .from("daily_checkins")
            .select("*")
            .eq("user_id", userId)
            .single();

        if (fetchError && fetchError.code !== "PGRST116") {
            logger.error("Fetch error:", fetchError);
            return { status: "error" as const, error: fetchError.message };
        }

        let streakCount = 1;
        
        // Calculate reward amount based on streak day
        const getRewardForDay = (day: number): number => {
            const rewards = [10, 20, 30, 40, 50, 60, 70];
            return rewards[Math.min(day - 1, 6)]; // Cap at day 7 (index 6)
        };

        // Helper function to add earnings and update history
        const recordReward = async (amount: number): Promise<boolean> => {
            try {
                // 1. Insert into earnings table
                const { error: earningError } = await client
                    .from("earnings")
                    .insert({
                        user_id: userId,
                        amount: amount,
                        earning_type: "other",
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    });

                if (earningError) {
                    logger.error("Error recording daily check-in reward:", earningError);
                    return false;
                }

                // 2. Update earnings history
                const { data: latestHistory, error: historyError } = await client
                    .from("earnings_history")
                    .select("*")
                    .eq("user_id", userId)
                    .eq("payout_status", "pending")
                    .order("timestamp", { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (historyError) {
                    logger.error("Error fetching earnings history:", historyError);
                    // Continue execution despite this error
                } else if (latestHistory) {
                    // Update existing record
                    const { error: updateError } = await client
                        .from("earnings_history")
                        .update({
                            amount: Number(latestHistory.amount) + amount,
                            timestamp: new Date().toISOString()
                        })
                        .eq("id", latestHistory.id);
                    
                    if (updateError) {
                        logger.error("Error updating earnings history:", updateError);
                        // Continue execution despite this error
                    }
                } else {
                    // Create new history record
                    const { error: insertError } = await client
                        .from("earnings_history")
                        .insert({
                            user_id: userId,
                            amount: amount,
                            task_count: 0,
                            timestamp: new Date().toISOString(),
                            payout_status: "pending"
                        });
                    
                    if (insertError) {
                        logger.error("Error creating earnings history:", insertError);
                        // Continue execution despite this error
                    }
                }

                return true;
            } catch (error) {
                logger.error("Error in recordReward:", error);
                return false;
            }
        };

        if (row) {
            if (row.last_checkin_date === todayStr) {
                return { status: "already_checked_in" as const, streak: row.streak_count }; // Already checked in today
            }

            // 2. Continue streak if last check-in was yesterday, otherwise reset
            if (row.last_checkin_date === yesterdayStr) {
                streakCount = row.streak_count + 1;
            } else {
                streakCount = 1; // Missed a day, reset
            }
            
            // Calculate reward amount for today's check-in
            const rewardAmount = getRewardForDay(streakCount);

            // Record the reward in earnings table and update earnings history
            const rewardRecorded = await recordReward(rewardAmount);
            
            if (!rewardRecorded) {
                logger.error("Failed to record reward for check-in");
                // We'll still update the streak but note the issue
            }

            // Update check-in record regardless of reward recording status
            const { error: updateError } = await client
                .from("daily_checkins")
                .update({
                    streak_count: streakCount,
                    last_checkin_date: todayStr,
                })
                .eq("user_id", userId);

            if (updateError) {
                logger.error("Error updating daily check-in record:", updateError);
                return { status: "error" as const, error: updateError.message };
            }

            return { 
                status: "checked_in" as const, 
                streak: streakCount,
                amount: rewardAmount
            };
        } else {
            // 5. First time check-in (Day 1 reward)
            const firstDayReward = getRewardForDay(1);
            
            // Insert first check-in record
            const { error: insertError } = await client
                .from("daily_checkins")
                .insert({
                    user_id: userId,
                    last_checkin_date: todayStr,
                    streak_count: 1,
                    last_rewarded_streak: 0,
                });

            if (insertError) {
                logger.error("Error creating first daily check-in record:", insertError);
                return { status: "error" as const, error: insertError.message };
            }
            
            // Record the reward in earnings table and update earnings history
            const rewardRecorded = await recordReward(firstDayReward);
            
            if (!rewardRecorded) {
                logger.error("Failed to record reward for first check-in");
                // Check-in was successful but reward failed
            }

            return { 
                status: "checked_in" as const, 
                streak: 1,
                amount: firstDayReward
            };
        }
    } catch (err) {
        logger.error("Check-in error:", err);
        return { status: "error" as const, error: err instanceof Error ? err.message : "Unknown error" };
    }
};

/**
 * Get user's current streak data
 * @param {string} userId - User ID from profile
 * @returns {Promise<{streak: number, lastCheckIn: string | null}>}
 */
export const getUserStreakData = async (userId: string) => {
    try {
        if (!userId) {
            return { streak: 0, lastCheckIn: null };
        }

        const client = getSwarmSupabase();
        if (!client) {
            return { streak: 0, lastCheckIn: null };
        }

        const { data, error } = await client
            .from("daily_checkins")
            .select("*")
            .eq("user_id", userId)
            .single();

        if (error && error.code !== "PGRST116") {
            logger.error("Error fetching streak data:", error);
            return { streak: 0, lastCheckIn: null };
        }

        if (data) {
            return {
                streak: data.streak_count,
                lastCheckIn: data.last_checkin_date,
            };
        }

        return { streak: 0, lastCheckIn: null };
    } catch (err) {
        logger.error("Failed to fetch streak data:", err);
        return { streak: 0, lastCheckIn: null };
    }
};