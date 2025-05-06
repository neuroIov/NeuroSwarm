import React, { useState } from "react";
import { Header } from "@/components/Header";
import { NetworkStats } from "@/components/NetworkStats";
import { NodeControlPanel } from "@/components/NodeControlPanel";
import { TaskPipeline } from "@/components/TaskPipeline";
import { EarningsDashboard } from "@/components/EarningsDashboard";
import { ReferralProgram } from "@/components/ReferralProgram";
import { GlobalStatistics } from "@/components/GlobalStatistics";
import { HowItWorks } from "@/components/HowItWorks";
import { Sidebar } from "@/components/Sidebar";

const Index = () => {
  const [activeSection, setActiveSection] = useState("dashboard");

  const renderContent = () => {
    switch (activeSection) {
      case "dashboard":
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
      case "earnings":
        return <EarningsDashboard />;
      case "referral":
        return <ReferralProgram />;
      case "global-stats":
        return <GlobalStatistics />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-swarm-darker-blue flex">
      {/* Sidebar - full height, fixed */}
      <Sidebar
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        className="fixed left-0 top-0 h-screen"
      />

      {/* Main content container with header and scrollable content */}
      <div className="flex-1 ml-64 flex flex-col">
        {/* Header at the top of main content */}
        <Header className="sticky top-0 z-50" />

        {/* Scrollable main content */}
        <main className="p-6 flex-1 overflow-auto">
          <div className="max-w-7xl mx-auto">{renderContent()}</div>
        </main>

        <HowItWorks />
      </div>
    </div>
  );
};

export default Index;
