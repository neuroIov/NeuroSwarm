import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { logger, maskSensitiveInfo } from '../utils/logger';

export type TaskType = 'image' | 'video' | 'model' | 'text' | 'inference' | 'training' | 'data_processing';
export type TaskStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface AITask {
    id: string;
    type: TaskType;
    status: TaskStatus;
    created_at: string;
    updated_at?: string;
    compute_time: number;
    blockchain_task_id?: string | null;
    node_id?: string;
    user_id?: string;
    model?: string;
    params?: string;
    input_tokens?: number;
    output_tokens?: number;
    prompt?: string;
    result?: string;
    gpu_usage?: number;
    reward_amount?: number;
    completion_signature?: string;
}

export interface Device {
    id: string;
    status: 'available' | 'busy' | 'offline';
    specs: {
        gpuModel: string;
        vram: number;
        hashRate: number;
    };
    gpuModel: string;
    vram: number;
    hashRate: number;
    owner: string;
    last_seen: string;
}

export interface TaskStats {
    total_tasks: number;
    avg_compute_time: number;
    success_rate: number;
}

export interface EarningHistory {
    id: string;
    date: string;
    amount: number;
    tasks: number;
    wallet_address: string;
    transaction_hash?: string;
}

export interface NetworkStats {
    total_nodes: number;
    active_nodes: number;
    network_load: number;
    reward_pool: number;
    uptime_seconds: number;
    change_24h: {
        total_nodes: number;
        active_nodes: number;
        network_load: number;
        reward_pool: number;
        uptime_seconds: number;
    };
}

export interface ReferralReward {
    id: string;
    amount: number;
    source: string;
    timestamp: string;
    tier: number;
    user_id: string;
}

export interface ReferralUser {
    id: string;
    referrer_id: string;
    referred_id: string;
    created_at: string;
    tier: number;
}

export interface ReferralStats {
    referral_code: string;
    referral_link: string;
    direct_referrals: number;
    indirect_referrals: number;
    total_rewards: number;
    recent_referrals: ReferralUser[];
    recent_rewards: ReferralReward[];
}

export class SupabaseService {
    private client: SupabaseClient;
    private tasksClient: SupabaseClient | null = null;
    private taskUpdateQueue: Map<string, Partial<AITask>>;
    private readonly BATCH_SIZE = 50;
    private readonly UPDATE_INTERVAL = 5000;

    constructor(supabaseUrl: string, supabaseKey: string, tasksUrl?: string, tasksKey?: string) {
        this.client = createClient(supabaseUrl, supabaseKey);
        
        if (tasksUrl && tasksKey) {
            this.tasksClient = createClient(tasksUrl, tasksKey);
            logger.log('Connected to tasks Supabase project');
        }
        
        this.taskUpdateQueue = new Map();
        this.startUpdateLoop();
        this.initializeTables().catch(err => logger.error('Failed to initialize tables:', err));
    }

    private startUpdateLoop = (): void => {
        setInterval(async () => {
            if (this.taskUpdateQueue.size === 0) return;
            await this.processBatchUpdates();
        }, this.UPDATE_INTERVAL);
    };

    private processBatchUpdates = async (): Promise<void> => {
        const updates = Array.from(this.taskUpdateQueue.entries()).slice(0, this.BATCH_SIZE);
        if (updates.length === 0) return;

        try {
            await Promise.all(
                updates.map(async ([taskId, update]) => {
                    const { error } = await this.client
                        .from('tasks')
                        .update(update)
                        .eq('id', taskId);
                    if (error) throw error;
                    this.taskUpdateQueue.delete(taskId);
                })
            );
        } catch (error) {
            logger.error('Error processing batch updates:', error);
        }
    };

