import React, { useEffect, useRef, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SubscriptionNotice } from "@/components/SubscriptionNotice";
import { Button } from "@/components/ui/button";

import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { useSession } from "./hooks/useSession";
import { WalletButton } from "./components/WalletButton";
import { useSelector } from "react-redux";
import { RootState, useAppDispatch } from "./store";
import { syncUptime, updateUptime } from "./store/slices/nodeSlice";
import { useToast } from "@/components/ui/use-toast"; // ✅ added
import { getSwarmSupabase, getTaskSupabase } from "./lib/supabase-client";
import { store } from "./store";
import { updatePlan } from "./store/slices/sessionSlice";
import { ConnectAppModal } from "./components/ConnectAppModal";

const queryClient = new QueryClient();

const AppContent = () => {
  const { session, logUserActivity, subscriptionTier } = useSession();
  const userProfile = session?.userProfile;
  const taskSupabase = getTaskSupabase();
  const dispatch = useAppDispatch();
  const { toast } = useToast(); // ✅ added
  const { isActive, remainingFreeTierTime } = useSelector(
    (state: RootState) => state.node
  );
  const hasShownLimitToast = useRef(false);
  const [showConnectModal, setShowConnectModal] = useState(false);

  useEffect(() => {
    const fetchUserPlan = async () => {
      if (!userProfile?.id) return;

      try {
        const { data, error } = await taskSupabase
          .from("unified_users")
          .select("plan")
          .eq("swarm_user_id", userProfile.id)
          .single();

        if (error) {
          console.error("Error fetching user plan:", error);

          // Check if it's the JSON object error or no rows returned error
          if (
            error.message.includes("JSON object") ||
            error.message.includes("rows returned")
          ) {
            console.log(
              "No plan found or connection issue - setting default plan to free"
            );
            dispatch(updatePlan("free"));

            // Show modal to connect swarm with app for exclusive access
            setShowConnectModal(true);
          }
          return;
        }

        if (data && data.plan) {
          console.log("User plan fetched:", data.plan);
          dispatch(updatePlan(data.plan));
        } else {
          // If no plan data is found, set default to free
          dispatch(updatePlan("free"));
        }
      } catch (error) {
        console.error("Error fetching user plan:", error);
        // Set default plan to free on any error
        dispatch(updatePlan("free"));
      }
    };

    fetchUserPlan();
  }, [userProfile?.id, dispatch]);

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
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (isActive) {
        console.log("App closing/refreshing - syncing uptime data...");
        dispatch(syncUptime());

        // Display confirmation dialog
        const message =
          "If you reload or close this tab, the current process will be terminated. Are you sure?";
        event.preventDefault();
        event.returnValue = message; // Required for Chrome

        return message; // For older browsers
      }
    };

    // Visibility change handler for when tab is hidden but not closed
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
      <SubscriptionNotice />
      <ConnectAppModal
        isOpen={showConnectModal}
        onClose={() => setShowConnectModal(false)}
      />
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
