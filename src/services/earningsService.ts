import { getSwarmSupabase, getTaskSupabase } from '@/lib/supabase-client';
import { EarningHistory } from './types';
import { logger } from '../utils/logger';

export const getEarningHistory = async (days: number, walletAddress?: string): Promise<EarningHistory[]> => {
    try {
        if (!walletAddress) {
            return [];
        }

        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const client = getSwarmSupabase();
        const { data, error } = await client
            .from('earnings')
            .select('*')
            .eq('wallet_address', walletAddress)
            .gte('date', startDate.toISOString().split('T')[0])
            .lte('date', endDate.toISOString().split('T')[0])
            .order('date', { ascending: false });

        if (error) throw error;
        return (data as EarningHistory[]) || [];
    } catch (error) {
        console.error('Error fetching earning history:', error);
        return [];
    }
};

export const updateEarningsForWallet = async (
    walletAddress: string,
    earningsData: { date: string; amount: number; tasks: number }
): Promise<string | null> => {
    try {
        const client = getSwarmSupabase();
        const { data, error } = await client
            .from('earnings')
            .select('*')
            .eq('date', earningsData.date)
            .eq('wallet_address', walletAddress)
            .maybeSingle();

        if (error && error.code !== 'PGRST116') {
            throw error;
        }

        if (data) {
            const { error: updateError } = await client
                .from('earnings')
                .update({
                    amount: earningsData.amount,
                    tasks: earningsData.tasks,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', data.id);

            if (updateError) throw updateError;
            return data.id;
        } else {
            const newEntry: Omit<EarningHistory, 'id'> & { created_at: string; updated_at: string } = {
                wallet_address: walletAddress,
                date: earningsData.date,
                amount: earningsData.amount,
                tasks: earningsData.tasks,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                transaction_hash: crypto.randomUUID().replace(/-/g, ''),
            };

            const { data: newData, error: insertError } = await client
                .from('earnings')
                .insert(newEntry)
                .select()
                .single();

            if (insertError) throw insertError;
            return newData?.id || null;
        }
    } catch (error) {
        console.error('Error updating earnings for wallet:', error);
        return null;
    }
};

export const recordTaskEarnings = async (
    walletAddress: string,
    taskId: string,
    amount: number,
    deviceType: 'mobile' | 'desktop' = 'desktop'
): Promise<string | null> => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const client = getSwarmSupabase();

        const { data, error } = await client
            .from('earnings')
            .select('*')
            .eq('wallet_address', walletAddress)
            .eq('date', today)
            .maybeSingle();

        if (error && error.code !== 'PGRST116') {
            throw error;
        }

        const earningsMultiplier = deviceType === 'mobile' ? 0.5 : 1.0;
        const adjustedAmount = amount * earningsMultiplier;

        if (data) {
            const { error: updateError } = await client
                .from('earnings')
                .update({
                    amount: data.amount + adjustedAmount,
                    tasks: data.tasks + 1,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', data.id);

            if (updateError) throw updateError;
            return data.id;
        } else {
            const newEntry = {
                wallet_address: walletAddress,
                date: today,
                amount: adjustedAmount,
                tasks: 1,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };

            const { data: insertData, error: insertError } = await client
                .from('earnings')
                .insert(newEntry)
                .select()
                .single();

            if (insertError) throw insertError;
            return insertData?.id || null;
        }
    } catch (error) {
        logger.error('Error recording task earnings:', error);
        return null;
    }
};

export const getTotalEarnings = async (walletAddress: string): Promise<number> => {
    try {
        const client = getSwarmSupabase();
        const { data, error } = await client
            .from('earnings')
            .select('amount')
            .eq('wallet_address', walletAddress);

        if (error) throw error;
        return data?.reduce((sum, record) => sum + (record.amount || 0), 0) || 0;
    } catch (error) {
        logger.error('Error fetching total earnings:', error);
        return 0;
    }
};

export const calculateEarningsRate = (deviceSpecs: { gpuModel: string; vram: number; hashRate: number }): number => {
    const baseRate = 0.1;
    let specMultiplier = 1.0;

    if (deviceSpecs.vram > 8192) {
        specMultiplier += 1.0;
    } else if (deviceSpecs.vram > 4096) {
        specMultiplier += 0.5;
    }

    if (deviceSpecs.hashRate > 500) {
        specMultiplier += 0.5;
    }

    specMultiplier = Math.min(specMultiplier, 4.0);
    const hourlyRate = baseRate * specMultiplier;
    return hourlyRate / 3600;
}; 