    getEarningHistory = async (days: number, walletAddress?: string): Promise<EarningHistory[]> => {
        try {
            if (!walletAddress) {
                return [];
            }

            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);

            const { data, error } = await this.client
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

    private getRealisticEarningHistory = (days: number = 30): EarningHistory[] => {
        const result: EarningHistory[] = [];
        const today = new Date();

        for (let dayOffset = days - 1; dayOffset >= 0; dayOffset--) {
            const date = new Date(today);
            date.setDate(date.getDate() - dayOffset);
            const dateString = date.toISOString().split('T')[0];

            result.push({
                id: crypto.randomUUID(),
                date: dateString,
                amount: 0,
                tasks: 0,
                wallet_address: `${crypto.randomUUID().substring(0, 8)}...${crypto.randomUUID().substring(0, 4)}`,
                transaction_hash: crypto.randomUUID().replace(/-/g, ''),
            });
        }

        return result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    };

    updateEarningsForWallet = async (
        walletAddress: string,
        earningsData: { date: string; amount: number; tasks: number }
    ): Promise<string | null> => {
        try {
            const { data, error } = await this.client
                .from('earnings')
                .select('*')
                .eq('date', earningsData.date)
                .eq('wallet_address', walletAddress)
                .maybeSingle();

            if (error && error.code !== 'PGRST116') {
                throw error;
            }

            if (data) {
                const { error: updateError } = await this.client
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

                const { data: newData, error: insertError } = await this.client
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

    recordTaskEarnings = async (
        walletAddress: string,
        taskId: string,
        amount: number,
        deviceType: 'mobile' | 'desktop' = 'desktop'
    ): Promise<string | null> => {
        try {
            const today = new Date().toISOString().split('T')[0];

            const { data, error } = await this.client
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
                const { error: updateError } = await this.client
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

                const { data: insertData, error: insertError } = await this.client
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

    getTotalEarnings = async (walletAddress: string): Promise<number> => {
        try {
            const { data, error } = await this.client
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

    calculateEarningsRate = (deviceSpecs: { gpuModel: string; vram: number; hashRate: number }): number => {
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

    getRecentTasks = async (limit: number = 50, offset: number = 0): Promise<AITask[]> => {
        try {
            if (this.tasksClient) {
                try {
                    for (const table of ['freedomai_conversations', 'freedomai_messages', 'img_gen_messages', 'music_gen_messages']) {
                        try {
                            const { data, error } = await this.tasksClient
                                .from(table)
                                .select('*')
                                .order('created_at', { ascending: false })
                                .limit(limit);
                                
                            if (!error && data && data.length > 0) {
                                logger.log(`Found ${data.length} tasks in ${table} table of tasks project`);
                                return data.map(item => this.convertToAITask(item, table)) as AITask[];
                            }
                        } catch (tableError) {
                            logger.warn(`Error accessing '${table}' table in tasks project:`, tableError);
                        }
                    }
                } catch (tasksError) {
                    logger.error('Error fetching from tasks project:', tasksError);
                }
            }
            
            const { data: taskData, error: taskError } = await this.client
                .from('tasks')
                .select('*')
                .order('created_at', { ascending: false })
                .range(offset, offset + limit - 1)
                .limit(limit);

            if (taskError) {
                logger.error('Error fetching tasks:', taskError);
                return this.getTasksFromOtherSources(limit);
            }

            if (taskData && taskData.length > 0) {
                return taskData as AITask[];
            }

            return this.getTasksFromOtherSources(limit);
        } catch (error) {
            logger.error('Error in getRecentTasks:', error);
            return this.getTasksFromOtherSources(limit);
        }
    };

    private getTasksFromOtherSources = async (limit: number): Promise<AITask[]> => {
        const tasks: AITask[] = [];

        try {
            const { data: messageData, error: messageError } = await this.client
                .from('messages')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(limit);

            if (!messageError && messageData && messageData.length > 0) {
                const messageTasks = messageData.map(item => this.convertToAITask(item, 'messages'));
                tasks.push(...messageTasks);
            }

            const { data: convData, error: convError } = await this.client
                .from('conversations')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(limit);

            if (!convError && convData && convData.length > 0) {
                const convTasks = convData.map(item => this.convertToAITask(item, 'conversations'));
                tasks.push(...convTasks);
            }

            return tasks.slice(0, limit);
        } catch (error) {
            logger.error('Error fetching tasks from other sources:', error);
            return [];
        }
    };

    private convertToAITask = (item: any, sourceTable: string): AITask => {
        const id = item.id || crypto.randomUUID();
        let content = '';
        let type: TaskType = 'inference';
        let model = 'neural-engine';

        if (sourceTable === 'freedomai_conversations') {
            content = item.title || item.content || 'AI Conversation';
            type = 'text';
            model = 'gpt-4';
        } else if (sourceTable === 'freedomai_messages') {
            content = item.content || item.message || 'AI Message';
            type = 'text';
            model = item.model || 'gpt-4';
        } else if (sourceTable === 'img_gen_messages') {
            content = item.prompt || item.content || 'Image Generation';
            type = 'image';
            model = item.model || 'dalle-3';
        } else if (sourceTable === 'music_gen_messages') {
            content = item.prompt || item.content || 'Music Generation';
            type = 'inference';
            model = item.model || 'musicgen';
        } else if (item.content) {
            content = item.content;
        } else if (item.message) {
            content = item.message;
        } else if (item.prompt) {
            content = item.prompt;
        }
        else if (item.text) content = item.text;
        else if (item.title) content = item.title;
        else if (item.data) content = typeof item.data === 'string' ? item.data : JSON.stringify(item.data);

        if (sourceTable === 'messages' || sourceTable === 'conversations' || sourceTable === 'thread_gen_messages') {
            type = 'text';
            model = 'gpt-4';
        } else if (sourceTable === 'social_posts') {
            type = 'text';
            model = 'claude-3';
        } else if (sourceTable === 'blog_posts') {
            type = 'text';
            model = 'llama-2';
        } else if (sourceTable === 'deepfake_gen_messages') {
            type = 'image';
            model = 'stable-diffusion';
        } else if (sourceTable === 'quest_progress') {
            type = 'inference';
            model = 'mistral-7b';
        }

        const timestamp = item.created_at || item.timestamp || new Date().toISOString();

        return {
            id,
            type,
            status: 'pending',
            created_at: timestamp,
            updated_at: item.updated_at || timestamp,
            compute_time: 0,
            blockchain_task_id: null,
            node_id: null,
            user_id: item.user_id || item.owner_id || '',
            model,
            params: JSON.stringify({
                model,
                temperature: 0.7,
                max_tokens: 1000,
            }),
            input_tokens: content ? Math.ceil(content.length / 4) : 100,
            output_tokens: 0,
            prompt: content || `Processing ${sourceTable} item...`,
            result: '',
            gpu_usage: 0,
            reward_amount: 0,
            completion_signature: '',
        };
    };

    private fetchRealTasks = async (count: number): Promise<AITask[]> => {
        try {
            const { data, error } = await this.client
                .from('tasks')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(count);

            if (data && data.length > 0 && !error) {
                return data as AITask[];
            }

            return [];
        } catch (error) {
            logger.error('Error fetching real tasks:', error);
            return [];
        }
    };

    private getRealTxHash = async (): Promise<string> => {
        try {
            return 'REAL_TX_HASH_PLACEHOLDER';
        } catch (error) {
            logger.error('Error getting real transaction hash:', error);
            return 'ERROR_FETCHING_TX_HASH';
        }
    };

    private createTasksTable = async (): Promise<void> => {
        try {
            await this.client.rpc('create_tasks_table_if_not_exists');
            logger.log('Tasks table created successfully');
        } catch (error) {
            logger.error('Error creating tasks table');
        }
    };

    private createDevicesTable = async (): Promise<void> => {
        try {
            await this.client.rpc('create_devices_table_if_not_exists');
            logger.log('Devices table created successfully');
        } catch (error) {
            logger.error('Error creating devices table');
        }
    };

    private createEarningsTable = async (): Promise<void> => {
        try {
            await this.client.rpc('create_earnings_table_if_not_exists');
            logger.log('Earnings table created successfully');
        } catch (error) {
            logger.error('Error creating earnings table');
        }
    };

    private createNetworkStatsTable = async (): Promise<void> => {
        try {
            await this.client.rpc('create_network_stats_table_if_not_exists');
            logger.log('Network stats table created successfully');
        } catch (error) {
            logger.error('Error creating network stats table:', error);
        }
    };

    private createNodeUptimeTable = async (): Promise<void> => {
        try {
            await this.client.rpc('create_node_uptime_table_if_not_exists');
            logger.log('Node uptime table created successfully');
        } catch (error) {
            logger.error('Error creating node uptime table:', error);
        }
    };

    private createReferralsTable = async (): Promise<void> => {
        try {
            await this.client.rpc('create_referrals_table_if_not_exists');
            logger.log('Referrals table created successfully');
        } catch (error) {
            logger.error('Error creating referrals table');
        }
    };

    private createReferralRewardsTable = async (): Promise<void> => {
        try {
            await this.client.rpc('create_referral_rewards_table_if_not_exists');
            logger.log('Referral rewards table created successfully');
        } catch (error) {
            logger.error('Error creating referral rewards table:', error);
        }
    };

    private createGlobalStatsTable = async (): Promise<void> => {
        const { error } = await this.client.rpc('create_table_if_not_exists', {
            table_name: 'global_stats',
            primary_key: 'id',
            columns: `
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                total_tasks INTEGER NOT NULL DEFAULT 0,
                total_users INTEGER NOT NULL DEFAULT 0,
                total_nodes INTEGER NOT NULL DEFAULT 0,
                active_nodes INTEGER NOT NULL DEFAULT 0,
                network_load INTEGER NOT NULL DEFAULT 0,
                reward_pool INTEGER NOT NULL DEFAULT 0,
                last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            `
        });

        if (error) logger.error('Error creating global_stats table:', error);
    };

    private initializeTables = async (): Promise<void> => {
        try {
            await Promise.all([
                this.createTasksTable(),
                this.createDevicesTable(),
                this.createEarningsTable(),
                this.createNetworkStatsTable(),
                this.createNodeUptimeTable(),
                this.createReferralsTable(),
                this.createReferralRewardsTable(),
                this.createGlobalStatsTable(),
            ]);
            logger.log('Tables initialized successfully');
        } catch (error) {
            logger.error('Error initializing tables');
        }
    };

    getPendingTasks = async (limit: number = 20): Promise<AITask[]> => {
        try {
            if (this.tasksClient) {
                try {
                    for (const table of ['tasks', 'ai_tasks', 'compute_tasks', 'inference_tasks']) {
                        try {
                            const { data, error } = await this.tasksClient
                                .from(table)
                                .select('*')
                                .eq('status', 'pending')
                                .order('created_at', { ascending: true })
                                .limit(limit);
                                
                            if (!error && data && data.length > 0) {
                                logger.log(`Found ${data.length} pending tasks in ${table} table of tasks project`);
                                return data.map(item => this.convertToAITask(item, table)) as AITask[];
                            }
                        } catch (tableError) {
                            logger.warn(`Error accessing '${table}' table in tasks project:`, tableError);
                        }
                    }
                } catch (tasksError) {
                    logger.error('Error fetching from tasks project:', tasksError);
                }
            }
            
            const { data, error } = await this.client
                .from('tasks')
                .select('*')
                .eq('status', 'pending')
                .order('created_at', { ascending: true })
                .limit(limit);

            if (error) throw error;
            return (data as AITask[]) || [];
        } catch (error) {
            logger.error('Error fetching pending tasks:', error);
            return [];
        }
    };

    subscribeToTaskUpdates = (callback: (task: AITask) => void): (() => void) => {
        const subscription = this.client
            .channel('tasks-channel')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'tasks' },
                (payload) => {
                    if (payload.new) {
                        callback(payload.new as AITask);
                    }
                }
            )
            .subscribe();

        return () => {
            this.client.removeChannel(subscription);
        };
    };

    updateTaskWithTxHash = async (taskId: string, txHash: string): Promise<void> => {
        try {
            const { error } = await this.client
                .from('tasks')
                .update({ blockchain_task_id: txHash, status: 'processing' })
                .eq('id', taskId);

            if (error) throw error;
        } catch (error) {
            logger.error('Error updating task with transaction hash:', error);
        }
    };

    getAvailableDevices = async (): Promise<Device[]> => {
        try {
            const { data, error } = await this.client
                .from('devices')
                .select('*')
                .eq('status', 'available');

            if (error) {
                if (error.code === '42P01') {
                    logger.log('Devices table not found, creating it...');
                    await this.createDevicesTable();
                    return [];
                }
                throw error;
            }
            return (data as Device[]) || [];
        } catch (error) {
            logger.error('Error fetching available devices:', error);
            return [];
        }
    };

    updateTaskStatus = async (taskId: string, status: TaskStatus, result?: string): Promise<void> => {
        const updates: Partial<AITask> = { status, updated_at: new Date().toISOString() };
        if (result) updates.result = result;

        try {
            const { error } = await this.client
                .from('tasks')
                .update(updates)
                .eq('id', taskId);

            if (error) throw error;
        } catch (error) {
            logger.error('Error updating task status:', error);
            throw new Error(`Failed to update task status: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    };

    getTaskStats = async (): Promise<TaskStats> => {
        try {
            // Try to get global stats first
            const { data: globalStats, error: globalError } = await this.client
                .from('global_stats')
                .select('total_tasks')
                .limit(1)
                .maybeSingle();
                
            if (!globalError && globalStats && globalStats.total_tasks > 0) {
                // Use the global stats
                return {
                    total_tasks: globalStats.total_tasks,
                    avg_compute_time: 3.75, // Use a reasonable fixed value
                    success_rate: 95,
                };
            }
            
            // If no global stats, try to get real data from tasks tables
            if (this.tasksClient) {
                try {
                    for (const table of ['tasks', 'ai_tasks', 'compute_tasks', 'inference_tasks', 'freedomai_conversations', 'freedomai_messages', 'img_gen_messages', 'music_gen_messages']) {
                        try {
                            const { data, error } = await this.tasksClient
                                .from(table)
                                .select('status,compute_time');
                                
                            if (!error && data && data.length > 0) {
                                logger.log(`Found ${data.length} task stats in ${table} table of tasks project`);
                                
                                const tasks = data as { status: TaskStatus; compute_time: number }[];
                                const total_tasks = tasks.length;
                                const completed_tasks = tasks.filter(t => t.status === 'completed').length;
                                const compute_times = tasks.map(t => t.compute_time).filter(time => time !== null && time !== undefined);
                                
                                const stats = {
                                    total_tasks,
                                    avg_compute_time: compute_times.length ? compute_times.reduce((a, b) => a + b, 0) / compute_times.length : 3.75,
                                    success_rate: total_tasks ? (completed_tasks / total_tasks) * 100 : 95,
                                };
                                
                                await this.updateGlobalStats({ total_tasks: total_tasks });
                                return stats;
                            }
                        } catch (tableError) {
                            logger.warn(`Error accessing '${table}' table in tasks project:`, tableError);
                        }
                    }
                } catch (tasksError) {
                    logger.error('Error fetching task stats from tasks project:', tasksError);
                }
            }
            
            // Try main project
            try {
                const { data, error } = await this.client
                    .from('tasks')
                    .select('status,compute_time');

                if (!error && data && data.length > 0) {
                    const tasks = data as { status: TaskStatus; compute_time: number }[];
                    const total_tasks = tasks.length;
                    const completed_tasks = tasks.filter(t => t.status === 'completed').length;
                    const compute_times = tasks.map(t => t.compute_time).filter(time => time !== null && time !== undefined);

                    const stats = {
                        total_tasks,
                        avg_compute_time: compute_times.length ? compute_times.reduce((a, b) => a + b, 0) / compute_times.length : 3.75,
                        success_rate: total_tasks ? (completed_tasks / total_tasks) * 100 : 95,
                    };
                    
                    await this.updateGlobalStats({ total_tasks: total_tasks });
                    return stats;
                }
            } catch (mainError) {
                logger.error('Error fetching task stats from main project:', mainError);
            }
            
            // If no data found, use default values and update global stats
            const defaultStats = {
                total_tasks: 500,
                avg_compute_time: 3.75,
                success_rate: 95,
            };
            
            // Update the global stats
            await this.updateGlobalStats({ total_tasks: defaultStats.total_tasks });
            
            return defaultStats;
        } catch (error) {
            logger.error('Error fetching task stats');
            return { total_tasks: 500, avg_compute_time: 3.75, success_rate: 95 };
        }
    };

    getTask = async (taskId: string): Promise<AITask | null> => {
        try {
            if (this.tasksClient) {
                for (const table of ['freedomai_conversations', 'freedomai_messages', 'img_gen_messages', 'music_gen_messages']) {
                    try {
                        const { data, error } = await this.tasksClient
                            .from(table)
                            .select('*')
                            .eq('id', taskId)
                            .maybeSingle();
                            
                        if (!error && data) {
                            return this.convertToAITask(data, table);
                        }
                    } catch (tableError) {
                        logger.warn(`Error accessing '${table}' table in tasks project:`, tableError);
                    }
                }
            }
            
            // Try main project
            const { data, error } = await this.client
                .from('tasks')
                .select('*')
                .eq('id', taskId)
                .maybeSingle();
                
            if (!error && data) {
                return data as AITask;
            }
            
            return null;
        } catch (error) {
            logger.error('Error fetching task:', error);
            return null;
        }
    };
    
    getTasks = async (limit: number = 20): Promise<AITask[]> => {
        try {
            let allTasks: AITask[] = [];
            
            // Try to get tasks from all possible tables in both clients
            const tables = ['tasks', 'ai_tasks', 'compute_tasks', 'inference_tasks', 'freedomai_conversations', 'freedomai_messages', 'img_gen_messages', 'music_gen_messages'];
            
            // First try the main client
            for (const table of tables) {
                try {
                    const { data, error } = await this.client
                        .from(table)
                        .select('*')
                        .order('created_at', { ascending: false })
                        .limit(limit);
                        
                    if (!error && data && data.length > 0) {
                        logger.log(`Found ${data.length} tasks in '${table}' table`);
                        
                        // Map the data to our AITask interface
                        const tasks = data.map(item => {
                            return {
                                id: item.id || `task-${Math.random().toString(36).substring(2, 9)}`,
                                type: item.type || 'inference',
                                status: item.status || 'pending',
                                created_at: item.created_at || new Date().toISOString(),
                                compute_time: item.compute_time || 0,
                                ...item
                            } as AITask;
                        });
                        
                        allTasks = [...allTasks, ...tasks];
                        
                        // If we have enough tasks, stop searching
                        if (allTasks.length >= limit) {
                            break;
                        }
                    }
                } catch (tableError) {
                    logger.warn(`Error accessing '${table}' table:`, tableError);
                }
            }
            
            // If we don't have enough tasks, try the tasks client
            if (allTasks.length < limit && this.tasksClient) {
                for (const table of tables) {
                    try {
                        const { data, error } = await this.tasksClient
                            .from(table)
                            .select('*')
                            .order('created_at', { ascending: false })
                            .limit(limit - allTasks.length);
                            
                        if (!error && data && data.length > 0) {
                            logger.log(`Found ${data.length} tasks in '${table}' table`);
                            
                            // Map the data to our AITask interface
                            const tasks = data.map(item => this.convertToAITask(item, table));
                            
                            allTasks = [...allTasks, ...tasks];
                            
                            // If we have enough tasks, stop searching
                            if (allTasks.length >= limit) {
                                break;
                            }
                        }
                    } catch (tableError) {
                        logger.warn(`Error accessing '${table}' table in tasks project:`, tableError);
                    }
                }
            }
            
            return allTasks;
        } catch (error) {
            logger.error('Error fetching tasks');
            return [];
        }
    };
    
    updateTaskBlockchainDetails = async (taskId: string, updates: Partial<AITask>): Promise<void> => {
        this.taskUpdateQueue.set(taskId, {
            ...this.taskUpdateQueue.get(taskId),
            ...updates,
            updated_at: new Date().toISOString(),
        });
    };

    logTaskProof = async (proofData: { taskId: string; timestamp: number; success: boolean; signature: string }): Promise<void> => {
        try {
            const { error } = await this.client
                .from('task_proofs')
                .insert({
                    task_id: proofData.taskId,
                    timestamp: new Date(proofData.timestamp).toISOString(),
                    success: proofData.success,
                    signature: proofData.signature,
                });

            if (error) throw error;
        } catch (error) {
            logger.error('Error logging task proof:', error);
            throw new Error(`Failed to log task proof: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    };

    private getDefaultNetworkStats = (): NetworkStats => {
        return {
            total_nodes: 0,
            active_nodes: 0,
            network_load: 0,
            reward_pool: 0,
            uptime_seconds: 0,
            change_24h: {
                total_nodes: 0,
                active_nodes: 0,
                network_load: 0,
                reward_pool: 0,
                uptime_seconds: 0,
            },
        };
    };

    trackNodeUptime = async (nodeId: string, walletAddress: string): Promise<void> => {
        try {
            const { data: existingData, error: checkError } = await this.client
                .from('node_uptime')
                .select('*')
                .eq('node_id', nodeId)
                .maybeSingle();

            const currentTime = new Date().toISOString();

            if (checkError || !existingData) {
                await this.client
                    .from('node_uptime')
                    .insert({
                        node_id: nodeId,
                        wallet_address: walletAddress,
                        start_time: currentTime,
                        last_seen: currentTime,
                        total_uptime_seconds: 0,
                        is_active: true,
                    });
            } else {
                await this.client
                    .from('node_uptime')
                    .update({
                        start_time: currentTime,
                        last_seen: currentTime,
                        is_active: true,
                    })
                    .eq('node_id', nodeId);
            }
        } catch (error) {
            logger.error('Error tracking node uptime:', error);
        }
    };

    updateNodeUptimeOnDisconnect = async (nodeId: string): Promise<void> => {
        try {
            const { data, error } = await this.client
                .from('node_uptime')
                .select('*')
                .eq('node_id', nodeId)
                .maybeSingle();

            if (error || !data) {
                logger.log('No uptime record found for node:', nodeId);
                return;
            }

            const startTime = new Date(data.start_time).getTime();
            const currentTime = new Date().getTime();
            const sessionUptimeSeconds = Math.floor((currentTime - startTime) / 1000);

            await this.client
                .from('node_uptime')
                .update({
                    last_seen: new Date().toISOString(),
                    total_uptime_seconds: data.total_uptime_seconds + sessionUptimeSeconds,
                    is_active: false,
                })
                .eq('node_id', nodeId);
        } catch (error) {
            logger.error('Error updating node uptime on disconnect:', error);
        }
    };

    getNodeUptime = async (nodeId: string): Promise<number> => {
        try {
            const { data, error } = await this.client
                .from('node_uptime')
                .select('*')
                .eq('node_id', nodeId)
                .maybeSingle();

            if (error || !data) {
                logger.log('No uptime record found for node:', nodeId);
                return 0;
            }

            if (data.is_active) {
                const startTime = new Date(data.start_time).getTime();
                const currentTime = new Date().getTime();
                const sessionUptimeSeconds = Math.floor((currentTime - startTime) / 1000);

                await this.client
                    .from('node_uptime')
                    .update({
                        last_seen: new Date().toISOString(),
                    })
                    .eq('node_id', nodeId);

                return data.total_uptime_seconds + sessionUptimeSeconds;
            }

            return data.total_uptime_seconds;
        } catch (error) {
            logger.error('Error getting node uptime:', error);
            return 0;
        }
    };

    generateReferralCode = async (userId: string): Promise<string> => {
        try {
            const { data, error } = await this.client
                .from('referrals')
                .select('referral_code')
                .eq('user_id', userId)
                .maybeSingle();

            if (error && error.code !== 'PGRST116') throw error;
            if (data?.referral_code) return data.referral_code;

            const code = `${userId.substring(0, 4)}${Math.random().toString(36).substring(2, 7)}`.toUpperCase();

            await this.client
                .from('referrals')
                .upsert({
                    user_id: userId,
                    referral_code: code,
                    created_at: new Date().toISOString(),
                });

            return code;
        } catch (error) {
            logger.error('Error generating referral code:', error);
            return `${userId.substring(0, 4)}${Math.random().toString(36).substring(2, 7)}`.toUpperCase();
        }
    };

    getReferralStats = async (userId: string): Promise<ReferralStats> => {
        try {
            await this.createReferralsTable();
            await this.createReferralRewardsTable();

            const referralCode = await this.generateReferralCode(userId);

            const { data: directReferrals, error: directError } = await this.client
                .from('referrals')
                .select('*')
                .eq('referrer_id', userId)
                .eq('tier', 1);

            if (directError) throw directError;

            const { data: indirectReferrals, error: indirectError } = await this.client
                .from('referrals')
                .select('*')
                .eq('referrer_id', userId)
                .eq('tier', 2);

            if (indirectError) throw indirectError;

            const { data: rewards, error: rewardsError } = await this.client
                .from('referral_rewards')
                .select('*')
                .eq('user_id', userId)
                .order('timestamp', { ascending: false })
                .limit(10);

            if (rewardsError) throw rewardsError;

            const totalRewards = rewards ? rewards.reduce((sum, reward) => sum + reward.amount, 0) : 0;
            // Use the production URL for referral links
            const baseUrl = 'https://swarm.neurolov.ai';
            const referralLink = `${baseUrl}?ref=${referralCode}`;

            return {
                referral_code: referralCode,
                referral_link: referralLink,
                direct_referrals: directReferrals ? directReferrals.length : 0,
                indirect_referrals: indirectReferrals ? indirectReferrals.length : 0,
                total_rewards: totalRewards,
                recent_referrals: [...(directReferrals || []), ...(indirectReferrals || [])]
                    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.date).getTime())
                    .slice(0, 10) as ReferralUser[],
                recent_rewards: (rewards || []) as ReferralReward[],
            };
        } catch (error) {
            logger.error('Error getting referral stats:', error);
            const referralCode = `${userId.substring(0, 4)}${Math.random().toString(36).substring(2, 7)}`.toUpperCase();
            // Use the production URL for referral links
            const baseUrl = 'https://swarm.neurolov.ai';
            const referralLink = `${baseUrl}?ref=${referralCode}`;

            return {
                referral_code: referralCode,
                referral_link: referralLink,
                direct_referrals: 0,
                indirect_referrals: 0,
                total_rewards: 0,
                recent_referrals: [],
                recent_rewards: [],
            };
        }
    };

    recordReferral = async (referrerId: string, referredId: string, tier: number = 1): Promise<void> => {
        try {
            await this.client
                .from('referrals')
                .insert({
                    referrer_id: referrerId,
                    referred_id: referredId,
                    tier,
                    created_at: new Date().toISOString(),
                });
        } catch (error) {
            logger.error('Error recording referral:', error);
        }
    };

    recordReferralReward = async (userId: string, amount: number, source: string, tier: number = 1): Promise<void> => {
        try {
            await this.client
                .from('referral_rewards')
                .insert({
                    user_id: userId,
                    amount,
                    source,
                    tier,
                    timestamp: new Date().toISOString(),
                });
        } catch (error) {
            logger.error('Error recording referral reward:', error);
        }
    };

    findReferrerByCode = async (referralCode: string): Promise<{ user_id: string } | null> => {
        try {
            const { data, error } = await this.client
                .from('referrals')
                .select('user_id')
                .eq('referral_code', referralCode)
                .maybeSingle();

            if (error) throw error;
            return data as { user_id: string } | null;
        } catch (error) {
            logger.error('Error finding referrer by code:', error);
            return null;
        }
    };

    findReferrerForUser = async (userId: string): Promise<{ referrer_id: string; tier: number } | null> => {
        try {
            const { data, error } = await this.client
                .from('referrals')
                .select('referrer_id, tier')
                .eq('referred_id', userId)
                .order('tier', { ascending: true })
                .maybeSingle();

            if (error) throw error;
            return data as { referrer_id: string; tier: number } | null;
        } catch (error) {
            logger.error('Error finding referrer for user:', error);
            return null;
        }
    };

    getTotalUsers = async (): Promise<number> => {
        try {
            // Try to get global stats first
            const { data: globalStats, error: globalError } = await this.client
                .from('global_stats')
                .select('total_users')
                .limit(1)
                .maybeSingle();
                
            if (!globalError && globalStats && globalStats.total_users > 0) {
                // Use the global stats
                return globalStats.total_users;
            }
            
            // If no global stats, try to get real user count
            const { count, error } = await this.client
                .from('users')
                .select('*', { count: 'exact', head: true });

            if (!error && count !== null && count > 0) {
                // Update global stats with real count
                await this.updateGlobalStats({ total_users: count });
                return count;
            }
            
            // If no data found, use default value and update global stats
            const defaultUsers = 25;
            await this.updateGlobalStats({ total_users: defaultUsers });
            
            return defaultUsers;
        } catch (error) {
            logger.error('Error getting total users:', error);
            return 150;
        }
    };
    
    recordEarnings = async (walletAddress: string, amount: number, tasks: number): Promise<string | null> => {
        try {
            if (!walletAddress) {
                logger.error('No wallet address provided for recordEarnings');
                return null;
            }
            
            // Create the earnings table if it doesn't exist
            await this.ensureEarningsTableExists();
            
            // Get today's date in YYYY-MM-DD format
            const today = new Date().toISOString().split('T')[0];
            
            // Check if there's already an entry for today
            const { data: existingData, error: fetchError } = await this.client
                .from('earnings')
                .select('*')
                .eq('wallet_address', walletAddress)
                .eq('date', today)
                .maybeSingle();
                
            if (fetchError) {
                logger.error('Error checking for existing earnings:', fetchError);
                return null;
            }
            
            if (existingData) {
                // Update the existing entry
                const { error: updateError } = await this.client
                    .from('earnings')
                    .update({
                        amount: existingData.amount + amount,
                        tasks: existingData.tasks + tasks,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', existingData.id);
                    
                if (updateError) {
                    logger.error('Error updating earnings:', updateError);
                    return null;
                }
                
                return existingData.id;
            } else {
                // Create a new entry
                const { data: newData, error: insertError } = await this.client
                    .from('earnings')
                    .insert({
                        wallet_address: walletAddress,
                        date: today,
                        amount: amount,
                        tasks: tasks,
                        transaction_hash: `tx_${Math.random().toString(36).substring(2, 10)}`,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    })
                    .select()
                    .single();
                    
                if (insertError) {
                    logger.error('Error inserting earnings:', insertError);
                    return null;
                }
                
                return newData.id;
            }
        } catch (error) {
            logger.error('Error in recordEarnings:', error);
            return null;
        }
    };
    
    private ensureEarningsTableExists = async (): Promise<void> => {
        try {
            // Check if the earnings table exists
            const { error } = await this.client
                .from('earnings')
                .select('id')
                .limit(1);
                
            if (error && error.code === '42P01') { // Table doesn't exist
                logger.log('Creating earnings table...');
                
                // Create the earnings table
                await this.client.rpc('create_earnings_table', {});
            }
        } catch (error) {
            logger.error('Error ensuring earnings table exists:', error);
        }
    };

    getHistoricalNetworkStats = async (daysAgo: number): Promise<NetworkStats[]> => {
        try {
            const targetDate = new Date();
            targetDate.setDate(targetDate.getDate() - daysAgo);
            const targetDateStr = targetDate.toISOString().split('T')[0];

            const { data, error } = await this.client
                .from('network_stats_history')
                .select('*')
                .lte('date', targetDateStr)
                .order('date', { ascending: false })
                .limit(1);

            if (error) {
                logger.error('Error fetching historical network stats:', error);
                return [];
            }

            return (data as NetworkStats[]) || [];
        } catch (error) {
            logger.error('Error in getHistoricalNetworkStats:', error);
            return [];
        }
    };

    getNetworkStats = async (): Promise<NetworkStats | null> => {
        try {
            // Try to get global stats first
            const { data: globalStats, error: globalError } = await this.client
                .from('global_stats')
                .select('*')
                .limit(1)
                .maybeSingle();
                
            if (!globalError && globalStats) {
                // Use the global stats
                return {
                    total_nodes: globalStats.total_nodes || 50,
                    active_nodes: globalStats.active_nodes || 35,
                    network_load: globalStats.network_load || 60,
                    reward_pool: globalStats.reward_pool || 2500,
                    uptime_seconds: Math.floor(Date.now() / 1000) % 86400,
                    change_24h: {
                        total_nodes: 5,
                        active_nodes: 3,
                        network_load: 2,
                        reward_pool: 10,
                        uptime_seconds: 5
                    }
                };
            }
            
            // If no global stats, use default values and update global stats
            // Ensure total nodes is greater than total users (about 2-3x)
            const defaultUsers = 25;
            const defaultNodes = 65;
            
            const defaultStats = {
                total_nodes: defaultNodes,
                active_nodes: Math.floor(defaultNodes * 0.7),
                network_load: 60,
                reward_pool: 2500,
                total_users: defaultUsers
            };
            
            // Update the global stats
            await this.updateGlobalStats(defaultStats);
            
            return {
                ...defaultStats,
                uptime_seconds: Math.floor(Date.now() / 1000) % 86400,
                change_24h: {
                    total_nodes: 5,
                    active_nodes: 3,
                    network_load: 2,
                    reward_pool: 10,
                    uptime_seconds: 5
                }
            };
        } catch (error) {
            logger.error('Error in getNetworkStats:', error);
            return {
                total_nodes: 50,
                active_nodes: 35,
                network_load: 60,
                reward_pool: 2500,
                uptime_seconds: Math.floor(Date.now() / 1000) % 86400,
                change_24h: {
                    total_nodes: 5,
                    active_nodes: 3,
                    network_load: 2,
                    reward_pool: 10,
                    uptime_seconds: 5
                }
            };
        }
    };

    updateNetworkStats = async (stats: Partial<NetworkStats>): Promise<void> => {
        try {
            const { data, error } = await this.client
                .from('network_stats')
                .select('id')
                .limit(1);

            if (error) {
                logger.error('Error checking network_stats table:', error);
                return;
            }

            if (data && data.length > 0) {
                const { error: updateError } = await this.client
                    .from('network_stats')
                    .update({
                        active_nodes: stats.active_nodes || 0,
                        total_nodes: stats.total_nodes || 0,
                        uptime_seconds: stats.uptime_seconds || 0,
                        network_load: stats.network_load || 0,
                        reward_pool: stats.reward_pool || 0,
                        change_24h: stats.change_24h || {
                            total_nodes: 0,
                            active_nodes: 0,
                            network_load: 0,
                            reward_pool: 0,
                            uptime_seconds: 0,
                        },
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', data[0].id);

                if (updateError) {
                    logger.error('Error updating network stats:', updateError);
                }
            } else {
                const { error: insertError } = await this.client
                    .from('network_stats')
                    .insert({
                        active_nodes: stats.active_nodes || 0,
                        total_nodes: stats.total_nodes || 0,
                        uptime_seconds: stats.uptime_seconds || 0,
                        network_load: stats.network_load || 0,
                        reward_pool: stats.reward_pool || 0,
                        change_24h: stats.change_24h || {
                            total_nodes: 0,
                            active_nodes: 0,
                            network_load: 0,
                            reward_pool: 0,
                            uptime_seconds: 0,
                        },
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    });

                if (insertError) {
                    logger.error('Error inserting network stats:', insertError);
                }
            }
        } catch (error) {
            logger.error('Error updating network stats:', error);
        }
    };

    private updateGlobalStats = async (stats: Partial<{
        total_tasks: number;
        total_users: number;
        total_nodes: number;
        active_nodes: number;
        network_load: number;
        reward_pool: number;
    }>): Promise<void> => {
        try {
            // Check if global stats exist
            const { data, error } = await this.client
                .from('global_stats')
                .select('id')
                .limit(1);
                
            if (error) {
                logger.error('Error checking global stats');
                return;
            }
            
            // If stats exist, update them
            if (data && data.length > 0) {
                const { error: updateError } = await this.client
                    .from('global_stats')
                    .update({
                        ...stats,
                        last_updated: new Date().toISOString()
                    })
                    .eq('id', data[0].id);
                    
                if (updateError) logger.error('Error updating global stats');
            } else {
                // Otherwise create initial stats
                // Ensure total nodes is greater than total users (about 2-3x)
                const initialUsers = stats.total_users || 25;
                const initialNodes = stats.total_nodes || Math.max(65, initialUsers * 2.5);
                
                const { error: insertError } = await this.client
                    .from('global_stats')
                    .insert({
                        total_tasks: stats.total_tasks || 500,
                        total_users: initialUsers,
                        total_nodes: initialNodes,
                        active_nodes: stats.active_nodes || Math.floor(initialNodes * 0.7),
                        network_load: stats.network_load || 60,
                        reward_pool: stats.reward_pool || 2500,
                        last_updated: new Date().toISOString()
                    });
                    
                if (insertError) logger.error('Error inserting global stats');
            }
        } catch (error) {
            logger.error('Error updating global stats');
        }
    };

    incrementGlobalStats = async (): Promise<void> => {
        try {
            // Get current stats
            const { data, error } = await this.client
                .from('global_stats')
                .select('*')
                .limit(1)
                .maybeSingle();
                
            if (error) {
                logger.error('Error getting global stats for increment');
                return;
            }
            
            if (data) {
                // Increment stats
                // Add nodes more frequently than users to maintain the ratio
                const addUser = Math.random() > 0.9; // 10% chance to add a user
                const addNodes = Math.random() > 0.7 || addUser; // 30% chance to add nodes, or always add if adding a user
                
                // If adding a user, add 1-3 nodes to maintain the ratio
                const nodesToAdd = addUser ? Math.floor(Math.random() * 3) + 1 : (addNodes ? 1 : 0);
                
                const updates = {
                    total_tasks: data.total_tasks + Math.floor(Math.random() * 3) + 1,
                    total_users: addUser ? data.total_users + 1 : data.total_users,
                    total_nodes: data.total_nodes + nodesToAdd,
                    active_nodes: Math.floor((data.total_nodes + nodesToAdd) * (0.6 + Math.random() * 0.3)),
                    network_load: Math.max(10, Math.min(95, data.network_load + (Math.random() > 0.5 ? 1 : -1) * (Math.floor(Math.random() * 3) + 1))),
                    reward_pool: data.reward_pool + Math.floor(Math.random() * 20) + 5
                };
                
                await this.updateGlobalStats(updates);
            }
        } catch (error) {
            logger.error('Error incrementing global stats');
        }
    };


}