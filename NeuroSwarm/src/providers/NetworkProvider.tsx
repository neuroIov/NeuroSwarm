import { ReactNode, useEffect } from 'react';
import { useNetworkStore } from '../core/ComputeNetwork';
import { Connection } from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';
import { ContractService } from '../services/ContractService';





interface NetworkState {
    authority: string;
    totalDevices: { toNumber: () => number };
    totalTasks: { toNumber: () => number };
    totalRewardsDistributed: { toNumber: () => number };
    bump: number;
}

export function NetworkProvider({ children }: { children: ReactNode }) {
    const { updateStats } = useNetworkStore();
    const { publicKey, wallet } = useWallet();

    useEffect(() => {
        if (!publicKey || !wallet) return;

        console.log('Initializing NetworkProvider with real data...');
        
        // Use devnet for testing
        const endpoint = 'https://api.devnet.solana.com';
        const connection = new Connection(endpoint);
        const contractService = new ContractService(connection, wallet as any);

        const fetchNetworkStats = async () => {
            try {
                // Fetch network state and devices
                // Initialize contract service with correct program ID
                const programId = import.meta.env.VITE_PROGRAM_ID;
                if (!programId) {
                    throw new Error('Program ID not found in environment variables');
                }

                const [state, devices] = await Promise.all([
                    contractService.getState(),
                    contractService.getAllDevices()
                ]);
                
                console.log('Fetched state:', state);
                console.log('Fetched devices:', devices);

                // Log raw data for debugging
                console.log('Raw state:', state);
                console.log('Raw devices:', devices);

                // Cast state to NetworkState
                const networkState = state as unknown as NetworkState;
                
                // Convert BN to numbers and handle data properly
                const totalNodes = networkState.totalDevices.toNumber();
                const activeNodes = devices.filter((d) => d.isActive).length;

                // Calculate network metrics
                const totalHashRate = devices.reduce((sum, d) => 
                    sum + d.specs.hashRate, 0);
                const networkLoad = totalHashRate / (1000000); // Normalize to make it a percentage
                
                const networkEfficiency = devices.reduce((sum, d) => 
                    sum + (d.totalRewards > 0 ? 100 : 0), 0) / (totalNodes || 1);

                const stats = {
                    totalNodes,
                    activeNodes,
                    networkLoad,
                    networkEfficiency,
                    rewardPool: networkState.totalRewardsDistributed.toNumber() / 1e9 // Convert lamports to SOL
                };

                console.log('Calculated stats:', stats);
                updateStats(stats);
            } catch (error) {
                console.error('Error fetching network stats:', error);
            }
        };

        // Initial fetch
        fetchNetworkStats();

        // Set up interval for updates
        const interval = setInterval(fetchNetworkStats, 5000);

        console.log('NetworkProvider initialized successfully');
        return () => {
            console.log('Cleaning up NetworkProvider...');
            clearInterval(interval);
        };
    }, [publicKey, wallet, updateStats]);

    return <>{children}</>;
}
