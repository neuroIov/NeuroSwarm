
import React from 'react';
import { Header } from '@/components/Header';
import { NetworkStats } from '@/components/NetworkStats';
import { NodeControlPanel } from '@/components/NodeControlPanel';
import { TaskPipeline } from '@/components/TaskPipeline';
import { EarningsDashboard } from '@/components/EarningsDashboard';
import { ReferralProgram } from '@/components/ReferralProgram';
import { GlobalStatistics } from '@/components/GlobalStatistics';
import { HowItWorks } from '@/components/HowItWorks';

const Index = () => {
  return (
    <div className="min-h-screen bg-swarm-darker-blue">
      <Header />
      
      <main className="container py-6 px-4">
        <NetworkStats />
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <NodeControlPanel />
          <TaskPipeline />
        </div>
        
        <div className="mb-6">
          <EarningsDashboard />
        </div>
        
        <div className="mb-6">
          <ReferralProgram />
        </div>
        
        <div className="mb-6">
          <GlobalStatistics />
        </div>
      </main>
      
      <HowItWorks />
    </div>
  );
};

export default Index;
