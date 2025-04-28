import { SecurityService } from './SecurityService';

interface ComputeTask {
    taskId: string;
    nodeId: string;
    input: Float32Array;
    computeShader: string;
    expectedResult?: any;
    deadline: number;
}

interface TaskResult {
    taskId: string;
    nodeId: string;
    result: Float32Array;
    executionTime: number;
    resourceUsage: {
        cpu: number;
        memory: number;
        gpu: number;
    };
}

export class TaskValidator {
    private readonly MAX_SHADER_SIZE = 1024 * 1024; // 1MB
    private readonly MAX_INPUT_SIZE = 100 * 1024 * 1024; // 100MB
    private readonly SUSPICIOUS_PATTERNS = [
        'while\\s*\\(true\\s*\\)', // Infinite loops
        'XMLHttpRequest', // Network requests
        'fetch\\s*\\(', // Network requests
        'WebSocket', // Network connections
        'eval\\s*\\(', // Code execution
        'Function\\s*\\(', // Dynamic function creation
        'crypto\\.', // Crypto mining
        'localStorage', // Local storage access
        'indexedDB', // IndexedDB access
    ];

    constructor(private securityService: SecurityService) {}

    async validateTaskInput(task: ComputeTask): Promise<boolean> {
        try {
            // Validate task structure
            if (!task.taskId || !task.nodeId || !task.computeShader) {
                throw new Error('Missing required task fields');
            }

            // Validate input size
            if (task.input.byteLength > this.MAX_INPUT_SIZE) {
                throw new Error(`Input size exceeds maximum allowed (${this.MAX_INPUT_SIZE} bytes)`);
            }

            // Validate shader size
            if (task.computeShader.length > this.MAX_SHADER_SIZE) {
                throw new Error(`Shader size exceeds maximum allowed (${this.MAX_SHADER_SIZE} bytes)`);
            }

            // Check for malicious patterns in shader code
            const maliciousPatterns = this.detectMaliciousCode(task.computeShader);
            if (maliciousPatterns.length > 0) {
                throw new Error(`Suspicious code patterns detected: ${maliciousPatterns.join(', ')}`);
            }

            // Validate shader syntax
            await this.validateShaderSyntax(task.computeShader);

            return true;
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.securityService.recordViolation(task.nodeId, {
                type: 'resource_abuse',
                severity: 'high',
                timestamp: Date.now(),
                details: `Task validation failed: ${errorMessage}`
            });
            return false;
        }
    }

    async validateTaskResult(result: TaskResult, originalTask: ComputeTask): Promise<boolean> {
        try {
            // Validate result structure
            if (!result.taskId || !result.nodeId || !result.result) {
                throw new Error('Missing required result fields');
            }

            // Verify task ID match
            if (result.taskId !== originalTask.taskId) {
                throw new Error('Task ID mismatch');
            }

            // Verify node ID match
            if (result.nodeId !== originalTask.nodeId) {
                throw new Error('Node ID mismatch');
            }

            // Check execution time
            if (result.executionTime <= 0 || result.executionTime > 300000) { // Max 5 minutes
                throw new Error('Invalid execution time');
            }

            // Validate resource usage
            this.validateResourceUsage(result.resourceUsage);

            // Verify result format
            if (!(result.result instanceof Float32Array)) {
                throw new Error('Invalid result format');
            }

            // If expected result is provided, compare with actual result
            if (originalTask.expectedResult) {
                const isValid = await this.compareResults(result.result, originalTask.expectedResult);
                if (!isValid) {
                    throw new Error('Result verification failed');
                }
            }

            // Update node reputation based on task performance
            const performanceScore = this.calculatePerformanceScore(result);
            this.securityService.updateNodeReputation(result.nodeId, performanceScore);

            return true;
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.securityService.recordViolation(result.nodeId, {
                type: 'invalid_proof',
                severity: 'medium',
                timestamp: Date.now(),
                details: `Result validation failed: ${errorMessage}`
            });
            return false;
        }
    }

    private detectMaliciousCode(shader: string): string[] {
        return this.SUSPICIOUS_PATTERNS
            .filter(pattern => new RegExp(pattern, 'i').test(shader));
    }

    private async validateShaderSyntax(shader: string): Promise<void> {
        // Basic WGSL syntax validation
        const errors = [];
        
        // Check for balanced braces
        if ((shader.match(/\{/g) || []).length !== (shader.match(/\}/g) || []).length) {
            errors.push('Unbalanced braces');
        }

        // Check for required WGSL structure
        if (!shader.includes('@compute') && !shader.includes('@fragment')) {
            errors.push('Missing required shader entry point');
        }

        // Check for proper variable declarations
        if (shader.includes('var') && !shader.match(/var\s+\w+\s*:\s*\w+/)) {
            errors.push('Invalid variable declarations');
        }

        if (errors.length > 0) {
            throw new Error(`Shader syntax errors: ${errors.join(', ')}`);
        }
    }

    private validateResourceUsage(usage: TaskResult['resourceUsage']): void {
        const maxUsage = 0.95; // 95% max resource usage
        
        if (usage.cpu > maxUsage) {
            throw new Error(`Excessive CPU usage: ${usage.cpu * 100}%`);
        }
        if (usage.memory > maxUsage) {
            throw new Error(`Excessive memory usage: ${usage.memory * 100}%`);
        }
        if (usage.gpu > maxUsage) {
            throw new Error(`Excessive GPU usage: ${usage.gpu * 100}%`);
        }
    }

    private async compareResults(actual: Float32Array, expected: Float32Array): Promise<boolean> {
        if (actual.length !== expected.length) {
            return false;
        }

        const tolerance = 1e-6; // Floating point comparison tolerance
        for (let i = 0; i < actual.length; i++) {
            if (Math.abs(actual[i] - expected[i]) > tolerance) {
                return false;
            }
        }
        return true;
    }

    private calculatePerformanceScore(result: TaskResult): number {
        // Calculate performance score based on:
        // 1. Resource usage efficiency
        // 2. Execution time relative to deadline
        // 3. Result accuracy
        
        const resourceScore = 1 - (result.resourceUsage.cpu + result.resourceUsage.memory + result.resourceUsage.gpu) / 3;
        const timeScore = Math.min(1, 300000 / result.executionTime); // 5 minutes reference
        
        // Weighted average
        return 0.6 * resourceScore + 0.4 * timeScore;
    }
}
