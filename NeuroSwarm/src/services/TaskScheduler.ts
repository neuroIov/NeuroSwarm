import { MonitoringService } from './MonitoringService';
import { RateLimiter } from './RateLimiter';
import { SecurityService } from './SecurityService';

interface BaseNodeStats {
    score: number;
    isBanned: boolean;
    gpuCapabilities: {
        webgpu: boolean;
        webgl2: boolean;
        compute: boolean;
    };
    performance: {
        latency: number;
        throughput: number;
        lastBenchmark: number;
    };
}

export interface ExtendedNodeStats extends BaseNodeStats {
    successCount: number;
    taskCount: number;
    failureCount: number;
    lastActive: number;
    stake: bigint;
    rewards: bigint;
}

export interface Task {
    id: string;
    input: Float32Array;
    computeShader: string;
    complexity: number;
    deadline?: number;
    priority: 'high' | 'medium' | 'low';
    status: 'pending' | 'assigned' | 'completed' | 'failed';
    assignedNode?: string;
    retries?: number;
    result?: Float32Array;
    error?: string;
}

export class TaskScheduler {
    private tasks: Map<string, Task> = new Map();
    private nodeStats: Map<string, ExtendedNodeStats> = new Map();
    private maxRetries = 3;
    private taskTimeout = 5 * 60 * 1000; // 5 minutes
    private rateLimiter: RateLimiter;
    private security: SecurityService;
    private monitoring: MonitoringService;
    private taskQueue: Task[] = [];
    private isPaused = false;
    private healthCheckInterval: NodeJS.Timer;
    private lastHealthCheck = 0;
    private healthCheckThreshold = 30000; // 30 seconds
    
    // Performance thresholds
    private readonly THRESHOLDS = {
        minSuccessRate: 0.8,       // 80% success rate required
        maxLatency: 2000,          // 2 seconds max latency
        minThroughput: 100,        // 100 ops/sec minimum
        benchmarkInterval: 3600000, // Re-benchmark every hour
        maxQueueLength: 1000,      // Maximum tasks in queue
        maxNodeLoad: 0.8,          // 80% max node utilization
        criticalErrors: 5           // Max errors before emergency pause
    };

    // Track error counts for emergency pause
    private errorCounts = {
        total: 0,
        consecutive: 0,
        lastReset: Date.now()
    };
    private isProcessing = false;
    private schedulerInterval: NodeJS.Timeout | null = null;

    constructor(rateLimiter: RateLimiter, security: SecurityService, monitoring: MonitoringService) {
        this.rateLimiter = rateLimiter;
        this.security = security;
        this.monitoring = monitoring;
        this.startHealthCheck();
    }

    private startHealthCheck() {
        this.healthCheckInterval = setInterval(() => {
            this.performHealthCheck();
        }, this.healthCheckThreshold);
    }

    private async performHealthCheck() {
        const now = Date.now();
        const stats = {
            queueLength: this.taskQueue.length,
            activeNodes: 0,
            totalErrors: this.errorCounts.total,
            avgLatency: 0,
            avgThroughput: 0,
            successRate: 0
        };

        let totalLatency = 0;
        let totalThroughput = 0;
        let successfulNodes = 0;

        for (const [nodeId, nodeStats] of this.nodeStats.entries()) {
            if (now - nodeStats.lastActive < this.THRESHOLDS.benchmarkInterval) {
                stats.activeNodes++;
                totalLatency += nodeStats.performance.latency;
                totalThroughput += nodeStats.performance.throughput;
                const successRate = nodeStats.successCount / (nodeStats.taskCount || 1);
                if (successRate >= this.THRESHOLDS.minSuccessRate) {
                    successfulNodes++;
                }
            }
        }

        if (stats.activeNodes > 0) {
            stats.avgLatency = totalLatency / stats.activeNodes;
            stats.avgThroughput = totalThroughput / stats.activeNodes;
            stats.successRate = successfulNodes / stats.activeNodes;
        }

        // Check for critical conditions
        if (
            stats.queueLength > this.THRESHOLDS.maxQueueLength ||
            stats.avgLatency > this.THRESHOLDS.maxLatency ||
            stats.avgThroughput < this.THRESHOLDS.minThroughput ||
            stats.successRate < this.THRESHOLDS.minSuccessRate ||
            this.errorCounts.consecutive >= this.THRESHOLDS.criticalErrors
        ) {
            await this.emergencyPause();
        }

        this.monitoring.recordMetrics('scheduler_health', stats);
        this.lastHealthCheck = now;
    }

