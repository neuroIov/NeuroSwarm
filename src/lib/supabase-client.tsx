import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/utils/logger";

const swarmSupabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const swarmSupabaseAnonKey = import.meta.env.VITE_SUPABASE_KEY;
const swarmSupabaseServiceRoleKey = import.meta.env
  .VITE_SUPABASE_SERVICE_ROLE_KEY;

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

// Create a Supabase client with service role key for admin operations
export const getSwarmSupabaseAdmin = (): SupabaseClient => {
  if (!swarmSupabaseUrl || !swarmSupabaseServiceRoleKey) {
    throw new Error("Supabase URL or service role key not available");
  }
  return createClient(swarmSupabaseUrl, swarmSupabaseServiceRoleKey);
};

// Function to delete a user by email
export async function deleteUserByEmail(
  email: string
): Promise<{ success: boolean; message: string }> {
  try {
    const supabase = getSwarmSupabaseAdmin();

    // Step 1: Get user by email
    const { data: userList, error: fetchError } =
      await supabase.auth.admin.listUsers();
    if (fetchError) throw fetchError;

    const user = userList.users.find((u: any) => u?.email === email);
    if (!user) throw new Error("User not found");

    const uid = user.id;

    // Step 3: Delete user from auth
    const { error: deleteError } = await supabase.auth.admin.deleteUser(uid);
    if (deleteError) throw deleteError;

    return { success: true, message: "User fully deleted!" };
  } catch (error: any) {
    logger?.error?.("Error deleting user:", error);
    return {
      success: false,
      message: error.message || "Failed to delete user",
    };
  }
}

// Export the clients directly for convenience
export { swarmSupabase, taskSupabase };
