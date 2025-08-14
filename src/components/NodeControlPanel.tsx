"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Clock,
  Laptop,
  Monitor,
  Tablet,
  Smartphone,
  Scan,
  Loader2,
  AlertTriangle,
  Trash2,
} from "lucide-react";
import { VscDebugStart } from "react-icons/vsc";
import { IoStopOutline } from "react-icons/io5";
import { InfoTooltip } from "./InfoTooltip";
import { Button } from "./ui/button";
import { HardwareScanDialog } from "./HardwareScanDialog";
import { useAppDispatch, useAppSelector } from "@/lib/store";
import {
  registerDevice,
  startNode,
  stopNode,
  selectCurrentUptime,
  selectNode,
} from "@/lib/store/slices/nodeSlice";
import {
  selectTotalEarnings,
  selectSessionEarnings,
  selectEarnings,
  resetSessionEarnings,
} from "@/lib/store/slices/earningsSlice";
import { resetTasks } from "@/lib/store/slices/taskSlice";
import { formatUptime, TASK_CONFIG } from "@/lib/store/config";
import { HardwareInfo } from "@/lib/store/types";
import { useEarnings } from "@/hooks/useEarnings";
import { useNodeUptime } from "@/hooks/useNodeuptime";
import { useReferrals } from "@/hooks/useRefferals";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { createClient } from "@/utils/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePlan } from "@/contexts/PlanContext";
import { extractGPUModel } from "@/lib/gpuUtils";
import {
  trackNodeAction,
  trackDeviceRegistration,
  trackRewardClaim,
  trackError,
  trackEvent,
} from "@/lib/analytics";

interface NodeInfo {
  id: string;
  name: string;
  type: "desktop" | "laptop" | "tablet" | "mobile";
  brand?: string;
  model?: string;
  rewardTier: "webgpu" | "wasm" | "webgl" | "cpu";
  status: "idle" | "running" | "offline";
  cpuCores?: number;
  memory?: number | string;
  gpuInfo?: string;
}

interface SupabaseDevice {
  id: string;
  status: string;
  gpu_model: string;
  hash_rate: number;
  owner: string;
  created_at: string;
  uptime: number;
  stake_amount: number | null;
  reward_tier: "webgpu" | "wasm" | "webgl" | "cpu" | null;
  device_name: string | null;
  device_type: "desktop" | "laptop" | "mobile" | "tablet";
}