    private async emergencyPause() {
        if (!this.isPaused) {
            this.isPaused = true;
            this.monitoring.recordEvent('emergency_pause', {
                reason: 'Critical health check failure',
                timestamp: Date.now()
            });

            // Notify all active nodes
            for (const [nodeId, nodeStats] of this.nodeStats.entries()) {
                if (!nodeStats.isBanned) {
                    try {
                        await this.notifyNode(nodeId, 'pause');
                    } catch (error) {
                        console.error(`Failed to notify node ${nodeId} of pause:`, error);
                    }
                }
            }
        }
    }

    private async emergencyResume() {
        if (!this.isPaused) return;

        // Verify conditions have improved
        const stats = await this.getSystemStats();
        if (
            stats.queueLength <= this.THRESHOLDS.maxQueueLength &&
            stats.avgLatency <= this.THRESHOLDS.maxLatency &&
            stats.avgThroughput >= this.THRESHOLDS.minThroughput &&
            stats.successRate >= this.THRESHOLDS.minSuccessRate &&
            (stats.webgpuNodes > 0 || stats.webgl2Nodes > 0)
        ) {
            this.isPaused = false;
            this.errorCounts.consecutive = 0;
            this.errorCounts.total = 0;
            this.errorCounts.lastReset = Date.now();

            // Notify monitoring
            this.monitoring.recordEvent('emergency_resume', {
                type: 'system',
                severity: 'high',
                message: 'System resumed from emergency pause',
                stats
            });

            // Recover failed tasks
            await this.recoverFailedTasks();

            // Resume processing
            void this.processTaskQueue();
        }
        if (this.isPaused) {
            // Verify conditions have improved
            const stats = await this.getSystemStats();
            if (
                stats.queueLength <= this.THRESHOLDS.maxQueueLength &&
                stats.avgLatency <= this.THRESHOLDS.maxLatency &&
                stats.avgThroughput >= this.THRESHOLDS.minThroughput &&
                stats.successRate >= this.THRESHOLDS.minSuccessRate &&
                (stats.webgpuNodes > 0 || stats.webgl2Nodes > 0) // Ensure we have GPU-capable nodes
            ) {
                this.isPaused = false;
                this.errorCounts.consecutive = 0;
                this.monitoring.recordEvent('emergency_resume', {
                    timestamp: Date.now(),
                    stats
                });

                // Resume processing
                this.processNextTask();
            }
        }
    }

    private async getSystemStats() {
        const now = Date.now();
        const stats = {
            queueLength: this.taskQueue.length,
            activeNodes: 0,
            avgLatency: 0,
            avgThroughput: 0,
            successRate: 0,
            webgpuNodes: 0,
            webgl2Nodes: 0
        };

        let totalLatency = 0;
        let totalThroughput = 0;
        let successfulNodes = 0;
        let totalNodes = 0;

        for (const [_, nodeStats] of this.nodeStats.entries()) {
            if (now - nodeStats.lastActive < this.THRESHOLDS.benchmarkInterval) {
                totalNodes++;
                if (nodeStats.gpuCapabilities.webgpu) stats.webgpuNodes++;
                if (nodeStats.gpuCapabilities.webgl2) stats.webgl2Nodes++;
                totalLatency += nodeStats.performance.latency;
                totalThroughput += nodeStats.performance.throughput;
                const successRate = nodeStats.successCount / (nodeStats.taskCount || 1);
                if (successRate >= this.THRESHOLDS.minSuccessRate) {
                    successfulNodes++;
                }
            }
        }

        if (totalNodes > 0) {
            stats.activeNodes = totalNodes;
            stats.avgLatency = totalLatency / totalNodes;
            stats.avgThroughput = totalThroughput / totalNodes;
            stats.successRate = successfulNodes / totalNodes;
        }

        return stats;
    }

