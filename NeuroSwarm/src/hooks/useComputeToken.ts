import { useConnection, useWallet, AnchorWallet } from '@solana/wallet-adapter-react';
import { useEffect, useState } from 'react';
import { ContractService } from '../services/ContractService';
import { Connection } from '@solana/web3.js';

export interface NodeStats {
    score: number;
    taskCount: number;
    successCount: number;
    lastPenaltyTime?: number;
    isBanned: boolean;
}

export interface TaskStats {
    id: string;
    status: 'pending' | 'completed' | 'failed';
    complexity?: number;
    timestamp: number;
}

export const useComputeToken = () => {
    const { connection } = useConnection();
    const { publicKey, wallet } = useWallet();
    const [contractService, setContractService] = useState<ContractService | null>(null);

    useEffect(() => {
        if (!connection || !publicKey || !wallet) return;

        // Initialize ContractService
        const service = new ContractService(connection, wallet as AnchorWallet);
        setContractService(service);
    }, [connection, publicKey, wallet]);

    return contractService;
};
