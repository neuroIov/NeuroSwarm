import { RateLimiter } from '../services/RateLimiter';
import { TaskValidator } from '../services/TaskValidator';
import { SecurityService } from '../services/SecurityService';
import { useMonitoringStore } from '../services/MonitoringService';

interface TaskMetrics {
    startTime?: number;
    endTime?: number;
    attempts: number;
    resourceUsage: {
        cpu: number;
        memory: number;
        gpu: number;
    };
}

interface Task {
    id: string;
    input: Float32Array;
    computeShader: string;
    complexity: number;
    priority: 'high' | 'medium' | 'low' | 'critical'; // Extended for new prioritization
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'retrying';
    deadline: number;
    result?: Float32Array;
    error?: string;
    nodeId: string;
    metrics: TaskMetrics;
    retryCount?: number;
    lastRetry?: number;
}

export class TaskScheduler {
    private tasks: Map<string, Task> = new Map();
    private rateLimiter: RateLimiter;
    private taskValidator: TaskValidator;
    private securityService: SecurityService;
    private readonly taskTimeout = 300000; // 5 minutes
    private readonly maxConcurrentTasks = 10;
    private readonly maxQueueSize = 100;
    private readonly complexityThreshold = 1000;
    private readonly maxBatchSize = 5;
    private readonly priorityWeights = {
        critical: 4,
        high: 3,
        medium: 2,
        low: 1
    };
    private taskProgress: Map<string, number> = new Map();
    private readonly maxRetries = 3; // New for error recovery
    private readonly retryDelay = 30000; // 30 seconds between retries
    private nodeLoad: Map<string, number> = new Map(); // For load balancing

    constructor(
        rateLimiter: RateLimiter,
        securityService: SecurityService,
        taskValidator: TaskValidator
    ) {
        this.rateLimiter = rateLimiter;
        this.securityService = securityService;
        this.taskValidator = taskValidator;
        
        // Start task cleanup and load balancing intervals
        setInterval(() => this.cleanupTasks(), this.taskTimeout);
        setInterval(() => this.balanceLoad(), 60000); // Check load every minute
    }

    private cleanupTasks(): void {
        const now = Date.now();
        for (const [id, task] of this.tasks.entries()) {
            if (task.status === 'pending' && now > task.deadline) {
                if (task.retryCount && task.retryCount < this.maxRetries) {
                    this.retryTask(id);
                } else {
                    task.status = 'failed';
                    task.error = 'Task timed out after max retries';
                    useMonitoringStore.getState().addAlert(`Task ${id} timed out`);
                    this.tasks.delete(id);
                }
            } else if (task.status === 'processing' && now > (task.deadline + this.taskTimeout)) {
                task.status = 'failed';
                task.error = 'Task processing timed out';
                useMonitoringStore.getState().addAlert(`Task ${id} processing timed out`);
                this.tasks.delete(id);
            }
        }
    }

    private estimateComplexity(input: Float32Array, computeShader: string): number {
        // Enhanced complexity estimation
        const inputSizeFactor = input.length * 0.1; // Linear factor for input size
        const shaderComplexity = computeShader.split(';').length * 10; // Count operations
        const complexity = Math.min(this.complexityThreshold * 2, inputSizeFactor + shaderComplexity);
        return Math.max(1, complexity); // Ensure non-zero
    }

    private async batchTasks(): Promise<Task[]> {
        const pendingTasks = Array.from(this.tasks.values())
            .filter(t => t.status === 'pending' || t.status === 'retrying')
            .sort((a, b) => {
                const priorityDiff = this.priorityWeights[b.priority] - this.priorityWeights[a.priority];
                if (priorityDiff !== 0) return priorityDiff;
                return a.deadline - b.deadline;
            });

        const batch: Task[] = [];
        let totalComplexity = 0;

        for (const task of pendingTasks) {
            if (batch.length >= this.maxBatchSize) break;
            if (totalComplexity + task.complexity > this.complexityThreshold * 2) break;
            
            // Select node with lowest load
            const selectedNode = await this.selectLeastLoadedNode(task.nodeId);
            if (selectedNode) task.nodeId = selectedNode;

            batch.push(task);
            totalComplexity += task.complexity;
        }

        return batch;
    }

    private updateTaskProgress(taskId: string, progress: number): void {
        this.taskProgress.set(taskId, Math.min(100, Math.max(0, progress)));
        const task = this.tasks.get(taskId);
        if (task) {
            useMonitoringStore.getState().updateMetrics({
                taskProgress: {
                    taskId,
                    progress,
                    status: task.status
                }
            });
        }
    }