    private async selectBestNode(task: Task): Promise<string | null> {
        const candidates = Array.from(this.nodeStats.entries())
            .filter(([_, stats]) => 
                !stats.isBanned && 
                this.isNodeCapable(stats, task) &&
                stats.successCount / (stats.taskCount || 1) >= this.THRESHOLDS.minSuccessRate
            )
            .map(([nodeId, stats]) => ({
                nodeId,
                score: this.calculateNodeScore(stats, task)
            }))
            .sort((a, b) => b.score - a.score);

        return candidates.length > 0 ? candidates[0].nodeId : null;
    }

    private async selectFallbackNode(task: Task): Promise<string | null> {
        const eligibleNodes = Array.from(this.nodeStats.entries())
            .filter(([_, stats]) => {
                // Check if node supports WebGL2 when WebGPU is not available
                if (!stats.gpuCapabilities.webgpu && stats.gpuCapabilities.webgl2) {
                    return !stats.isBanned &&
                        stats.performance.latency <= this.THRESHOLDS.maxLatency &&
                        stats.performance.throughput >= this.THRESHOLDS.minThroughput;
                }
                return false;
            })
            .sort(([_, a], [__, b]) => {
                // Prioritize nodes with better performance
                const scoreA = this.calculateNodeScore(a);
                const scoreB = this.calculateNodeScore(b);
                return scoreB - scoreA;
            });

        return eligibleNodes.length > 0 ? eligibleNodes[0][0] : null;
    }

    private calculateNodeScore(stats: ExtendedNodeStats): number {
        const successRate = stats.successCount / (stats.taskCount || 1);
        const latencyScore = 1 - (stats.performance.latency / this.THRESHOLDS.maxLatency);
        const throughputScore = stats.performance.throughput / this.THRESHOLDS.minThroughput;
        
        return (successRate * 0.4) + (latencyScore * 0.3) + (throughputScore * 0.3);
    }
    constructor(
        rateLimiter: RateLimiter,
        security: SecurityService,
        monitoring: MonitoringService
    ) {
        this.rateLimiter = rateLimiter;
        this.security = security;
        this.monitoring = monitoring;
        this.startScheduler();
        this.startPerformanceMonitoring();
    }

    private startScheduler(): void {
        this.schedulerInterval = setInterval(() => {
            this.processTaskQueue();
        }, 1000);
    }

    private startPerformanceMonitoring(): void {
        setInterval(() => {
            this.updateNodePerformance();
        }, 60000);
    }

    private async processTaskQueue(): Promise<void> {
        if (this.isProcessing || this.isPaused) return;
        this.isProcessing = true;

        try {
            // Get pending tasks sorted by priority and deadline
            const pendingTasks = Array.from(this.taskQueue)
                .filter(task => task.status === 'pending')
                .sort((a, b) => {
                    if (a.priority !== b.priority) {
                        return a.priority === 'high' ? -1 : b.priority === 'high' ? 1 : 0;
                    }
                    return (a.deadline || 0) - (b.deadline || 0);
                });

            for (const task of pendingTasks) {
                if (this.isPaused) break;

                // Find best node for task
                const nodeId = await this.selectBestNode(task);
                if (!nodeId) {
                    const fallbackNodeId = await this.selectFallbackNode(task);
                    if (!fallbackNodeId) {
                        this.monitoring.recordEvent('task_unassigned', {
                            taskId: task.id,
                            reason: 'No suitable node found'
                        });
                        continue;
                    }
                    task.assignedNode = fallbackNodeId;
                } else {
                    task.assignedNode = nodeId;
                }

                // Execute task
                try {
                    const result = await this.submitTaskToNode(task, task.assignedNode);
                    if (result) {
                        task.status = 'completed';
                        task.result = result;
                        await this.updateNodeReputation(task.assignedNode, true, task.complexity);
                    }
                } catch (error) {
                    this.handleTaskFailure(task, error);
                }
            }

            // Update node performance metrics
            await this.updateNodePerformance();

        } finally {
            this.isProcessing = false;
        }
        if (this.isProcessing || this.taskQueue.length === 0) return;

        this.isProcessing = true;
        try {
            const task = this.taskQueue[0];
            await this.scheduleTask(task);
            this.taskQueue.shift();
        } catch (error) {
            console.error('Error processing task:', error);
        } finally {
            this.isProcessing = false;
        }
    }

