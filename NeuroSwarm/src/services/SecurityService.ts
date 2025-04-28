import { RateLimiter } from './RateLimiter';
export interface IStakingContract {
    getStake(nodeId: string): Promise<bigint>;
}

type RequestType = 'task' | 'stake' | 'general';

interface NodeIdentity {
    publicKey: string;
    ipAddress: string;
    lastSeen: number;
    reputation: number;
    stakeAmount: bigint;
    behaviorScore: number; // New field for behavior analysis
}

interface ProofData {
    timestamp: number;
    signature: string;
    data: unknown;
    taskId: string; // Added for better proof tracking
    nonce: string; // Added for replay protection
}

interface SecurityViolation {
    type: 'rate_limit' | 'invalid_proof' | 'resource_abuse' | 'stake_manipulation' | 'ddos_suspicion';
    severity: 'low' | 'medium' | 'high';
    timestamp: number;
    details: string;
}

export class SecurityService {
    private isPaused: boolean = false;
    private validNodes: Set<string> = new Set();
    private rateLimiter: RateLimiter;
    private stakingContract: IStakingContract;
    private violations: Map<string, SecurityViolation[]> = new Map();
    private bannedNodes: Set<string> = new Set();
    private emergencyPaused: boolean = false;
    private readonly VIOLATION_THRESHOLD = 5;
    private readonly MIN_STAKE_AMOUNT = BigInt(1000) * BigInt(1e9); // 1000 tokens
    private readonly MIN_REPUTATION = 0.3; // 30% minimum reputation
    private verifiedNodes: Map<string, NodeIdentity> = new Map();
    private readonly BAN_DURATION = 24 * 60 * 60 * 1000; // 24 hours
    private requestCounts: Map<string, number[]> = new Map(); // Track request timestamps
    private ddosThreshold: number = 1000; // Default threshold for DDoS detection
    private nodeBehavior: Map<string, { requestPatterns: number[]; anomalyScore: number }> = new Map();

    constructor(
        private readonly config: {
            maxRequestsPerMinute: number;
            maxConcurrentTasks: number;
            maxNodeFailures: number;
        },
        rateLimiter: RateLimiter,
        stakingContract: IStakingContract
    ) {
        this.rateLimiter = rateLimiter;
        this.stakingContract = stakingContract;
        this.startCleanupInterval();
    }

    private startCleanupInterval() {
        setInterval(async () => {
            this.cleanupViolations();
            this.cleanupBans();
            this.cleanupRequestCounts();
            await this.cleanupVerifiedNodes();
            this.adjustRateLimits();
        }, 60 * 60 * 1000); // Run every hour
    }

    private cleanupViolations() {
        const now = Date.now();
        for (const [nodeId, nodeViolations] of this.violations.entries()) {
            const recentViolations = nodeViolations.filter(
                v => now - v.timestamp < this.BAN_DURATION
            );
            if (recentViolations.length === 0) {
                this.violations.delete(nodeId);
            } else {
                this.violations.set(nodeId, recentViolations);
            }
        }
    }

    public async pauseOperations(): Promise<void> {
        this.isPaused = true;
        console.log('Security service paused operations');
    }

    public async resumeOperations(): Promise<void> {
        this.isPaused = false;
        console.log('Security service resumed operations');
    }

    public async validateNode(nodeId: string): Promise<boolean> {
        if (this.isPaused) {
            throw new Error('Security service is paused');
        }

        if (!nodeId) {
            throw new Error('Invalid node ID');
        }

        if (this.validNodes.has(nodeId)) {
            return true;
        }

        const isValid = await this.performNodeValidation(nodeId);
        if (isValid) {
            this.validNodes.add(nodeId);
        }

        return isValid;
    }

    private async performNodeValidation(nodeId: string): Promise<boolean> {
        return nodeId.length > 0 && !this.bannedNodes.has(nodeId);
    }

    private cleanupBans() {
        const now = Date.now();
        for (const nodeId of this.bannedNodes) {
            const violations = this.violations.get(nodeId) || [];
            const recentViolations = violations.filter(
                v => now - v.timestamp < this.BAN_DURATION
            );
            if (recentViolations.length < this.VIOLATION_THRESHOLD) {
                this.bannedNodes.delete(nodeId);
                console.log(`Node ${nodeId} ban expired`);
            }
        }
    }

