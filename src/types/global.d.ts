declare global {
    interface Window {
        ethereum?: {
            isMetaMask?: boolean;
            request: (args: { method: string, params?: any[] }) => Promise<any>;
        };
        solana?: {
            isPhantom?: boolean;
            connect: () => Promise<{ publicKey: { toString(): string } }>;
        };
        phantom?: {
            solana?: {
                isPhantom?: boolean;
                connect: () => Promise<{ publicKey: { toString(): string } }>;
            };
        };
    }
}

export { }; 