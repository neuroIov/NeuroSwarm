import { ArrowUpIcon, ArrowDownIcon } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { NetworkStats as NetworkStatsType } from '../services/SupabaseService';
import { useNodeStore } from '../core/ComputeNode';
import { useWallet } from '@solana/wallet-adapter-react';

// Add type definition for the global window object
declare global {
    interface Window {
        contractService?: {
            getNetworkStats: () => Promise<{
                totalNodes: number;
                activeNodes: number;
                networkLoad: number;
                rewardPool: number;
                change24h?: {
                    totalNodes: number;
                    activeNodes: number;
                    networkLoad: number;
                    rewardPool: number;
                }
            }>;
        };
    }
}

interface StatCardProps {
    title: string;
    value: string | number;
    unit: string;
    change: number;
}

interface NetworkStatsProps {
    supabaseService: any;
}

// Helper function to format uptime in a human-readable format
const formatUptime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
};

function StatCard({ title, value, unit, change }: StatCardProps) {
    // Ensure change is a valid number
    const safeChange = typeof change === 'number' && !isNaN(change) ? change : 0;
    const isPositive = safeChange >= 0;
    const changeAbs = Math.abs(safeChange);
    
    // Display the value as is
    const displayValue = value;

    return (
        <div className="p-4 rounded-xl bg-[#0F1520] relative overflow-hidden">
            <div className="flex flex-col">
                <span className="text-gray-400 text-sm mb-1">{title}</span>
                <div className="flex items-baseline gap-2 mb-1">
                    <div className="text-xl font-bold">{displayValue}</div>
                    <span className="text-gray-400 text-sm ml-1">{unit}</span>
                </div>
                <div className={`flex items-center gap-1 ${isPositive ? 'text-[#4ADE80]' : 'text-[#F75555]'}`}>
                    {isPositive ? (
                        <ArrowUpIcon className="w-3 h-3" />
                    ) : (
                        <ArrowDownIcon className="w-3 h-3" />
                    )}
                    <span className="text-xs">{changeAbs.toFixed(1)}%</span>
                </div>
            </div>
        </div>
    );
}

