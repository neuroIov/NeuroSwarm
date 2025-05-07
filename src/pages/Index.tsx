import React, { useState, useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Header } from "@/components/Header";
import { NetworkStats } from "@/components/NetworkStats";
import { NodeControlPanel } from "@/components/NodeControlPanel";
import { TaskPipeline } from "@/components/TaskPipeline";
import { EarningsDashboard } from "@/components/EarningsDashboard";
import { ReferralProgram } from "@/components/ReferralProgram";
import { GlobalStatistics } from "@/components/GlobalStatistics";
import { HowItWorks } from "@/components/HowItWorks";
import { Sidebar } from "@/components/Sidebar";
import { useSelector } from "react-redux";
import { RootState } from "@/store";

const Dashboard = () => (
  <div className="flex flex-col gap-6">
    <NetworkStats />
    <div className="grid grid-cols-2 gap-6">
      <NodeControlPanel />
      <TaskPipeline />
    </div>
  </div>
);

const Index = () => {
  const [isLoaded, setIsLoaded] = useState(false);
  const location = useLocation();

  const getActiveSection = () => {
    const path = location.pathname.split("/")[1];
    return path || "dashboard";
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoaded(true);
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen flex relative">
      {/* Radial background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute top-0 left-0 w-full h-full"
          style={{
            background:
              "linear-gradient(180deg, #000 0%, #021020 30%, #051a36 60%, #000 100%)",
            opacity: 1,
          }}
        />

        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full max-w-6xl max-h-6xl rounded-full bg-blue-900/8 blur-3xl" />
        <div className="absolute top-0 left-0 w-2/3 h-2/5 bg-blue-900/5 blur-3xl" />
        <div className="absolute bottom-0 right-0 w-3/5 h-1/3 rounded-full bg-blue-800/7 blur-2xl" />
      </div>

      {/* Main content with sidebar */}
      <Sidebar
        activeSection={getActiveSection()}
        onSectionChange={() => {}}
        className="fixed left-0 top-0 h-screen z-10"
      />

      <div className="flex-1 ml-64 flex flex-col relative z-10">
        <Header className="sticky top-8 z-20" />

        <main className="p-6 flex-1 overflow-auto mt-8">
          <div
            className={`max-w-7xl mx-auto transition-opacity duration-500 ${
              isLoaded ? "opacity-100" : "opacity-0"
            }`}
          >
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/earnings" element={<EarningsDashboard />} />
              <Route path="/referral" element={<ReferralProgram />} />
              <Route path="/global-stats" element={<GlobalStatistics />} />
            </Routes>
          </div>
        </main>

        <HowItWorks />
      </div>
    </div>
  );
};

export default Index;
