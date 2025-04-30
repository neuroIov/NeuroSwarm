export const logger = {
    log: (message: string, ...args: unknown[]): void => {
        console.log(`[LOG] ${message}`, ...args);
    },
    error: (message: string, ...args: unknown[]): void => {
        console.error(`[ERROR] ${message}`, ...args);
    },
    warn: (message: string, ...args: unknown[]): void => {
        console.warn(`[WARN] ${message}`, ...args);
    }
};

export const maskSensitiveInfo = <T extends Record<string, unknown>>(data: T): T => {
    if (typeof data !== 'object' || data === null) {
        return data;
    }

    const masked = { ...data };
    const sensitiveFields = ['password', 'token', 'key', 'secret', 'api_key'];

    for (const field of sensitiveFields) {
        if (field in masked) {
            masked[field] = '***MASKED***';
        }
    }

    return masked;
}; 