    private async updateNodePerformance(): Promise<void> {
        const now = Date.now();
        const deadNodes: string[] = [];

        for (const [nodeId, stats] of this.nodeStats.entries()) {
            // Check if node is responsive
            if (now - stats.lastActive > this.THRESHOLDS.benchmarkInterval * 2) {
                deadNodes.push(nodeId);
                continue;
            }

            try {
                // Run performance benchmark
                const benchmark = await this.runBenchmark(nodeId);
                stats.performance.latency = benchmark.latency;
                stats.performance.throughput = benchmark.throughput;
                stats.performance.lastBenchmark = now;

                // Update node score
                const successRate = stats.successCount / (stats.taskCount || 1);
                if (successRate < this.THRESHOLDS.minSuccessRate || 
                    benchmark.latency > this.THRESHOLDS.maxLatency || 
                    benchmark.throughput < this.THRESHOLDS.minThroughput) {
                    
                    this.monitoring.recordEvent('node_performance_warning', {
                        type: 'performance',
                        severity: 'high',
                        message: `Node ${nodeId} performance degraded`,
                        nodeId,
                        metrics: {
                            successRate,
                            latency: benchmark.latency,
                            throughput: benchmark.throughput
                        }
                    });
                }
            } catch (error) {
                this.monitoring.recordEvent('node_benchmark_failed', {
                    type: 'system',
                    severity: 'medium',
                    message: `Failed to benchmark node ${nodeId}`,
                    nodeId,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }

        // Handle dead nodes
        for (const nodeId of deadNodes) {
            await this.handleDeadNode(nodeId);
        }
        for (const [nodeId, stats] of this.nodeStats.entries()) {
            if (Date.now() - stats.performance.lastBenchmark > 3600000) { // 1 hour
                try {
                    const benchmarkResult = await this.runBenchmark(nodeId);
                    stats.performance = {
                        ...stats.performance,
                        ...benchmarkResult,
                        lastBenchmark: Date.now()
                    };
                    this.nodeStats.set(nodeId, stats);
                } catch (error) {
                    console.error(`Benchmark failed for node ${nodeId}:`, error);
                }
            }
        }
    }

    private async handleDeadNode(nodeId: string): Promise<void> {
        // Remove node stats
        this.nodeStats.delete(nodeId);

        // Reassign tasks from dead node
        const affectedTasks = Array.from(this.tasks.values())
            .filter(t => t.assignedNode === nodeId && t.status === 'pending');

        for (const task of affectedTasks) {
            task.assignedNode = undefined;
            task.status = 'pending';
            task.retries = (task.retries || 0) + 1;

            if (task.retries < this.maxRetries) {
                this.taskQueue.push(task);
                this.monitoring.recordEvent('task_reassigned', {
                    type: 'system',
                    severity: 'medium',
                    message: `Task ${task.id} reassigned due to dead node ${nodeId}`,
                    taskId: task.id,
                    nodeId
                });
            } else {
                task.status = 'failed';
                task.error = `Max retries exceeded after node ${nodeId} became unresponsive`;
                this.monitoring.recordEvent('task_failed', {
                    type: 'system',
                    severity: 'high',
                    message: `Task ${task.id} failed after max retries`,
                    taskId: task.id,
                    nodeId
                });
            }
        }

        // Notify monitoring
        this.monitoring.recordEvent('node_dead', {
            type: 'system',
            severity: 'high',
            message: `Node ${nodeId} is unresponsive and has been removed`,
            nodeId,
            affectedTasks: affectedTasks.length
        });

        // Update network metrics
        await this.monitoring.updateMetrics({
            activeNodes: this.getActiveNodesCount(),
            networkLoad: await this.calculateNetworkLoad()
        });
    }

    private async runBenchmark(nodeId: string): Promise<{ latency: number; throughput: number }> {
        // Implement benchmark logic here
        return {
            latency: Math.random() * 100,
            throughput: Math.random() * 1000
        };
    }

    private calculateNodeScore(stats: ExtendedNodeStats, task: Task): number {
        const performanceScore = (1000 - stats.performance.latency) * stats.performance.throughput;
        const reliabilityScore = stats.successCount / (stats.taskCount || 1);
        const stakeScore = Number(stats.stake) / 1e9; // Convert from wei-like units

        return performanceScore * 0.4 + reliabilityScore * 0.3 + stakeScore * 0.3;
    }

    private isNodeCapable(stats: ExtendedNodeStats, task: Task): boolean {
        return stats.gpuCapabilities.webgpu || 
               (stats.gpuCapabilities.webgl2 && task.complexity <= 1000) ||
               (stats.gpuCapabilities.compute && task.complexity <= 500);
    }

    private async executeWebGPU(task: Task, nodeId: string): Promise<Float32Array> {
        try {
            // Check if WebGPU is available
            if (!('gpu' in navigator)) {
                throw new Error('WebGPU not available');
            }

            const adapter = await navigator.gpu.requestAdapter();
            if (!adapter) {
                throw new Error('No appropriate GPUAdapter found');
            }

            const device = await adapter.requestDevice();
            const computePipeline = device.createComputePipeline({
                layout: 'auto',
                compute: {
                    module: device.createShaderModule({
                        code: task.computeShader
                    }),
                    entryPoint: 'main'
                }
            });

            // Create input buffer
            const inputBuffer = device.createBuffer({
                size: task.input.byteLength,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
            });
            device.queue.writeBuffer(inputBuffer, 0, task.input);

            // Create output buffer
            const outputBuffer = device.createBuffer({
                size: task.input.byteLength,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
            });

            // Create bind group
            const bindGroup = device.createBindGroup({
                layout: computePipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: inputBuffer } },
                    { binding: 1, resource: { buffer: outputBuffer } }
                ]
            });

            // Create command encoder and pass
            const commandEncoder = device.createCommandEncoder();
            const passEncoder = commandEncoder.beginComputePass();
            passEncoder.setPipeline(computePipeline);
            passEncoder.setBindGroup(0, bindGroup);
            passEncoder.dispatchWorkgroups(Math.ceil(task.input.length / 64));
            passEncoder.end();

            // Get result
            const readbackBuffer = device.createBuffer({
                size: task.input.byteLength,
                usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
            });

            commandEncoder.copyBufferToBuffer(
                outputBuffer, 0,
                readbackBuffer, 0,
                task.input.byteLength
            );

            device.queue.submit([commandEncoder.finish()]);
            await readbackBuffer.mapAsync(GPUMapMode.READ);
            const result = new Float32Array(readbackBuffer.getMappedRange());

            // Cleanup
            readbackBuffer.unmap();
            inputBuffer.destroy();
            outputBuffer.destroy();
            readbackBuffer.destroy();

            return result;
        } catch (error) {
            console.error('WebGPU execution failed:', error);
            // Try WebGL2 fallback
            return this.executeWebGL2(task, nodeId);
        }
    }