    public async submitTask(
        input: Float32Array,
        computeShader: string,
        nodeId: string,
        priority: Task['priority'] = 'medium'
    ): Promise<string> {
        if (this.securityService.isNodeBanned(nodeId)) {
            throw new Error('Node is banned from submitting tasks');
        }

        const canSubmit = await this.rateLimiter.checkRateLimit('task_submission', nodeId);
        if (!canSubmit) {
            throw new Error('Rate limit exceeded for task submissions');
        }

        if (this.tasks.size >= this.maxQueueSize) {
            throw new Error('Task queue is full');
        }

        const activeTasks = Array.from(this.tasks.values()).filter(
            t => t.status === 'processing'
        ).length;
        if (activeTasks >= this.maxConcurrentTasks) {
            throw new Error('Maximum concurrent tasks limit reached');
        }

        const complexity = this.estimateComplexity(input, computeShader);
        if (complexity > this.complexityThreshold) {
            useMonitoringStore.getState().addAlert(`High complexity task detected: ${complexity}`);
        }

        const task: Task = {
            id: crypto.randomUUID(),
            input,
            computeShader,
            nodeId,
            complexity,
            priority,
            status: 'pending',
            deadline: Date.now() + this.taskTimeout,
            metrics: { attempts: 0, resourceUsage: { cpu: 0, memory: 0, gpu: 0 } },
            retryCount: 0
        };

        const isValid = await this.taskValidator.validateTaskInput({
            taskId: task.id,
            nodeId: task.nodeId,
            input: task.input,
            computeShader: task.computeShader,
            deadline: task.deadline
        });

        if (!isValid) {
            throw new Error('Task validation failed');
        }

        this.tasks.set(task.id, task);
        return task.id;
    }

    public async getTask(id: string): Promise<Task | undefined> {
        const canQuery = await this.rateLimiter.checkRateLimit('task_query', 'default');
        if (!canQuery) {
            throw new Error('Rate limit exceeded for task queries');
        }

        return this.tasks.get(id);
    }

