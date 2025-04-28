interface RateLimit {
    maxRequests: number;
    windowMs: number;
    requests: { timestamp: number; identifier: string }[];
    burstLimit?: number;
    burstWindow?: number;
}

export class RateLimiter {
    private limits: Map<string, RateLimit> = new Map();
    private violations: Map<string, { count: number; timestamp: number }> = new Map();
    private readonly VIOLATION_THRESHOLD = 5;
    private readonly VIOLATION_WINDOW = 3600000; // 1 hour

    constructor() {
        // Initialize default rate limits with burst protection
        this.setRateLimit('token_mint', 100, 3600000, 10, 60000);  // 100/hour, burst: 10/minute
        this.setRateLimit('device_registration', 5, 86400000, 2, 3600000);  // 5/day, burst: 2/hour
        this.setRateLimit('task_submission', 50, 3600000, 5, 60000);  // 50/hour, burst: 5/minute
        this.setRateLimit('stake_operation', 10, 86400000, 3, 3600000);  // 10/day, burst: 3/hour
        this.setRateLimit('economic_operation', 30, 3600000, 5, 60000);  // 30/hour, burst: 5/minute
        
        // Start cleanup interval
        setInterval(() => this.cleanupViolations(), this.VIOLATION_WINDOW);
    }

    setRateLimit(operation: string, maxRequests: number, windowMs: number, burstLimit?: number, burstWindow?: number) {
        this.limits.set(operation, {
            maxRequests,
            windowMs,
            requests: [],
            burstLimit,
            burstWindow
        });
    }

    async checkRateLimit(operation: string, identifier: string): Promise<boolean> {
        const limit = this.limits.get(operation);
        
        if (!limit) {
            throw new Error(`No rate limit defined for operation: ${operation}`);
        }

        // Check if identifier is banned due to violations
        if (this.isIdentifierBanned(identifier)) {
            throw new Error('Rate limit violations exceeded threshold');
        }

        const now = Date.now();

        // Clean up old requests
        limit.requests = limit.requests.filter(req => 
            now - req.timestamp < limit.windowMs
        );

        // Check main rate limit
        const identifierRequests = limit.requests.filter(req => req.identifier === identifier);
        if (identifierRequests.length >= limit.maxRequests) {
            this.recordViolation(identifier);
            return false;
        }

        // Check burst limit if defined
        if (limit.burstLimit && limit.burstWindow) {
            const burstRequests = identifierRequests.filter(req => 
                now - req.timestamp < limit.burstWindow!
            );
            if (burstRequests.length >= limit.burstLimit) {
                this.recordViolation(identifier);
                return false;
            }
        }

        // Add new request
        limit.requests.push({ timestamp: now, identifier });
        return true;
    }

    private cleanupViolations(): void {
        const now = Date.now();
        for (const [identifier, violation] of this.violations.entries()) {
            if (now - violation.timestamp >= this.VIOLATION_WINDOW) {
                this.violations.delete(identifier);
            }
        }
    }

    private isIdentifierBanned(identifier: string): boolean {
        const violation = this.violations.get(identifier);
        if (!violation) return false;
        
        const now = Date.now();
        if (now - violation.timestamp >= this.VIOLATION_WINDOW) {
            this.violations.delete(identifier);
            return false;
        }

        return violation.count >= this.VIOLATION_THRESHOLD;
    }

    private recordViolation(identifier: string): void {
        const now = Date.now();
        const violation = this.violations.get(identifier);

        if (violation) {
            violation.count++;
            violation.timestamp = now;
        } else {
            this.violations.set(identifier, { count: 1, timestamp: now });
        }
    }

    async getRemainingRequests(operation: string, identifier: string): Promise<number> {
        const limit = this.limits.get(operation);
        
        if (!limit) {
            throw new Error(`No rate limit defined for operation: ${operation}`);
        }

        if (this.isIdentifierBanned(identifier)) {
            return 0;
        }

        const now = Date.now();
        const identifierRequests = limit.requests.filter(req => 
            req.identifier === identifier && now - req.timestamp < limit.windowMs
        );

        const mainRemaining = Math.max(0, limit.maxRequests - identifierRequests.length);

        if (limit.burstLimit && limit.burstWindow) {
            const burstRequests = identifierRequests.filter(req => 
                now - req.timestamp < limit.burstWindow!
            );
            const burstRemaining = Math.max(0, limit.burstLimit - burstRequests.length);
            return Math.min(mainRemaining, burstRemaining);
        }

        return mainRemaining;
    }

    async resetRateLimit(operation: string, identifier: string): Promise<void> {
        const limit = this.limits.get(operation);
        
        if (!limit) {
            throw new Error(`No rate limit defined for operation: ${operation}`);
        }

        limit.requests = limit.requests.filter(req => req.identifier !== identifier);
    }
}
