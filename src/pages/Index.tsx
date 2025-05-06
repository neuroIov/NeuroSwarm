
import React, { useState } from 'react';
import { Header } from '@/components/Header';
import { NetworkStats } from '@/components/NetworkStats';
import { NodeControlPanel } from '@/components/NodeControlPanel';
import { TaskPipeline } from '@/components/TaskPipeline';
import { EarningsDashboard } from '@/components/EarningsDashboard';
import { ReferralProgram } from '@/components/ReferralProgram';
import { GlobalStatistics } from '@/components/GlobalStatistics';
import { HowItWorks } from '@/components/HowItWorks';
import { Sidebar } from '@/components/Sidebar';

const Index = () => {
  const [activeSection, setActiveSection] = useState('dashboard');

  const renderContent = () => {
    switch (activeSection) {
      case 'dashboard':
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-6">
              <NetworkStats />
              <NodeControlPanel />
            </div>
            <div className="space-y-6">
              <TaskPipeline />
            </div>
          </div>
        );
      case 'earnings':
        return <EarningsDashboard />;
      case 'referral':
        return <ReferralProgram />;
      case 'global-stats':
        return <GlobalStatistics />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-swarm-darker-blue">
      <Header />
      <Sidebar activeSection={activeSection} onSectionChange={setActiveSection} />
      
      <main className="pl-64 py-6 px-6">
        <div className="max-w-7xl mx-auto">
          {renderContent()}
        </div>
      </main>
      
      <HowItWorks />
    </div>
  );
};

export default Index;
