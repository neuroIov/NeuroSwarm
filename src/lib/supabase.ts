import { createClient } from '@supabase/supabase-js';

// These are placeholder values, users will need to replace with their own
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://your-project.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'your-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Types for Supabase database tables
export interface WalletProfile {
  id: string;
  wallet_address: string;
  created_at: string;
  updated_at: string;
  last_seen_at: string;
}

export interface SwarmNode {
  id: string;
  wallet_address: string;
  device_id: string;
  device_name: string;
  device_type: 'desktop' | 'laptop' | 'tablet' | 'mobile';
  reward_tier: 'webgpu' | 'wasm' | 'webgl' | 'cpu';
  status: 'idle' | 'running' | 'offline';
  cpu_cores: number;
  memory: string;
  gpu_info: string;
  created_at: string;
  last_active: string;
}

export interface SwarmTask {
  id: string;
  type: 'gpt-4' | 'compute' | 'storage';
  subtype: 'text' | 'image' | 'video' | 'data';
  prompt: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  assigned_to?: string;
  created_at: string;
  completed_at?: string;
  wallet_address?: string;
}

// Helper functions for wallet authentication
export const loginWithWallet = async (walletAddress: string, signature: string) => {
  try {
    // In a real implementation, you would verify the signature on the server
    const { data, error } = await supabase
      .from('wallet_profiles')
      .upsert({ 
        wallet_address: walletAddress,
        last_seen_at: new Date().toISOString()
      }, { 
        onConflict: 'wallet_address'
      });
    
    if (error) throw error;
    
    // Set session data in local storage
    localStorage.setItem('swarm_wallet_address', walletAddress);
    
    return { success: true, walletAddress };
  } catch (error) {
    console.error('Error logging in with wallet:', error);
    return { success: false, error };
  }
};

export const logoutWallet = () => {
  localStorage.removeItem('swarm_wallet_address');
  return { success: true };
};

export const getWalletSession = () => {
  const walletAddress = localStorage.getItem('swarm_wallet_address');
  return walletAddress ? { walletAddress } : null;
};

// Data fetching functions
export const fetchTasks = async () => {
  const { data, error } = await supabase
    .from('swarm_tasks')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('Error fetching tasks:', error);
    return [];
  }
  
  return data || [];
};

export const fetchUserNodes = async (walletAddress: string) => {
  const { data, error } = await supabase
    .from('swarm_nodes')
    .select('*')
    .eq('wallet_address', walletAddress);
  
  if (error) {
    console.error('Error fetching nodes:', error);
    return [];
  }
  
  return data || [];
};

export const fetchGlobalStats = async () => {
  // This would be a single query in a real implementation
  const totalTasksPromise = supabase
    .from('swarm_tasks')
    .select('id', { count: 'exact' });
    
  const totalUsersPromise = supabase
    .from('wallet_profiles')
    .select('id', { count: 'exact' });
    
  const onlineNodesPromise = supabase
    .from('swarm_nodes')
    .select('id', { count: 'exact' })
    .eq('status', 'running');
    
  const [tasksResult, usersResult, nodesResult] = await Promise.all([
    totalTasksPromise,
    totalUsersPromise,
    onlineNodesPromise
  ]);
  
  return {
    totalTasks: tasksResult.count || 0,
    totalUsers: usersResult.count || 0,
    activeNodes: nodesResult.count || 0,
  };
};

// Register a new node
export const registerNode = async (walletAddress: string, nodeInfo: Omit<SwarmNode, 'id' | 'wallet_address' | 'created_at' | 'last_active'>) => {
  const { data, error } = await supabase
    .from('swarm_nodes')
    .insert({
      ...nodeInfo,
      wallet_address: walletAddress,
      created_at: new Date().toISOString(),
      last_active: new Date().toISOString(),
    })
    .select();
  
  if (error) {
    console.error('Error registering node:', error);
    return { success: false, error };
  }
  
  return { success: true, node: data?.[0] };
};

// Update node status
export const updateNodeStatus = async (nodeId: string, status: 'idle' | 'running' | 'offline') => {
  const { data, error } = await supabase
    .from('swarm_nodes')
    .update({ 
      status, 
      last_active: new Date().toISOString()
    })
    .eq('id', nodeId)
    .select();
  
  if (error) {
    console.error('Error updating node status:', error);
    return { success: false, error };
  }
  
  return { success: true, node: data?.[0] };
};
