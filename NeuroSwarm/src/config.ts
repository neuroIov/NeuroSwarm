export const config = {
    // Use environment variables if available, otherwise use the hardcoded values
    SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL || 'https://oiqqfyhdvdrsymxtuoyr.supabase.co',
    SUPABASE_KEY: import.meta.env.VITE_SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9pcXFmeWhkdmRyc3lteHR1b3lyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzYzNjgxNzQsImV4cCI6MjA1MTk0NDE3NH0.m_3ZBiGpGwACVNeA1bZBSpXRAAXj-myXJg6_dl6pwmk',
    PROGRAM_ID: 'dswefmc8yoCGWHAi72YxyAvC3DwXHcF3BRNF9UV5pCh',
    NETWORK: 'devnet',
    MIN_STAKE: 1000,
    REWARD_RATE: 0.1,
    MAX_TASK_SIZE: 50 * 1024 * 1024 // 50MB
};
