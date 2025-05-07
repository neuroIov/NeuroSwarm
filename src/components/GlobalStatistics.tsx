import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Activity, Clock, Users, Server, RefreshCw } from "lucide-react";
import { InfoTooltip } from "./InfoTooltip";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { logger } from '@/utils/logger';
import { safeStorage } from '@/utils/storage';
import { toast } from "sonner";
import { getQueuedTasks } from "@/services/swarmTaskService";
import { AITask } from "@/services/types";
import { FileCode } from "./ui/file-code";
import { useSelector } from "react-redux";
import { RootState, useAppDispatch } from "@/store";
import { fetchPendingTasks } from "@/store/slices/taskSlice";
import { getSwarmSupabase } from "@/lib/supabase-client";
import { formatUptime } from "@/utils/timeUtils";

// Default refresh interval in milliseconds
const AUTO_REFRESH_INTERVAL = 120000; // Increased to 120 seconds (2 minutes)
const TASK_CACHE_KEY = "global_statistics_task_cache";
const LAST_REFRESH_KEY = "global_statistics_last_refresh";
const MIN_REFRESH_INTERVAL = 30000; // Minimum time between refreshes (30 seconds)

export const GlobalStatistics = () => {
  const dispatch = useAppDispatch();
  const client = getSwarmSupabase();
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Cache for storing tasks to reduce duplicate requests
  const [taskCache, setTaskCache] = useState<AITask[]>([]);
  const [lastRefreshTime, setLastRefreshTime] = useState<number>(0);

  // Get tasks from Redux store
  const { allTasks } = useSelector((state: RootState) => state.tasks);
  const { tasksCompleted } = useSelector((state: RootState) => state.node);

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
          toast.success("Global statistics refreshed");
        }
      } catch (error) {
        console.error("Error loading tasks:", error);
        setIsRefreshing(false);
        if (showToast) {
          toast.error("Failed to refresh statistics");
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
            <Switch checked={autoRefresh} onCheckedChange={toggleAutoRefresh} />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="bg-slate-700/50 border-slate-600"
          >
            <RefreshCw
              className={`w-4 h-4 mr-1 ${isRefreshing ? "animate-spin" : ""}`}
            />
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </Button>
        </div>
      </div>

      {statsCards}

      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-lg font-medium">Recent Global Tasks</h3>
          <div className="text-sm text-blue-400">
            <span className="mr-1">•</span> Network Load:{" "}
            {stats.networkLoad.toFixed(1)}%
          </div>
        </div>

        {displayTasks.length > 0 ? (
          <div className="space-y-3 max-h-[800px] overflow-y-auto pr-2 custom-scrollbar">
            {displayTasks.map((task, index) => (
              <div key={`${task.id}-${index}`} className="task-card">
                <div className="flex">
                  <div className="mr-3 p-2 bg-blue-900/20 rounded">
                    <div className="w-8 h-8 flex items-center justify-center">
                      <FileCode
                        className={`w-5 h-5 ${getTaskTypeColorClass(
                          task.type
                        )}`}
                      />
                    </div>
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
                        className={`text-xs px-2 py-0.5 rounded ml-auto 
                        ${
                          task.status === "completed"
                            ? "bg-green-900/50 text-green-300"
                            : ""
                        }
                        ${
                          task.status === "processing"
                            ? "bg-blue-900/50 text-blue-300"
                            : ""
                        }
                        ${
                          task.status === "pending"
                            ? "bg-amber-900/50 text-amber-300"
                            : ""
                        }
                        ${
                          task.status === "failed"
                            ? "bg-red-900/50 text-red-300"
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
                      <span>{task.compute_time || 0}s</span>
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
