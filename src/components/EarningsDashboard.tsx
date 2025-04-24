
import React from 'react';
import { Wallet, ArrowUpRight, Award, Clock } from 'lucide-react';
import { InfoTooltip } from './InfoTooltip';
import { Progress } from "@/components/ui/progress";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer 
} from 'recharts';
import { useNodes } from '@/contexts/NodeContext';

export const EarningsDashboard = () => {
  const { nodes, totalEarnings } = useNodes();
  
  // Generate fake historical earnings data
  const getEarningsData = () => {
    const days = 14; // Show last 14 days
    const data = [];
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      
      // Start lower and gradually increase, with some randomness
      const factor = 1 + ((days - i) / days); // Gradual increase factor
      const baseAmount = 2 + (Math.random() * 0.5); // Base amount
      
      data.push({
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        amount: +(baseAmount * factor).toFixed(2)
      });
    }
    
    return data;
  };
  
  const earningsData = getEarningsData();
  
  // Format number with 2 decimal places
  const formatNumber = (num: number) => {
    return num.toFixed(2);
  };
  
  // Get the daily average from the earnings data
  const dailyAverage = earningsData.reduce((sum, day) => sum + day.amount, 0) / earningsData.length;
  
  // Custom tooltip for the chart
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-800 p-2 border border-slate-700 rounded text-sm">
          <p className="text-white font-semibold">{label}</p>
          <p className="text-green-400">NLOV: {payload[0].value}</p>
        </div>
      );
    }
    return null;
  };
  
  // Calculate projected earnings based on current nodes and reward tiers
  const getProjectedEarnings = () => {
    const activeNodes = nodes.filter(node => node.status === 'running');
    if (activeNodes.length === 0) return 0;
    
    const hourlyRate = activeNodes.reduce((sum, node) => {
      // Base hourly rate * node multiplier
      return sum + (3 * node.multiplier);
    }, 0);
    
    return +(hourlyRate * 24 * 30).toFixed(2); // Monthly projection
  };
  
  const projectedMonthlyEarnings = getProjectedEarnings();
  
  return (
    <div className="stat-card">
      <div className="flex flex-col space-y-6">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold">Earnings Dashboard</h2>
          <InfoTooltip content="Track your NLOV token earnings and projections" />
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-800/30 p-4 rounded-lg">
            <h3 className="text-sm text-slate-400 mb-1 flex items-center">
              <Wallet className="w-4 h-4 mr-1" /> Total Earnings
            </h3>
            <div className="text-2xl font-bold">
              {formatNumber(totalEarnings)} NLOV
            </div>
            <Progress 
              value={Math.min(100, totalEarnings * 10)} 
              max={100} 
              className="h-1 mt-2" 
            />
          </div>
          
          <div className="bg-slate-800/30 p-4 rounded-lg">
            <h3 className="text-sm text-slate-400 mb-1 flex items-center">
              <Award className="w-4 h-4 mr-1" /> Daily Average
            </h3>
            <div className="text-2xl font-bold">
              {formatNumber(dailyAverage)} NLOV
            </div>
            <div className="flex items-center mt-2 text-xs">
              <ArrowUpRight className="w-3 h-3 text-green-400 mr-1" />
              <span className="text-green-400">+4.2%</span>
              <span className="text-slate-400 ml-1">from previous week</span>
            </div>
          </div>
          
          <div className="bg-slate-800/30 p-4 rounded-lg">
            <h3 className="text-sm text-slate-400 mb-1 flex items-center">
              <Clock className="w-4 h-4 mr-1" /> Monthly Projection
            </h3>
            <div className="text-2xl font-bold">
              {formatNumber(projectedMonthlyEarnings)} NLOV
            </div>
            <div className="flex items-center mt-2 text-xs text-slate-400">
              Based on {nodes.filter(n => n.status === 'running').length} active nodes
            </div>
          </div>
        </div>
        
        <div>
          <h3 className="text-sm text-slate-400 mb-3">Earnings History (14-day)</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={earningsData}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <XAxis 
                  dataKey="date" 
                  stroke="#475569" 
                  tick={{ fill: '#94a3b8' }} 
                  axisLine={{ stroke: '#334155' }}
                />
                <YAxis 
                  stroke="#475569" 
                  tick={{ fill: '#94a3b8' }} 
                  axisLine={{ stroke: '#334155' }}
                />
                <RechartsTooltip content={<CustomTooltip />} />
                <Line 
                  type="monotone" 
                  dataKey="amount" 
                  stroke="#10b981" 
                  activeDot={{ r: 8 }} 
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Per-device earnings breakdown */}
        {nodes.length > 0 && (
          <div>
            <h3 className="text-sm text-slate-400 mb-3">Per-Device Earnings</h3>
            <div className="overflow-hidden bg-slate-800/20 rounded-lg">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="py-3 px-4 text-left text-xs font-medium text-slate-400">Device</th>
                    <th className="py-3 px-4 text-left text-xs font-medium text-slate-400">Status</th>
                    <th className="py-3 px-4 text-left text-xs font-medium text-slate-400">Reward Tier</th>
                    <th className="py-3 px-4 text-left text-xs font-medium text-slate-400">Earnings</th>
                  </tr>
                </thead>
                <tbody>
                  {nodes.map((node) => (
                    <tr key={node.id} className="border-b border-slate-800">
                      <td className="py-2 px-4 text-sm">{node.name}</td>
                      <td className="py-2 px-4">
                        <span className={`inline-block w-2 h-2 rounded-full mr-2 ${
                          node.status === 'running' ? 'bg-green-500' : 
                          node.status === 'idle' ? 'bg-amber-500' : 'bg-red-500'
                        }`}></span>
                        <span className="text-xs capitalize">{node.status}</span>
                      </td>
                      <td className="py-2 px-4">
                        <span className="text-xs bg-purple-900/50 text-purple-300 py-1 px-2 rounded-full">
                          {node.rewardTier.toUpperCase()} ({node.multiplier}x)
                        </span>
                      </td>
                      <td className="py-2 px-4 font-medium">
                        {node.earnings.toFixed(2)} NLOV
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-slate-800/50">
                    <td colSpan={3} className="py-2 px-4 font-semibold text-sm">Total Earnings</td>
                    <td className="py-2 px-4 font-bold text-green-400">{totalEarnings.toFixed(2)} NLOV</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
