import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Activity, Clock, Users, Server, RefreshCw } from "lucide-react";
import { InfoTooltip } from "./InfoTooltip";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { logger } from "@/utils/logger";
import { safeStorage } from "@/utils/storage";
import { toast } from "sonner";
import { getQueuedTasks } from "@/services/swarmTaskService";
import { AITask } from "@/services/types";
import { FileCode } from "./ui/file-code";
import { useSelector } from "react-redux";
import { RootState, useAppDispatch } from "@/store";
import { fetchPendingTasks } from "@/store/slices/taskSlice";
import { getSwarmSupabase } from "@/lib/supabase-client";
import { formatUptime } from "@/utils/timeUtils";
import { updateUptime } from "@/store/slices/nodeSlice";

// Default refresh interval in milliseconds
const AUTO_REFRESH_INTERVAL = 120000; // Increased to 120 seconds (2 minutes)
const TASK_CACHE_KEY = "global_statistics_task_cache";
const LAST_REFRESH_KEY = "global_statistics_last_refresh";
const MIN_REFRESH_INTERVAL = 30000; // Minimum time between refreshes (30 seconds)

export const GlobalStatistics = () => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const client = getSwarmSupabase();
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Cache for storing tasks to reduce duplicate requests
  const [taskCache, setTaskCache] = useState<AITask[]>([]);
  const [lastRefreshTime, setLastRefreshTime] = useState<number>(0);
  const [forceUpdate, setForceUpdate] = useState(0);

  // Get tasks from Redux store
  const { allTasks } = useSelector((state: RootState) => state.tasks);
  const { tasksCompleted, isActive } = useSelector(
    (state: RootState) => state.node
  );

  const [stats, setStats] = useState({
    totalTasks: 0,
    avgComputeTime: 0,
    totalUsers: 0,
    activeNodes: 0,
    networkLoad: 0,
  });

  // Track completed tasks to trigger refresh when needed
  const [prevCompletedTasks, setPrevCompletedTasks] = useState(0);

  // Fetch total users from the database
  const fetchTotalUsers = async () => {
    try {
      const { data, error } = await client.from("user_profiles").select("id");

      if (error) throw error;

      return data?.length || 0;
    } catch (error) {
      console.error("Error fetching total users:", error);
      return 0;
    }
  };

  // Fetch active nodes from the devices table
  const fetchActiveNodes = async () => {
    try {
      const { data, error } = await client
        .from("devices")
        .select("id")
        .eq("status", "busy");

      if (error) throw error;

      return data?.length || 0;
    } catch (error) {
      console.error("Error fetching active nodes:", error);
      return 0;
    }
  };

  // Calculate network load based on active nodes / total nodes
  const calculateNetworkLoad = async (activeNodesCount: number) => {
    try {
      const { data, error } = await client.from("devices").select("id");

      if (error) throw error;

      const totalNodes = data?.length || 0;

      if (totalNodes > 0) {
        return Math.round((activeNodesCount / totalNodes) * 100);
      }
      return 0;
    } catch (error) {
      console.error("Error calculating network load:", error);
      return 0;
    }
  };

  // Fetch average uptime from all devices
  const fetchAverageUptime = async () => {
    try {
      const { data, error } = await client.from("devices").select("uptime");

      if (error) throw error;

      if (!data || data.length === 0) return 0;

      // Calculate average uptime across all devices
      const totalUptime = data.reduce(
        (sum, device) => sum + (device.uptime || 0),
        0
      );
      const averageUptime = totalUptime / data.length;

      return averageUptime;
    } catch (error) {
      console.error("Error fetching average uptime:", error);
      return 0;
    }
  };

  // Load any cached tasks from localStorage on initial load
  useEffect(() => {
    try {
      const cachedTasks = safeStorage.getItem(TASK_CACHE_KEY);
      if (cachedTasks) {
        const parsedTasks = JSON.parse(cachedTasks) as AITask[];
        if (parsedTasks.length > 0) {
          setTaskCache(parsedTasks);
        }
      }

      // Load the last refresh time from localStorage here inside useEffect
      const savedLastRefreshTime = safeStorage.getItem(LAST_REFRESH_KEY);
      if (savedLastRefreshTime) {
        setLastRefreshTime(Number(savedLastRefreshTime));
      }
    } catch (error) {
      console.error("Error loading task cache:", error);
    }
  }, []);

  // Cache tasks whenever they change
  useEffect(() => {
    if (allTasks.length > 0) {
      try {
        safeStorage.setItem(TASK_CACHE_KEY, JSON.stringify(allTasks));
      } catch (error) {
        console.error("Error saving task cache:", error);
      }
    }
  }, [allTasks]);

  // Fetch database statistics
  const fetchDatabaseStats = useCallback(async () => {
    try {
      const [totalUsersCount, activeNodesCount, averageUptimeSeconds] =
        await Promise.all([
          fetchTotalUsers(),
          fetchActiveNodes(),
          fetchAverageUptime(),
        ]);

      const networkLoadPercentage = await calculateNetworkLoad(
        activeNodesCount
      );

      return {
        totalUsers: totalUsersCount,
        activeNodes: activeNodesCount,
        avgComputeTime: averageUptimeSeconds,
        networkLoad: networkLoadPercentage,
      };
    } catch (error) {
      console.error("Error fetching database statistics:", error);
      return null;
    }
  }, []);

  // Helper function to calculate and update stats
  const calculateAndUpdateStats = useCallback(
    async (tasks: AITask[]) => {
      // Get database statistics
      const dbStats = await fetchDatabaseStats();

      const computeTimes = tasks
        .map((t) => t.compute_time || 0)
        .filter((t) => t > 0);

      const avgTime =
        dbStats?.avgComputeTime ||
        (computeTimes.length > 0
          ? computeTimes.reduce((sum, time) => sum + time, 0) /
            computeTimes.length
          : 0);

      setStats({
        totalTasks: tasks.length,
        avgComputeTime: avgTime,
        totalUsers: dbStats?.totalUsers || 0,
        activeNodes: dbStats?.activeNodes || 0,
        networkLoad: dbStats?.networkLoad || 0,
      });
    },
    [fetchDatabaseStats]
  );

  // Memoized function to load tasks to prevent unnecessary re-renders
  const loadTasks = useCallback(
    async (showToast = true, forceRefresh = false) => {
      try {
        // Check if we're already refreshing
        if (isRefreshing) {
          return;
        }

        // Check if it's too soon to refresh again
        const now = Date.now();
        const timeSinceLastRefresh = now - lastRefreshTime;
        if (!forceRefresh && timeSinceLastRefresh < MIN_REFRESH_INTERVAL) {
          // Only log occasionally to reduce console spam
          if (Math.random() < 0.1) {
            console.log(
              `Skipping refresh, last refresh was ${(
                timeSinceLastRefresh / 1000
              ).toFixed(1)}s ago`
            );
          }
          return;
        }

        setIsRefreshing(true);

        // Check for available unassigned tasks, but only log success
        let availableTaskCount = 0;
        try {
          const availableTasks = await getQueuedTasks(10);
          availableTaskCount = availableTasks.length;
          if (availableTaskCount > 0) {
            console.log(
              `Found ${availableTaskCount} available unassigned tasks in the database`
            );
          }
        } catch (error) {
          // Log error but continue with existing tasks
          console.error("Error checking available tasks:", error);
        }

        // Only fetch tasks if we need them (no tasks or forced refresh)
        if (allTasks.length === 0 || forceRefresh || availableTaskCount > 0) {
          // Dispatch the fetchPendingTasks action to update Redux store
          const tasks = await dispatch(fetchPendingTasks()).unwrap();

          // Only log if we get tasks or occasionally
          if (tasks.length > 0 || Math.random() < 0.1) {
            console.log(`Fetched ${tasks.length} tasks total`);
          }

          // Update last refresh time
          setLastRefreshTime(now);
          safeStorage.setItem(LAST_REFRESH_KEY, now.toString());

          // Calculate stats from the fetched tasks (not the Redux store)
          if (tasks.length > 0) {
            await calculateAndUpdateStats(tasks);
          } else if (availableTaskCount > 0) {
            // We found new tasks but didn't fetch them, try again
            const moreTasks = await dispatch(fetchPendingTasks()).unwrap();

            if (moreTasks.length > 0) {
              await calculateAndUpdateStats(moreTasks);
            }
          }
        } else {
          // Only log occasionally
          if (Math.random() < 0.1) {
            console.log("Using existing tasks for stats");
          }

          if (allTasks.length > 0) {
            await calculateAndUpdateStats(allTasks);
          }
        }

        setIsRefreshing(false);
        if (showToast) {
          toast.success(t("globalStatistics.toasts.refreshSuccess"));
        }
      } catch (error) {
        console.error("Error loading tasks:", error);
        setIsRefreshing(false);
        if (showToast) {
          toast.error(t("globalStatistics.toasts.refreshFailed"));
        }
      }
    },
    [dispatch, allTasks, lastRefreshTime, calculateAndUpdateStats, isRefreshing]
  );

  // Load initial tasks - using useEffect with empty dependency array runs only once
  useEffect(() => {
    // If we have cached tasks, use them first and then refresh in the background
    if (taskCache.length > 0) {
      // Only log once
      console.log(
        `Using ${taskCache.length} cached tasks from previous session`
      );
      calculateAndUpdateStats(taskCache);
      // Refresh in the background without showing toast, with a small delay
      setTimeout(() => loadTasks(false, false), 3000);
    } else {
      // No cached tasks, do a normal load
      loadTasks(true, true);
    }

    // Set up auto-refresh with a random offset to prevent multiple components
    // refreshing at exactly the same time
    let interval: NodeJS.Timeout | null = null;
    if (autoRefresh) {
      // Add a random offset (between 0-15 seconds) to stagger refreshes
      const randomOffset = Math.floor(Math.random() * 15000);
      const refreshInterval = AUTO_REFRESH_INTERVAL + randomOffset;

      interval = setInterval(() => {
        // Only refresh if not already refreshing
        if (!isRefreshing) {
          loadTasks(false, false);
        }
      }, refreshInterval);

      // Log this only once during setup
      console.log(
        `Auto-refresh set up with interval: ${Math.round(
          refreshInterval / 1000
        )}s`
      );
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [
    autoRefresh,
    loadTasks,
    calculateAndUpdateStats,
    taskCache,
    isRefreshing,
  ]);

  // Watch for tasks completed count changes to refresh the global task list
  useEffect(() => {
    // Only proceed if tasks completed counter increased
    if (tasksCompleted > prevCompletedTasks) {
      // Update our tracking counter
      setPrevCompletedTasks(tasksCompleted);

      // If there are few visible tasks, refresh the list to show more pending tasks
      // but only if we haven't refreshed recently
      const now = Date.now();
      const timeSinceLastRefresh = now - lastRefreshTime;

      if (allTasks.length < 10 && timeSinceLastRefresh > MIN_REFRESH_INTERVAL) {
        // Only log this occasionally
        if (Math.random() < 0.3) {
          console.log(
            `Task completed and only ${allTasks.length} tasks visible, refreshing task list`
          );
        }

        // Add a small delay before refreshing to avoid multiple rapid refreshes
        setTimeout(() => {
          if (!isRefreshing) {
            loadTasks(false, true);
          }
        }, 2000);
      }
    }
  }, [
    tasksCompleted,
    prevCompletedTasks,
    allTasks.length,
    loadTasks,
    lastRefreshTime,
    isRefreshing,
  ]);

  // Update stats when allTasks changes - using useMemo to avoid unnecessary calculations
  useMemo(() => {
    if (allTasks.length > 0) {
      // Calculate stats from allTasks
      calculateAndUpdateStats(allTasks);

      console.log(
        `Stats updated from allTasks: ${allTasks.length} tasks found`
      );
      console.log(
        `Task types: Image=${
          allTasks.filter((t) => t.type === "image").length
        }, Text=${allTasks.filter((t) => t.type === "text").length}`
      );
    } else if (
      allTasks.length === 0 &&
      !isRefreshing &&
      taskCache.length === 0
    ) {
      // If no tasks are visible, we're not refreshing, and have no cache, try to get more
      console.log("No tasks visible in global view, triggering refresh");
      loadTasks(false, true);
    }
  }, [
    allTasks,
    isRefreshing,
    taskCache.length,
    calculateAndUpdateStats,
    loadTasks,
  ]);

  const handleRefresh = useCallback(() => {
    loadTasks(true, true);
  }, [loadTasks]);

  const toggleAutoRefresh = useCallback((checked: boolean) => {
    setAutoRefresh(checked);
    toast(checked ? t("globalStatistics.toasts.autoRefreshEnabled") : t("globalStatistics.toasts.autoRefreshDisabled"));
  }, []);

  // Format timestamp to display time only
  const formatTime = useCallback((dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }, []);

  // Get the appropriate color class based on task type - memoized for performance
  const getTaskTypeColorClass = useCallback((type: string) => {
    switch (type) {
      case "text":
        return "text-blue-400";
      case "image":
        return "text-green-400";
      case "inference":
        return "text-purple-400";
      default:
        return "text-slate-300";
    }
  }, []);

  // Use the tasks from Redux or cache if Redux is empty
  const displayTasks = useMemo(() => {
    return allTasks.length > 0 ? allTasks : taskCache;
  }, [allTasks, taskCache]);

  // Memoize stats cards to prevent unnecessary re-renders
  const statsCards = useMemo(
    () => (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="flex flex-col p-3 bg-slate-800/30 rounded-lg">
          <div className="flex items-center text-slate-400 mb-1">
            <Activity className="w-4 h-4 mr-2" /> {t("globalStatistics.cards.totalTasks")}
          </div>
          <div className="text-2xl font-bold">{stats.totalTasks}</div>
        </div>

        <div className="flex flex-col p-3 bg-slate-800/30 rounded-lg">
          <div className="flex items-center text-slate-400 mb-1">
            <Clock className="w-4 h-4 mr-2" /> {t("globalStatistics.cards.avgUptime")}
          </div>
          <div className="text-2xl font-bold">
            {formatUptime(stats.avgComputeTime)}
          </div>
        </div>

        <div className="flex flex-col p-3 bg-slate-800/30 rounded-lg">
          <div className="flex items-center text-slate-400 mb-1">
            <Users className="w-4 h-4 mr-2" /> {t("globalStatistics.cards.totalUsers")}
          </div>
          <div className="text-2xl font-bold">{stats.totalUsers}</div>
        </div>

        <div className="flex flex-col p-3 bg-slate-800/30 rounded-lg">
          <div className="flex items-center text-slate-400 mb-1">
            <Server className="w-4 h-4 mr-2" /> {t("globalStatistics.cards.activeNodes")}
          </div>
          <div className="text-2xl font-bold">{stats.activeNodes}</div>
        </div>
      </div>
    ),
    [stats]
  );

  // Update real-time stats while node is active
  useEffect(() => {
    let uptimeInterval: NodeJS.Timeout | null = null;

    if (isActive) {
      // Force uptime updates and component re-render every second
      uptimeInterval = setInterval(() => {
        dispatch(updateUptime());
        // Trigger re-render for uptime display
        setForceUpdate((prev) => prev + 1);

        // Only update database stats occasionally to reduce load
        if (forceUpdate % 30 === 0) {
          // Every 30 seconds
          fetchDatabaseStats().then((dbStats) => {
            if (dbStats) {
              setStats((prev) => ({
                ...prev,
                totalUsers: dbStats.totalUsers,
                activeNodes: dbStats.activeNodes,
                avgComputeTime: dbStats.avgComputeTime,
                networkLoad: dbStats.networkLoad,
              }));
            }
          });
        }
      }, 1000);
    }

    return () => {
      if (uptimeInterval) clearInterval(uptimeInterval);
    };
  }, [isActive, dispatch, forceUpdate, fetchDatabaseStats]);

  return (
    <div className="stat-card overflow-x-hidden">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0 mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-base sm:text-xl font-semibold">
            {t("globalStatistics.title")}
          </h2>
          <InfoTooltip content={t("globalStatistics.tooltip")} />
        </div>
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-2">
            <span className="text-xs sm:text-sm text-slate-400">
              {t("globalStatistics.autoRefresh")}
            </span>
            <Switch
              checked={autoRefresh}
              onCheckedChange={toggleAutoRefresh}
              className="border border-[#0361da] data-[state=checked]:bg-slate-700 data-[state=checked]:border-[#0361da] data-[state=checked]:ring-slate-700 data-[state=checked]:ring-offset-slate-700"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="gradient-button border-0 h-8 rounded-full ml-auto sm:ml-0"
          >
            <RefreshCw
              className={`w-4 h-4 mr-1 ${isRefreshing ? "animate-spin" : ""}`}
            />
            {t("globalStatistics.refresh")}
          </Button>
        </div>
      </div>

      {/* Global Map Visualization */}
      <div className="global-map w-full h-[250px] sm:h-[330px] mb-6 border border-blue-900/30 relative">
        <div className="absolute inset-0 bg-grid opacity-[0.15] z-0"></div>
        <img
          src="/images/map.png"
          alt={t("globalStatistics.map.alt")}
          className="absolute inset-0 w-full h-full object-contain z-10"
          onError={(e) => {
            e.currentTarget.src =
              "https://raw.githubusercontent.com/Neurolov/NeuroSwarm/main/public/images/map.png";
          }}
        />
        <div className="absolute inset-0 z-30 pointer-events-none cursor-pointer"></div>
        {/* Hardcoded Node Indicators (yellow dots) - Responsive positions */}
        <div
          className="node-indicator absolute z-20"
          style={{ top: "20%", left: "30%" }}
        />
        <div
          className="node-indicator absolute z-20"
          style={{ top: "30%", left: "58%" }}
        />
        <div
          className="node-indicator absolute z-20"
          style={{ top: "40%", left: "63%" }}
        />
        <div
          className="node-indicator absolute z-20"
          style={{ top: "53%", left: "59%" }}
        />
        <div
          className="node-indicator absolute z-20"
          style={{ top: "65%", left: "50%" }}
        />
        <div
          className="node-indicator absolute z-20"
          style={{ top: "70%", left: "40%" }}
        />
        <div
          className="node-indicator absolute z-20"
          style={{ top: "20%", left: "65%" }}
        />

        <div
          className="node-indicator absolute z-20"
          style={{ top: "30%", left: "35%" }}
        />
        <div
          className="node-indicator absolute z-20"
          style={{ top: "10%", left: "42%" }}
        />
        <div
          className="node-indicator absolute z-20"
          style={{ top: "61%", left: "40%" }}
        />
        <div
          className="node-indicator absolute z-20"
          style={{ top: "50%", left: "48%" }}
        />

        {/* -------------- l--25 to 74% and t --5 to 90  */}
        <div
          className="node-indicator absolute z-20"
          style={{ top: "12%", left: "35%" }}
        />
        <div
          className="node-indicator absolute z-20"
          style={{ top: "15%", left: "45%" }}
        />
        <div
          className="node-indicator absolute z-20"
          style={{ top: "40%", left: "59%" }}
        />
        <div
          className="node-indicator absolute z-20"
          style={{ top: "44%", left: "66%" }}
        />
        <div
          className="node-indicator absolute z-20"
          style={{ top: "57%", left: "52%" }}
        />
        <div
          className="node-indicator absolute z-20"
          style={{ top: "39%", left: "33%" }}
        />
        <div
          className="node-indicator absolute z-20"
          style={{ top: "79%", left: "39%" }}
        />
        <div
          className="node-indicator absolute z-20"
          style={{ top: "80%", left: "69%" }}
        />
        <div
          className="node-indicator absolute z-20"
          style={{ top: "28%", left: "52%" }}
        />
        <div
          className="node-indicator absolute z-20"
          style={{ top: "17%", left: "60%" }}
        />
      </div>

      {/* Stats Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="flex flex-col p-4 earning-cards rounded-lg">
          <div className="flex gap-3 items-center">
            <div className="icon-bg icon-container flex items-center justify-center rounded-md p-1 sm:p-2">
              <img
                src="/images/total_tasks.png"
                alt="Tasks"
                className="w-6 h-6 sm:w-7 sm:h-7 relative z-10"
                onError={(e) => {
                  e.currentTarget.src =
                    "https://raw.githubusercontent.com/Neurolov/NeuroSwarm/main/public/images/total_tasks.png";
                }}
              />
            </div>
            <div className="flex flex-col">
              <span className="text-sm text-[#515194]">{t("globalStatistics.cards.totalTasks")}</span>
              <span className="text-xl font-bold text-white">
                {stats.totalTasks}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col p-4 earning-cards rounded-lg">
          <div className="flex gap-3 items-center">
            <div className="icon-bg icon-container flex items-center justify-center rounded-md p-1 sm:p-2">
              <img
                src="/images/computing.png"
                alt="Processing Time"
                className="w-6 h-6 sm:w-7 sm:h-7 relative z-10"
                onError={(e) => {
                  e.currentTarget.src =
                    "https://raw.githubusercontent.com/Neurolov/NeuroSwarm/main/public/images/computing.png";
                }}
              />
            </div>
            <div className="flex flex-col">
              <span className="text-sm text-[#515194]">{t("globalStatistics.cards.processingTime")}</span>
              <span className="text-xl font-bold text-white">
                {(() => {
                  const seconds = stats.avgComputeTime || 0;
                  if (seconds < 1) {
                    return `${(seconds * 1000).toFixed(0)}ms`;
                  }
                  if (seconds < 60) {
                    return `${seconds.toFixed(1)}s`;
                  }
                  if (seconds < 3600) {
                    const minutes = Math.floor(seconds / 60);
                    return `${minutes}m`;
                  }
                  const hours = Math.floor(seconds / 3600);
                  return `${hours}h`;
                })()}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col p-4 earning-cards rounded-lg">
          <div className="flex gap-3 items-center">
            <div className="icon-bg icon-container flex items-center justify-center rounded-md p-1 sm:p-2">
              <img
                src="/images/total_users.png"
                alt="Users"
                className="w-6 h-6 sm:w-7 sm:h-7 relative z-10"
                onError={(e) => {
                  e.currentTarget.src =
                    "https://raw.githubusercontent.com/Neurolov/NeuroSwarm/main/public/images/total_users.png";
                }}
              />
            </div>
            <div className="flex flex-col">
              <span className="text-sm text-[#515194]">{t("globalStatistics.cards.totalUsers")}</span>
              <span className="text-xl font-bold text-white">
                {stats.totalUsers}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col p-4 earning-cards rounded-lg">
          <div className="flex gap-3 items-center">
            <div className="icon-bg icon-container flex items-center justify-center rounded-md p-1 sm:p-2">
              <img
                src="/images/active_nodes.png"
                alt="Active Nodes"
                className="w-6 h-6 sm:w-7 sm:h-7 relative z-10"
                onError={(e) => {
                  e.currentTarget.src =
                    "https://raw.githubusercontent.com/Neurolov/NeuroSwarm/main/public/images/active_nodes.png";
                }}
              />
            </div>
            <div className="flex flex-col">
              <span className="text-sm text-[#515194]">{t("globalStatistics.cards.activeNodes")}</span>
              <span className="text-xl font-bold text-white">
                {stats.activeNodes}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-6 w-full">
        <h3 className="text-base sm:text-lg font-medium mb-4">
          {t("globalStatistics.tasks.title")}
        </h3>

        {displayTasks.length > 0 ? (
          <div className="space-y-3 max-h-[300px] overflow-y-auto overflow-x-hidden pr-2 custom-scrollbar">
            {displayTasks.map((task, index) => (
              <div
                key={`${task.id}-${index}`}
                className="task-card data-panel p-3 sm:p-4 w-full"
              >
                <div className="flex items-start gap-2">
                  <div className="p-1 sm:p-1.5 icon-bg rounded-md flex items-center justify-center shrink-0">
                    <FileCode
                      className={`w-3 h-3 z-10 ${getTaskTypeColorClass(
                        task.type
                      )}`}
                    />
                  </div>
                  <div className="flex-1 min-w-0 break-words overflow-hidden">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-blue-400 truncate max-w-[80px] sm:max-w-[120px]">
                        {task.model || "default"}
                      </span>
                      <span
                        className={`text-xs bg-slate-700/50 px-1.5 py-0.5 rounded ${getTaskTypeColorClass(
                          task.type
                        )}`}
                      >
                        {task.type}
                      </span>
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded-full ml-auto
                        ${
                          task.status === "completed"
                            ? "bg-green-900/20 text-green-300 border border-green-500/30"
                            : ""
                        }
                        ${
                          task.status === "processing"
                            ? "bg-blue-900/20 text-blue-300 border border-blue-500/30"
                            : ""
                        }
                        ${
                          task.status === "pending"
                            ? "bg-amber-900/20 text-amber-300 border border-amber-500/30"
                            : ""
                        }
                        ${
                          task.status === "failed"
                            ? "bg-red-900/20 text-red-300 border border-red-500/30"
                            : ""
                        }
                      `}
                      >
                        {task.status === "completed" && t("globalStatistics.tasks.status.completed")}
                        {task.status === "processing" && t("globalStatistics.tasks.status.processing")}
                        {task.status === "pending" && t("globalStatistics.tasks.status.pending")}
                        {task.status === "failed" && t("globalStatistics.tasks.status.failed")}
                      </span>
                    </div>
                    <p className="text-xs mb-1 break-words truncate">
                      {t("globalStatistics.tasks.prompt")}: {task.prompt.substring(0, 60)}
                      {task.prompt.length > 60 ? "..." : ""}
                    </p>
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
                      <span>{t("globalStatistics.tasks.assigning")}</span>
                      <span>{formatTime(task.created_at)}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-slate-400">
            <FileCode className="w-10 h-10 mb-2 text-slate-600" />
            <p>{t("globalStatistics.tasks.noTasks")}</p>
          </div>
        )}
      </div>
    </div>
  );
};