    private async executeWebGL2(task: Task, nodeId: string): Promise<Float32Array> {
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl2');
            if (!gl) {
                throw new Error('WebGL2 not available');
            }

            // Create shader program
            const vertexShader = gl.createShader(gl.VERTEX_SHADER)!;
            gl.shaderSource(vertexShader, `#version 300 es
                in vec4 position;
                void main() {
                    gl_Position = position;
                }
            `);
            gl.compileShader(vertexShader);

            const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER)!
            gl.shaderSource(fragmentShader, task.computeShader);
            gl.compileShader(fragmentShader);

            // Check for shader compilation errors
            if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
                throw new Error(`Vertex shader compilation failed: ${gl.getShaderInfoLog(vertexShader)}`);
            }
            if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
                throw new Error(`Fragment shader compilation failed: ${gl.getShaderInfoLog(fragmentShader)}`);
            }

            const program = gl.createProgram()!;
            gl.attachShader(program, vertexShader);
            gl.attachShader(program, fragmentShader);
            gl.linkProgram(program);

            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
                throw new Error(`Program link failed: ${gl.getProgramInfoLog(program)}`);
            }

            // Create buffers and textures
            const inputTexture = gl.createTexture()!;
            gl.bindTexture(gl.TEXTURE_2D, inputTexture);
            gl.texImage2D(
                gl.TEXTURE_2D,
                0,
                gl.R32F,
                task.input.length,
                1,
                0,
                gl.RED,
                gl.FLOAT,
                task.input
            );

            // Create framebuffer for output
            const framebuffer = gl.createFramebuffer()!;
            gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);

            const outputTexture = gl.createTexture()!;
            gl.bindTexture(gl.TEXTURE_2D, outputTexture);
            gl.texImage2D(
                gl.TEXTURE_2D,
                0,
                gl.R32F,
                task.input.length,
                1,
                0,
                gl.RED,
                gl.FLOAT,
                null
            );
            gl.framebufferTexture2D(
                gl.FRAMEBUFFER,
                gl.COLOR_ATTACHMENT0,
                gl.TEXTURE_2D,
                outputTexture,
                0
            );

            // Execute compute shader
            gl.useProgram(program);
            gl.viewport(0, 0, task.input.length, 1);
            gl.drawArrays(gl.TRIANGLES, 0, 3);

            // Read back result
            const result = new Float32Array(task.input.length);
            gl.readPixels(
                0, 0,
                task.input.length, 1,
                gl.RED,
                gl.FLOAT,
                result
            );

            // Cleanup
            gl.deleteTexture(inputTexture);
            gl.deleteTexture(outputTexture);
            gl.deleteFramebuffer(framebuffer);
            gl.deleteProgram(program);
            gl.deleteShader(vertexShader);
            gl.deleteShader(fragmentShader);

            return result;
        } catch (error) {
            console.error('WebGL2 execution failed:', error);
            // Try basic compute fallback
            return this.executeCompute(task, nodeId);
        }
    }

    private async executeCompute(task: Task, nodeId: string): Promise<Float32Array> {
        // Implement basic compute fallback
        const result = new Float32Array(task.input.length);
        for (let i = 0; i < result.length; i++) {
            result[i] = task.input[i];
        }
        return result;
    }

    private validateResult(result: Float32Array, task: Task): boolean {
        if (!result || !(result instanceof Float32Array)) {
            console.error('Invalid result type');
            return false;
        }

        if (result.length !== task.input.length) {
            console.error(`Result length mismatch: expected ${task.input.length}, got ${result.length}`);
            return false;
        }

        // Check for NaN, Infinity, and unreasonable values
        for (let i = 0; i < result.length; i++) {
            if (!Number.isFinite(result[i]) || 
                Math.abs(result[i]) > 1e6) { // Arbitrary large value threshold
                console.error(`Invalid value at index ${i}: ${result[i]}`);
                return false;
            }
        }

        // Verify basic mathematical properties if applicable
        const inputSum = task.input.reduce((a, b) => a + b, 0);
        const resultSum = result.reduce((a, b) => a + b, 0);
        if (Math.abs(resultSum) > Math.abs(inputSum) * 1e3) {
            console.error('Result magnitude exceeds reasonable bounds');
            return false;
        }

        return true;
    }

    private async updateNodeReputation(nodeId: string, success: boolean, complexity: number): Promise<void> {
        const stats = this.nodeStats.get(nodeId);
        if (!stats) return;

        if (success) {
            stats.successCount++;
            stats.score = Math.min(100, stats.score + (complexity / 1000));
        } else {
            stats.failureCount++;
            stats.score = Math.max(0, stats.score - (complexity / 500));
            if (stats.score < 10) {
                stats.isBanned = true;
            }
        }

        stats.taskCount++;
        stats.lastActive = Date.now();
        this.nodeStats.set(nodeId, stats);
    }

    public async submitTask(input: Float32Array, computeShader: string, priority: Task['priority'] = 'medium'): Promise<string> {
        const task: Task = {
            id: crypto.randomUUID(),
            input,
            computeShader,
            complexity: this.estimateComplexity(input, computeShader),
            priority,
            status: 'pending',
            deadline: Date.now() + this.taskTimeout
        };

        this.tasks.set(task.id, task);
        this.taskQueue.push(task);
        return task.id;
    }

    private estimateComplexity(input: Float32Array, computeShader: string): number {
        return Math.min(2000, input.length * computeShader.length / 1000);
    }

    public getTaskStatus(taskId: string): Task | null {
        return this.tasks.get(taskId) || null;
    }

    public getActiveNodesCount(): number {
        return Array.from(this.nodeStats.values())
            .filter(stats => !stats.isBanned && Date.now() - stats.lastActive < 300000)
            .length;
    }

    public calculateNetworkLoad(): number {
        const activeTasks = Array.from(this.tasks.values())
            .filter(task => task.status === 'assigned')
            .length;
        const activeNodes = this.getActiveNodesCount();
        return activeNodes ? (activeTasks / activeNodes) : 0;
    }
    private tasks: Map<string, Task> = new Map();
    private nodeStats: Map<string, ExtendedNodeStats> = new Map();
    private maxRetries = 3;
    private taskTimeout = 5 * 60 * 1000; // 5 minutes
    private rateLimiter: RateLimiter;
    private security: SecurityService;
    private monitoring: MonitoringService;
    private taskQueue: Task[] = [];
    private isProcessing = false;

    constructor(
        rateLimiter: RateLimiter,
        security: SecurityService,
        monitoring: MonitoringService
    ) {
        this.rateLimiter = rateLimiter;
        this.security = security;
        this.monitoring = monitoring;
        this.startScheduler();
        this.startPerformanceMonitoring();
    }

    async submitTask(input: Float32Array, computeShader: string, priority: Task['priority'] = 'medium'): Promise<string> {
        const task: Task = {
            id: crypto.randomUUID(),
            input,
            computeShader,
            complexity: this.estimateComplexity(input, computeShader),
            priority,
            status: 'pending',
            deadline: Date.now() + this.taskTimeout
        };

        this.tasks.set(task.id, task);
        await this.scheduleTask(task);
        return task.id;
    }

    private async scheduleTask(task: Task): Promise<void> {
        // Check rate limits
        const canSubmit = await this.rateLimiter.checkRateLimit('task_submission', task.id);
        if (!canSubmit) {
            throw new Error('Rate limit exceeded for task submission');
        }

        // Get available nodes sorted by optimal matching
        const nodes = Array.from(this.nodeStats.entries())
            .filter(([, stats]) => 
                !stats.isBanned && 
                stats.score >= 50 && 
                this.isNodeCapable(stats, task) &&
                Date.now() - stats.lastActive < 300000 // Active in last 5 minutes
            )
            .sort(([, a], [, b]) => 
                this.calculateNodeScore(b, task) - this.calculateNodeScore(a, task)
            );

        if (nodes.length === 0) {
            task.status = 'failed';
            task.error = 'No suitable nodes available';
            return;
        }

        // Assign to best available node
        const [nodeId] = nodes[0];
        task.assignedNode = nodeId;
        task.status = 'assigned';

        try {
            // Submit task to node
            const result = await this.submitTaskToNode(task, nodeId);
            if (result) {
                task.status = 'completed';
                task.result = result;
                await this.updateNodeReputation(nodeId, true, task.complexity);
            } else {
                throw new Error('Task execution failed');
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error(`Task ${task.id} failed:`, errorMessage);
            task.status = 'failed';
            task.error = errorMessage;
            await this.updateNodeReputation(nodeId, false, task.complexity);

            // Retry with different node if attempts remain
            if ((task.retries || 0) < this.maxRetries) {
                task.retries = (task.retries || 0) + 1;
                await this.scheduleTask(task);
            }
        }
    }

    private async recoverFailedTasks(): Promise<void> {
        const failedTasks = Array.from(this.tasks.values())
            .filter(t => t.status === 'failed' && (t.retries || 0) < this.maxRetries);

        for (const task of failedTasks) {
            task.status = 'pending';
            task.error = undefined;
            task.retries = (task.retries || 0) + 1;
            task.deadline = Date.now() + this.taskTimeout * Math.pow(2, task.retries || 0);

            // Clear assigned node to allow reassignment
            task.assignedNode = undefined;

            this.monitoring.recordEvent('task_recovery', {
                type: 'system',
                severity: 'medium',
                message: `Recovering task ${task.id}, attempt ${task.retries}`,
                taskId: task.id
            });

            this.taskQueue.push(task);
        }
    }

    private async submitTaskToNode(task: Task, nodeId: string): Promise<Float32Array | null> {
        const node = this.nodeStats.get(nodeId);
        if (!node) {
            throw new Error('Node not found');
        }

        // Update monitoring
        this.monitoring.getState().updateMetrics({
            activeNodes: this.getActiveNodesCount(),
            totalTasks: this.tasks.size,
            networkLoad: this.calculateNetworkLoad()
        });

        // Execute task based on node capabilities
        try {
            let result: Float32Array;
            if (node.gpuCapabilities.webgpu) {
                result = await this.executeWebGPU(task, nodeId);
            } else if (node.gpuCapabilities.webgl2) {
                result = await this.executeWebGL2(task, nodeId);
            } else if (node.gpuCapabilities.compute) {
                result = await this.executeCompute(task, nodeId);
            } else {
                throw new Error('No compatible execution environment');
            }

            // Validate result
            if (!this.validateResult(result, task)) {
                throw new Error('Invalid task result');
            }

            return result;
        } catch (error) {
            this.monitoring.getState().addAlert(
                `Task execution failed on node ${nodeId}: ${error.message}`
            );
            throw error;
        }
                    for (let i = 0; i < result.length; i++) {
                        result[i] = task.input[i] * 2; // Simulate computation
                    }
                    resolve(result);
                } else {
                    reject(new Error('Task execution failed'));
                }
            }, task.complexity * 100); // Simulate computation time
        });
    }

    private estimateComplexity(input: Float32Array, computeShader: string): number {
        // Implement complexity estimation based on input size and shader complexity
        return Math.ceil(
            (input.length / 1024) + // Data size factor
            (computeShader.length / 100) + // Shader complexity factor
            Math.random() * 5 // Random factor for variation
        );
    }

    private startScheduler(): void {
        // Periodically check for timed out tasks
        setInterval(() => {
            const now = Date.now();
            for (const [, task] of this.tasks.entries()) {
                if (task.status === 'assigned' && task.deadline && now > task.deadline) {
                    task.status = 'failed';
                    task.error = 'Task timed out';
                    if (task.assignedNode) {
                        this.updateNodeReputation(task.assignedNode, false, task.complexity);
                    }
                }
            }
        }, 30000); // Check every 30 seconds
    }

    async getTaskStatus(taskId: string): Promise<Task | null> {
        return this.tasks.get(taskId) || null;
    }

    async updateNodeStats(nodeKey: string, stats: ExtendedNodeStats): Promise<void> {
        this.nodeStats.set(nodeKey, stats);
    }

    private async updateNodeReputation(nodeId: string, success: boolean, complexity: number): Promise<void> {
        const stats = this.nodeStats.get(nodeId);
        if (!stats) return;

        if (success) {
            stats.score = Math.min(100, stats.score + complexity * 0.1);
            stats.successCount++;
        } else {
            stats.score = Math.max(0, stats.score - complexity * 0.2);
            stats.taskCount++;
            if (stats.score < 10) {
                stats.isBanned = true;
            }
        }

        this.nodeStats.set(nodeId, stats);
    }
}
