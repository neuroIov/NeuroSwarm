import React, { useState, useEffect, useCallback, useMemo } from "react";
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
const AUTO_REFRESH_INTERVAL = 300000; // Increased to 5 minutes
const TASK_CACHE_KEY = "global_statistics_task_cache";
const LAST_REFRESH_KEY = "global_statistics_last_refresh";
const MIN_REFRESH_INTERVAL = 60000; // Minimum time between refreshes (60 seconds)
const REFRESH_ATTEMPT_LIMIT = 3; // Maximum number of failed refresh attempts before backing off

export const GlobalStatistics = () => {
  const dispatch = useAppDispatch();
  const client = getSwarmSupabase();
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Cache for storing tasks to reduce duplicate requests
  const [taskCache, setTaskCache] = useState<AITask[]>([]);
  const [lastRefreshTime, setLastRefreshTime] = useState<number>(0);
  const [forceUpdate, setForceUpdate] = useState(0);
  const [failedRefreshAttempts, setFailedRefreshAttempts] = useState(0);
  const [refreshCount, setRefreshCount] = useState(0); // Track total refresh attempts for debugging
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false); // Separate control variable

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
        setRefreshCount((prev) => prev + 1);
        const refreshAttempt = refreshCount + 1;
        console.log(
          `Refresh attempt #${refreshAttempt} at ${new Date().toLocaleTimeString()}`
        );

        // Check if we're already refreshing
        if (isRefreshing) {
          console.log("Already refreshing, skipping this attempt");
          return;
        }

        // Check if it's too soon to refresh again
        const now = Date.now();
        const timeSinceLastRefresh = now - lastRefreshTime;

        console.log(
          `Last refresh: ${new Date(
            lastRefreshTime
          ).toLocaleTimeString()}, Time since: ${(
            timeSinceLastRefresh / 1000
          ).toFixed(1)}s, Min interval: ${MIN_REFRESH_INTERVAL / 1000}s`
        );

        if (!forceRefresh && timeSinceLastRefresh < MIN_REFRESH_INTERVAL) {
          console.log(
            `Skipping refresh, last refresh was ${(
              timeSinceLastRefresh / 1000
            ).toFixed(1)}s ago`
          );
          return;
        }

        // Check if we've had too many failed refreshes in a row
        if (failedRefreshAttempts >= REFRESH_ATTEMPT_LIMIT && !forceRefresh) {
          console.log(
            `Too many failed refresh attempts (${failedRefreshAttempts}), backing off`
          );
          return;
        }

        // Set refreshing flag at the start and make sure we clear it at the end
        setIsRefreshing(true);
        console.log(
          `Starting refresh #${refreshAttempt} at`,
          new Date().toLocaleTimeString()
        );

        // Critical: Always update the refresh time to prevent rapid re-requests
        setLastRefreshTime(now);
        safeStorage.setItem(LAST_REFRESH_KEY, now.toString());

        try {
          // Only try to fetch available tasks if there are fewer than 5 in the store
          // to reduce duplicate API calls
          const existingTasksCount = allTasks.length;
          let availableTaskCount = 0;

          if (existingTasksCount < 5) {
            try {
              // Use a smaller limit to reduce load
              const availableTasks = await getQueuedTasks(5);
              availableTaskCount = availableTasks.length;

              if (availableTaskCount > 0) {
                console.log(
                  `Found ${availableTaskCount} available unassigned tasks`
                );
              }
            } catch (error) {
              console.error("Error checking available tasks:", error);
              setFailedRefreshAttempts((prev) => prev + 1);
            }
          }

          // Only fetch tasks if we need them (no tasks or forced refresh)
          let newTasks: AITask[] = [];
          if (allTasks.length === 0 || forceRefresh || availableTaskCount > 0) {
            try {
              // Dispatch the fetchPendingTasks action to update Redux store
              newTasks = await dispatch(fetchPendingTasks()).unwrap();

              // Reset failed attempt counter on success
              setFailedRefreshAttempts(0);

              // Only log if we get tasks
              if (newTasks.length > 0) {
                console.log(`Fetched ${newTasks.length} tasks total`);
              }

              // Calculate stats from the fetched tasks
              if (newTasks.length > 0) {
                await calculateAndUpdateStats(newTasks);
              }
            } catch (error) {
              console.error("Error fetching pending tasks:", error);
              setFailedRefreshAttempts((prev) => prev + 1);
            }
          } else {
            // No need to fetch, use existing tasks
            if (allTasks.length > 0) {
              await calculateAndUpdateStats(allTasks);
            }
          }

          if (showToast && (newTasks.length > 0 || forceRefresh)) {
            toast.success("Global statistics refreshed");
          }
        } finally {
          // Make absolutely sure we clear the refreshing flag
          console.log(
            `Ending refresh #${refreshAttempt} at`,
            new Date().toLocaleTimeString()
          );
          setIsRefreshing(false);
        }
      } catch (error) {
        console.error("Error loading tasks:", error);
        setIsRefreshing(false);
        setFailedRefreshAttempts((prev) => prev + 1);
        if (showToast) {
          toast.error("Failed to refresh statistics");
        }
      }
    },
    [
      dispatch,
      allTasks,
      lastRefreshTime,
      calculateAndUpdateStats,
      isRefreshing,
      failedRefreshAttempts,
      refreshCount,
    ]
  );

  // Load initial tasks - using useEffect with empty dependency array runs only once
  useEffect(() => {
    // For debugging
    console.log(
      "Initial load effect triggered",
      new Date().toLocaleTimeString()
    );

    let cleanup = () => {};

    // If we have cached tasks, use them first and then refresh in the background
    if (taskCache.length > 0) {
      console.log(
        `Using ${taskCache.length} cached tasks from previous session`
      );
      calculateAndUpdateStats(taskCache);

      // Refresh in the background without showing toast, with a small delay
      const timer = setTimeout(() => loadTasks(false, false), 5000);
      cleanup = () => clearTimeout(timer);
    } else {
      // No cached tasks, do a normal load
      loadTasks(true, true);
    }

    return () => {
      cleanup();
    };
    // Only run this effect once on component mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Set up auto-refresh in a separate effect to control it better
  useEffect(() => {
    // Set up auto-refresh with a random offset to prevent multiple components
    // refreshing at exactly the same time
    let interval: NodeJS.Timeout | null = null;

    if (autoRefresh && !autoRefreshEnabled) {
      setAutoRefreshEnabled(true);

      // Add a random offset (between 0-30 seconds) to stagger refreshes
      const randomOffset = Math.floor(Math.random() * 30000);
      const refreshInterval = AUTO_REFRESH_INTERVAL + randomOffset;

      interval = setInterval(() => {
        // Only refresh if not already refreshing and we haven't had too many failures
        if (!isRefreshing && failedRefreshAttempts < REFRESH_ATTEMPT_LIMIT) {
          console.log(
            "Auto-refresh triggered",
            new Date().toLocaleTimeString()
          );
          loadTasks(false, false);
        } else if (failedRefreshAttempts >= REFRESH_ATTEMPT_LIMIT) {
          // If we've had too many failures, reduce the counter over time
          setFailedRefreshAttempts((prev) => Math.max(0, prev - 1));
        }
      }, refreshInterval);

      // Log this only once during setup
      console.log(
        `Auto-refresh set up with interval: ${Math.round(
          refreshInterval / 1000
        )}s`
      );
    } else if (!autoRefresh && autoRefreshEnabled) {
      setAutoRefreshEnabled(false);
      console.log("Auto-refresh disabled");
    }

    return () => {
      if (interval) {
        console.log("Clearing auto-refresh interval");
        clearInterval(interval);
      }
    };
  }, [
    autoRefresh,
    autoRefreshEnabled,
    isRefreshing,
    failedRefreshAttempts,
    loadTasks,
  ]);

  // Watch for tasks completed count changes to refresh the global task list
  useEffect(() => {
    // Only proceed if tasks completed counter increased
    if (tasksCompleted > prevCompletedTasks) {
      console.log(
        `Tasks completed increased from ${prevCompletedTasks} to ${tasksCompleted}`
      );

      // Update our tracking counter
      setPrevCompletedTasks(tasksCompleted);

      // If there are few visible tasks, refresh the list to show more pending tasks
      // but only if we haven't refreshed recently
      const now = Date.now();
      const timeSinceLastRefresh = now - lastRefreshTime;

      if (allTasks.length < 5 && timeSinceLastRefresh > MIN_REFRESH_INTERVAL) {
        console.log(
          `Task completed and only ${allTasks.length} tasks visible, refreshing task list`
        );

        // Add a small delay before refreshing to avoid multiple rapid refreshes
        const timer = setTimeout(() => {
          if (!isRefreshing) {
            loadTasks(false, true);
          }
        }, 3000);

        return () => clearTimeout(timer);
      }
    }
    // Use only tasksCompleted to trigger this useEffect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasksCompleted]);

  // Update stats when allTasks changes - using useEffect instead of useMemo for side effects
  useEffect(() => {
    console.log(`allTasks changed: ${allTasks.length} tasks available`);

    if (allTasks.length > 0) {
      // Calculate stats from allTasks
      calculateAndUpdateStats(allTasks);
    }
    // Only run this effect when allTasks changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTasks]);

  // Use the tasks from Redux or cache if Redux is empty
  const displayTasks = useMemo(() => {
    return allTasks.length > 0 ? allTasks : taskCache;
  }, [allTasks, taskCache]);

  const handleRefresh = useCallback(() => {
    loadTasks(true, true);
  }, [loadTasks]);

  const toggleAutoRefresh = useCallback((checked: boolean) => {
    console.log(`Auto-refresh ${checked ? "enabled" : "disabled"}`);
    setAutoRefresh(checked);
    toast(checked ? "Auto-refresh enabled" : "Auto-refresh disabled");
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

  // Memoize stats cards to prevent unnecessary re-renders
  const statsCards = useMemo(
    () => (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="flex flex-col p-3 bg-slate-800/30 rounded-lg">
          <div className="flex items-center text-slate-400 mb-1">
            <Activity className="w-4 h-4 mr-2" /> Total Tasks
          </div>
          <div className="text-2xl font-bold">{stats.totalTasks}</div>
        </div>

        <div className="flex flex-col p-3 bg-slate-800/30 rounded-lg">
          <div className="flex items-center text-slate-400 mb-1">
            <Clock className="w-4 h-4 mr-2" /> Avg. Uptime
          </div>
          <div className="text-2xl font-bold">
            {formatUptime(stats.avgComputeTime)}
          </div>
        </div>

        <div className="flex flex-col p-3 bg-slate-800/30 rounded-lg">
          <div className="flex items-center text-slate-400 mb-1">
            <Users className="w-4 h-4 mr-2" /> Total Users
          </div>
          <div className="text-2xl font-bold">{stats.totalUsers}</div>
        </div>

        <div className="flex flex-col p-3 bg-slate-800/30 rounded-lg">
          <div className="flex items-center text-slate-400 mb-1">
            <Server className="w-4 h-4 mr-2" /> Active Nodes
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
    <div className="stat-card">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold">Global Statistics</h2>
          <InfoTooltip content="Overview of the entire Swarm Network activity" />
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400">Auto-Refresh</span>
            <Switch
              checked={autoRefresh}
              onCheckedChange={toggleAutoRefresh}
              className="border border-[#0361da]  data-[state=checked]:bg-slate-700 data-[state=checked]:border-[#0361da] data-[state=checked]:ring-slate-700 data-[state=checked]:ring-offset-slate-700 "
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="gradient-button border-0 h-8 rounded-full"
          >
            <RefreshCw
              className={`w-4 h-4 mr-1 ${isRefreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      {/* Global Map Visualization */}
      <div className="global-map w-full h-[330px] mb-6 border border-blue-900/30">
        <div className="absolute inset-0 bg-grid opacity-[0.15] z-0"></div>
        <img
          src="/images/map.png"
          alt="Global Network Map"
          className="absolute inset-0 w-full h-full object-contain z-10"
          onError={(e) => {
            e.currentTarget.src =
              "https://raw.githubusercontent.com/Neurolov/NeuroSwarm/main/public/images/map.png";
          }}
        />
        <div className="absolute inset-0 z-30 pointer-events-none cursor-pointer"></div>
        {/* Hardcoded Node Indicators (yellow dots) - Fixed positions so you can adjust them */}
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
      </div>

      {/* Stats Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="flex flex-col p-4 earning-cards rounded-lg">
          <div className="flex gap-3 items-center">
            <div className="icon-bg icon-container flex items-center justify-center rounded-md p-2">
              <img
                src="/images/total_tasks.png"
                alt="Tasks"
                className="w-8 h-8 relative z-10"
                onError={(e) => {
                  e.currentTarget.src =
                    "https://raw.githubusercontent.com/Neurolov/NeuroSwarm/main/public/images/total_tasks.png";
                }}
              />
            </div>
            <div className="flex flex-col">
              <span className="text-sm text-[#515194]">Total Tasks</span>
              <span className="text-xl font-bold text-white">
                {stats.totalTasks}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col p-4 earning-cards rounded-lg">
          <div className="flex gap-3 items-center">
            <div className="icon-bg icon-container flex items-center justify-center rounded-md p-2">
              <img
                src="/images/computing.png"
                alt="Processing Time"
                className="w-8 h-8 relative z-10"
                onError={(e) => {
                  e.currentTarget.src =
                    "https://raw.githubusercontent.com/Neurolov/NeuroSwarm/main/public/images/computing.png";
                }}
              />
            </div>
            <div className="flex flex-col">
              <span className="text-sm text-[#515194]">Processing Time</span>
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
            <div className="icon-bg icon-container flex items-center justify-center rounded-md p-2">
              <img
                src="/images/total_users.png"
                alt="Users"
                className="w-8 h-8 relative z-10"
                onError={(e) => {
                  e.currentTarget.src =
                    "https://raw.githubusercontent.com/Neurolov/NeuroSwarm/main/public/images/total_users.png";
                }}
              />
            </div>
            <div className="flex flex-col">
              <span className="text-sm text-[#515194]">Total Users</span>
              <span className="text-xl font-bold text-white">
                {stats.totalUsers}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col p-4 earning-cards rounded-lg">
          <div className="flex gap-3 items-center">
            <div className="icon-bg icon-container flex items-center justify-center rounded-md p-2">
              <img
                src="/images/active_nodes.png"
                alt="Active Nodes"
                className="w-8 h-8 relative z-10"
                onError={(e) => {
                  e.currentTarget.src =
                    "https://raw.githubusercontent.com/Neurolov/NeuroSwarm/main/public/images/active_nodes.png";
                }}
              />
            </div>
            <div className="flex flex-col">
              <span className="text-sm text-[#515194]">Active Nodes</span>
              <span className="text-xl font-bold text-white">
                {stats.activeNodes}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-6">
        <h3 className="text-lg font-medium mb-4">Recent Global Tasks</h3>

        {displayTasks.length > 0 ? (
          <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
            {displayTasks.map((task, index) => (
              <div key={`${task.id}-${index}`} className="task-card data-panel">
                <div className="flex">
                  <div className="mr-3 p-2 icon-bg rounded-md flex items-center justify-center">
                    <FileCode
                      className={`w-5 h-5 z-10 ${getTaskTypeColorClass(
                        task.type
                      )}`}
                    />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-blue-400">
                        {task.model || "default"}
                      </span>
                      <span
                        className={`text-xs bg-slate-700/50 px-2 py-0.5 rounded ${getTaskTypeColorClass(
                          task.type
                        )}`}
                      >
                        {task.type}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ml-auto
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
                        {task.status.charAt(0).toUpperCase() +
                          task.status.slice(1)}
                      </span>
                    </div>
                    <p className="text-sm mb-1">
                      Prompt: {task.prompt.substring(0, 80)}
                      {task.prompt.length > 80 ? "..." : ""}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <span>Assigning...</span>
                      <span className="ml-auto">
                        {formatTime(task.created_at)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-slate-400">
            <FileCode className="w-10 h-10 mb-2 text-slate-600" />
            <p>No tasks available. Refresh to load tasks.</p>
          </div>
        )}
      </div>
    </div>
  );
};
