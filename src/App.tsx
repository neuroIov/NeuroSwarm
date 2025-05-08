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
import { syncUptime, updateUptime } from "./store/slices/nodeSlice";

const queryClient = new QueryClient();

const AppContent = () => {
  const { session, logUserActivity, userProfile, walletConnected } =
    useSession();
  const dispatch = useAppDispatch();
  const { isActive } = useSelector((state: RootState) => state.node);

  // Inject Google Analytics gtag.js script
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://www.googletagmanager.com/gtag/js?id=G-LC4ZMF7G9K";
    script.async = true;
    document.head.appendChild(script);

    const inlineScript = document.createElement("script");
    inlineScript.innerHTML = `
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'G-LC4ZMF7G9K');
    `;
    document.head.appendChild(inlineScript);

    return () => {
      document.head.removeChild(script);
      document.head.removeChild(inlineScript);
    };
  }, []);

  useEffect(() => {
    if (userProfile) {
      console.log("User profile in App:", userProfile);
    }
  }, [userProfile]);

  // Set up event listeners for app closure/refresh to sync uptime data
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (isActive) {
        console.log("App closing/refreshing - syncing uptime data...");
        dispatch(syncUptime());
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden" && isActive) {
        console.log("Page hidden - syncing uptime data");
        dispatch(syncUptime());
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const syncInterval = isActive
      ? setInterval(() => dispatch(syncUptime()), 5 * 60 * 1000)
      : null;

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (syncInterval) clearInterval(syncInterval);
    };
  }, [isActive, dispatch]);

  useEffect(() => {
    let uptimeInterval: NodeJS.Timeout | null = null;

    if (isActive) {
      uptimeInterval = setInterval(() => {
        dispatch(updateUptime());
      }, 1000);

      console.log("Started real-time uptime updates");
    }

    return () => {
      if (uptimeInterval) {
        clearInterval(uptimeInterval);
        console.log("Stopped real-time uptime updates");
      }
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