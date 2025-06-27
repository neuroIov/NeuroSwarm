import React, { useEffect, useRef, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import { Button } from "@/components/ui/button";

import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { useSession } from "./hooks/useSession";
import { WalletButton } from "./components/WalletButton";
import { useSelector } from "react-redux";
import { RootState, useAppDispatch, store } from "./store";
import { 
  syncUptime, 
  updateUptime, 
  checkPendingSyncOperations, 
  getLastActiveNodeId,
  saveLastActiveNodeId
} from "./store/slices/nodeSlice";
import { useToast } from "@/components/ui/use-toast"; // ✅ added
import { getSwarmSupabase, getTaskSupabase } from "./lib/supabase-client";
import { updatePlan } from "./store/slices/sessionSlice";
import { ConnectAppModal } from "./components/ConnectAppModal";

const queryClient = new QueryClient();

const AppContent = () => {
  const { session, logUserActivity, subscriptionTier } = useSession();
  const userProfile = session?.userProfile;
  const taskSupabase = getTaskSupabase();
  const swarmSupabase = getSwarmSupabase();
  const dispatch = useAppDispatch();
  const { toast } = useToast(); // ✅ added
  const { isActive, remainingFreeTierTime, nodeId } = useSelector(
    (state: RootState) => state.node
  );
  const hasShownLimitToast = useRef(false);
  const [showConnectModal, setShowConnectModal] = useState(false);

  // Check for pending sync operations when app loads
  useEffect(() => {
    const processPendingSyncs = async () => {
      try {
        await checkPendingSyncOperations();
      } catch (error) {
        console.error("Error processing pending sync operations:", error);
      }
    };
    
    processPendingSyncs();
  }, []);

  // Restore last active node on app load
  useEffect(() => {
    const restoreLastActiveNode = async () => {
      if (!userProfile?.id) return;
      
      const lastNodeId = getLastActiveNodeId();
      if (lastNodeId && !nodeId && !isActive) {
        try {
          console.log(`Restoring last active node: ${lastNodeId}`);
          
          // Fetch the node details from the database
          const { data, error } = await swarmSupabase
            .from("devices")
            .select("id, device_name, reward_tier, uptime")
            .eq("id", lastNodeId)
            .eq("owner", userProfile.id)
            .single();
            
          if (error) {
            console.error("Error fetching last active node:", error);
            return;
          }
          
          if (data) {
            console.log(`Found last active node: ${data.device_name} (${data.id})`);
            
            // Update the Redux store with this node's info
            // Note: We're not starting the node, just setting it as the current selection
            dispatch({
              type: 'node/switchCurrentNode',
              payload: {
                nodeId: data.id,
                nodeName: data.device_name,
                nodeType: 'desktop', // Default to desktop
                rewardTier: data.reward_tier || 'cpu',
                uptime: data.uptime || 0
              }
            });
          }
        } catch (error) {
          console.error("Error restoring last active node:", error);
        }
      }
    };
    
    restoreLastActiveNode();
  }, [userProfile?.id, nodeId, isActive, dispatch, swarmSupabase]);

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
            
            // Don't show connect modal automatically here since it's handled in signup flow
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
    const handleBeforeUnload = async (event: BeforeUnloadEvent) => {
      if (isActive) {
        console.log("App closing/refreshing - syncing uptime data...");
         
        // Get current node state
        const { nodeId, startTime, totalUptime } = store.getState().node;
        const userId = userProfile?.id;
         
        // Calculate current session uptime
        if (startTime && nodeId) {
          const sessionUptime = Math.floor((Date.now() - startTime) / 1000);
          const finalUptime = totalUptime + sessionUptime;
           
          // Store sync info in localStorage for recovery
          try {
            localStorage.setItem(`node-uptime-sync-pending-${nodeId}`, JSON.stringify({
              totalUptime: finalUptime,
              timestamp: Date.now()
            }));
             
            // Also store node stop info
            localStorage.setItem("nodeToStop", nodeId);
            localStorage.setItem("nodeStopTime", new Date().toISOString());
             
            console.log(`Stored pending sync for node ${nodeId}: ${finalUptime} seconds`);

            // Reset all pending and processing tasks for this user/node to pending with null user_id and node_id
            // Note: This is a fire-and-forget call since we can't await in beforeunload reliably
            if (userId && swarmSupabase) {
              swarmSupabase
                .from("tasks")
                .update({
                  status: "pending",
                  user_id: null,
                  node_id: null,
                  updated_at: new Date().toISOString()
                })
                .eq("user_id", userId)
                .eq("node_id", nodeId)
                .in("status", ["pending", "processing"])
                .then(({ error }) => {
                  if (error) {
                    console.error("Error resetting tasks on page unload:", error);
                  } else {
                    console.log("Successfully reset pending and processing tasks on page unload");
                  }
                });
            }
          } catch (e) {
            console.error("Failed to store sync info:", e);
          }
        }
         
        // Try to sync immediately
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
      } else if (document.visibilityState === "visible" && isActive) {
        // When page becomes visible again, check if we need to refresh data
        console.log("Page visible again - checking for updates");
        // This will trigger any necessary database fetches
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
