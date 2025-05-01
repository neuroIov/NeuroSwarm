/**
 * Type definitions for Phantom wallet
 */

interface Window {
    solana?: {
        isPhantom?: boolean;
        connect: () => Promise<{ publicKey: { toString: () => string } }>;
        disconnect: () => Promise<void>;
        on: (event: string, callback: () => void) => void;
        request: (request: {
            method: string;
            params?: unknown
        }) => Promise<unknown>;
    };
} 