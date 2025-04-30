// src/globals.d.ts

interface Window {
    solana?: {
      isPhantom: boolean;
      connect: () => Promise<{ publicKey: string }>;
      // Add any additional Phantom Wallet methods if needed
    };
  }
  