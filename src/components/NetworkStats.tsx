
import React from 'react';
import { ArrowUp } from 'lucide-react';
import { InfoTooltip } from './InfoTooltip';

type StatCardProps = {
  title: string;
  value: string | number;
  unit?: string;
  changePercentage?: number;
  info?: string;
};

const StatCard = ({ title, value, unit, changePercentage, info }: StatCardProps) => {
  return (
    <div className="stat-card">
      <div className="flex justify-between items-start mb-2">
        <div className="text-slate-400 flex items-center gap-1">
          {title} 
          {info && <InfoTooltip content={info} />}
        </div>
      </div>
      <div className="flex flex-col">
        <div className="text-2xl font-bold flex items-baseline gap-1">
          {value} 
          {unit && <span className="text-sm text-slate-400">{unit}</span>}
        </div>
        {changePercentage !== undefined && (
          <div className="flex items-center text-sm text-green-400 mt-1">
            <ArrowUp className="w-3 h-3 mr-1" />
            {changePercentage}%
          </div>
        )}
      </div>
    </div>
  );
};

export const NetworkStats = () => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <StatCard 
        title="Total Nodes" 
        value={65} 
        unit="nodes"
        changePercentage={5.0}
        info="Total number of registered nodes across the Swarm network"
      />
      <StatCard 
        title="Active Nodes" 
        value={45} 
        unit="nodes"
        changePercentage={3.0}
        info="Currently active nodes processing tasks on the network"
      />
      <StatCard 
        title="Network Load" 
        value={60} 
        unit="%"
        changePercentage={2.0}
        info="Current utilization of the network's total processing capacity"
      />
      <StatCard 
        title="Uptime" 
        value="9h 56m"
        changePercentage={5.0}
        info="How long your nodes have been running in this session"
      />
    </div>
  );
};
