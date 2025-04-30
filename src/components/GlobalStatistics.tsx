import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Activity, Clock, Users, Server, RefreshCw } from "lucide-react";
import { InfoTooltip } from "./InfoTooltip";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { getRecentTasks } from "@/services/taskService";
import { refreshTasks, getQueuedTasks } from "@/services/swarmTaskService";
import { AITask } from "@/services/types";
import { FileCode } from "./ui/file-code";
import { useSelector } from "react-redux";
import { RootState, useAppDispatch } from "@/store";
import { fetchTasks } from "@/store/slices/taskSlice";

// Default refresh interval in milliseconds
const AUTO_REFRESH_INTERVAL = 60000; // Increased to 60 seconds
const TASK_CACHE_KEY = "global_statistics_task_cache";
const LAST_REFRESH_KEY = "global_statistics_last_refresh";

export const GlobalStatistics = () => {
  const dispatch = useAppDispatch();
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Cache for storing tasks to reduce duplicate requests
  const [taskCache, setTaskCache] = useState<AITask[]>([]);
  const [lastRefreshTime, setLastRefreshTime] = useState<number>(
    Number(localStorage.getItem(LAST_REFRESH_KEY)) || 0
  );

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

  // Load any cached tasks from localStorage on initial load
  useEffect(() => {
    try {
      const cachedTasks = localStorage.getItem(TASK_CACHE_KEY);
      if (cachedTasks) {
        const parsedTasks = JSON.parse(cachedTasks) as AITask[];
        if (parsedTasks.length > 0) {
          setTaskCache(parsedTasks);
        }
      }
    } catch (error) {
      console.error("Error loading task cache:", error);
    }
  }, []);

  // Cache tasks whenever they change
  useEffect(() => {
    if (allTasks.length > 0) {
      try {
        localStorage.setItem(TASK_CACHE_KEY, JSON.stringify(allTasks));
      } catch (error) {
        console.error("Error saving task cache:", error);
      }
    }
  }, [allTasks]);

  // Helper function to calculate and update stats - MOVED UP before loadTasks
  const calculateAndUpdateStats = useCallback((tasks: AITask[]) => {
    const computeTimes = tasks
      .map((t) => t.compute_time || 0)
      .filter((t) => t > 0);
    const avgTime =
      computeTimes.length > 0
        ? computeTimes.reduce((sum, time) => sum + time, 0) /
          computeTimes.length
        : 0;

    // Gather unique user and node IDs
    const userIds = new Set(tasks.map((t) => t.user_id).filter(Boolean));
    const nodeIds = new Set(tasks.map((t) => t.node_id).filter(Boolean));

    setStats({
      totalTasks: tasks.length,
      avgComputeTime: avgTime,
      totalUsers: userIds.size,
      activeNodes: nodeIds.size,
      networkLoad: Math.min(100, Math.floor(Math.random() * 30) + 40),
    });
  }, []);

  // Memoized function to load tasks to prevent unnecessary re-renders
  const loadTasks = useCallback(
    async (showToast = true, forceRefresh = false) => {
      try {
        // Check if we should skip this refresh (not forced and refreshed recently)
        const now = Date.now();
        const timeSinceLastRefresh = now - lastRefreshTime;

        if (
          !forceRefresh &&
          timeSinceLastRefresh < 30000 && // Less than 30 seconds since last refresh
          allTasks.length > 0
        ) {
          // We already have tasks loaded
          console.log(
            `Skipping refresh - last refresh was ${timeSinceLastRefresh}ms ago`
          );
          return;
        }

        setIsRefreshing(true);

        // First try to refresh tasks by fetching new ones from freedom ai and image gen
        const refreshedCount = await refreshTasks(50); // Get up to 50 tasks
        console.log(`Refreshed ${refreshedCount} tasks`);

        // Only fetch tasks if we need them (no tasks or forced refresh)
        if (allTasks.length === 0 || forceRefresh || refreshedCount > 0) {
          // Dispatch the fetchTasks action to update Redux store
          const tasks = await dispatch(fetchTasks({ forceRefresh })).unwrap();
          console.log(`Fetched ${tasks.length} tasks total`);
          console.log(
            `Image tasks: ${tasks.filter((t) => t.type === "image").length}`
          );
          console.log(
            `Text tasks: ${tasks.filter((t) => t.type === "text").length}`
          );

          // Update last refresh time
          setLastRefreshTime(now);
          localStorage.setItem(LAST_REFRESH_KEY, now.toString());

          // Calculate stats from the fetched tasks (not the Redux store)
          if (tasks.length > 0) {
            calculateAndUpdateStats(tasks);
          } else if (refreshedCount > 0) {
            // We created new tasks but didn't fetch them, try again
            console.log("Created new tasks but didn't fetch them, retrying...");
            const moreTasks = await dispatch(
              fetchTasks({ forceRefresh: true })
            ).unwrap();
            console.log(`After second refresh: ${moreTasks.length} tasks`);
            if (moreTasks.length > 0) {
              calculateAndUpdateStats(moreTasks);
            }
          }
        } else {
          console.log("No new tasks created, using existing tasks for stats");
          if (allTasks.length > 0) {
            calculateAndUpdateStats(allTasks);
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
    [dispatch, allTasks, lastRefreshTime, calculateAndUpdateStats]
  );

  // Load initial tasks - using useEffect with empty dependency array runs only once
  useEffect(() => {
    // If we have cached tasks, use them first and then refresh in the background
    if (taskCache.length > 0) {
      console.log(
        `Using ${taskCache.length} cached tasks from previous session`
      );
      calculateAndUpdateStats(taskCache);
      // Refresh in the background without showing toast
      loadTasks(false, false);
    } else {
      // No cached tasks, do a normal load
      loadTasks(true, true);
    }

    // Set up auto-refresh
    let interval: NodeJS.Timeout | null = null;
    if (autoRefresh) {
      interval = setInterval(() => {
        loadTasks(false, false);
      }, AUTO_REFRESH_INTERVAL);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh, loadTasks, calculateAndUpdateStats, taskCache]);

  // Watch for tasks completed count changes to refresh the global task list
  useEffect(() => {
    if (tasksCompleted > prevCompletedTasks) {
      console.log(
        `Tasks completed changed: ${prevCompletedTasks} -> ${tasksCompleted}`
      );
      setPrevCompletedTasks(tasksCompleted);

      // If there are few visible tasks, refresh the list to show more pending tasks
      if (allTasks.length < 30) {
        console.log(
          `Task completed and only ${allTasks.length} tasks visible, refreshing task list`
        );
        loadTasks(false, true);
      }
    }
  }, [tasksCompleted, prevCompletedTasks, allTasks.length, loadTasks]);

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
            <Clock className="w-4 h-4 mr-2" /> Avg. Compute Time
          </div>
          <div className="text-2xl font-bold">
            {stats.avgComputeTime.toFixed(2)}s
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
