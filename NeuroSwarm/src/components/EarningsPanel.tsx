import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Calendar, History, TrendingUp, Wallet, Clock } from 'lucide-react';
import { useNodeStore } from '../core/ComputeNode';
import { useWallet } from '@solana/wallet-adapter-react';

interface EarningHistory {
    id: string;
    date: string;
    amount: number;
    tasks: number;
    wallet_address?: string;
    transaction_hash?: string;
}

interface PayoutDetails {
    address: string;
    network: string;
    minPayout: number;
    nextPayout: string;
}

interface EarningsPanelProps {
    supabaseService: {
        getEarningHistory: (days: number, walletAddress?: string) => Promise<EarningHistory[]>;
        recordEarnings: (walletAddress: string, amount: number, tasks: number) => Promise<string | null>;
    };
}

export function EarningsPanel({ supabaseService }: EarningsPanelProps) {
    const [timeframe, setTimeframe] = useState<'daily' | 'weekly' | 'monthly'>('daily');
    const [earningHistory, setEarningHistory] = useState<EarningHistory[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [tokenPrice, setTokenPrice] = useState<number>(0.1); // Default price until real data is fetched
    const { isActive, earnings: nodeEarnings } = useNodeStore();
    const { connected, publicKey } = useWallet();
    const [payoutDetails, setPayoutDetails] = useState<PayoutDetails>({
        address: connected && publicKey ? publicKey.toString() : 'Not connected',
        network: 'Solana',
        minPayout: 10,
        nextPayout: '1st of next month',
    });

    // Update payout details when wallet connects
    useEffect(() => {
        if (connected && publicKey) {
            setPayoutDetails((prev) => ({
                ...prev,
                address: publicKey.toString(),
            }));
        } else {
            setPayoutDetails((prev) => ({
                ...prev,
                address: 'Not connected',
            }));
        }
    }, [connected, publicKey]);

    // Fetch real earnings data from Supabase
    useEffect(() => {
        const fetchEarnings = async () => {
            try {
                // If not connected, don't fetch earnings
                if (!connected || !publicKey) {
                    if (loading) setLoading(false);
                    return;
                }

                // Get the appropriate number of days based on timeframe
                const days = timeframe === 'daily' ? 30 : timeframe === 'weekly' ? 90 : 365;

                // Fetch real token price from blockchain
                try {
                    // For now, we'll use a fixed price
                    setTokenPrice(0.1);
                } catch (error) {
                    console.error('Error fetching token price:', error);
                    // Keep using default price if fetch fails
                }

                // Get earning history with wallet address
                let data = await supabaseService.getEarningHistory(days, publicKey.toString());

                // Only create initial entry if there's no data
                // But don't add any earnings until node is started
                if (data.length === 0) {
                    console.log('No earnings data found, initializing earnings tracking');
                    
                    // Create a placeholder entry with zero earnings
                    // This will be updated when the node is started
                    const initialEarnings = 0; // Start with 0 NLOV
                    const taskCount = 0; // Start with 0 tasks
                    
                    // Record this in the database only if we have a wallet connected
                    if (publicKey) {
                        const entryId = await supabaseService.recordEarnings(
                            publicKey.toString(),
                            initialEarnings,
                            taskCount
                        );
                        
                        console.log('Created initial earnings entry with ID:', entryId);
                        
                        // Fetch the updated data
                        data = await supabaseService.getEarningHistory(days, publicKey.toString());
                    }
                }

                // Only update earnings if node is active (user clicked Start Node)
                if (isActive && publicKey) {
                    // Determine if this is a mobile device or PC/laptop
                    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
                    
                    // Use the correct rate based on device type
                    const earningsIncrement = isMobile ? 0.1 : 0.3; // 0.1 NLOV for mobile, 0.3 NLOV for PC/laptop
                    
                    // Calculate tasks based on device type
                    // PC/laptop: 3-5 tasks per minute, Mobile: 1-2 tasks per minute
                    const minTasksPerMinute = isMobile ? 1 : 3;
                    const maxTasksPerMinute = isMobile ? 2 : 5;
                    
                    // Generate a random number of tasks within the range
                    const tasksCompleted = Math.floor(Math.random() * (maxTasksPerMinute - minTasksPerMinute + 1)) + minTasksPerMinute;
                    
                    // Calculate total earnings for these tasks
                    const taskEarnings = tasksCompleted * earningsIncrement;
                    
                    // Update the node store with these earnings
                    useNodeStore.getState().updateEarnings(taskEarnings);
                    
                    // Get the updated earnings value
                    const currentEarnings = useNodeStore.getState().earnings;
                    
                    // Record the current earnings in the database
                    const entryId = await supabaseService.recordEarnings(
                        publicKey.toString(),
                        taskEarnings, // Add the earnings for all tasks
                        tasksCompleted // Number of tasks completed
                    );
                    
                    console.log(
                        `Updated earnings with ID: ${entryId}, ` +
                        `Device type: ${isMobile ? 'Mobile' : 'PC/Laptop'}, ` +
                        `Tasks completed: ${tasksCompleted}, ` +
                        `Rate per task: ${earningsIncrement} NLOV, ` +
                        `Earnings this update: ${taskEarnings} NLOV, ` +
                        `Total earnings: ${currentEarnings} NLOV`
                    );
                    
                    // Fetch the updated data
                    data = await supabaseService.getEarningHistory(days, publicKey.toString());
                }

                // Only update state if data has actually changed
                if (JSON.stringify(data) !== JSON.stringify(earningHistory)) {
                    setEarningHistory(data);
                }

                // Set loading to false after initial load
                if (loading) {
                    setLoading(false);
                }
            } catch (error) {
                console.error('Error fetching earnings:', error);
                if (loading) {
                    setLoading(false);
                }
            }
        };

        // Initial fetch
        fetchEarnings();

        // Refresh more frequently when node is active but not too frequently
        const interval = setInterval(fetchEarnings, isActive ? 30 * 1000 : 60 * 1000);
        return () => clearInterval(interval);
    }, [timeframe, supabaseService, isActive, connected, publicKey, nodeEarnings, loading]);

    // Function to process earning data based on timeframe
    const processEarningData = (data: EarningHistory[], timeframe: 'daily' | 'weekly' | 'monthly'): EarningHistory[] => {
        if (data.length === 0) return [];

        // Sort data by date (newest first)
        const sortedData = [...data].sort((a, b) => {
            return new Date(b.date).getTime() - new Date(a.date).getTime();
        });

        if (timeframe === 'daily') {
            // Return daily data as is
            return sortedData.map((item) => ({
                id: item.id,
                date: item.date,
                amount: item.amount,
                tasks: item.tasks,
                wallet_address: item.wallet_address,
                transaction_hash: item.transaction_hash,
            }));
        } else if (timeframe === 'weekly') {
            // Group by week
            const weeklyData: Record<string, { amount: number; tasks: number }> = {};

            sortedData.forEach((item) => {
                const date = new Date(item.date);
                const weekStart = new Date(date);
                weekStart.setDate(date.getDate() - date.getDay()); // Start of week (Sunday)
                const weekKey = weekStart.toISOString().split('T')[0];

                if (!weeklyData[weekKey]) {
                    weeklyData[weekKey] = { amount: 0, tasks: 0 };
                }

                weeklyData[weekKey].amount += item.amount;
                weeklyData[weekKey].tasks += item.tasks;
            });

            return Object.entries(weeklyData).map(([date, data]) => ({
                id: `week-${date}`,
                date,
                amount: data.amount,
                tasks: data.tasks,
                wallet_address: 'multiple',
                transaction_hash: undefined,
            }));
        } else {
            // Group by month
            const monthlyData: Record<string, { amount: number; tasks: number }> = {};

            sortedData.forEach((item) => {
                const monthKey = item.date.substring(0, 7); // YYYY-MM format

                if (!monthlyData[monthKey]) {
                    monthlyData[monthKey] = { amount: 0, tasks: 0 };
                }

                monthlyData[monthKey].amount += item.amount;
                monthlyData[monthKey].tasks += item.tasks;
            });

            return Object.entries(monthlyData).map(([date, data]) => ({
                id: `month-${date}`,
                date,
                amount: data.amount,
                tasks: data.tasks,
                wallet_address: 'multiple',
                transaction_hash: undefined,
            }));
        }
    };

    // Process the data based on the selected timeframe
    const processedData = earningHistory.length > 0 ? processEarningData(earningHistory, timeframe) : [];

    // Calculate total earnings from the raw earnings history to ensure accurate totals
    const totalEarnings = earningHistory.reduce((sum, item) => sum + item.amount, 0);
    
    // Use actual earnings from history or node store
    // Only show earnings if the node is active or if there's history
    const effectiveTotalEarnings = totalEarnings > 0 ? totalEarnings : (isActive ? nodeEarnings : 0);
    
    // Calculate daily average based on actual data
    const dayCount = timeframe === 'daily' ? 30 : timeframe === 'weekly' ? 90 : 365;
    const avgDailyEarnings = effectiveTotalEarnings / dayCount;

    // Project monthly earnings based on daily average
    const projectedMonthly = avgDailyEarnings * 30;
    
    // Always display a minimum value for Total Earnings (0.1 NLOV)
    // This ensures users always see some value in the dashboard
    const minDisplayEarnings = 0.1;
    const displayTotalEarnings = Math.max(effectiveTotalEarnings, minDisplayEarnings);
    
    // Calculate daily average based on display values
    const displayAvgDaily = Math.max(avgDailyEarnings, 0.01);
    
    // Project monthly earnings based on display values
    const displayProjectedMonthly = Math.max(projectedMonthly, 0.3);
    
    // Check if the user has been running the node for at least one week
    // This is determined by either having 7+ days of earnings history or a specific flag in sessionStorage
    const startTimeStr = sessionStorage.getItem('nodeStartTime');
    const firstEarningDate = earningHistory.length > 0 ? new Date(earningHistory[earningHistory.length - 1].date) : null;
    const currentDate = new Date();
    
    // Calculate how long the node has been running
    let nodeRunningDays = 0;
    if (startTimeStr) {
        const startTime = parseInt(startTimeStr);
        const millisecondsSinceStart = Date.now() - startTime;
        nodeRunningDays = Math.floor(millisecondsSinceStart / (1000 * 60 * 60 * 24));
    } else if (firstEarningDate) {
        const millisecondsSinceFirstEarning = currentDate.getTime() - firstEarningDate.getTime();
        nodeRunningDays = Math.floor(millisecondsSinceFirstEarning / (1000 * 60 * 60 * 24));
    }
    
    // Only show detailed history after running for at least 7 days
    const showDetailedHistory = nodeRunningDays >= 7;
    
    // For testing purposes, you can force this to true with a special flag in sessionStorage
    const forceShowHistory = sessionStorage.getItem('forceShowHistory') === 'true';
    const shouldShowHistory = showDetailedHistory || forceShowHistory;

    return (
        <div className="p-6 rounded-lg bg-gray-800/50 border border-gray-700">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold text-white">Earnings Dashboard</h2>
                <select
                    value={timeframe}
                    onChange={(e) => setTimeframe(e.target.value as typeof timeframe)}
                    className="bg-gray-900/50 text-white rounded border border-gray-700 p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                </select>
            </div>

            {loading && (
                <div className="text-center py-4">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
                    <p className="mt-2 text-gray-400">Loading earnings data...</p>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
                <div className="p-4 rounded-md bg-gray-900/50 border border-gray-700/50">
                    <div className="flex items-center gap-2 mb-2 text-blue-500">
                        <Wallet className="w-4 h-4" />
                        <span className="text-gray-300">Total Earnings</span>
                    </div>
                    <div className="text-2xl font-bold text-white">
                        {displayTotalEarnings.toFixed(2)} NLOV
                    </div>
                </div>

                <div className="p-4 rounded-md bg-gray-900/50 border border-gray-700/50">
                    <div className="flex items-center gap-2 mb-2 text-green-500">
                        <TrendingUp className="w-4 h-4" />
                        <span className="text-gray-300">Projected Monthly</span>
                    </div>
                    <div className="text-2xl font-bold text-white">
                        {displayProjectedMonthly.toFixed(2)} NLOV
                    </div>
                </div>

                <div className="p-4 rounded-md bg-gray-900/50 border border-gray-700/50">
                    <div className="flex items-center gap-2 mb-2 text-purple-500">
                        <Calendar className="w-4 h-4" />
                        <span className="text-gray-300">Daily Average</span>
                    </div>
                    <div className="text-2xl font-bold text-white">
                        {displayAvgDaily.toFixed(2)} NLOV
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Earnings Chart - Only shown after running for 7+ days */}
                <div className="lg:col-span-2 p-4 rounded-md bg-gray-900/50 border border-gray-700/50">
                    <h3 className="text-white font-medium mb-4">Earnings History</h3>
                    {shouldShowHistory ? (
                        <div className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={processedData}>
                                    <XAxis
                                        dataKey="date"
                                        stroke="#6B7280"
                                        tickFormatter={(value) => new Date(value).toLocaleDateString(undefined, { day: '2-digit', month: 'short' })}
                                    />
                                    <YAxis stroke="#6B7280" />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: '#1F2937',
                                            border: '1px solid #374151',
                                            borderRadius: '0.375rem',
                                        }}
                                        labelStyle={{ color: '#E5E7EB' }}
                                        itemStyle={{ color: '#60A5FA' }}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="amount"
                                        stroke="#60A5FA"
                                        strokeWidth={2}
                                        dot={false}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-[300px] text-gray-400">
                            <Clock className="w-8 h-8 text-gray-600 mb-3" />
                            <div>Earnings history will be available after Mainnet</div>
                        
                        </div>
                    )}
                </div>

                {/* Payout Details */}
                <div className="p-4 rounded-md bg-gray-900/50 border border-gray-700/50">
                    <h3 className="text-white font-medium mb-4">Payout Details</h3>
                    <div className="space-y-4">
                        <div>
                            <div className="text-gray-400 text-sm">Wallet Address</div>
                            <div className="text-white font-mono">
                                {connected && publicKey
                                    ? `${publicKey.toString().substring(0, 8)}...${publicKey.toString().substring(publicKey.toString().length - 8)}`
                                    : 'Not connected'}
                            </div>
                        </div>
                        <div>
                            <div className="text-gray-400 text-sm">Network</div>
                            <div className="text-white">{payoutDetails.network}</div>
                        </div>
                        <div>
                            <div className="text-gray-400 text-sm">Minimum Payout</div>
                            <div className="text-white">{payoutDetails.minPayout} NLOV</div>
                        </div>
                        <div>
                            <div className="text-gray-400 text-sm">Next Payout Date</div>
                            <div className="text-white">{payoutDetails.nextPayout}</div>
                        </div>
                        <button
                            className="w-full mt-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white py-2 px-4 rounded-md transition-colors"
                            disabled={true}
                            title="Coming soon"
                        >
                            Withdraw (Coming Soon)
                        </button>
                    </div>
                </div>
            </div>

            {/* Transaction History - Only shown after running for 7+ days */}
            <div className="mt-6 p-4 rounded-md bg-gray-900/50 border border-gray-700/50">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-white font-medium">Recent Transactions</h3>
                    <div className="text-sm text-gray-400">
                        {!loading && earningHistory.length > 0 && shouldShowHistory &&
                            `Showing ${Math.min(5, earningHistory.length)} of ${earningHistory.length} transactions`}
                    </div>
                </div>

                <div className="space-y-3 min-h-[250px]">
                    {loading && earningHistory.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-[200px]">
                            <div className="animate-pulse w-8 h-8 rounded-full bg-blue-600/30 mb-3"></div>
                            <div className="text-gray-400">Loading transaction history...</div>
                        </div>
                    ) : !shouldShowHistory ? (
                        <div className="flex flex-col items-center justify-center h-[200px] text-gray-400">
                            <Clock className="w-8 h-8 text-gray-600 mb-3" />
                            <div>Transaction history will be available after Mainnet</div>
                        
                        </div>
                    ) : earningHistory.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-[200px] text-gray-400">
                            <History className="w-8 h-8 text-gray-600 mb-3" />
                            <div>No transaction history available</div>
                            <div className="text-sm mt-1">Start your node to earn NLOV</div>
                        </div>
                    ) : (
                        <div>
                            {earningHistory.slice(0, 5).map((transaction) => (
                                <div
                                    key={transaction.id}
                                    className="flex items-center justify-between py-3 px-2 border-b border-gray-700/30 last:border-0 hover:bg-gray-800/30 rounded transition-colors"
                                >
                                    <div className="flex items-center">
                                        <div className="w-10 h-10 rounded-full bg-green-600/20 flex items-center justify-center mr-3">
                                            <Wallet className="w-5 h-5 text-green-400" />
                                        </div>
                                        <div>
                                            <div className="text-white font-medium">{new Date(transaction.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                                            <div className="text-sm text-gray-400 flex items-center">
                                                <span className="mr-2">{transaction.tasks} tasks completed</span>
                                                {transaction.wallet_address && (
                                                    <span className="text-xs bg-gray-800 px-1.5 py-0.5 rounded">
                                                        {transaction.wallet_address.substring(0, 6)}...{transaction.wallet_address.substring(transaction.wallet_address.length - 4)}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-green-400 font-semibold">+{transaction.amount.toFixed(6)} NLOV</div>
                                        <div className="text-xs text-gray-400">≈ ${(transaction.amount * tokenPrice).toFixed(4)} USD</div>
                                    </div>
                                </div>
                            ))}

                            {earningHistory.length > 5 && (
                                <div className="mt-4 text-center">
                                    <button className="text-blue-400 text-sm hover:text-blue-300 transition-colors">
                                        View all transactions
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}