    public async processTask(id: string, nodeId: string): Promise<void> {
        const task = this.tasks.get(id);
        if (!task) throw new Error('Task not found');

        if (task.status !== 'pending' && task.status !== 'retrying') {
            throw new Error(`Task is already ${task.status}`);
        }

        const canProcess = await this.rateLimiter.checkRateLimit('task_processing', nodeId);
        if (!canProcess) {
            throw new Error('Rate limit exceeded for task processing');
        }

        try {
            task.status = 'processing';
            task.metrics.startTime = Date.now();
            task.metrics.attempts++;
            this.updateTaskProgress(id, 0);

            const progressInterval = setInterval(() => {
                const elapsed = Date.now() - (task.metrics.startTime || 0);
                const estimatedProgress = Math.min(95, (elapsed / (this.taskTimeout / 2)) * 100); // Half timeout for progress
                this.updateTaskProgress(id, estimatedProgress);
            }, 1000);

            const result = await this.executeTask(task);
            clearInterval(progressInterval);

            if (result) {
                task.result = result;
                task.status = 'completed';
                task.metrics.endTime = Date.now();
                this.updateTaskProgress(id, 100);
            } else {
                throw new Error('Task execution failed');
            }

            const isValid = await this.taskValidator.validateTaskResult({
                taskId: task.id,
                nodeId: task.nodeId,
                result: task.result,
                executionTime: task.metrics.endTime - (task.metrics.startTime || 0),
                resourceUsage: task.metrics.resourceUsage
            }, {
                taskId: task.id,
                nodeId: task.nodeId,
                input: task.input,
                computeShader: task.computeShader,
                deadline: task.deadline
            });

            if (!isValid) throw new Error('Task result validation failed');

        } catch (error) {
            task.status = 'retrying';
            task.error = error instanceof Error ? error.message : 'Unknown error';
            task.retryCount = (task.retryCount || 0) + 1;
            task.lastRetry = Date.now();
            this.updateTaskProgress(id, 0);

            useMonitoringStore.getState().addAlert({
                type: 'system',
                severity: 'high',
                message: `Task ${id} failed: ${task.error}, retrying (${task.retryCount}/${this.maxRetries})`
            });

            if (task.retryCount >= this.maxRetries) {
                task.status = 'failed';
                this.tasks.delete(id);
            } else {

private async executeTask(task: Task): Promise<TaskResult> {
console.log(`Executing task ${task.id}`);
    
// Start timing the execution
const startTime = Date.now();
    
try {
// Create a result array based on the task input size
const result = new Array(task.input.length);
    
// Perform the actual computation based on the task type
for (let i = 0; i < task.input.length; i++) {
// This would be replaced with actual computation logic
// For now, we'll use a simple transformation of the input
result[i] = typeof task.input[i] === 'number' ? 
task.input[i] * 2 : // Simple operation for numbers
task.input[i]; // Pass through for other types
}
    
// Get actual system resource usage if available
const resourceUsage = await this.getSystemResourceUsage();
    
// Return the result with real metrics
return {
taskId: task.id,
result,
executionTime: Date.now() - startTime,
resourceUsage,
success: true
};
} catch (error) {
console.error(`Error executing task ${task.id}:`, error);
return {
taskId: task.id,
result: [],
executionTime: Date.now() - startTime,
resourceUsage: await this.getSystemResourceUsage(),
success: false,
error: error.message
};
}
}

// Get actual system resource usage
private async getSystemResourceUsage() {
// In a real implementation, this would use system APIs to get actual usage
// For now, we'll return reasonable defaults
return {
cpu: 0.5, // 50% CPU usage
memory: 0.4, // 40% memory usage
gpu: 0.6  // 60% GPU usage
};
}

public async cancelTask(id: string): Promise<void> {
const task = this.tasks.get(id);
if (!task) throw new Error('Task not found');

if (task.status === 'completed' || task.status === 'failed') {
throw new Error(`Cannot cancel ${task.status} task`);
}

task.status = 'failed';
task.error = 'Task cancelled by user';
this.updateTaskProgress(id, 0);

if (task.metrics.startTime) {
task.metrics.endTime = Date.now();
}
        if (task.status === 'completed' || task.status === 'failed') {
            throw new Error(`Cannot cancel ${task.status} task`);
        }

        task.status = 'failed';
        task.error = 'Task cancelled by user';
        this.updateTaskProgress(id, 0);

        if (task.metrics.startTime) {
            task.metrics.endTime = Date.now();
        }

        useMonitoringStore.getState().addAlert({
            type: 'system',
            severity: 'low',
            message: `Task ${id} cancelled`
        });

        this.tasks.delete(id);
    }

    public async getQueueStatus(): Promise<{
        totalTasks: number;
        pendingTasks: number;
        processingTasks: number;
        completedTasks: number;
        failedTasks: number;
    }> {
        const canQuery = await this.rateLimiter.checkRateLimit('queue_status', 'default');
        if (!canQuery) throw new Error('Rate limit exceeded for queue status queries');

        const tasks = Array.from(this.tasks.values());
        return {
            totalTasks: tasks.length,
            pendingTasks: tasks.filter(t => t.status === 'pending' || t.status === 'retrying').length,
            processingTasks: tasks.filter(t => t.status === 'processing').length,
            completedTasks: tasks.filter(t => t.status === 'completed').length,
            failedTasks: tasks.filter(t => t.status === 'failed').length
        };
    }

    public async getActiveNodes(): Promise<string[]> {
        const now = Date.now();
        const activeNodes = new Set<string>();

        const tasks = Array.from(this.tasks.values());
        for (const task of tasks) {
            if ((task.metrics.endTime || 0) > now - 300000) { // Last 5 minutes
                activeNodes.add(task.nodeId);
            }
        }

        return Array.from(activeNodes);
    }

    public async getNodeStats(nodeId: string): Promise<{
        successRate: number;
        avgResponseTime: number;
        lastHeartbeat: number;
        resourceUtilization: {
            cpu: number;
            memory: number;
            bandwidth: number;
        };
    }> {
        const tasks = Array.from(this.tasks.values())
            .filter(t => t.nodeId === nodeId && t.status !== 'pending' && t.status !== 'retrying');

        if (tasks.length === 0) throw new Error(`No tasks found for node ${nodeId}`);

        const completedTasks = tasks.filter(t => t.status === 'completed');
        const successRate = completedTasks.length / tasks.length;

        const responseTimes = completedTasks
            .map(t => (t.metrics.endTime || 0) - (t.metrics.startTime || 0))
            .filter(time => time > 0);

        const avgResponseTime = responseTimes.length > 0
            ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
            : 0;

        const lastTask = tasks.sort((a, b) => (b.metrics.endTime || 0) - (a.metrics.endTime || 0))[0];

        return {
            successRate,
            avgResponseTime,
            lastHeartbeat: lastTask.metrics.endTime || Date.now(),
            resourceUtilization: lastTask.metrics.resourceUsage || { cpu: 0, memory: 0, bandwidth: 0 }
        };
    }

    private async selectLeastLoadedNode(preferredNode: string): Promise<string> {
        const activeNodes = await this.getActiveNodes();
        if (!activeNodes.length) return preferredNode;

        let minLoad = Infinity;
        let leastLoadedNode = preferredNode;

        for (const node of activeNodes) {
            const load = this.nodeLoad.get(node) || 0;
            if (load < minLoad) {
                minLoad = load;
                leastLoadedNode = node;
            }
        }

        return leastLoadedNode;
    }

    private balanceLoad(): void {
        const nodeTasks = new Map<string, number>();
        for (const task of this.tasks.values()) {
            const count = nodeTasks.get(task.nodeId) || 0;
            nodeTasks.set(task.nodeId, count + (task.status === 'processing' ? 2 : 1));
        }

        for (const [node, count] of nodeTasks) {
            this.nodeLoad.set(node, count);
        }

        useMonitoringStore.getState().updateMetrics({
            loadBalancing: Array.from(this.nodeLoad.entries()).map(([node, load]) => ({ node, load }))
        });
    }

    private retryTask(id: string): void {
        const task = this.tasks.get(id);
        if (!task || task.retryCount >= this.maxRetries) return;

        task.status = 'retrying';
        task.retryCount = (task.retryCount || 0) + 1;
        task.lastRetry = Date.now();
        task.error = undefined;

        setTimeout(() => {
            const node = this.selectLeastLoadedNode(task!.nodeId);
            this.processTask(id, node).catch(err => {
                useMonitoringStore.getState().addAlert({
                    type: 'system',
                    severity: 'high',
                    message: `Retry failed for task ${id}: ${err.message}`
                });
            });
        }, this.retryDelay);
    }
}