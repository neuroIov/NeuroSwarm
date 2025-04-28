import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config';

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

export class TaskService {
    private client: SupabaseClient;
    
    constructor(supabaseUrl?: string, supabaseKey?: string) {
        // Use provided credentials or fall back to config
        const url = supabaseUrl || config.SUPABASE_URL;
        const key = supabaseKey || config.SUPABASE_KEY;
        
        console.log('Initializing TaskService with URL:', url);
        this.client = createClient(url, key);
    }
    
    // List all tables in the Supabase database
    async listTables(): Promise<string[]> {
        try {
            console.log('Listing all tables in Supabase database...');
            
            // Try a direct query to information_schema
            try {
                const { data, error } = await this.client.rpc(
                    'execute_sql',
                    { 
                        query: `
                            SELECT table_name 
                            FROM information_schema.tables 
                            WHERE table_schema = 'public'
                        `
                    }
                );
                
                if (!error && data) {
                    console.log('Available tables:', data);
                    return Array.isArray(data) ? data.map(row => row.table_name) : [];
                }
            } catch (sqlError) {
                console.error('SQL query error:', sqlError);
            }
            
            // If the SQL query fails, try checking specific tables
            const tables = ['ai_tasks', 'tasks', 'neuroswarm_tasks', 'compute_tasks'];
            const results = await Promise.all(
                tables.map(async (table) => {
                    try {
                        const { data, error } = await this.client
                            .from(table)
                            .select('count(*)', { count: 'exact', head: true });
                            
                        return { 
                            table, 
                            exists: !error, 
                            count: data ? data.length : 0,
                            error: error ? error.message : null
                        };
                    } catch (e) {
                        return { table, exists: false, count: 0, error: e instanceof Error ? e.message : 'Unknown error' };
                    }
                })
            );
            
            console.log('Table check results:', results);
            return results.filter(r => r.exists).map(r => r.table);
        } catch (error) {
            console.error('Error listing tables:', error);
            return [];
        }
    }
    
    // Get recent tasks from the Supabase database
    async getRecentTasks(limit: number = 10): Promise<AITask[]> {
        try {
            console.log('Fetching recent tasks from Supabase...');
            
            // First, list all available tables to debug
            const tables = await this.listTables();
            console.log('Available tables for tasks:', tables);
            
            let allTasks: AITask[] = [];
            
            // Try each possible table name
            const tablesToTry = [
                'ai_tasks', 
                'tasks', 
                'neuroswarm_tasks', 
                'compute_tasks',
                ...tables.filter(t => 
                    t.includes('task') && 
                    !['ai_tasks', 'tasks', 'neuroswarm_tasks', 'compute_tasks'].includes(t)
                )
            ];
            
            for (const table of tablesToTry) {
                try {
                    console.log(`Trying to fetch tasks from '${table}' table...`);
                    const { data, error } = await this.client
                        .from(table)
                        .select('*')
                        .order('created_at', { ascending: false })
                        .limit(limit);
                        
                    if (!error && data && data.length > 0) {
                        console.log(`Found ${data.length} tasks in '${table}' table`);
                        
                        // Map the data to our AITask interface
                        const tasks = data.map(item => {
                            // Ensure the item has all required fields
                            return {
                                id: item.id || `generated-${Math.random().toString(36).substring(2, 9)}`,
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
                    } else if (error) {
                        console.warn(`Error fetching from '${table}' table:`, error);
                    }
                } catch (tableError) {
                    console.error(`Error accessing '${table}' table:`, tableError);
                }
            }
            
            // If we found any tasks, return them
            if (allTasks.length > 0) {
                return allTasks.slice(0, limit);
            }
            
            // If we still don't have data, return empty array
            console.warn('No tasks found in any table, returning empty array');
            return [];
        } catch (error) {
            console.error('Error fetching recent tasks:', error);
            return [];
        }
    }
    

}
