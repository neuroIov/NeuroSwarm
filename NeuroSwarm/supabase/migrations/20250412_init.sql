-- Create tasks table
CREATE TABLE IF NOT EXISTS public.tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL,
    prompt TEXT NOT NULL,
    result TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    compute_time INT,
    gpu_usage INT,
    blockchain_task_id TEXT,
    node_id TEXT,
    reward_amount BIGINT,
    completion_signature TEXT
);

-- Create devices table
CREATE TABLE IF NOT EXISTS public.devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status TEXT NOT NULL DEFAULT 'offline',
    gpu_model TEXT NOT NULL,
    vram INT NOT NULL,
    hash_rate INT NOT NULL,
    owner TEXT NOT NULL,
    last_seen TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create task_stats view
CREATE OR REPLACE VIEW public.task_stats AS
SELECT 
    COUNT(*) as total_tasks,
    AVG(compute_time) as avg_compute_time,
    (COUNT(*) FILTER (WHERE status = 'completed') * 100.0 / COUNT(*)) as success_rate
FROM public.tasks;

-- Add indexes
CREATE INDEX IF NOT EXISTS tasks_status_idx ON public.tasks(status);
CREATE INDEX IF NOT EXISTS tasks_created_at_idx ON public.tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS devices_status_idx ON public.devices(status);
CREATE INDEX IF NOT EXISTS devices_last_seen_idx ON public.devices(last_seen DESC);