export const NodeControlPanel = () => {
  const { user, isLoggedIn, isLoading } = useAuth();
  const { canAddDevice, getMaxUptime, currentPlan, planDetails } = usePlan();
  const dispatch = useAppDispatch();
  const node = useAppSelector(selectNode);
  const earnings = useAppSelector(selectEarnings);
  const currentUptime = useAppSelector(selectCurrentUptime);
  const totalEarnings = useAppSelector(selectTotalEarnings);
  const sessionEarnings = useAppSelector(selectSessionEarnings);
  const supabase = createClient();

  const {
    claimTaskRewards,
    loadTotalEarnings,
    isClaimingReward,
    isLoading: isLoadingEarnings,
    claimError: earningsClaimError,
    claimSuccess,
    resetClaimState,
  } = useEarnings();

  const {
    initializeDeviceUptime,
    startDeviceUptime,
    stopDeviceUptime,
    getCurrentUptime,
    isDeviceRunning,
    getCompletedTasks,
    syncDeviceUptime,
    isUpdatingUptime,
    deviceUptimes: deviceUptimeList,
    // FIX: Add new utility functions from enhanced hook
    validateCurrentUptime,
    resetDeviceUptime,
    isDataStale,
  } = useNodeUptime();

  const { processReferralRewards } = useReferrals();

  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [showScanDialog, setShowScanDialog] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [showDeleteConfirmDialog, setShowDeleteConfirmDialog] = useState(false);
  const [isDeletingNode, setIsDeletingNode] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [isLoadingDevices, setIsLoadingDevices] = useState(true);
  const [hasFetchedDevices, setHasFetchedDevices] = useState(false);
  const [deletingNodeId, setDeletingNodeId] = useState<string | null>(null);
  const [uptimeExceeded, setUptimeExceeded] = useState(false);
  const [deviceLimitExceeded, setDeviceLimitExceeded] = useState(false);
  const [showUptimeLimitDialog, setShowUptimeLimitDialog] = useState(false);
  const [showClaimSuccess, setShowClaimSuccess] = useState(false);
  const [displayUptime, setDisplayUptime] = useState(0);
  const [dbUnclaimedRewards, setDbUnclaimedRewards] = useState(0);
  const [isLoadingUnclaimedRewards, setIsLoadingUnclaimedRewards] =
    useState(true);
  const [lastSavedSessionEarnings, setLastSavedSessionEarnings] = useState(0);
  const [isSavingToDb, setIsSavingToDb] = useState(false);

  // FIX: Enhanced refs for better tracking
  const initializedDevicesRef = useRef<Set<string>>(new Set());
  const lastAutoSaveRef = useRef<number>(0);
  const autoStopInProgressRef = useRef<boolean>(false);
  const deviceSyncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [nodes, setNodes] = useState<NodeInfo[]>([]);
  // FIX: Add new state for sync status tracking
  const [syncingDeviceId, setSyncingDeviceId] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<number>(0);

  // Prevent duplicate claims via double-click/race conditions
  const claimInProgressRef = useRef(false);
  const [isClaimingUi, setIsClaimingUi] = useState(false);

  // Helper function to get device icon
  const getDeviceIcon = (type: "desktop" | "laptop" | "tablet" | "mobile") => {
    switch (type) {
      case "desktop":
        return <Monitor className="w-6 h-6" />;
      case "laptop":
        return <Laptop className="w-6 h-6" />;
      case "tablet":
        return <Tablet className="w-6 h-6" />;
      case "mobile":
        return <Smartphone className="w-6 h-6" />;
    }
  };

  // FIX: Enhanced device status update function
  const updateDeviceStatus = async (
    deviceId: string,
    status: "online" | "offline" | "busy"
  ) => {
    try {
      const response = await fetch("/api/devices", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          device_id: deviceId,
          status: status,
          last_seen: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        console.error("Failed to update device status:", response.status);
        return false;
      }

      console.log(`✅ Device ${deviceId} status updated to ${status}`);
      return true;
    } catch (error) {
      console.error("Error updating device status:", error);
      return false;
    }
  };

  // FIX: Enhanced device deletion with better error handling
  const deleteDevice = async (deviceId: string) => {
    if (!deviceId || !user?.id) return;

    // FIX: Prevent deletion of running devices
    if (isDeviceRunning(deviceId)) {
      alert("Cannot delete a running device. Please stop the device first.");
      return false;
    }

    try {
      console.log(`🗑️ Deleting device: ${deviceId}`);

      const response = await fetch(`/api/devices?id=${deviceId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        console.error(
          "Error deleting device:",
          response.status,
          response.statusText
        );
        return false;
      } else {
        // Remove the node from the list
        setNodes((prevNodes) =>
          prevNodes.filter((node) => node.id !== deviceId)
        );

        // FIX: Better handling of selected node after deletion
        if (deviceId === selectedNodeId) {
          const remainingNodes = nodes.filter((node) => node.id !== deviceId);
          if (remainingNodes.length > 0) {
            const nextNodeId = remainingNodes[0].id;
            setSelectedNodeId(nextNodeId);
            // Sync the new selected device
            setTimeout(() => syncDeviceUptime(nextNodeId, false), 100);
          } else {
            setSelectedNodeId("");
          }
        }

        console.log(`✅ Device ${deviceId} deleted successfully`);
        return true;
      }
    } catch (err) {
      console.error("Exception while deleting device:", err);
      return false;
    }
  };

  // FIX: Enhanced device limit checking
  const checkDeviceLimit = useCallback(() => {
    const exceeded = !canAddDevice(nodes.length);
    console.log(
      `📱 Device limit check - Current: ${nodes.length}, Limit: ${planDetails.deviceLimit}, Exceeded: ${exceeded}`
    );
    return exceeded;
  }, [nodes.length, canAddDevice, planDetails.deviceLimit]);

  // FIX: CRITICAL - Enhanced uptime limit checking with server validation
  const checkUptimeLimit = useCallback(
    async (validateWithServer: boolean = false): Promise<boolean> => {
      if (!selectedNodeId) return false;

      let currentUptime;

      if (validateWithServer) {
        // FIX: Get server-validated uptime
        console.log("📡 Validating uptime with server...");
        currentUptime = await validateCurrentUptime(selectedNodeId);
      } else {
        currentUptime = getCurrentUptime(selectedNodeId);
      }

      const maxUptime = getMaxUptime();
      const exceeded = currentUptime >= maxUptime;

      console.log(
        `📊 Uptime check - Current: ${currentUptime}s, Max: ${maxUptime}s, Exceeded: ${exceeded}`
      );

      return exceeded;
    },
    [selectedNodeId, getCurrentUptime, getMaxUptime, validateCurrentUptime]
  );

  // FIX: Enhanced fetch unclaimed rewards with better error handling
  const fetchUnclaimedRewards = async () => {
    if (!user?.id) return;

    try {
      setIsLoadingUnclaimedRewards(true);
      console.log("💰 Fetching unclaimed rewards from server...");

      const response = await fetch("/api/unclaimed-rewards", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        const { unclaimed_reward } = await response.json();
        const dbRewards = unclaimed_reward || 0;
        setDbUnclaimedRewards(dbRewards);

        // FIX: On page load, reset session earnings to start fresh
        dispatch(resetSessionEarnings());
        setLastSavedSessionEarnings(0);

        console.log(`✅ Loaded unclaimed rewards from DB: ${dbRewards} SP`);
      } else {
        console.error("❌ Failed to fetch unclaimed rewards:", response.status);
      }
    } catch (error) {
      console.error("❌ Error fetching unclaimed rewards:", error);
    } finally {
      setIsLoadingUnclaimedRewards(false);
    }
  };

  // FIX: Enhanced save session earnings with better concurrency control
  const saveSessionEarningsToDb = async (forceSkipConcurrencyCheck = false) => {
    if (!user?.id || sessionEarnings <= 0) return false;

    // Prevent concurrent saves unless forced
    if (isSavingToDb && !forceSkipConcurrencyCheck) {
      console.log("Skipping save - already saving to DB");
      return false;
    }

    // Prevent rapid auto-saves (minimum 10 seconds between auto-saves)
    const now = Date.now();
    if (!forceSkipConcurrencyCheck && now - lastAutoSaveRef.current < 10000) {
      console.log("Skipping auto-save - too frequent");
      return false;
    }

    setIsSavingToDb(true);
    const currentSessionEarnings = sessionEarnings;

    try {
      // Calculate new total: existing DB rewards + current session earnings
      const newDbTotal = dbUnclaimedRewards + currentSessionEarnings;

      const response = await fetch("/api/unclaimed-rewards", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ amount: newDbTotal }),
      });

      if (response.ok) {
        console.log(
          `✅ Saved session earnings to DB: ${currentSessionEarnings} (new total: ${newDbTotal})`
        );

        // Update local state to reflect the save
        setDbUnclaimedRewards(newDbTotal);
        setLastSavedSessionEarnings(currentSessionEarnings);
        lastAutoSaveRef.current = now;

        // Clear session earnings since they're now saved to DB
        dispatch(resetSessionEarnings());

        return true;
      } else {
        console.error(
          "❌ Failed to save session earnings to DB:",
          response.status
        );
        return false;
      }
    } catch (error) {
      console.error("❌ Error saving session earnings to DB:", error);
      return false;
    } finally {
      setIsSavingToDb(false);
    }
  };

  // FIX: NEW - Real-time uptime monitoring with immediate auto-stop
  const startUptimeMonitoring = useCallback(() => {
    if (!selectedNodeId || !isDeviceRunning(selectedNodeId)) return null;

    console.log("🚨 Starting real-time uptime monitoring for auto-stop...");

    const monitoringInterval = setInterval(async () => {
      try {
        const currentUptime = getCurrentUptime(selectedNodeId);
        const maxUptime = getMaxUptime();
        const remainingTime = maxUptime - currentUptime;

        // FIX: Immediate auto-stop when limit is reached
        if (currentUptime >= maxUptime && !autoStopInProgressRef.current) {
          console.log(
            "🚨 UPTIME LIMIT EXCEEDED - IMMEDIATE AUTO-STOP TRIGGERED"
          );

          autoStopInProgressRef.current = true;
          setIsStopping(true);

          try {
            // Save session earnings before stopping
            if (sessionEarnings > 0) {
              console.log(
                "🛑 Auto-stop: Saving session earnings to DB:",
                sessionEarnings
              );
              const saveSuccess = await saveSessionEarningsToDb(true);
              if (!saveSuccess) {
                console.error(
                  "❌ Failed to save session earnings before auto-stopping node"
                );
              }
            }

            // Update device status to offline
            await updateDeviceStatus(selectedNodeId, "offline");

            // Stop uptime tracking and update server
            const result = await stopDeviceUptime(selectedNodeId);

            if (result.success) {
              console.log(
                "✅ Node auto-stopped and uptime updated successfully"
              );
            } else {
              console.error(
                "❌ Failed to update uptime during auto-stop:",
                result.error
              );
            }

            // Stop Redux state and tasks
            dispatch(stopNode());
            dispatch(resetTasks());

            setShowUptimeLimitDialog(true);
            console.log(
              `🚫 Auto-stop completed. Final uptime: ${currentUptime}s exceeded limit: ${maxUptime}s`
            );
          } catch (error) {
            console.error("❌ Error during auto-stop:", error);
          } finally {
            setIsStopping(false);
            autoStopInProgressRef.current = false;
          }

          // Clear the monitoring interval
          clearInterval(monitoringInterval);
          return;
        }

        // FIX: Early warning system
        if (remainingTime <= 60 && remainingTime > 0) {
          console.warn(
            `🚨 WARNING: Only ${remainingTime} seconds remaining before auto-stop!`
          );
        }

        // FIX: Sync with server when approaching limit (within 2 minutes or 95% of limit)
        if (remainingTime <= 120 || currentUptime >= maxUptime * 0.95) {
          console.log(
            "⚠️ Approaching uptime limit - syncing with server for accuracy..."
          );
          await syncDeviceUptime(selectedNodeId, true);
        }
      } catch (error) {
        console.error("❌ Error in uptime monitoring:", error);
      }
    }, 15000); // Check every 15 seconds for optimized response

    return monitoringInterval;
  }, [
    selectedNodeId,
    isDeviceRunning,
    getCurrentUptime,
    getMaxUptime,
    sessionEarnings,
    saveSessionEarningsToDb,
    updateDeviceStatus,
    stopDeviceUptime,
    syncDeviceUptime,
  ]);

  // FIX: Enhanced auto-stop logic with real-time monitoring
  useEffect(() => {
    if (!selectedNodeId) return;

    let monitoringInterval: NodeJS.Timeout | null = null;

    const checkAndSetupMonitoring = async () => {
      // FIX: Check if device is running and start monitoring
      if (isDeviceRunning(selectedNodeId) || node.isActive) {
        console.log("🔄 Device is running - starting uptime monitoring...");
        monitoringInterval = startUptimeMonitoring();
      }

      // FIX: Also check current uptime status for immediate action
      const isUptimeExceeded = await checkUptimeLimit(false);
      setUptimeExceeded(isUptimeExceeded);

      // FIX: Immediate auto-stop if already exceeded and device is running
      if (
        isUptimeExceeded &&
        (isDeviceRunning(selectedNodeId) || node.isActive) &&
        !autoStopInProgressRef.current
      ) {
        console.log("🚨 UPTIME ALREADY EXCEEDED - IMMEDIATE AUTO-STOP");

        autoStopInProgressRef.current = true;
        setIsStopping(true);

        try {
          // Save session earnings before stopping
          if (sessionEarnings > 0) {
            console.log(
              "🛑 Auto-stop: Saving session earnings to DB:",
              sessionEarnings
            );
            const saveSuccess = await saveSessionEarningsToDb(true);
            if (!saveSuccess) {
              console.error(
                "❌ Failed to save session earnings before auto-stopping node"
              );
            }
          }

          // Update device status to offline
          await updateDeviceStatus(selectedNodeId, "offline");

          // Stop uptime tracking and update server
          const result = await stopDeviceUptime(selectedNodeId);

          if (result.success) {
            console.log("✅ Node auto-stopped and uptime updated successfully");
          } else {
            console.error(
              "❌ Failed to update uptime during auto-stop:",
              result.error
            );
          }

          // Stop Redux state and tasks
          dispatch(stopNode());
          dispatch(resetTasks());

          setShowUptimeLimitDialog(true);
        } catch (error) {
          console.error("❌ Error during immediate auto-stop:", error);
        } finally {
          setIsStopping(false);
          autoStopInProgressRef.current = false;
        }
      }
    };

    checkAndSetupMonitoring();
    setDeviceLimitExceeded(checkDeviceLimit());

    // FIX: Cleanup monitoring interval on unmount or when device changes
    return () => {
      if (monitoringInterval) {
        clearInterval(monitoringInterval);
        console.log("🔄 Stopped uptime monitoring");
      }
    };
  }, [
    selectedNodeId,
    node.isActive,
    isDeviceRunning,
    checkUptimeLimit,
    startUptimeMonitoring,
    sessionEarnings,
    saveSessionEarningsToDb,
    updateDeviceStatus,
    stopDeviceUptime,
  ]);

  // FIX: Enhanced periodic validation for running devices (backup monitoring)
  useEffect(() => {
    if (!selectedNodeId || !isDeviceRunning(selectedNodeId)) return;

    console.log(
      "⏱️ Starting backup periodic uptime validation for running device..."
    );

    // FIX: More frequent validation for running devices
    const validateUptime = setInterval(async () => {
      try {
        const currentUptime = getCurrentUptime(selectedNodeId);
        const maxUptime = getMaxUptime();
        const remainingTime = maxUptime - currentUptime;

        console.log(
          `⏱️ Backup check - Uptime: ${currentUptime}s, Remaining: ${remainingTime}s`
        );

        // FIX: Emergency stop if somehow the main monitoring missed it
        if (currentUptime >= maxUptime && !autoStopInProgressRef.current) {
          console.log(
            "🚨 EMERGENCY STOP - Uptime limit exceeded in backup check"
          );

          autoStopInProgressRef.current = true;
          setIsStopping(true);

          try {
            // Save session earnings before stopping
            if (sessionEarnings > 0) {
              console.log(
                "🛑 Emergency stop: Saving session earnings to DB:",
                sessionEarnings
              );
              const saveSuccess = await saveSessionEarningsToDb(true);
              if (!saveSuccess) {
                console.error(
                  "❌ Failed to save session earnings before emergency stop"
                );
              }
            }

            // Update device status to offline
            await updateDeviceStatus(selectedNodeId, "offline");

            // Stop uptime tracking and update server
            const result = await stopDeviceUptime(selectedNodeId);

            if (result.success) {
              console.log("✅ Emergency stop completed successfully");
            } else {
              console.error(
                "❌ Failed to update uptime during emergency stop:",
                result.error
              );
            }

            // Stop Redux state and tasks
            dispatch(stopNode());
            dispatch(resetTasks());

            setShowUptimeLimitDialog(true);
          } catch (error) {
            console.error("❌ Error during emergency stop:", error);
          } finally {
            setIsStopping(false);
            autoStopInProgressRef.current = false;
          }
        }
      } catch (error) {
        console.error("Error in backup uptime validation:", error);
      }
    }, 30000); // Every 30 seconds as backup

    return () => {
      clearInterval(validateUptime);
      console.log("⏱️ Stopped backup periodic uptime validation");
    };
  }, [
    selectedNodeId,
    isDeviceRunning,
    getCurrentUptime,
    getMaxUptime,
    sessionEarnings,
    saveSessionEarningsToDb,
    updateDeviceStatus,
    stopDeviceUptime,
  ]);

  // FIX: Enhanced unclaimed rewards management
  const resetAllUnclaimedRewards = async () => {
    if (!user?.id) return false;

    try {
      const response = await fetch("/api/unclaimed-rewards", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ amount: 0 }),
      });

      if (response.ok) {
        console.log("✅ Reset all unclaimed rewards to 0");
        setDbUnclaimedRewards(0);
        setLastSavedSessionEarnings(0);
        dispatch(resetSessionEarnings());
        return true;
      } else {
        console.error("❌ Failed to reset unclaimed rewards:", response.status);
        return false;
      }
    } catch (error) {
      console.error("❌ Error resetting unclaimed rewards:", error);
      return false;
    }
  };

  // FIX: Enhanced mount effect with migration
  useEffect(() => {
    setIsMounted(true);

    // FIX: Clean up old storage keys on mount
    const migrateOldData = () => {
      const oldKeys = [
        "_device_metrics_store",
        "_device_metrics_store_v1",
        "_device_metrics_store_v2",
      ];

      oldKeys.forEach((key) => {
        try {
          const oldData = localStorage.getItem(key);
          if (oldData) {
            console.log(`🔄 Removing old uptime data: ${key}`);
            localStorage.removeItem(key);
          }
        } catch (error) {
          console.error(`Failed to remove old data ${key}:`, error);
        }
      });
    };

    migrateOldData();
  }, []);

  // FIX: Enhanced earnings loading with migration check
  useEffect(() => {
    if (user?.id && isMounted) {
      console.log("💰 Loading user earnings and unclaimed rewards...");
      loadTotalEarnings();
      fetchUnclaimedRewards();
    }
  }, [user?.id, isMounted]);

  // FIX: Enhanced auto-save with better concurrency control
  useEffect(() => {
    if (!user?.id || sessionEarnings <= 0 || !node.isActive) return;

    // FIX: More frequent auto-save for running nodes (every 45 seconds instead of 60)
    const autoSaveInterval = setInterval(() => {
      if (node.isActive || isDeviceRunning(selectedNodeId)) {
        const timeSinceLastSave = Date.now() - lastAutoSaveRef.current;

        // Optimized: Only auto-save if enough time has passed and not currently saving
        if (timeSinceLastSave >= 90000 && !isSavingToDb) {
          console.log(
            "🔄 Auto-save interval triggered - Session earnings:",
            sessionEarnings
          );
          saveSessionEarningsToDb(false);
        }
      }
    }, 90000); // Optimized from 45s to 90s for better performance

    return () => {
      clearInterval(autoSaveInterval);
      console.log("🔄 Auto-save interval cleared");
    };
  }, [sessionEarnings, user?.id, node.isActive, selectedNodeId, isSavingToDb]);

  // Show claim success message after successful claim
  useEffect(() => {
    if (claimSuccess) {
      setShowClaimSuccess(true);
      const timer = setTimeout(() => {
        setShowClaimSuccess(false);
        resetClaimState();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [claimSuccess, resetClaimState]);

  // FIX: Enhanced page unload handling with better error recovery
  useEffect(() => {
    const handleBeforeUnload = async () => {
      if (sessionEarnings > 0) {
        try {
          // FIX: Use both sendBeacon AND fetch for redundancy
          const newDbTotal = dbUnclaimedRewards + sessionEarnings;
          const data = JSON.stringify({ amount: newDbTotal });

          // Primary method: sendBeacon
          const blob = new Blob([data], { type: "application/json" });
          const beaconSent = navigator.sendBeacon(
            "/api/unclaimed-rewards",
            blob
          );

          console.log(
            `📤 Page unload: Beacon sent: ${beaconSent}, Session earnings: ${sessionEarnings}`
          );

          // FIX: Fallback method if beacon fails
          if (!beaconSent) {
            try {
              await fetch("/api/unclaimed-rewards", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: data,
                keepalive: true,
              });
              console.log("📤 Fallback fetch completed");
            } catch (fetchError) {
              console.error("❌ Both beacon and fetch failed:", fetchError);
            }
          }
        } catch (error) {
          console.error("❌ Error in beforeunload handler:", error);
        }
      }
    };

    const handleVisibilityChange = async () => {
      if (document.visibilityState === "hidden" && sessionEarnings > 0) {
        console.log(
          "📱 Page hidden: Saving session earnings:",
          sessionEarnings
        );

        // FIX: Force save with timeout protection
        try {
          const savePromise = saveSessionEarningsToDb(true);
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Save timeout")), 5000)
          );

          await Promise.race([savePromise, timeoutPromise]);
        } catch (error) {
          console.error("❌ Failed to save on visibility change:", error);
        }
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [sessionEarnings, dbUnclaimedRewards]);

  // For demo purposes - in a real implementation this would be derived from the selected node ID
  const selectedNode = nodes.find((node) => node.id === selectedNodeId);

  // FIX: Enhanced uptime display with server sync priority
  useEffect(() => {
    if (!selectedNodeId) return;

    const updateDisplayUptime = () => {
      const currentDeviceUptime = getCurrentUptime(selectedNodeId);
      setDisplayUptime(currentDeviceUptime);
    };

    // Update immediately
    updateDisplayUptime();

    // Update every 3 seconds for better performance
    const interval = setInterval(updateDisplayUptime, 3000);

    return () => clearInterval(interval);
  }, [selectedNodeId, getCurrentUptime]);

  // FIX: IMPROVED device sync when selected with debouncing and proper error handling
  useEffect(() => {
    if (!selectedNodeId || isDeviceRunning(selectedNodeId)) return;

    // Clear previous timeout
    if (deviceSyncTimeoutRef.current) {
      clearTimeout(deviceSyncTimeoutRef.current);
    }

    // FIX: Debounced sync with better error handling
    deviceSyncTimeoutRef.current = setTimeout(async () => {
      try {
        setSyncingDeviceId(selectedNodeId);
        console.log(`🔄 Syncing uptime for selected device: ${selectedNodeId}`);

        await syncDeviceUptime(selectedNodeId, false);
        setLastSyncTime(Date.now());

        console.log(`✅ Sync completed for device: ${selectedNodeId}`);
      } catch (error) {
        console.error(`❌ Sync failed for device ${selectedNodeId}:`, error);
      } finally {
        setSyncingDeviceId(null);
      }
    }, 300); // FIX: 300ms debounce to prevent rapid calls

    return () => {
      if (deviceSyncTimeoutRef.current) {
        clearTimeout(deviceSyncTimeoutRef.current);
      }
    };
  }, [selectedNodeId]);

  // FIX: Enhanced device initialization with proper server sync and migration
  useEffect(() => {
    if (!user?.id || hasFetchedDevices) return;

    const fetchUserDevices = async () => {
      setIsLoadingDevices(true);
      console.log("🔄 Starting device fetch and initialization...");

      try {
        const response = await fetch("/api/devices", {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          console.error(
            "Error fetching devices:",
            response.status,
            response.statusText
          );
          return;
        }

        const { devices } = await response.json();
        console.log(`📱 Fetched ${devices.length} devices from server`);

        const mappedNodes: NodeInfo[] = devices.map(
          (device: SupabaseDevice) => ({
            id: device.id,
            name:
              device.device_name ||
              `My ${
                device.device_type.charAt(0).toUpperCase() +
                device.device_type.slice(1)
              }`,
            type: device.device_type,
            rewardTier: device.reward_tier || "cpu",
            status:
              device.status === "online"
                ? "running"
                : device.status === "offline"
                ? "idle"
                : "offline",
            gpuInfo: device.gpu_model,
          })
        );

        setNodes(mappedNodes);

        // Register existing devices in Redux store
        if (devices.length > 0 && !node.isRegistered) {
          const firstDevice = devices[0];
          const hardwareInfo: HardwareInfo = {
            gpuInfo: firstDevice.gpu_model,
            rewardTier: firstDevice.reward_tier || "cpu",
            deviceType: firstDevice.device_type,
            cpuCores: 4,
            deviceMemory: "8GB",
            deviceGroup:
              firstDevice.device_type === "mobile" ||
              firstDevice.device_type === "tablet"
                ? "mobile_tablet"
                : "desktop_laptop",
          };
          dispatch(registerDevice(hardwareInfo));
        }

        // FIX: CRITICAL - Sequential device initialization with server-authoritative uptime
        for (const mappedNode of mappedNodes) {
          if (!initializedDevicesRef.current.has(mappedNode.id)) {
            const serverDevice = devices.find(
              (d: SupabaseDevice) => d.id === mappedNode.id
            );
            const serverUptime = Number(serverDevice?.uptime) || 0;

            console.log(
              `🔧 Initializing device ${mappedNode.id} with SERVER uptime: ${serverUptime}s`
            );

            // Initialize with server uptime as the ONLY source of truth
            await initializeDeviceUptime(mappedNode.id, serverUptime);
            initializedDevicesRef.current.add(mappedNode.id);

            // FIX: Small delay between device initializations to prevent conflicts
            await new Promise((resolve) => setTimeout(resolve, 150));
          }
        }

        // FIX: Force sync all devices after initialization to ensure accuracy
        console.log("🔄 Post-initialization sync for all devices...");
        for (const mappedNode of mappedNodes) {
          setTimeout(() => {
            syncDeviceUptime(mappedNode.id, true); // Force sync
          }, 100 * mappedNodes.indexOf(mappedNode)); // Stagger syncs
        }

        if (mappedNodes.length > 0 && !selectedNodeId) {
          setSelectedNodeId(mappedNodes[0].id);
        }

        setHasFetchedDevices(true);
        console.log(
          "✅ All devices initialized with server-authoritative uptime"
        );
      } catch (err) {
        console.error("Exception while fetching devices:", err);
      } finally {
        setIsLoadingDevices(false);
      }
    };

    fetchUserDevices();
  }, [user?.id, hasFetchedDevices, initializeDeviceUptime, syncDeviceUptime]);

  // FIX: Enhanced node selection with better validation
  const handleNodeSelect = (nodeId: string) => {
    // Allow switching devices for viewing purposes
    console.log(`🔄 Switching to device: ${nodeId}`);
    setSelectedNodeId(nodeId);

    // Track device selection
    const selectedDevice = nodes.find((node) => node.id === nodeId);
    if (selectedDevice) {
      trackEvent("device_selected", "device_management", selectedDevice.type);
    }

    // FIX: Sync the newly selected device immediately
    setTimeout(() => {
      syncDeviceUptime(nodeId, false);
    }, 100);
  };

  // FIX: Enhanced auto-stop logic with real-time monitoring
  useEffect(() => {
    if (!selectedNodeId) return;

    let monitoringInterval: NodeJS.Timeout | null = null;

    const checkAndSetupMonitoring = async () => {
      // FIX: Check if device is running and start monitoring
      if (isDeviceRunning(selectedNodeId) || node.isActive) {
        console.log("🔄 Device is running - starting uptime monitoring...");
        monitoringInterval = startUptimeMonitoring();
      }

      // FIX: Also check current uptime status for immediate action
      const isUptimeExceeded = await checkUptimeLimit(false);
      setUptimeExceeded(isUptimeExceeded);

      // FIX: Immediate auto-stop if already exceeded and device is running
      if (
        isUptimeExceeded &&
        (isDeviceRunning(selectedNodeId) || node.isActive) &&
        !autoStopInProgressRef.current
      ) {
        console.log("🚨 UPTIME ALREADY EXCEEDED - IMMEDIATE AUTO-STOP");

        autoStopInProgressRef.current = true;
        setIsStopping(true);

        try {
          // Save session earnings before stopping
          if (sessionEarnings > 0) {
            console.log(
              "🛑 Auto-stop: Saving session earnings to DB:",
              sessionEarnings
            );
            const saveSuccess = await saveSessionEarningsToDb(true);
            if (!saveSuccess) {
              console.error(
                "❌ Failed to save session earnings before auto-stopping node"
              );
            }
          }

          // Update device status to offline
          await updateDeviceStatus(selectedNodeId, "offline");

          // Stop uptime tracking and update server
          const result = await stopDeviceUptime(selectedNodeId);

          if (result.success) {
            console.log("✅ Node auto-stopped and uptime updated successfully");
          } else {
            console.error(
              "❌ Failed to update uptime during auto-stop:",
              result.error
            );
          }

          // Stop Redux state and tasks
          dispatch(stopNode());
          dispatch(resetTasks());

          setShowUptimeLimitDialog(true);
        } catch (error) {
          console.error("❌ Error during immediate auto-stop:", error);
        } finally {
          setIsStopping(false);
          autoStopInProgressRef.current = false;
        }
      }
    };

    checkAndSetupMonitoring();
    setDeviceLimitExceeded(checkDeviceLimit());

    // FIX: Cleanup monitoring interval on unmount or when device changes
    return () => {
      if (monitoringInterval) {
        clearInterval(monitoringInterval);
        console.log("🔄 Stopped uptime monitoring");
      }
    };
  }, [
    selectedNodeId,
    node.isActive,
    isDeviceRunning,
    checkUptimeLimit,
    startUptimeMonitoring,
    sessionEarnings,
    saveSessionEarningsToDb,
    updateDeviceStatus,
    stopDeviceUptime,
  ]);

  // FIX: Enhanced periodic validation for running devices (backup monitoring)
  useEffect(() => {
    if (!selectedNodeId || !isDeviceRunning(selectedNodeId)) return;

    console.log(
      "⏱️ Starting backup periodic uptime validation for running device..."
    );

    // FIX: More frequent validation for running devices
    const validateUptime = setInterval(async () => {
      try {
        const currentUptime = getCurrentUptime(selectedNodeId);
        const maxUptime = getMaxUptime();
        const remainingTime = maxUptime - currentUptime;

        console.log(
          `⏱️ Backup check - Uptime: ${currentUptime}s, Remaining: ${remainingTime}s`
        );

        // FIX: Emergency stop if somehow the main monitoring missed it
        if (currentUptime >= maxUptime && !autoStopInProgressRef.current) {
          console.log(
            "🚨 EMERGENCY STOP - Uptime limit exceeded in backup check"
          );

          autoStopInProgressRef.current = true;
          setIsStopping(true);

          try {
            // Save session earnings before stopping
            if (sessionEarnings > 0) {
              console.log(
                "🛑 Emergency stop: Saving session earnings to DB:",
                sessionEarnings
              );
              const saveSuccess = await saveSessionEarningsToDb(true);
              if (!saveSuccess) {
                console.error(
                  "❌ Failed to save session earnings before emergency stop"
                );
              }
            }

            // Update device status to offline
            await updateDeviceStatus(selectedNodeId, "offline");

            // Stop uptime tracking and update server
            const result = await stopDeviceUptime(selectedNodeId);

            if (result.success) {
              console.log("✅ Emergency stop completed successfully");
            } else {
              console.error(
                "❌ Failed to update uptime during emergency stop:",
                result.error
              );
            }

            // Stop Redux state and tasks
            dispatch(stopNode());
            dispatch(resetTasks());

            setShowUptimeLimitDialog(true);
          } catch (error) {
            console.error("❌ Error during emergency stop:", error);
          } finally {
            setIsStopping(false);
            autoStopInProgressRef.current = false;
          }
        }
      } catch (error) {
        console.error("Error in backup uptime validation:", error);
      }
    }, 30000); // Every 30 seconds as backup

    return () => {
      clearInterval(validateUptime);
      console.log("⏱️ Stopped backup periodic uptime validation");
    };
  }, [
    selectedNodeId,
    isDeviceRunning,
    getCurrentUptime,
    getMaxUptime,
    sessionEarnings,
    saveSessionEarningsToDb,
    updateDeviceStatus,
    stopDeviceUptime,
  ]);

  // FIX: ENHANCED toggle node status with pre-validation and server sync
  const toggleNodeStatus = async () => {
    if (!selectedNodeId) return;

    const deviceCurrentlyRunning = isDeviceRunning(selectedNodeId);

    if (deviceCurrentlyRunning || node.isActive) {
      // STOP LOGIC - Enhanced with better error handling
      setIsStopping(true);

      try {
        console.log(`🛑 Stopping node ${selectedNodeId}...`);

        // Track node stop
        const selectedDevice = nodes.find((node) => node.id === selectedNodeId);
        if (selectedDevice) {
          trackNodeAction("stop", selectedDevice.type);
        }

        // Update device status to offline
        await updateDeviceStatus(selectedNodeId, "offline");

        // Save any unsaved session earnings before stopping the node
        if (sessionEarnings > 0) {
          console.log(
            "🛑 Node stopping: Saving session earnings to DB:",
            sessionEarnings
          );
          const saveSuccess = await saveSessionEarningsToDb(true);
          if (!saveSuccess) {
            console.error(
              "❌ Failed to save session earnings before stopping node"
            );
          }
        }

        // Stop uptime tracking and update server
        const result = await stopDeviceUptime(selectedNodeId);

        if (result.success) {
          console.log("✅ Node stopped and uptime updated successfully");
        } else {
          console.error("❌ Failed to update uptime:", result.error);
        }
      } catch (error) {
        console.error("Error stopping node:", error);
      }

      setTimeout(() => {
        dispatch(stopNode());
        dispatch(resetTasks());
        setIsStopping(false);
        console.log("🛑 Node stop completed");
      }, 2000);
    } else {
      // START LOGIC - Check if any other device is running first
      const anyOtherDeviceRunning = deviceUptimeList.some(
        (device) => device.isRunning && device.deviceId !== selectedNodeId
      );

      if (anyOtherDeviceRunning) {
        const runningDevice = deviceUptimeList.find((d) => d.isRunning);
        const runningDeviceName =
          nodes.find((n) => n.id === runningDevice?.deviceId)?.name ||
          "Unknown Device";

        alert(
          `Cannot start this device while "${runningDeviceName}" is running. Please stop the current device first.`
        );
        return;
      }

      // START LOGIC - CRITICAL FIXES for uptime validation
      setIsStarting(true);

      try {
        // FIX: Step 1 - Force sync with server to get latest uptime BEFORE starting
        console.log("🚀 Starting node - syncing with server first...");
        setSyncingDeviceId(selectedNodeId);

        await syncDeviceUptime(selectedNodeId, true); // Force sync

        // FIX: Step 2 - Wait for sync to complete properly
        await new Promise((resolve) => setTimeout(resolve, 500));
        setSyncingDeviceId(null);

        // FIX: Step 3 - Get server-validated uptime
        const serverValidatedUptime = await validateCurrentUptime(
          selectedNodeId
        );
        const maxUptime = getMaxUptime();

        console.log(
          `📊 Pre-start validation - Server uptime: ${serverValidatedUptime}s, Max: ${maxUptime}s`
        );

        // FIX: Step 4 - Check limits with server-validated data
        if (serverValidatedUptime >= maxUptime) {
          setIsStarting(false);
          setUptimeExceeded(true);

          alert(
            `❌ Node cannot start. Uptime limit (${formatUptime(
              maxUptime
            )}) reached for ${currentPlan.toLowerCase()} plan.\n\nCurrent uptime: ${formatUptime(
              serverValidatedUptime
            )}\n\nUpgrade your plan to continue.`
          );
          return;
        }

        // Step 5 - Check if node is registered
        if (!node.isRegistered) {
          setIsStarting(false);
          setShowScanDialog(true);
          return;
        }

        // FIX: Step 6 - Proceed with start only after all validations pass
        console.log("✅ All pre-start checks passed, starting node...");

        // Track node start
        const selectedDevice = nodes.find((node) => node.id === selectedNodeId);
        if (selectedDevice) {
          trackNodeAction("start", selectedDevice.type);
        }

        await updateDeviceStatus(selectedNodeId, "busy");
        startDeviceUptime(selectedNodeId);

        setTimeout(() => {
          dispatch(startNode());
          setIsStarting(false);
          console.log("🟢 Node started successfully");
        }, 2000);
      } catch (error) {
        console.error("❌ Error starting node:", error);
        setIsStarting(false);
        setSyncingDeviceId(null);

        // FIX: Show user-friendly error message
        alert(
          "Failed to start node. Please check your connection and try again."
        );
      }
    }
  };

  // FIX: Enhanced scan complete handler with better validation
  const handleScanComplete = async (
    hardwareInfo: HardwareInfo,
    deviceName: string
  ) => {
    if (!user?.id) return;

    // FIX: Double-check device limit before adding
    if (checkDeviceLimit()) {
      alert(
        `❌ Device limit reached. Your ${currentPlan.toLowerCase()} plan allows ${
          planDetails.deviceLimit
        } device${
          planDetails.deviceLimit > 1 ? "s" : ""
        }.\n\nCurrent devices: ${
          nodes.length
        }\n\nUpgrade your plan to add more devices.`
      );
      return;
    }

    console.log("🔧 Registering new device:", deviceName);

    // Register the device in Redux store
    dispatch(registerDevice(hardwareInfo));

    // Track device registration
    trackDeviceRegistration(
      hardwareInfo.deviceType || "desktop",
      hardwareInfo.rewardTier
    );

    // Save the device using API route
    try {
      const response = await fetch("/api/devices", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          gpu_model: hardwareInfo.gpuInfo,
          device_type: hardwareInfo.deviceType || "desktop",
          reward_tier: hardwareInfo.rewardTier,
          device_name: deviceName,
        }),
      });

      if (!response.ok) {
        console.error(
          "Error saving device:",
          response.status,
          response.statusText
        );
        alert("❌ Failed to save device. Please try again.");
        return;
      } else {
        const { device } = await response.json();
        const newDevice = device as SupabaseDevice;
        const newNode: NodeInfo = {
          id: newDevice.id,
          name:
            newDevice.device_name ||
            `My ${
              newDevice.device_type.charAt(0).toUpperCase() +
              newDevice.device_type.slice(1)
            }`,
          type: newDevice.device_type,
          rewardTier: newDevice.reward_tier || "cpu",
          status: "idle",
          gpuInfo: newDevice.gpu_model,
        };

        setNodes((prevNodes) => [...prevNodes, newNode]);
        setSelectedNodeId(newDevice.id);

        // FIX: Initialize new device with server uptime (should be 0 for new devices)
        await initializeDeviceUptime(newDevice.id, 0);

        console.log(`✅ New device ${newDevice.id} added and initialized`);
      }
    } catch (err) {
      console.error("Exception while saving device:", err);
      alert("❌ An error occurred while saving the device. Please try again.");
    }
  };

  // FIX: Enhanced delete selected node function
  const deleteSelectedNode = async () => {
    if (!selectedNodeId || !user?.id) return;

    setIsDeletingNode(true);
    try {
      const success = await deleteDevice(selectedNodeId);
      if (success) {
        setShowDeleteConfirmDialog(false);

        // FIX: Show success message
        setTimeout(() => {
          console.log("✅ Device deleted successfully");
        }, 100);
      } else {
        alert("❌ Failed to delete device. Please try again.");
      }
    } catch (err) {
      console.error("Exception while deleting device:", err);
      alert("❌ An error occurred while deleting the device.");
    } finally {
      setIsDeletingNode(false);
    }
  };

  // FIX: Enhanced reward tier color function
  const getRewardTierColor = (tier: string) => {
    switch (tier) {
      case "webgpu":
        return "text-purple-400";
      case "wasm":
        return "text-blue-400";
      case "webgl":
        return "text-green-400";
      case "cpu":
        return "text-yellow-400";
      default:
        return "text-gray-400";
    }
  };

  // FIX: Enhanced claim reward handler with better error recovery
  const handleClaimReward = async () => {
    // Local UI lock to prevent duplicate claims
    if (claimInProgressRef.current || isClaimingReward) {
      return;
    }
    claimInProgressRef.current = true;
    setIsClaimingUi(true);

    const totalUnclaimedRewards = sessionEarnings + dbUnclaimedRewards;
    if (totalUnclaimedRewards <= 0) {
      setIsClaimingUi(false);
      claimInProgressRef.current = false;
      return;
    }

    try {
      console.log("💰 Starting reward claim process...");
      console.log(
        `Total to claim: ${totalUnclaimedRewards} (Session: ${sessionEarnings} + DB: ${dbUnclaimedRewards})`
      );

      // FIX: Enhanced pre-claim validation
      if (node.isActive || isDeviceRunning(selectedNodeId)) {
        alert(
          "❌ Cannot claim rewards while node is running. Please stop the node first."
        );
        // Release UI lock on early exit
        setIsClaimingUi(false);
        claimInProgressRef.current = false;
        return;
      }

      // First, save any unsaved session earnings to ensure we don't lose them
      if (sessionEarnings > 0) {
        console.log(
          "💾 Saving unsaved session earnings before claiming:",
          sessionEarnings
        );
        const saveSuccess = await saveSessionEarningsToDb(true);
        if (!saveSuccess) {
          console.error("❌ Failed to save session earnings before claiming");
          alert(
            "❌ Failed to save current session earnings. Please try again."
          );
          return;
        }

        // FIX: Wait for save to complete and update state
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      // Recalculate total after potential save
      const finalDbRewards =
        dbUnclaimedRewards + (sessionEarnings > 0 ? sessionEarnings : 0);

      console.log(`💰 Claiming final amount: ${finalDbRewards} SP`);

      // Claim the rewards
      const result = await claimTaskRewards(finalDbRewards);

      if (result) {
        // Track successful reward claim
        trackRewardClaim(finalDbRewards);

        // After successful claim, reset everything to 0
        const resetSuccess = await resetAllUnclaimedRewards();
        if (resetSuccess) {
          console.log("✅ Successfully claimed and reset all rewards");
        }
        // Ensure UI is synced with server after claim
        await fetchUnclaimedRewards();
      }
    } catch (error) {
      console.error("❌ Error in reward claiming process:", error);
      alert("❌ Failed to claim rewards. Please try again.");
    } finally {
      setIsClaimingUi(false);
      claimInProgressRef.current = false;
    }
  };

  // FIX: Enhanced uptime display component with sync status
  const renderUptimeCard = () => {
    const maxUptime = getMaxUptime();
    const isNearLimit = displayUptime >= maxUptime * 0.9;
    const progressPercentage = Math.min((displayUptime / maxUptime) * 100, 100);

    return (
      <div
        className={`p-4 rounded-xl flex flex-col ${
          uptimeExceeded
            ? "bg-red-900/20 border border-red-500/30"
            : isNearLimit
            ? "bg-yellow-900/20 border border-yellow-500/30"
            : "bg-[#1D1D33]"
        }`}
      >
        <div className="text-[#515194] text-xs mb-1 flex items-center justify-between">
          <span>Device Uptime</span>
          <div className="flex items-center gap-1">
            {/* FIX: Show sync status */}
            {syncingDeviceId === selectedNodeId && (
              <Loader2 className="w-3 h-3 animate-spin text-blue-400" />
            )}
            {uptimeExceeded && (
              <span className="text-red-400 text-xs font-medium">
                LIMIT REACHED
              </span>
            )}
            {isNearLimit && !uptimeExceeded && (
              <span className="text-yellow-400 text-xs font-medium">
                NEAR LIMIT
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center">
          <div className="icon-bg mt-2 icon-container flex items-center justify-center rounded-md p-2 mx-auto sm:mx-0">
            <Clock className="w-5 h-5 sm:w-7 sm:h-7 text-white z-10" />
          </div>
          <div className="flex flex-col mt-2 sm:ml-3 w-full">
            <div
              className={`text-lg font-medium text-center sm:text-left ${
                uptimeExceeded
                  ? "text-red-400"
                  : isNearLimit
                  ? "text-yellow-400"
                  : "text-white"
              }`}
            >
              {formatUptime(displayUptime)}
            </div>
            <div className="text-xs text-white/50 text-center sm:text-left">
              of {formatUptime(maxUptime)}
            </div>
            {/* FIX: Enhanced progress bar with better visual feedback */}
            <div className="w-full bg-gray-700 rounded-full h-1.5 mt-1">
              <div
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  uptimeExceeded
                    ? "bg-red-500"
                    : isNearLimit
                    ? "bg-yellow-500"
                    : "bg-green-500"
                }`}
                style={{ width: `${progressPercentage}%` }}
              ></div>
            </div>
            {/* FIX: Show detailed sync information */}
            {syncingDeviceId === selectedNodeId && (
              <div className="text-xs text-blue-400 text-center sm:text-left mt-1">
                Syncing with server...
              </div>
            )}
            {/* FIX: Show data staleness warning */}
            {selectedNodeId && isDataStale(selectedNodeId) && (
              <div className="text-xs text-yellow-400 text-center sm:text-left mt-1">
                ⚠️ Data may be outdated
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // FIX: Enhanced start button with better state management
  const renderStartStopButton = () => {
    const deviceCurrentlyRunning = isDeviceRunning(selectedNodeId);
    const isNodeActive = node.isActive || deviceCurrentlyRunning;
    const isProcessing = isStarting || isStopping || isUpdatingUptime;
    const isSyncing = syncingDeviceId === selectedNodeId;

    // FIX: Better disabled state logic
    const isDisabled =
      isProcessing ||
      !selectedNodeId ||
      isSyncing ||
      (uptimeExceeded && !isNodeActive) ||
      !isLoggedIn;

    const getButtonText = () => {
      if (isUpdatingUptime) return "Updating...";
      if (isStarting) return "Starting...";
      if (isStopping) return "Stopping...";
      if (isSyncing) return "Syncing...";

      if (isNodeActive) return "Stop Node";
      if (uptimeExceeded) return "Uptime Limit Reached";
      if (!isLoggedIn) return "Login Required";

      return "Start Node";
    };

    const getButtonIcon = () => {
      if (isProcessing || isSyncing) {
        return (
          <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2 animate-spin" />
        );
      }

      if (isNodeActive) {
        return <IoStopOutline className="text-white/90 ml-1 sm:ml-2" />;
      }

      if (uptimeExceeded) {
        return <AlertTriangle className="text-white/90 ml-1 sm:ml-2" />;
      }

      return <VscDebugStart className="text-white/90 ml-1 sm:ml-2" />;
    };

    const getButtonStyle = () => {
      if (isNodeActive) {
        return "bg-red-600 hover:bg-red-700 hover:shadow-red-500/30 shadow-red-500";
      }

      if (uptimeExceeded || !isLoggedIn) {
        return "bg-gray-600 hover:bg-gray-700 cursor-not-allowed opacity-50";
      }

      return "bg-green-600 hover:bg-green-700 hover:shadow-green-500/30 shadow-green-500";
    };

    return (
      <Button
        variant="default"
        disabled={isDisabled}
        onClick={toggleNodeStatus}
        className={`w-[22%] rounded-full transition-all duration-300 shadow-md hover:shadow-lg text-white text-xs sm:text-sm px-3 py-1 sm:px-4 sm:py-2 h-9 sm:h-10 hover:translate-y-[-0.5px] ${getButtonStyle()}`}
      >
        {getButtonText()}
        {getButtonIcon()}
      </Button>
    );
  };

  // FIX: Add cleanup effect for timeouts
  useEffect(() => {
    return () => {
      if (deviceSyncTimeoutRef.current) {
        clearTimeout(deviceSyncTimeoutRef.current);
      }
    };
  }, []);

  // FIX: Enhanced error boundary effect
  useEffect(() => {
    const handleError = (error: ErrorEvent) => {
      console.error("NodeControlPanel error:", error);
      // Could add error reporting here
    };

    window.addEventListener("error", handleError);
    return () => window.removeEventListener("error", handleError);
  }, []);

  return (
    <>
      <div className="node-control-panel p-2.5 sm:p-4 md:p-6 rounded-2xl sm:rounded-3xl stat-card overflow-x-hidden">
        <div className="flex flex-col">
          <div className="flex flex-row justify-between items-center gap-2 sm:gap-0 mb-3 sm:mb-6">
            <div className="flex items-center gap-1 sm:gap-2">
              <h2 className="text-sm sm:text-lg font-medium text-white/90">
                Node Control Panel
              </h2>
              <InfoTooltip content="Manage your computing nodes, start or stop them, and view performance metrics" />
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (deviceLimitExceeded) {
                  alert(
                    `Device limit reached. Your ${currentPlan.toLowerCase()} plan allows ${
                      planDetails.deviceLimit
                    } device${
                      planDetails.deviceLimit > 1 ? "s" : ""
                    }. Current: ${nodes.length}`
                  );
                  return;
                }
                setShowScanDialog(true);
              }}
              disabled={deviceLimitExceeded || !isLoggedIn}
              className={`gradient-button rounded-full text-xs sm:text-sm px-2 py-1 sm:px-3 sm:py-2 ${
                deviceLimitExceeded || !isLoggedIn
                  ? "opacity-50 cursor-not-allowed text-gray-400"
                  : "text-[#8BBEFF]"
              }`}
            >
              <Scan className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
              Scan Device
            </Button>
          </div>

          <div className="flex flex-row justify-between gap-2 sm:gap-4 items-center mb-3 sm:mb-6">
            <Select
              value={selectedNodeId}
              onValueChange={handleNodeSelect}
              open={isOpen}
              onOpenChange={setIsOpen}
            >
              <SelectTrigger className="w-[75%] bg-[#1D1D33] border-0 rounded-full text-[#515194] text-xs sm:text-sm h-9 sm:h-10">
                <div className="flex items-center gap-2">
                  {selectedNode && (
                    <>
                      {getDeviceIcon(selectedNode.type)}
                      <span className="truncate">{selectedNode.name}</span>
                      {/* FIX: Enhanced running indicator with sync status */}
                      {isDeviceRunning(selectedNodeId) && (
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                          {syncingDeviceId === selectedNodeId && (
                            <Loader2 className="w-3 h-3 animate-spin text-blue-400" />
                          )}
                        </div>
                      )}
                    </>
                  )}
                  {!selectedNode && (
                    <span className="truncate">
                      {isLoadingDevices ? "Loading..." : "No nodes"}
                    </span>
                  )}
                </div>
              </SelectTrigger>
              <SelectContent className="bg-[#0A1A2F] border-[#1E293B]">
                {nodes.map((node) => (
                  <div key={node.id} className="relative">
                    <SelectItem
                      value={node.id}
                      className="text-[#515194] hover:bg-[#1D1D33] focus:bg-[#1D1D33] pr-10"
                    >
                      <div className="flex items-center gap-2">
                        {getDeviceIcon(node.type)}
                        <span>{node.name}</span>
                        {/* FIX: Show uptime in dropdown for better visibility */}
                        <span className="text-xs text-white/50 ml-auto">
                          {formatUptime(getCurrentUptime(node.id))}
                        </span>
                      </div>
                    </SelectItem>
                    <div
                      className="absolute right-2 top-1/2 -translate-y-1/2"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDeletingNodeId(node.id);
                        deleteDevice(node.id).finally(() => {
                          setDeletingNodeId(null);
                        });
                      }}
                    >
                      <button
                        type="button"
                        disabled={deletingNodeId === node.id}
                        className="p-1.5 rounded-full hover:bg-red-500/20 focus:outline-none"
                      >
                        {deletingNodeId === node.id ? (
                          <Loader2 className="w-4 h-4 text-red-500 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4 text-red-500" />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </SelectContent>
            </Select>

            {/* FIX: Use the enhanced start/stop button */}
            {renderStartStopButton()}
          </div>

          {/* FIX: Enhanced login warning */}
          {!isLoggedIn && (
            <div className="mb-4 p-3 rounded-full bg-yellow-900/20 border border-yellow-500/30 flex items-center gap-2">
              <AlertTriangle className="w-[15px] h-[15px] text-yellow-500 flex-shrink-0" />
              <span className="text-xs text-yellow-200">
                Login required to start node and track uptime
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 sm:gap-4 mb-3 sm:mb-6">
            <div className="p-4 rounded-xl bg-[#1D1D33] flex flex-col">
              <div className="text-[#515194] text-xs mb-1">Reward Tier</div>
              <div className="flex flex-col sm:flex-row sm:items-center">
                <div className="icon-bg mt-2 icon-container flex items-center justify-center rounded-md p-2 mx-auto sm:mx-0">
                  <img
                    src="/images/coins.png"
                    alt="NLOV"
                    className="w-8 h-8 object-contain"
                  />
                </div>
                <div className="text-lg font-medium text-white mt-2 text-center sm:text-left sm:ml-3">
                  {isMounted
                    ? (selectedNode?.rewardTier || "N/A").toUpperCase()
                    : "N/A"}
                </div>
              </div>
            </div>

            {/* FIX: Use the enhanced uptime card */}
            {renderUptimeCard()}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:gap-4 mb-3 sm:mb-6">
            <div className="p-4 rounded-xl bg-[#1D1D33] flex flex-col">
              <div className="text-[#515194] text-xs mb-1">
                Connected Devices
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center">
                <div className="icon-bg mt-2 icon-container flex items-center justify-center rounded-md p-2 mx-auto sm:mx-0">
                  <img
                    src="/images/devices.png"
                    alt="NLOV"
                    className="w-8 h-8 object-contain"
                  />
                </div>
                <div className="flex flex-col mt-2 sm:ml-3">
                  <div
                    className={`text-lg font-medium text-center sm:text-left ${
                      deviceLimitExceeded ? "text-red-400" : "text-white"
                    }`}
                  >
                    {nodes.length}
                  </div>
                  <div className="text-xs text-white/50 text-center sm:text-left">
                    of {planDetails.deviceLimit}
                  </div>
                  {deviceLimitExceeded && (
                    <div className="text-xs text-red-400 text-center sm:text-left mt-1">
                      LIMIT REACHED
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-[#1D1D33] flex flex-col">
              <div className="text-[#515194] text-xs mb-1">GPU Model</div>
              <div className="flex flex-col sm:flex-row sm:items-start">
                <div className="icon-bg mt-2 icon-container flex items-center justify-center rounded-md p-2 mx-auto sm:mx-0">
                  <img
                    src="/images/gpu_model.png"
                    alt="NLOV"
                    className="w-8 h-8 object-contain"
                  />
                </div>
                <div
                  className="text-lg text-white mt-3 text-center sm:text-left sm:ml-3 overflow-hidden w-full sm:w-[75%]"
                  title={selectedNode?.gpuInfo || "N/A"}
                >
                  {extractGPUModel(selectedNode?.gpuInfo || "N/A")}
                </div>
              </div>
            </div>
          </div>

          {/* FIX: Enhanced earnings section with better state tracking */}
          <div
            className={`p-4 sm:p-6 flex flex-col rounded-xl sm:rounded-2xl border relative overflow-hidden gap-4 transition-all duration-300 ${
              sessionEarnings + dbUnclaimedRewards > 0
                ? "border-yellow-500/30 bg-yellow-900/10"
                : "border-blue-800/30 bg-blue-900/10"
            }`}
          >
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-4 z-10">
                <img
                  src="/images/nlov-coin.png"
                  alt="coin"
                  className="w-11 h-11 object-contain z-10 flex-shrink-0"
                />
                <div className="flex flex-col min-w-0">
                  <span className="text-white/90 text-xl sm:text-2xl break-words transition-all duration-500">
                    {sessionEarnings + dbUnclaimedRewards > 0
                      ? "Rewards Available"
                      : "Total Earnings"}
                  </span>
                  {isLoadingEarnings && (
                    <span className="text-xs text-white/50">
                      Loading earnings...
                    </span>
                  )}
                  {/* FIX: Enhanced warning message */}
                  {sessionEarnings + dbUnclaimedRewards > 0 &&
                    (node.isActive || isDeviceRunning(selectedNodeId)) && (
                      <div className="flex items-center gap-2 mt-1">
                        <AlertTriangle className="w-4 h-4 text-yellow-500 flex-shrink-0" />
                        <span className="text-xs text-yellow-400">
                          Stop active node to claim rewards
                        </span>
                      </div>
                    )}
                </div>
              </div>
              <div className="flex items-baseline gap-2 z-10 flex-shrink-0">
                <span
                  className={`font-medium text-2xl sm:text-3xl lg:text-4xl transition-all duration-300 ${
                    sessionEarnings + dbUnclaimedRewards > 0
                      ? "text-yellow-400"
                      : "text-blue-400"
                  } leading-none`}
                >
                  {isLoggedIn
                    ? isLoadingEarnings
                      ? "..."
                      : sessionEarnings + dbUnclaimedRewards > 0
                      ? (sessionEarnings + dbUnclaimedRewards).toFixed(2)
                      : totalEarnings.toFixed(2)
                    : "0.00"}
                </span>
                <span
                  className={`text-sm transition-all duration-300 ${
                    sessionEarnings + dbUnclaimedRewards > 0
                      ? "text-yellow-300"
                      : "text-white/90"
                  }`}
                >
                  SP
                </span>
              </div>
            </div>

            {sessionEarnings + dbUnclaimedRewards > 0 && (
              <div className="flex flex-col">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mt-2 border-t border-yellow-500/30 pt-3 gap-3">
                  <div className="flex items-center gap-2">
                    <img
                      src="/images/pending_reward.png"
                      alt="Unclaimed"
                      className="w-5 h-5 object-contain flex-shrink-0"
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="text-white text-base font-medium break-words">
                        Unclaimed:{" "}
                        <span className="text-yellow-400">
                          +{(sessionEarnings + dbUnclaimedRewards).toFixed(2)}{" "}
                          SP
                        </span>
                      </span>
                      {/* FIX: Enhanced earnings breakdown display */}
                      <div className="text-xs text-white/50 space-y-0.5">
                        {isLoadingUnclaimedRewards ? (
                          <div>Loading...</div>
                        ) : (
                          <>
                            {dbUnclaimedRewards > 0 && (
                              <div>
                                Saved: {dbUnclaimedRewards.toFixed(2)} SP
                              </div>
                            )}
                            {sessionEarnings > 0 && (
                              <div className="flex items-center gap-1">
                                <span>
                                  Session: {sessionEarnings.toFixed(2)} SP
                                </span>
                                {isSavingToDb ? (
                                  <span className="text-blue-400">
                                    (saving...)
                                  </span>
                                ) : node.isActive ||
                                  isDeviceRunning(selectedNodeId) ? (
                                  <span className="text-green-400">
                                    (auto-saving)
                                  </span>
                                ) : (
                                  <span className="text-yellow-400">
                                    (unsaved)
                                  </span>
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mt-3 gap-2">
                  <div className="flex flex-col gap-1">
                    {earningsClaimError && (
                      <span className="text-red-400 text-xs">
                        {earningsClaimError}
                      </span>
                    )}
                    {showClaimSuccess && (
                      <span className="text-green-400 text-xs">
                        Reward claimed successfully!
                      </span>
                    )}
                  </div>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleClaimReward}
                    disabled={
                      isClaimingReward ||
                      isClaimingUi ||
                      isSavingToDb ||
                      sessionEarnings + dbUnclaimedRewards <= 0 ||
                      isLoadingUnclaimedRewards ||
                      node.isActive ||
                      isDeviceRunning(selectedNodeId)
                    }
                    className={`rounded-full text-white px-4 py-2 w-full sm:w-auto transition-all duration-300 ${
                      node.isActive || isDeviceRunning(selectedNodeId)
                        ? "bg-gray-600 hover:bg-gray-700 cursor-not-allowed"
                        : "bg-green-600 hover:bg-green-700 hover:shadow-green-500/30 shadow-green-500"
                    }`}
                  >
                    {isClaimingReward || isClaimingUi ? (
                      <div className="flex items-center justify-center">
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Claiming...
                      </div>
                    ) : (
                      <div className="flex items-center justify-center">
                        <img
                          src="/images/claimed_reward.png"
                          alt="Claim"
                          className="w-4 h-4 mr-2 object-contain"
                        />
                        {node.isActive || isDeviceRunning(selectedNodeId)
                          ? "Stop Node to Claim"
                          : "Claim Rewards"}
                      </div>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* Show message when no rewards available */}
            {sessionEarnings + dbUnclaimedRewards <= 0 && (
              <div className="flex items-center justify-center border-t border-blue-800/30 pt-3">
                <span className="text-white/50 text-sm">
                  <i>*All Swarm Points will be converted to $NLOV after TGE </i>
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Hardware Scan Dialog */}
      <HardwareScanDialog
        isOpen={showScanDialog}
        onClose={() => setShowScanDialog(false)}
        onScanComplete={handleScanComplete}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={showDeleteConfirmDialog}
        onOpenChange={setShowDeleteConfirmDialog}
      >
        <DialogContent className="sm:max-w-md bg-[#0A1A2F] border-[#112544]">
          <DialogHeader>
            <DialogTitle className="text-white">Delete Node</DialogTitle>
            <DialogDescription className="text-white/70">
              Are you sure you want to delete this node? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteConfirmDialog(false)}
              disabled={isDeletingNode}
              className="border-[#112544] text-white hover:bg-[#112544]/30"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={deleteSelectedNode}
              disabled={isDeletingNode}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isDeletingNode ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* FIX: Enhanced Uptime Limit Dialog with better information */}
      <Dialog
        open={showUptimeLimitDialog}
        onOpenChange={setShowUptimeLimitDialog}
      >
        <DialogContent className="sm:max-w-md bg-[#0A1A2F] border-[#112544]">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              Uptime Limit Exceeded
            </DialogTitle>
            <DialogDescription className="text-white/70">
              Your node has been automatically stopped because you've reached
              the uptime limit for your {currentPlan.toLowerCase()} plan.
              <br />
              <br />
              <span className="text-yellow-400">
                Current usage: {formatUptime(displayUptime)} of{" "}
                {formatUptime(getMaxUptime())}
              </span>
              <br />
              <br />
              {/* FIX: Add helpful information about uptime reset */}
              <span className="text-blue-400 text-sm">
                💡 Tip: Uptime resets daily. You can also upgrade your plan for
                higher limits.
              </span>
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="flex flex-col gap-3 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => setShowUptimeLimitDialog(false)}
              className="border-[#112544] text-white hover:bg-[#112544]/30 w-full sm:w-auto"
            >
              Close
            </Button>
            <Button
              onClick={() => {
                window.open("https://app.neurolov.ai/subscription", "_blank");
                setShowUptimeLimitDialog(false);
              }}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white w-full sm:w-auto"
            >
              Upgrade Plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* FIX: Add debug panel for development (can be removed in production) */}
      {process.env.NODE_ENV === "development" && selectedNodeId && (
        <div className="mt-4 p-3 bg-gray-800 rounded-lg text-xs text-white/70">
          <div className="font-medium mb-2">Debug Info (Dev Only):</div>
          <div>Selected Device: {selectedNodeId}</div>
          <div>
            Local Uptime: {formatUptime(getCurrentUptime(selectedNodeId))}
          </div>
          <div>
            Is Running: {isDeviceRunning(selectedNodeId) ? "Yes" : "No"}
          </div>
          <div>
            Data Stale:{" "}
            {isDataStale && isDataStale(selectedNodeId) ? "Yes" : "No"}
          </div>
          <div>
            Last Sync:{" "}
            {lastSyncTime
              ? new Date(lastSyncTime).toLocaleTimeString()
              : "Never"}
          </div>
          <div>Redux Node Active: {node.isActive ? "Yes" : "No"}</div>
          <div>
            Syncing: {syncingDeviceId === selectedNodeId ? "Yes" : "No"}
          </div>
          <button
            onClick={() => syncDeviceUptime(selectedNodeId, true)}
            className="mt-2 px-2 py-1 bg-blue-600 rounded text-white text-xs"
            disabled={syncingDeviceId === selectedNodeId}
          >
            {syncingDeviceId === selectedNodeId ? "Syncing..." : "Force Sync"}
          </button>
          <button
            onClick={() => validateCurrentUptime(selectedNodeId)}
            className="mt-2 ml-2 px-2 py-1 bg-green-600 rounded text-white text-xs"
          >
            Validate Uptime
          </button>
        </div>
      )}
    </>
  );
};