    private async cleanupVerifiedNodes() {
        const now = Date.now();
        for (const [nodeId, identity] of this.verifiedNodes.entries()) {
            if (now - identity.lastSeen > 24 * 60 * 60 * 1000) {
                this.verifiedNodes.delete(nodeId);
                continue;
            }

            try {
                identity.stakeAmount = await this.stakingContract.getStake(nodeId);
                this.verifiedNodes.set(nodeId, identity);
            } catch (error) {
                console.error(`Failed to update stake for node ${nodeId}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }

    private cleanupRequestCounts() {
        const now = Date.now();
        for (const [nodeId, timestamps] of this.requestCounts.entries()) {
            const recentRequests = timestamps.filter(t => now - t < this.BAN_DURATION);
            if (recentRequests.length === 0) {
                this.requestCounts.delete(nodeId);
            } else {
                this.requestCounts.set(nodeId, recentRequests);
            }
        }
    }

    recordViolation(nodeId: string, violation: SecurityViolation) {
        const nodeViolations = this.violations.get(nodeId) || [];
        nodeViolations.push(violation);
        this.violations.set(nodeId, nodeViolations);

        console.log(`Security violation by node ${nodeId}: ${violation.type} (${violation.severity}) - ${violation.details}`);

        const recentViolations = nodeViolations.filter(
            v => Date.now() - v.timestamp < this.BAN_DURATION
        );

        if (recentViolations.length >= this.VIOLATION_THRESHOLD) {
            this.bannedNodes.add(nodeId);
            console.log(`Node ${nodeId} banned due to violations`);
        }

        // Update behavior score
        this.updateNodeBehavior(nodeId, -0.1); // Negative impact on behavior
    }

    async validateRequest(nodeId: string, requestType: RequestType): Promise<boolean> {
        if (this.emergencyPaused) {
            throw new Error('System is in emergency pause mode');
        }

        if (this.bannedNodes.has(nodeId)) {
            throw new Error('Node is banned due to security violations');
        }

        // Check for DDoS patterns
        if (await this.detectDDoS(nodeId)) {
            this.recordViolation(nodeId, {
                type: 'ddos_suspicion',
                severity: 'high',
                timestamp: Date.now(),
                details: 'Potential DDoS attack detected'
            });
            return false;
        }

        const counts = this.getRequestCounts(nodeId);
        const isVerified = await this.isVerifiedNode(nodeId);

        // Dynamically adjust limits based on network load
        const baseLimit = this.config.maxRequestsPerMinute;
        const dynamicLimit = Math.max(baseLimit * (isVerified ? 1.5 : 0.5), 10); // Adjust based on verification status

        if (counts.minute >= dynamicLimit) {
            this.recordViolation(nodeId, {
                type: 'rate_limit',
                severity: 'low',
                timestamp: Date.now(),
                details: `Exceeded per-minute request limit (${dynamicLimit})`
            });
            return false;
        }

        let canProceed: boolean;
        try {
            switch (requestType) {
                case 'task':
                    canProceed = await this.rateLimiter.checkRateLimit('task_submission', nodeId);
                    break;
                case 'stake':
                    canProceed = await this.rateLimiter.checkRateLimit('stake_operation', nodeId);
                    break;
                case 'general':
                    canProceed = await this.rateLimiter.checkRateLimit('general_request', nodeId);
                    break;
                default:
                    const _exhaustiveCheck: never = requestType;
                    throw new Error(`Invalid request type: ${_exhaustiveCheck}`);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.recordViolation(nodeId, {
                type: 'rate_limit',
                severity: 'medium',
                timestamp: Date.now(),
                details: errorMessage
            });
            return false;
        }

        if (!canProceed) {
            this.recordViolation(nodeId, {
                type: 'rate_limit',
                severity: 'low',
                timestamp: Date.now(),
                details: `Rate limit exceeded for ${requestType}`
            });
            return false;
        }

        this.incrementRequestCount(nodeId);
        this.updateNodeBehavior(nodeId, 0.01); // Positive impact for valid requests
        return true;
    }

    async validateProof(nodeId: string, proof: ProofData): Promise<boolean> {
        if (!nodeId || !proof) {
            throw new Error('Invalid input for proof validation');
        }

        try {
            // Comprehensive proof validation
            if (!this.isValidProofStructure(proof)) {
                throw new Error('Invalid proof structure');
            }

            if (!await this.verifyProofSignature(proof, nodeId)) {
                throw new Error('Invalid proof signature');
            }

            if (!this.isProofTimely(proof.timestamp)) {
                throw new Error('Proof timestamp out of range');
            }

            if (!this.isNonceUnique(proof.nonce, nodeId)) {
                throw new Error('Nonce reuse detected');
            }

            // Check node stake and reputation
            const identity = this.verifiedNodes.get(nodeId);
            if (!identity || identity.stakeAmount < this.MIN_STAKE_AMOUNT || identity.reputation < this.MIN_REPUTATION) {
                throw new Error('Node not authorized for proof submission');
            }

            return true;
        } catch (error) {
            this.recordViolation(nodeId, {
                type: 'invalid_proof',
                severity: 'high',
                timestamp: Date.now(),
                details: error instanceof Error ? error.message : 'Unknown error'
            });
            return false;
        }
    }

    private isValidProofStructure(proof: ProofData): boolean {
        return proof && typeof proof.timestamp === 'number' && 
               typeof proof.signature === 'string' && 
               typeof proof.data === 'object' && 
               typeof proof.taskId === 'string' && 
               typeof proof.nonce === 'string';
    }

    private async verifyProofSignature(proof: ProofData, nodeId: string): Promise<boolean> {
        const identity = this.verifiedNodes.get(nodeId);
        if (!identity) return false;

        // Simulate signature verification (in real implementation, use crypto libraries)
        const message = JSON.stringify({ taskId: proof.taskId, data: proof.data, timestamp: proof.timestamp });
        return message.length > 0 && proof.signature.length > 0; // Simplified check
    }

    private isProofTimely(timestamp: number): boolean {
        const now = Date.now();
        return timestamp <= now && now - timestamp <= 5 * 60 * 1000; // 5 minutes window
    }

    private isNonceUnique(nonce: string, nodeId: string): boolean {
        // Check if nonce was used recently (e.g., last 24 hours)
        const recentNonces = this.nodeBehavior.get(nodeId)?.requestPatterns.filter(t => 
            typeof t === 'number' && Date.now() - t < 24 * 60 * 60 * 1000
        ) || [];
        
        // Create a simple hash of the nonce for comparison
        const hashNonce = (str: string): string => {
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                const char = str.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash; // Convert to 32bit integer
            }
            return hash.toString(16);
        };
        
        // Convert the nonce to a hash and check if it exists in our recent nonces
        const hashedNonce = hashNonce(nonce);
        return !recentNonces.some(n => typeof n === 'string' && n === hashedNonce);
    }

    private async isVerifiedNode(nodeId: string): Promise<boolean> {
        const identity = this.verifiedNodes.get(nodeId);
        if (!identity) return false;

        if (Date.now() - identity.lastSeen > 60 * 60 * 1000) {
            return false;
        }

        const currentStake = await this.stakingContract.getStake(nodeId);
        if (currentStake < this.MIN_STAKE_AMOUNT) {
            return false;
        }

        return identity.reputation >= this.MIN_REPUTATION;
    }

    async registerNode(nodeId: string, publicKey: string, ipAddress: string): Promise<boolean> {
        if (!nodeId || !publicKey || !ipAddress) {
            throw new Error('Missing required registration fields');
        }

        const existingSybil = Array.from(this.verifiedNodes.values())
            .find(node => node.ipAddress === ipAddress && Date.now() - node.lastSeen < 24 * 60 * 60 * 1000);
        
        if (existingSybil) {
            this.recordViolation(nodeId, {
                type: 'resource_abuse',
                severity: 'high',
                timestamp: Date.now(),
                details: 'Potential Sybil attack detected: Multiple registrations from same IP'
            });
            return false;
        }

        const stake = await this.stakingContract.getStake(nodeId);
        if (stake < this.MIN_STAKE_AMOUNT) {
            throw new Error(`Insufficient stake. Minimum required: ${this.MIN_STAKE_AMOUNT}`);
        }

        this.verifiedNodes.set(nodeId, {
            publicKey,
            ipAddress,
            lastSeen: Date.now(),
            reputation: 1.0,
            stakeAmount: stake,
            behaviorScore: 1.0 // Initial behavior score
        });

        return true;
    }

    updateNodeReputation(nodeId: string, performanceScore: number): void {
        const identity = this.verifiedNodes.get(nodeId);
        if (!identity) return;

        const alpha = 0.1;
        identity.reputation = alpha * performanceScore + (1 - alpha) * identity.reputation;
        identity.lastSeen = Date.now();

        if (identity.reputation < this.MIN_REPUTATION) {
            this.recordViolation(nodeId, {
                type: 'resource_abuse',
                severity: 'medium',
                timestamp: Date.now(),
                details: 'Node reputation dropped below minimum threshold'
            });
        }

        this.verifiedNodes.set(nodeId, identity);
    }

    private updateNodeBehavior(nodeId: string, delta: number): void {
        let behavior = this.nodeBehavior.get(nodeId) || { requestPatterns: [], anomalyScore: 0 };
        behavior.requestPatterns.push(Date.now());
        behavior.anomalyScore = Math.max(0, Math.min(1, behavior.anomalyScore + delta));

        // Analyze behavior for anomalies
        if (behavior.requestPatterns.length > 100) { // Analyze last 100 requests
            const intervals = behavior.requestPatterns
                .sort((a, b) => a - b)
                .map((t, i, arr) => i > 0 ? t - arr[i - 1] : 0);
            const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
            const stdDev = Math.sqrt(intervals.map(x => Math.pow(x - avgInterval, 2)).reduce((a, b) => a + b, 0) / intervals.length);

            if (stdDev < 100 || intervals.some(i => i < 50)) { // Very tight or bursty patterns
                behavior.anomalyScore += 0.2;
                this.recordViolation(nodeId, {
                    type: 'resource_abuse',
                    severity: 'medium',
                    timestamp: Date.now(),
                    details: 'Suspicious request pattern detected'
                });
            }

            behavior.requestPatterns = behavior.requestPatterns.slice(-50); // Keep last 50 for efficiency
        }

        this.nodeBehavior.set(nodeId, behavior);

        // Update identity behavior score
        const identity = this.verifiedNodes.get(nodeId);
        if (identity) {
            identity.behaviorScore = 1 - behavior.anomalyScore;
            this.verifiedNodes.set(nodeId, identity);
        }
    }

    private getRequestCounts(nodeId: string): { minute: number; hourly: number; daily: number } {
        if (!nodeId) {
            throw new Error('Invalid nodeId');
        }
        const timestamps = this.requestCounts.get(nodeId) || [];
        const now = Date.now();

        return {
            minute: timestamps.filter(t => now - t < 60 * 1000).length,
            hourly: timestamps.filter(t => now - t < 60 * 60 * 1000).length,
            daily: timestamps.filter(t => now - t < 24 * 60 * 60 * 1000).length
        };
    }

    private incrementRequestCount(nodeId: string) {
        const counts = this.requestCounts.get(nodeId) || [];
        counts.push(Date.now());
        this.requestCounts.set(nodeId, counts);
    }

    async emergencyPause(): Promise<void> {
        this.emergencyPaused = true;
    }

    async emergencyResume(): Promise<void> {
        this.emergencyPaused = false;
    }

    getViolationHistory(nodeId: string): SecurityViolation[] {
        return this.violations.get(nodeId) || [];
    }

    isNodeBanned(nodeId: string): boolean {
        return this.bannedNodes.has(nodeId);
    }

    private async detectDDoS(nodeId: string): Promise<boolean> {
        const counts = this.getRequestCounts(nodeId);
        const networkLoad = Array.from(this.requestCounts.values()).reduce((sum, timestamps) => sum + timestamps.length, 0);

        // Adjust DDoS threshold based on network load
        const adjustedThreshold = this.ddosThreshold * (1 + Math.log(networkLoad / 1000 + 1));
        return counts.minute > adjustedThreshold || networkLoad > this.ddosThreshold * 10;
    }

    private adjustRateLimits(): void {
        const totalRequests = Array.from(this.requestCounts.values()).reduce((sum, timestamps) => sum + timestamps.length, 0);
        const loadFactor = Math.min(2, totalRequests / (this.config.maxRequestsPerMinute * 10)); // Scale up to 2x under high load

        this.config.maxRequestsPerMinute = Math.max(10, this.config.maxRequestsPerMinute * (1 + loadFactor / 2));
        this.ddosThreshold = Math.max(500, this.ddosThreshold * (1 + loadFactor / 4));

        console.log(`Adjusted rate limits: maxRequestsPerMinute=${this.config.maxRequestsPerMinute}, ddosThreshold=${this.ddosThreshold}`);
    }
}