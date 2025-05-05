import { motion } from 'framer-motion';
import CountUp from 'react-countup';
import { useNetworkStore } from '../core/ComputeNetwork';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { SwarmStats } from './SwarmStats';
import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useComputeToken } from '../hooks/useComputeToken';
import { NodeStats, TaskStats } from '../hooks/useComputeToken';

const MetricCard = ({ title, value, unit, change }: { 
    title: string; 
    value: number; 
    unit: string;
    change?: number;
}) => (
    <motion.div
        whileHover={{ scale: 1.02 }}
        className="bg-gradient-to-br from-gray-900 to-gray-800 p-6 rounded-xl shadow-xl"
    >
        <h3 className="text-gray-400 mb-2">{title}</h3>
        <div className="flex items-end space-x-2">
            <span className="text-2xl font-bold text-white">
                <CountUp end={value} decimals={2} duration={2} />
            </span>
            <span className="text-gray-400 text-sm mb-1">{unit}</span>
        </div>
        {change && (
            <div className={`text-sm ${change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {change >= 0 ? '↑' : '↓'} {Math.abs(change)}%
            </div>
        )}
    </motion.div>
);

const Dashboard = () => {
    const { totalNodes, activeNodes, networkLoad, networkEfficiency, rewardPool } = useNetworkStore();
    const { publicKey } = useWallet();
    const computeToken = useComputeToken();
    
    const [nodeStats, setNodeStats] = useState({
        highRep: 0,
        medRep: 0,
        lowRep: 0,
        banned: 0
    });

    const [taskStats, setTaskStats] = useState({
        completed: 0,
        failed: 0,
        pending: 0,
        avgComplexity: 0
    });

    useEffect(() => {
        if (!publicKey || !computeToken) return;

        const fetchStats = async () => {
            try {
                const devices = await computeToken.getAllDevices();
                
                // Calculate node reputation stats
                const stats = {
                    highRep: 0,
                    medRep: 0,
                    lowRep: 0,
                    banned: 0
                };

                devices.forEach(device => {
                    const totalRewards = device.account.totalRewards.toNumber();
                    if (device.account.isBanned) {
                        stats.banned++;
                    } else if (totalRewards > 1000) {
                        stats.highRep++;
                    } else if (totalRewards > 100) {
                        stats.medRep++;
                    } else {
                        stats.lowRep++;
                    }
                });

                setNodeStats(stats);

                // Calculate task stats
                const state = await computeToken.getState();
                setTaskStats({
                    completed: state.completedTasks.toNumber(),
                    failed: state.failedTasks.toNumber(),
                    pending: state.pendingTasks.toNumber(),
                    avgComplexity: state.averageComplexity.toNumber()
                });
            } catch (error) {
                console.error('Error fetching stats:', error);
            }
        };

        fetchStats();
        const interval = setInterval(fetchStats, 5000);
        return () => clearInterval(interval);
    }, [publicKey, computeToken]);

    const [performanceData, setPerformanceData] = useState<Array<{ time: string; load: number; efficiency: number; }>>([]);

    useEffect(() => {
        if (!publicKey || !computeToken) return;

        const fetchPerformance = async () => {
            try {
                const devices = await computeToken.getAllDevices();
                const now = new Date();
                const data = [];

                // Create 6 data points for the last 24 hours
                for (let i = 0; i < 6; i++) {
                    const time = new Date(now.getTime() - (5 - i) * 4 * 60 * 60 * 1000);
                    const timeStr = time.getHours().toString().padStart(2, '0') + ':00';

                    // Calculate load and efficiency for active devices at this time
                    const activeDevices = devices.filter(d => d.account.isActive);
                    const load = activeDevices.reduce((sum, d) => sum + d.account.hashRate.toNumber(), 0) / (devices.length || 1);
                    const efficiency = activeDevices.reduce((sum, d) => sum + (d.account.totalRewards.toNumber() > 0 ? 100 : 0), 0) / (devices.length || 1);

                    data.push({ time: timeStr, load, efficiency });
                }

                setPerformanceData(data);
            } catch (error) {
                console.error('Error fetching performance data:', error);
            }
        };

        fetchPerformance();
        const interval = setInterval(fetchPerformance, 5000);
        return () => clearInterval(interval);
    }, [publicKey, computeToken]);

    useEffect(() => {
        const fetchStats = async () => {
            if (!computeToken || !publicKey) return;

            try {
                // Fetch node reputation stats
                const reputationData: NodeStats[] = await computeToken.getNodeReputationStats();
                setNodeStats({
                    highRep: reputationData.filter((n: NodeStats) => n.score >= 80).length,
                    medRep: reputationData.filter((n: NodeStats) => n.score >= 50 && n.score < 80).length,
                    lowRep: reputationData.filter((n: NodeStats) => n.score >= 20 && n.score < 50).length,
                    banned: reputationData.filter((n: NodeStats) => n.score < 20 || n.isBanned).length
                });

                // Fetch task statistics
                const tasks: TaskStats[] = await computeToken.getRecentTasks();
                setTaskStats({
                    completed: tasks.filter((t: TaskStats) => t.status === 'completed').length,
                    failed: tasks.filter((t: TaskStats) => t.status === 'failed').length,
                    pending: tasks.filter((t: TaskStats) => t.status === 'pending').length,
                    avgComplexity: tasks.reduce((acc: number, t: TaskStats) => acc + (t.complexity || 0), 0) / tasks.length
                });
            } catch (error) {
                console.error('Error fetching stats:', error);
            }
        };

        fetchStats();
        const interval = setInterval(fetchStats, 30000); // Update every 30s
        return () => clearInterval(interval);
    }, [computeToken, publicKey]);
    
    const reputationData = [
        { name: 'High Rep', value: nodeStats.highRep, color: '#10B981' },
        { name: 'Med Rep', value: nodeStats.medRep, color: '#F59E0B' },
        { name: 'Low Rep', value: nodeStats.lowRep, color: '#EF4444' },
        { name: 'Banned', value: nodeStats.banned, color: '#6B7280' }
    ];

    const taskData = [
        { name: 'Completed', value: taskStats.completed, color: '#10B981' },
        { name: 'Failed', value: taskStats.failed, color: '#EF4444' },
        { name: 'Pending', value: taskStats.pending, color: '#F59E0B' }
    ];

    return (
        <div className="p-6 space-y-6">
            <SwarmStats />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <MetricCard
                    title="Total Nodes"
                    value={totalNodes}
                    unit="nodes"
                />
                <MetricCard
                    title="Active Nodes"
                    value={activeNodes}
                    unit="nodes"
                    change={((activeNodes - totalNodes) / totalNodes) * 100}
                />
                <MetricCard
                    title="Network Load"
                    value={networkLoad}
                    unit="%"
                />
                <MetricCard
                    title="Network Efficiency"
                    value={networkEfficiency}
                    unit="%"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-gray-900 p-6 rounded-xl shadow-xl">
                    <h3 className="text-gray-400 mb-4">Node Reputation Distribution</h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={reputationData}
                                    dataKey="value"
                                    nameKey="name"
                                    cx="50%"
                                    cy="50%"
                                    outerRadius={80}
                                    label
                                >
                                    {reputationData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="bg-gray-900 p-6 rounded-xl shadow-xl">
                    <h3 className="text-gray-400 mb-4">Task Status Distribution</h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={taskData}
                                    dataKey="value"
                                    nameKey="name"
                                    cx="50%"
                                    cy="50%"
                                    outerRadius={80}
                                    label
                                >
                                    {taskData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="col-span-1 lg:col-span-2 bg-gray-900 p-6 rounded-xl shadow-xl">
                    <h3 className="text-gray-400 mb-4">Task Complexity Trend</h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart
                                data={performanceData}
                                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="time" />
                                <YAxis />
                                <Tooltip />
                                <Line
                                    type="monotone"
                                    dataKey="load"
                                    name="Network Load"
                                    stroke="#10B981"
                                    strokeWidth={2}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="efficiency"
                                    name="Efficiency"
                                    stroke="#F59E0B"
                                    strokeWidth={2}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <MetricCard
                    title="Average Task Complexity"
                    value={taskStats.avgComplexity}
                    unit="nodes"
                    change={5.2}
                />
                <MetricCard
                    title="Active Nodes"
                    value={activeNodes}
                    unit="nodes"
                    change={3.1}
                />
                <MetricCard
                    title="Network Load"
                    value={networkLoad}
                    unit="%"
                    change={-2.4}
                />
                <MetricCard
                    title="Reward Pool"
                    value={rewardPool}
                    unit="NLOV"
                    change={7.8}
                />
            </div>

            <div className="bg-gray-900 p-6 rounded-xl shadow-xl">
                <h3 className="text-xl font-bold text-white mb-4">Network Performance</h3>
                <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={performanceData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                            <XAxis 
                                dataKey="time" 
                                stroke="#9CA3AF"
                            />
                            <YAxis 
                                stroke="#9CA3AF"
                            />
                            <Tooltip 
                                contentStyle={{ 
                                    backgroundColor: '#1F2937',
                                    border: 'none',
                                    borderRadius: '0.5rem',
                                    color: '#F3F4F6'
                                }}
                            />
                            <Line 
                                type="monotone" 
                                dataKey="load" 
                                stroke="#10B981" 
                                strokeWidth={2}
                                dot={false}
                            />
                            <Line 
                                type="monotone" 
                                dataKey="efficiency" 
                                stroke="#3B82F6" 
                                strokeWidth={2}
                                dot={false}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-gray-900 p-6 rounded-xl shadow-xl">
                    <h3 className="text-xl font-bold text-white mb-4">Network Efficiency</h3>
                    <div className="flex items-center justify-center h-40">
                        <div className="relative w-40 h-40">
                            <svg className="transform -rotate-90 w-full h-full">
                                <circle
                                    className="text-gray-700"
                                    strokeWidth="8"
                                    stroke="currentColor"
                                    fill="transparent"
                                    r="70"
                                    cx="80"
                                    cy="80"
                                />
                                <circle
                                    className="text-blue-500"
                                    strokeWidth="8"
                                    strokeDasharray={440}
                                    strokeDashoffset={440 * (1 - networkEfficiency / 100)}
                                    strokeLinecap="round"
                                    stroke="currentColor"
                                    fill="transparent"
                                    r="70"
                                    cx="80"
                                    cy="80"
                                />
                            </svg>
                            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                                <span className="text-2xl font-bold text-white">
                                    {networkEfficiency}%
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-gray-900 p-6 rounded-xl shadow-xl">
                    <h3 className="text-xl font-bold text-white mb-4">Resource Distribution</h3>
                    <div className="space-y-4">
                        <div>
                            <div className="flex justify-between text-sm text-gray-400 mb-1">
                                <span>CPU Usage</span>
                                <span>78%</span>
                            </div>
                            <div className="w-full bg-gray-700 rounded-full h-2">
                                <div className="bg-green-500 h-2 rounded-full" style={{ width: '78%' }}></div>
                            </div>
                        </div>
                        <div>
                            <div className="flex justify-between text-sm text-gray-400 mb-1">
                                <span>GPU Usage</span>
                                <span>92%</span>
                            </div>
                            <div className="w-full bg-gray-700 rounded-full h-2">
                                <div className="bg-blue-500 h-2 rounded-full" style={{ width: '92%' }}></div>
                            </div>
                        </div>
                        <div>
                            <div className="flex justify-between text-sm text-gray-400 mb-1">
                                <span>Memory Usage</span>
                                <span>64%</span>
                            </div>
                            <div className="w-full bg-gray-700 rounded-full h-2">
                                <div className="bg-purple-500 h-2 rounded-full" style={{ width: '64%' }}></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
