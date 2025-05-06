

import { getSwarmSupabase } from '@/lib/supabase-client';
import { logger } from '../utils/logger';
import { TASK_PROCESSING_CONFIG } from './config';

/**
 * Record earnings for a completed task
 * @param {string} taskId - The ID of the completed task
 * @param {string} userAddress - User's wallet address
 * @param {string} taskType - Type of task ('image' or 'text')
 * @returns {Promise<{success: boolean, earningId?: string}>}
 */
export const recordTaskEarning = async (taskId, userAddress, taskType) => {
    try {
        if (!taskId || !userAddress || !taskType) {
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

        // Insert new earning record
        const { data: earning, error: insertError } = await client
            .from('earnings')
            .insert({
                user_address: userAddress,
                amount: amount,
                task_id: taskId,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .select('*')
            .single();

        if (insertError) {
            logger.error('Error recording task earnings:', insertError);
            return { success: false };
        }

        logger.log(`Successfully recorded ${amount} NLOVE earnings for task ${taskId}`);
        return { success: true, earningId: earning.id };
    } catch (error) {
        logger.error('Error in recordTaskEarning:', error);
        return { success: false };
    }
};

/**
 * Update user's earnings history after task completion
 * @param {string} userId - User ID from profile
 * @param {string} taskType - Type of task ('image' or 'text')
 * @returns {Promise<{success: boolean}>}
 */
export const updateEarningsHistory = async (userId, taskType) => {
    try {
        if (!userId || !taskType) {
            logger.error('Cannot update earnings history: Missing required parameters');
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

        // Get the latest earnings history record for this user
        const { data: latestHistory, error: fetchError } = await client
            .from('earnings_history')
            .select('*')
            .eq('user_id', userId)
            .order('timestamp', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (fetchError) {
            logger.error('Error fetching earnings history:', fetchError);
            return { success: false };
        }

        if (latestHistory && latestHistory.payout_status === 'pending') {
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
                return { success: false };
            }

            logger.log(`Updated earnings history for user ${userId}: +${amount} NLOVE, total: ${latestHistory.amount + amount}`);
        } else {
            // Create new history record
            const { error: insertError } = await client
                .from('earnings_history')
                .insert({
                    user_id: userId,
                    amount: amount,
                    task_count: 1,
                    timestamp: new Date().toISOString(),
                    payout_status: 'pending'
                });

            if (insertError) {
                logger.error('Error creating earnings history record:', insertError);
                return { success: false };
            }

            logger.log(`Created new earnings history record for user ${userId}: ${amount} NLOVE`);
        }

        return { success: true };
    } catch (error) {
        logger.error('Error in updateEarningsHistory:', error);
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

        // Get user's wallet address from user_profiles
        const { data: userProfile, error: profileError } = await client
            .from('user_profiles')
            .select('wallet_address')
            .eq('id', userId)
            .single();

        if (profileError || !userProfile?.wallet_address) {
            logger.error('Error fetching user wallet address:', profileError);
            return { totalEarnings: 0, pendingEarnings: 0, completedTasks: 0 };
        }

        // Get all earnings for this user's wallet address
        const { data: earnings, error: earningsError } = await client
            .from('earnings')
            .select('amount')
            .eq('user_address', userProfile.wallet_address);

        if (earningsError) {
            logger.error('Error fetching user earnings:', earningsError);
            return { totalEarnings: 0, pendingEarnings: 0, completedTasks: 0 };
        }

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
            return { totalEarnings: 0, pendingEarnings: 0, completedTasks: 0 };
        }

        // Calculate total earnings from all earnings records
        const totalEarnings = earnings.reduce((sum, record) => sum + Number(record.amount), 0);

        // Get pending earnings and task count from history
        const pendingEarnings = earningsHistory?.amount || 0;
        const completedTasks = earningsHistory?.task_count || 0;

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

        // Get user's wallet address from user_profiles
        const { data: userProfile, error: profileError } = await client
            .from('user_profiles')
            .select('wallet_address')
            .eq('id', userId)
            .single();

        if (profileError || !userProfile?.wallet_address) {
            logger.error('Error fetching user wallet address:', profileError);
            return [];
        }

        // Get earnings records with task details
        const { data: transactions, error } = await client
            .from('earnings')
            .select(`
        id,
        amount,
        created_at,
        transaction_hash,
        tasks (
          id,
          type,
          status,
          prompt
        )
      `)
            .eq('user_address', userProfile.wallet_address)
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