export function NetworkStats({ supabaseService }: NetworkStatsProps) {
    const [networkStats, setNetworkStats] = useState<NetworkStatsType | null>(null);
    const [loading, setLoading] = useState(false);
    const { isActive } = useNodeStore();
    const { connected, publicKey } = useWallet();

    // Create a reference to track the uptime interval
    const uptimeIntervalRef = useRef<any>(null);
    
    useEffect(() => {
        // Set up an interval to update the uptime every second when node is active
        if (isActive && !uptimeIntervalRef.current) {
            uptimeIntervalRef.current = setInterval(() => {
                if (networkStats) {
                    const nodeUptime = useNodeStore.getState().getUptime();
                    setNetworkStats(prev => {
                        if (!prev) return prev;
                        return {
                            ...prev,
                            uptime_seconds: nodeUptime
                        };
                    });
                }
            }, 1000); // Update every second
        } else if (!isActive && uptimeIntervalRef.current) {
            // Clear the interval when node is stopped
            clearInterval(uptimeIntervalRef.current);
            uptimeIntervalRef.current = null;
        }
        
        return () => {
            if (uptimeIntervalRef.current) {
                clearInterval(uptimeIntervalRef.current);
                uptimeIntervalRef.current = null;
            }
        };
    }, [isActive, networkStats]);
    
    useEffect(() => {
        const fetchNetworkStats = async () => {
            setLoading(true);
            try {
                // Try to get real blockchain network stats first
                if (connected && publicKey && window.contractService) {
                    try {
                        // Fetch real network stats from the blockchain
                        const blockchainStats = await window.contractService.getNetworkStats();
                        
                        if (blockchainStats) {
                            // Get real uptime from the node store if node is active
                            const nodeUptime = isActive ? useNodeStore.getState().getUptime() : 0;
                            
                            const realStats = {
                                total_nodes: blockchainStats.totalNodes || 0,
                                active_nodes: blockchainStats.activeNodes || 0,
                                network_load: blockchainStats.networkLoad || 0,
                                reward_pool: blockchainStats.rewardPool || 0,
                                uptime_seconds: nodeUptime, // Use real node uptime
                                change_24h: {
                                    total_nodes: blockchainStats.change24h?.totalNodes || 0,
                                    active_nodes: blockchainStats.change24h?.activeNodes || 0,
                                    network_load: blockchainStats.change24h?.networkLoad || 0,
                                    reward_pool: blockchainStats.change24h?.rewardPool || 0,
                                    uptime_seconds: 0
                                }
                            };
                            setNetworkStats(realStats);
                            return;
                        }
                    } catch (error) {
                        console.error('Error fetching blockchain network stats:', error);
                        // Continue to fallback methods
                    }
                }
                
                // Fallback to Supabase if blockchain fetch fails
                const stats = await supabaseService.getNetworkStats();
                
                // If stats are missing, create a minimal valid object with default values
                if (!stats) {
                    // Get real uptime from the node store if node is active
                    const nodeUptime = isActive ? useNodeStore.getState().getUptime() : 0;
                    
                    // Use zeros for all values as default
                    const baseStats = {
                        total_nodes: 0,
                        active_nodes: isActive ? 1 : 0, // Count this node if active
                        network_load: isActive ? 5 : 0, // Show some load if active
                        reward_pool: 0,
                        uptime_seconds: nodeUptime, // Use real node uptime
                        change_24h: {
                            total_nodes: 0,
                            active_nodes: 0,
                            network_load: 0,
                            reward_pool: 0,
                            uptime_seconds: 0
                        }
                    };
                    setNetworkStats(baseStats);
                    return;
                }
                
                // If uptime is missing, use real node uptime if active
                if (!stats.uptime_seconds && isActive) {
                    stats.uptime_seconds = useNodeStore.getState().getUptime();
                } else if (!stats.uptime_seconds) {
                    stats.uptime_seconds = 0; // No uptime if node is not active
                }
                
                // If we have a connected wallet and active node, update the stats
                if (connected && isActive) {
                    // Increment active nodes count when our node is active
                    stats.active_nodes += 1;
                    
                    // Slightly increase network load to reflect our node's activity
                    stats.network_load = Math.min(100, stats.network_load + 2.5);
                }
                
                setNetworkStats(stats);
            } catch (error) {
                console.error('Error fetching network stats:', error);
                
                // Fallback to minimal stats if fetch fails
                const nodeUptime = isActive ? useNodeStore.getState().getUptime() : 0;
                
                const baseStats = {
                    total_nodes: 0,
                    active_nodes: 0,
                    network_load: 0,
                    reward_pool: 0,
                    uptime_seconds: nodeUptime,
                    change_24h: {
                        total_nodes: 0,
                        active_nodes: 0,
                        network_load: 0,
                        reward_pool: 0,
                        uptime_seconds: 0
                    }
                };
                setNetworkStats(baseStats);
            } finally {
                setLoading(false);
            }
        };

        // Function to fetch and update node uptime
        const fetchNodeUptime = async () => {
            if (!connected || !publicKey) return;
            
            try {
                // Generate a node ID from the wallet public key
                const nodeId = publicKey.toString();
                
                // Get the current uptime
                const uptime = await supabaseService.getNodeUptime(nodeId);
                
                // Update the network stats with this node's uptime
                setNetworkStats(prev => {
                    if (!prev) return prev;
                    return {
                        ...prev,
                        uptime_seconds: uptime
                    };
                });
            } catch (error) {
                console.error('Error updating node uptime:', error);
            }
        };

        fetchNetworkStats();
        fetchNodeUptime();

        // Refresh stats and uptime regularly
        const statsInterval = setInterval(fetchNetworkStats, isActive ? 10 * 1000 : 60 * 1000);
        const uptimeInterval = setInterval(fetchNodeUptime, 5 * 1000); // Update uptime more frequently (every 5 seconds)
        
        return () => {
            clearInterval(statsInterval);
            clearInterval(uptimeInterval);
        };
    }, [supabaseService, isActive, connected, publicKey]);

    // Format stats for display
    const statsForDisplay = [
        {
            title: 'Total\nNodes',
            value: networkStats?.total_nodes || 0,
            unit: 'nodes',
            change: networkStats?.change_24h.total_nodes || 0
        },
        {
            title: 'Active\nNodes',
            value: networkStats?.active_nodes || 0,
            unit: 'nodes',
            change: networkStats?.change_24h.active_nodes || 0
        },
        {
            title: 'Network\nLoad',
            value: networkStats?.network_load || 0,
            unit: '%',
            change: networkStats?.change_24h.network_load || 0
        },
        {
            title: 'Uptime',
            value: formatUptime(networkStats?.uptime_seconds || 0),
            unit: '',
            change: networkStats?.change_24h.uptime_seconds || 0
        }
    ];

    if (loading && !networkStats) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {[...Array(4)].map((_, i) => (
                    <div key={i} className="p-4 rounded-xl bg-[#0F1520] relative overflow-hidden animate-pulse">
                        <div className="h-20"></div>
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {statsForDisplay.map((stat) => (
                <StatCard
                    key={stat.title}
                    title={stat.title.replace('\n', ' ')}
                    value={stat.value}
                    unit={stat.unit}
                    change={stat.change}
                />
            ))}
        </div>
    );
}
