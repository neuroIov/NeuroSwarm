import React, { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { useSession } from "./hooks/useSession";
import { WalletButton } from "./components/WalletButton";
import { useSelector } from "react-redux";
import { RootState, useAppDispatch } from "./store";
import { syncUptime } from "./store/slices/nodeSlice";

const queryClient = new QueryClient();

const AppContent = () => {
  const { session, logUserActivity, userProfile, walletConnected } =
    useSession();
  const dispatch = useAppDispatch();
  const { isActive } = useSelector((state: RootState) => state.node);

  // Log when user profile changes
  useEffect(() => {
    if (userProfile) {
      console.log("User profile in App:", userProfile);
    }
  }, [userProfile]);

  // Set up event listeners for app closure/refresh to sync uptime data
  useEffect(() => {
    // Function to sync uptime before app is closed or refreshed
    const handleBeforeUnload = () => {
      if (isActive) {
        // Sync uptime data to the database
        console.log("App closing/refreshing - syncing uptime data...");
        dispatch(syncUptime());
      }
    };

    // Handle page visibility change (switching tabs, minimizing)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden" && isActive) {
        console.log("Page hidden - syncing uptime data");
        dispatch(syncUptime());
      }
    };

    // Add event listeners
    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Periodic sync every 5 minutes as a safety measure
    const syncInterval = isActive
      ? setInterval(() => dispatch(syncUptime()), 5 * 60 * 1000)
      : null;

    return () => {
      // Clean up event listeners
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (syncInterval) clearInterval(syncInterval);
    };
  }, [isActive, dispatch]);

  return (
    <>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/*" element={<Index />} />
          <Route path="/notfound" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </>
  );
};

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppContent />
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
