import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/utils/logger";

const swarmSupabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const swarmSupabaseAnonKey = import.meta.env.VITE_SUPABASE_KEY;

const taskSupabaseUrl = import.meta.env.VITE_TASK_SUPABASE_URL;
const taskSupabaseAnonKey = import.meta.env.VITE_TASK_SUPABASE_KEY;

let swarmSupabase: SupabaseClient | null = null;
let taskSupabase: SupabaseClient | null = null;

// Initialize both clients
if (swarmSupabaseUrl && swarmSupabaseAnonKey) {
  swarmSupabase = createClient(swarmSupabaseUrl, swarmSupabaseAnonKey);
  logger?.log?.("Connected to swarm Supabase project");
}

if (taskSupabaseUrl && taskSupabaseAnonKey) {
  taskSupabase = createClient(taskSupabaseUrl, taskSupabaseAnonKey);
  logger?.log?.("Connected to tasks Supabase project");
}

// Getter functions to ensure clients exist
export const getSwarmSupabase = (): SupabaseClient => {
  if (!swarmSupabase) {
    throw new Error("Swarm Supabase client not initialized");
  }
  return swarmSupabase;
};

export const getTaskSupabase = (): SupabaseClient => {
  if (!taskSupabase) {
    throw new Error("Task Supabase client not initialized");
  }
  return taskSupabase;
};

// Export the clients directly for convenience
export { swarmSupabase, taskSupabase };
