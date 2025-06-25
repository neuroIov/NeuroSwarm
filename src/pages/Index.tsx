import React, { useState, useEffect } from "react";
import {
  Routes,
  Route,
  Navigate,
  useLocation,
  useSearchParams,
} from "react-router-dom";
import { Header } from "@/components/Header";
import { NetworkStats } from "@/components/NetworkStats";
import { NodeControlPanel } from "@/components/NodeControlPanel";
import { TaskPipeline } from "@/components/TaskPipeline";
import { EarningsDashboard } from "@/components/EarningsDashboard";
import { ReferralProgram } from "@/components/ReferralProgram";
import { GlobalStatistics } from "@/components/GlobalStatistics";
import { HowItWorks } from "@/components/HowItWorks";
import { Sidebar } from "@/components/Sidebar";
import { useAppDispatch, useAppSelector } from "@/store";
import {
  updateUsername,
} from "@/store/slices/sessionSlice";
import { UsernameDialog } from "@/components/UsernameDialog";
import { ReferralCodeDialog } from "@/components/ReferralCodeDialog";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import HelpCenter from "@/components/HelpCenter";
import Settings from "@/components/Settings";
import { OnboardingTour } from "@/components/OnboardingTour";

const Dashboard = () => (
  <div className="flex flex-col gap-6">
    <NetworkStats />
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <NodeControlPanel />
      <TaskPipeline />
    </div>
  </div>
);

const Index = () => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [showUsernameDialog, setShowUsernameDialog] = useState(false);
  const [showReferralDialog, setShowReferralDialog] = useState(false);
  const [detectedRefCode, setDetectedRefCode] = useState<string>("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [runTour, setRunTour] = useState(false);
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const dispatch = useAppDispatch();
  const { userProfile, loading } = useAppSelector((state) => state.session);

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

  useEffect(() => {
    const hasVisitedBefore = localStorage.getItem('hasVisitedBefore');
    if (!hasVisitedBefore && isLoaded) {
      setTimeout(() => {
        setRunTour(true);
        localStorage.setItem('hasVisitedBefore', 'true');
      }, 1000); 
    }
  }, [isLoaded]);

  // Check for referral code in URL and show modal
  useEffect(() => {
    const refCode = searchParams.get("ref");
    if (refCode) {
      setDetectedRefCode(refCode);
      setShowReferralDialog(true);
      console.log(`Referral code detected: ${refCode}`);
    }
  }, [searchParams]);

  // Check if we need to show the username dialog
  useEffect(() => {
    // Show dialog if user is logged in but doesn't have a username
    if (userProfile && userProfile?.id && userProfile.user_name === null) {
      setShowUsernameDialog(true);
    }
  }, [userProfile, userProfile?.id]);

  const handleSaveUsername = (username: string) => {
    setShowUsernameDialog(false);
  };

  const handleCloseReferralDialog = () => {
    setShowReferralDialog(false);
  };

  const handleTourComplete = () => {
    setRunTour(false);
    localStorage.setItem('hasVisitedBefore', 'true');
    console.log('Tour completed or skipped');
  };

  return (
    <div className="min-h-screen flex relative overflow-hidden">
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
        onSectionChange={() => setSidebarOpen(false)}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        className={`fixed left-0 top-0 h-screen z-30 transition-transform duration-300 ease-in-out md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      />

      <div className="flex-1 md:ml-64 flex flex-col relative z-10 overflow-x-hidden">
        <Header
          className="sticky top-0 md:top-8 z-20"
          onMenuToggle={() => setSidebarOpen(!sidebarOpen)}
          sidebarOpen={sidebarOpen}
        />

        <main className="p-3 md:p-6 flex-1 overflow-auto mt-4 md:mt-8 overflow-x-hidden">
          <div
            className={`max-w-7xl mx-auto transition-opacity duration-500 ${
              isLoaded ? "opacity-100" : "opacity-0"
            }`}
          >
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<div className="welcome-step"><Dashboard /></div>} />
              <Route path="/earnings" element={<EarningsDashboard />} />
              <Route path="/referral" element={<ReferralProgram />} />
              <Route path="/global-stats" element={<GlobalStatistics />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/help-center" element={<HelpCenter />} />
            </Routes>
          </div>
        </main>

        <HowItWorks />
      </div>

      {/* Username dialog for new users */}
      <UsernameDialog
        isOpen={showUsernameDialog}
        onClose={() => setShowUsernameDialog(false)}
        onSave={handleSaveUsername}
        initialUsername={userProfile?.user_name || ""}
      />

      {/* Referral code detection dialog */}
      <ReferralCodeDialog
        isOpen={showReferralDialog}
        onClose={handleCloseReferralDialog}
        referralCode={detectedRefCode}
      />

      {/* Onboarding Tour */}
      <OnboardingTour run={runTour} onComplete={handleTourComplete} />
    </div>
  );
};

export default Index;
