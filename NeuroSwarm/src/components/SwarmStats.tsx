import { useEffect } from 'react';
import { useNetworkStore } from '../core/ComputeNetwork';
import { Connection } from '@solana/web3.js';
import { useWallet, AnchorWallet } from '@solana/wallet-adapter-react';
import { ContractService } from '../services/ContractService';

export function SwarmStats() {
    const { totalNodes, activeNodes, networkLoad, networkEfficiency, rewardPool } = useNetworkStore();
    const { publicKey, wallet } = useWallet();

    useEffect(() => {
        if (!publicKey || !wallet) return;

        const connection = new Connection(import.meta.env.VITE_NETWORK || 'https://api.devnet.solana.com');
        const contractService = new ContractService(connection, wallet as AnchorWallet);

        const fetchStats = async () => {
            try {
                const [state, devices] = await Promise.all([
                    contractService.getState(),
                    contractService.getAllDevices()
                ]);

                const totalNodes = devices.length;
                const activeDevices = devices.filter(d => d.account.isActive).length;
                const networkLoad = devices.reduce((sum, d) => sum + d.account.hashRate.toNumber(), 0) / (totalNodes || 1);
                const networkEfficiency = devices.reduce((sum, d) => sum + (d.account.totalRewards.toNumber() > 0 ? 100 : 0), 0) / (totalNodes || 1);

                updateStats({
                    totalNodes,
                    activeNodes: activeDevices,
                    networkLoad,
                    networkEfficiency,
                    rewardPool: state.totalRewardsDistributed.toNumber()
                });
            } catch (error) {
                console.error('Error fetching network stats:', error);
            }
        };

        fetchStats();
        const interval = setInterval(fetchStats, 5000);
        return () => clearInterval(interval);
    }, [publicKey, wallet, updateStats]);

    // Calculate metrics based on network state
    const totalJobs = activeNodes;
    const totalRewards = rewardPool / 1e9; // Convert to SOL

    return (
        <div className="grid grid-cols-3 gap-6 p-6 rounded-lg bg-gray-800/50 border border-gray-700">
            <div className="flex flex-col items-center p-4 rounded-lg bg-gray-900/50 border border-gray-700">
                <h4 className="text-lg font-semibold text-gray-300 mb-2">Swarm Devices</h4>
                <p className="text-3xl font-bold text-blue-500">{totalNodes}</p>
            </div>
            <div className="flex flex-col items-center p-4 rounded-lg bg-gray-900/50 border border-gray-700">
                <h4 className="text-lg font-semibold text-gray-300 mb-2">Total Jobs Trained</h4>
                <p className="text-3xl font-bold text-green-500">{totalJobs}</p>
            </div>
            <div className="flex flex-col items-center p-4 rounded-lg bg-gray-900/50 border border-gray-700">
                <h4 className="text-lg font-semibold text-gray-300 mb-2">Total NLOV Rewards</h4>
                <p className="text-3xl font-bold text-purple-500">{totalRewards.toFixed(2)}</p>
            </div>
        </div>
    );
}
