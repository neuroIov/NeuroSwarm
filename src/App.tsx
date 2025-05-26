import React, { useEffect, useRef } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SubscriptionNotice } from "@/components/SubscriptionNotice";

import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { useSession } from "./hooks/useSession";
import { WalletButton } from "./components/WalletButton";
import { useSelector } from "react-redux";
import { RootState, useAppDispatch } from "./store";
import { syncUptime, updateUptime } from "./store/slices/nodeSlice";
import { useToast } from "@/components/ui/use-toast"; // ✅ added
import { getSwarmSupabase } from "./lib/supabase-client";
import { store } from "./store";

const queryClient = new QueryClient();

const AppContent = () => {
  const { session, logUserActivity, subscriptionTier } = useSession();
  const userProfile = session?.userProfile;
  const dispatch = useAppDispatch();
  const { toast } = useToast(); // ✅ added
  const { isActive, remainingFreeTierTime } = useSelector(
    (state: RootState) => state.node
  ); // ✅ merged selectors
  const hasShownLimitToast = useRef(false); // ✅ to prevent duplicate toasts

  // ✅ Notify when time limit reached
  useEffect(() => {
    if (
      remainingFreeTierTime === 0 &&
      isActive &&
      !hasShownLimitToast.current
    ) {
      hasShownLimitToast.current = true;

      toast({
        title: "⚠️ Swarm Node Limit Reached",
        description: `Your ${subscriptionTier} tier session time is up. Please upgrade to continue.`,
        duration: 7000,
      });
    }
  }, [remainingFreeTierTime, isActive, subscriptionTier]);

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

  // Sync uptime on app close/refresh
  useEffect(() => {
    const handleBeforeUnload = async (event: BeforeUnloadEvent) => {
      if (isActive) {
        console.log("App closing/refreshing - syncing uptime data...");
        dispatch(syncUptime());

        // Also update device status to offline in database
        if (userProfile?.id) {
          try {
            const client = getSwarmSupabase();
            // Get the active nodeId from Redux store
            const nodeId = (store.getState() as RootState).node.nodeId;

            if (nodeId) {
              console.log(
                `Setting node ${nodeId} to offline in database before unload`
              );

              // Attempt to update the database
              await client
                .from("devices")
                .update({ status: "offline" })
                .eq("id", nodeId);
            }
          } catch (err) {
            console.error("Error updating device status on unload:", err);
          }
        }

        // Display confirmation dialog
        event.preventDefault();
        // Chrome requires returnValue to be set
        event.returnValue =
          "If you reload or close this tab, the current process will be terminated. Are you sure?";
        // For older browsers
        return "If you reload or close this tab, the current process will be terminated. Are you sure?";
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
  }, [isActive, dispatch, userProfile?.id]);

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
      <SubscriptionNotice />
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
