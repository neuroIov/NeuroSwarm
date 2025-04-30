import React, { useState, useEffect } from "react";
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

export const GlobalStatistics = () => {
  const dispatch = useAppDispatch();
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

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

  const loadTasks = async (showToast = true) => {
    try {
      setIsRefreshing(true);

      // First try to refresh tasks by fetching new ones from freedom ai and image gen
      const refreshedCount = await refreshTasks(50); // Get up to 50 tasks to ensure we have enough
      console.log(`Refreshed ${refreshedCount} tasks`);

      // Dispatch the fetchTasks action to update Redux store
      const tasks = await dispatch(fetchTasks()).unwrap();
      console.log(`Fetched ${tasks.length} tasks total`);
      console.log(
        `Image tasks: ${tasks.filter((t) => t.type === "image").length}`
      );
      console.log(
        `Text tasks: ${tasks.filter((t) => t.type === "text").length}`
      );

      // Calculate stats from the fetched tasks (not the Redux store)
      if (tasks.length > 0) {
        // Calculate stats
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
      } else {
        // If no tasks were found, try to refresh one more time
        console.log("No tasks found, refreshing again");
        await refreshTasks(50); // Try to fetch and create up to 50 tasks
        const moreTasks = await dispatch(fetchTasks()).unwrap();
        console.log(`After second refresh: ${moreTasks.length} tasks`);
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
  };

  // Load initial tasks
  useEffect(() => {
    loadTasks();

    // Set up auto-refresh
    if (autoRefresh) {
      const interval = setInterval(() => {
        loadTasks(false);
      }, 30000); // Refresh every 30 seconds

      return () => clearInterval(interval);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh]);

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
        loadTasks(false);
      }
    }
  }, [tasksCompleted, prevCompletedTasks, allTasks.length]);

  // Update stats when allTasks changes
  useEffect(() => {
    if (allTasks.length > 0) {
      // Calculate stats from allTasks
      const computeTimes = allTasks
        .map((t) => t.compute_time || 0)
        .filter((t) => t > 0);
      const avgTime =
        computeTimes.length > 0
          ? computeTimes.reduce((sum, time) => sum + time, 0) /
            computeTimes.length
          : 0;

      // Gather unique user and node IDs
      const userIds = new Set(allTasks.map((t) => t.user_id).filter(Boolean));
      const nodeIds = new Set(allTasks.map((t) => t.node_id).filter(Boolean));

      setStats({
        totalTasks: allTasks.length,
        avgComputeTime: avgTime,
        totalUsers: userIds.size,
        activeNodes: nodeIds.size,
        networkLoad: Math.min(100, Math.floor(Math.random() * 30) + 40),
      });

      console.log(
        `Stats updated from allTasks: ${allTasks.length} tasks found`
      );
      console.log(
        `Task types: Image=${
          allTasks.filter((t) => t.type === "image").length
        }, Text=${allTasks.filter((t) => t.type === "text").length}`
      );
    } else if (allTasks.length === 0 && !isRefreshing) {
      // If no tasks are visible and we're not currently refreshing, try to get more
      console.log("No tasks visible in global view, triggering refresh");
      loadTasks(false);
    }
  }, [allTasks]);

  const handleRefresh = () => {
    loadTasks();
  };

  const toggleAutoRefresh = (checked: boolean) => {
    setAutoRefresh(checked);
    toast(checked ? "Auto-refresh enabled" : "Auto-refresh disabled");
  };

  // Format timestamp to display time only
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  // Get the appropriate color class based on task type
  const getTaskTypeColorClass = (type: string) => {
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
  };

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

      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-lg font-medium">Recent Global Tasks</h3>
          <div className="text-sm text-blue-400">
            <span className="mr-1">•</span> Network Load:{" "}
            {stats.networkLoad.toFixed(1)}%
          </div>
        </div>

        {allTasks.length > 0 ? (
          <div className="space-y-3 max-h-[800px] overflow-y-auto pr-2 custom-scrollbar">
            {allTasks.map((task, index) => (
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
