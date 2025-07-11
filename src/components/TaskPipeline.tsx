import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  CheckCircle,
  Clock,
  Zap,
  XCircle,
  Loader2,
  FileCode,
  ImageIcon,
  AlignLeft,
  Calculator,
  RefreshCw,
  Video,
  Boxes as Cube,
} from "lucide-react";
import { InfoTooltip } from "./InfoTooltip";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useSelector } from "react-redux";
import { RootState, useAppDispatch } from "@/store";
import {
  setCurrentTask,
  fetchAndAssignTasks,
  updateTaskStatus,
  processNextTask,
  recoverStuckTasks,
  generateProxyTasks,
} from "@/store/slices/taskSlice";
import {
  incrementTasksCompleted,
  updateSuccessRate,
} from "@/store/slices/nodeSlice";
import { AITask, TaskStatus, TaskType } from "@/services/types";
import { Button } from "@/components/ui/button";
import { TASK_PROCESSING_CONFIG } from "@/services/config";

export const TaskPipeline = () => {
  const dispatch = useAppDispatch();
  const { isActive, nodeId, rewardTier } = useSelector((state: RootState) => state.node);
  const { assignedTasks, currentTask, isLoading, isProcessing } = useSelector(
    (state: RootState) => state.tasks
  );
  const { userProfile } = useSelector((state: RootState) => state.session);
  const userId = userProfile?.id;

  const [autoMode, setAutoMode] = useState(true);
  const [stats, setStats] = useState({
    completed: 0,
    processing: 0,
    pending: 0,
    failed: 0,
    imageTasksCount: 0,
    textTasksCount: 0,
    threeDTasksCount: 0,
    videoTasksCount: 0,
  });

  // Simple flag to prevent concurrent operations
  const [localProcessing, setLocalProcessing] = useState(false);

  // References for task recovery and timeouts
  const recoveryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const taskAssignTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Update stats when tasks change
  useEffect(() => {
    if (!isActive) {
      setStats({
        completed: 0,
        processing: 0,
        pending: 0,
        failed: 0,
        imageTasksCount: 0,
        textTasksCount: 0,
        threeDTasksCount: 0,
        videoTasksCount: 0,
      });
      return;
    }

    const newStats = {
      completed: assignedTasks.filter((t) => t.status === "completed").length,
      processing: assignedTasks.filter((t) => t.status === "processing").length,
      pending: assignedTasks.filter((t) => t.status === "pending").length,
      failed: assignedTasks.filter((t) => t.status === "failed").length,
      imageTasksCount: assignedTasks.filter((t) => t.type === "image").length,
      textTasksCount: assignedTasks.filter((t) => t.type === "text").length,
      threeDTasksCount: assignedTasks.filter((t) => t.type === "three_d").length,
      videoTasksCount: assignedTasks.filter((t) => t.type === "video").length,
    };

    setStats(newStats);
  }, [assignedTasks, isActive]);

  // Cleanup function for timers
  const clearAllTimers = useCallback(() => {
    if (recoveryTimerRef.current) {
      clearTimeout(recoveryTimerRef.current);
      recoveryTimerRef.current = null;
    }

    if (taskAssignTimerRef.current) {
      clearTimeout(taskAssignTimerRef.current);
      taskAssignTimerRef.current = null;
    }
  }, []);

  // Recovery function for stuck tasks
  const recoverStuckTasksHandler = useCallback(() => {
    const stuckTasks = assignedTasks.filter(
      (t) =>
        t.status === "processing" &&
        new Date().getTime() - new Date(t.updated_at).getTime() > 60000
    );

    if (stuckTasks.length > 0) {
      console.warn(`Recovering ${stuckTasks.length} stuck tasks`);
      dispatch(recoverStuckTasks());

      // Only show toast for first stuck task to avoid spam
      if (stuckTasks[0]) {
        toast.error(
          `Task ${stuckTasks[0].id.slice(
            0,
            8
          )}... timed out and was marked as failed`
        );
      }
    }
  }, [assignedTasks, dispatch]);

  // Function to select a task to process
  const selectNextTask = useCallback(() => {
    // Choose pending task that's not currently selected
    const pendingTasks = assignedTasks.filter(
      (t) => t.status === "pending" && (!currentTask || t.id !== currentTask.id)
    );

    // If no pending tasks or we already have a valid task, do nothing
    if (pendingTasks.length === 0) {
      return false;
    }

    // Select first pending task
    dispatch(setCurrentTask(pendingTasks[0]));
    return true;
  }, [assignedTasks, currentTask, dispatch]);

  // Function to fetch more tasks if needed
  const checkAndFetchMoreTasks = useCallback(() => {
    // Only fetch more tasks if we have less than 2 pending tasks and we're not already fetching
    if (
      !isLoading &&
      !localProcessing &&
      userId &&
      nodeId &&
      isActive &&
      assignedTasks.filter((t) => t.status === "pending").length < 2
    ) {
      // Avoid scheduling multiple fetches
      if (taskAssignTimerRef.current) {
        clearTimeout(taskAssignTimerRef.current);
      }

      // Generate proxy tasks instead of fetching from API
      taskAssignTimerRef.current = setTimeout(() => {
        dispatch(generateProxyTasks());
        taskAssignTimerRef.current = null;
      }, 3000);
    }
  }, [
    isLoading,
    localProcessing,
    userId,
    nodeId,
    isActive,
    assignedTasks,
    dispatch,
  ]);

  // Main task processing effect - simplified to reduce race conditions
  useEffect(() => {
    // Exit conditions
    if (!autoMode || !isActive || !userId || !nodeId) {
      clearAllTimers();
      return;
    }

    // If already processing or there's no current task, don't start
    if (isProcessing || localProcessing) {
      return;
    }

    // Set up a timer to recover stuck tasks
    if (!recoveryTimerRef.current) {
      recoveryTimerRef.current = setInterval(() => {
        recoverStuckTasksHandler();
      }, 30000); // Check every 30 seconds
    }

    // Handle task selection and processing
    const processTask = async () => {
      // Skip if already processing
      if (isProcessing || localProcessing) {
        return;
      }

      // Make sure we have a valid task to process
      if (!currentTask || currentTask.status !== "pending") {
        if (!selectNextTask()) {
          // No tasks to select, check if we need to fetch more
          checkAndFetchMoreTasks();
          return;
        }

        // Let the next cycle handle the newly selected task
        return;
      }

      try {
        // Set local processing flag
        setLocalProcessing(true);

        // Process the task
        const result = await dispatch(processNextTask()).unwrap();

        if (result.success) {
          // Update node metrics
          dispatch(incrementTasksCompleted());

          // Calculate success rate
          const successRate = Math.round(
            ((stats.completed + 1) / (stats.completed + 1 + stats.failed)) * 100
          );

          dispatch(updateSuccessRate(successRate));

          // Show success toast
          toast.success(
            `Task completed: ${
              currentTask.type === "image"
                ? "Image generated"
                : currentTask.type === "text"
                ? "Text processed"
                : currentTask.type === "three_d"
                ? "3D model created"
                : "Video generated"
            }`
          );
        } else {
          // Task failed
          const successRate = Math.round(
            (stats.completed / (stats.completed + stats.failed + 1)) * 100
          );

          dispatch(updateSuccessRate(successRate));

          // Only show error toast for non-expected failures
          if (
            !(
              "message" in result &&
              (result.message === "Task is no longer current" ||
                result.message === "Processing lock could not be acquired")
            )
          ) {
            toast.error(`Failed to process ${currentTask.type} task`);
          }
        }

        // Always select next task after completion
        selectNextTask();

        // Check if we need more tasks
        checkAndFetchMoreTasks();
      } catch (error) {
        console.error("Error processing task:", error);

        // Only show unexpected errors
        if (
          error.message !== "No pending tasks to process" &&
          error.message !== "Processing lock could not be acquired"
        ) {
          toast.error("Error processing task");
        }

        // Still try to select next task after error
        selectNextTask();
      } finally {
        // Reset local processing state with a delay
        setTimeout(() => {
          setLocalProcessing(false);
        }, 1000);
      }
    };

    // Only start processing if we're not already and we have tasks
    if (!isProcessing && !localProcessing && assignedTasks.length > 0) {
      processTask();
    } else if (assignedTasks.length === 0) {
      // If no tasks at all, try to get some
      checkAndFetchMoreTasks();
    }

    // On unmount, clear all timers
    return () => {
      clearAllTimers();
    };
  }, [
    isActive,
    userId,
    nodeId,
    autoMode,
    isProcessing,
    localProcessing,
    currentTask,
    assignedTasks,
    stats,
    selectNextTask,
    checkAndFetchMoreTasks,
    recoverStuckTasksHandler,
    clearAllTimers,
    dispatch,
  ]);

  // Whenever node is activated, fetch tasks
  useEffect(() => {
    if (isActive && userId && nodeId) {
      dispatch(
        fetchAndAssignTasks({
          userId,
          nodeId,
          batchSize: 5,
        })
      );

      // Generate initial proxy tasks
      dispatch(generateProxyTasks());
    }
  }, [isActive, userId, nodeId, dispatch]);

  const toggleAutoMode = (checked: boolean) => {
    setAutoMode(checked);

    if (checked) {
      toast.info("Auto mode enabled");
      // Re-fetch tasks if enabled
      if (isActive && userId && nodeId) {
        dispatch(generateProxyTasks());
      }
    } else {
      toast.info("Auto mode disabled");
    }
  };

  // Manual task processing for non-auto mode
  const handleProcessCurrentTask = async () => {
    if (
      isProcessing ||
      localProcessing ||
      !currentTask ||
      !userId ||
      !isActive
    ) {
      return;
    }

    try {
      setLocalProcessing(true);

      // Process the current task
      const result = await dispatch(processNextTask()).unwrap();

      if (result.success) {
        // Task completed successfully
        dispatch(incrementTasksCompleted());
        toast.success(`Task completed successfully`);

        // Update success rate
        const successRate = Math.round(
          ((stats.completed + 1) / (stats.completed + 1 + stats.failed)) * 100
        );
        dispatch(updateSuccessRate(successRate));
      } else {
        // Task failed
        toast.error(`Failed to process task`);

        // Update success rate
        const successRate = Math.round(
          (stats.completed / (stats.completed + stats.failed + 1)) * 100
        );
        dispatch(updateSuccessRate(successRate));
      }

      // Select next task
      selectNextTask();
    } catch (error) {
      console.error("Error processing task:", error);
      toast.error("Error processing task");
    } finally {
      // Reset local processing state with a delay
      setTimeout(() => {
        setLocalProcessing(false);
      }, 1000);
    }
  };

  const getStatusIcon = (status: TaskStatus) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case "processing":
        return <Zap className="w-5 h-5 text-blue-500" />;
      case "pending":
        return <Clock className="w-5 h-5 text-amber-500" />;
      case "failed":
        return <XCircle className="w-5 h-5 text-red-500" />;
    }
  };

  const getTaskTypeIcon = (type: TaskType) => {
    switch (type) {
      case "image":
        return <ImageIcon className="w-5 h-5 text-purple-500" />;
      case "text":
        return <AlignLeft className="w-5 h-5 text-blue-500" />;
      case "three_d":
        return <Cube className="w-5 h-5 text-green-500" />;
      case "video":
        return <Video className="w-5 h-5 text-red-500" />;
      default:
        return <FileCode className="w-5 h-5 text-gray-500" />;
    }
  };

  const getEstimatedTime = (task: AITask): number => {
    // Get appropriate processing time based on task type and hardware
    return TASK_PROCESSING_CONFIG.PROCESSING_TIME[task.type as keyof typeof TASK_PROCESSING_CONFIG.PROCESSING_TIME] * 
      TASK_PROCESSING_CONFIG.HARDWARE_MULTIPLIERS[rewardTier as keyof typeof TASK_PROCESSING_CONFIG.HARDWARE_MULTIPLIERS];
  };

  const refreshTaskList = () => {
    if (!userId || !nodeId) return;

    // Generate new tasks
    dispatch(generateProxyTasks());
    toast.info("Refreshing tasks...");
  };

  const getRewardForTask = (task: AITask): number => {
    const baseReward = TASK_PROCESSING_CONFIG.EARNINGS_NLOVE[task.type as keyof typeof TASK_PROCESSING_CONFIG.EARNINGS_NLOVE] || 5;
    const multiplier = TASK_PROCESSING_CONFIG.REWARD_MULTIPLIERS[rewardTier as keyof typeof TASK_PROCESSING_CONFIG.REWARD_MULTIPLIERS] || 1;
    return baseReward * multiplier;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h2 className="text-lg font-medium">Task Pipeline</h2>
          <InfoTooltip
            content={
              "Tasks are automatically generated and processed based on your hardware tier. Higher tier hardware earns more rewards."
            }
          />
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-sm text-muted-foreground">Auto</span>
            <Switch checked={autoMode} onCheckedChange={toggleAutoMode} />
          <Button
            size="icon"
            variant="outline"
            onClick={refreshTaskList}
            disabled={isLoading || localProcessing}
            title="Refresh task list"
          >
            <RefreshCw
              className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-muted/50 rounded-lg p-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Pending</p>
            <p className="text-2xl font-semibold">{stats.pending}</p>
          </div>
          <Clock className="w-6 h-6 text-amber-500" />
        </div>

        <div className="bg-muted/50 rounded-lg p-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Processing</p>
            <p className="text-2xl font-semibold">{stats.processing}</p>
          </div>
          <Zap className="w-6 h-6 text-blue-500" />
        </div>

        <div className="bg-muted/50 rounded-lg p-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Completed</p>
            <p className="text-2xl font-semibold">{stats.completed}</p>
          </div>
          <CheckCircle className="w-6 h-6 text-green-500" />
        </div>

        <div className="bg-muted/50 rounded-lg p-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Failed</p>
            <p className="text-2xl font-semibold">{stats.failed}</p>
          </div>
          <XCircle className="w-6 h-6 text-red-500" />
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <div className="bg-muted/50 px-4 py-2 text-sm font-medium flex justify-between">
          <span>Current Queue</span>
          <div className="flex items-center space-x-2">
            <span>{isActive ? "Active" : "Inactive"}</span>
            <span
              className={`w-2 h-2 rounded-full ${
                isActive ? "bg-green-500" : "bg-red-500"
              }`}
            ></span>
          </div>
        </div>

        <div
          className={`overflow-y-auto ${
            assignedTasks.length > 0 ? "max-h-80" : "h-20"
          }`}
        >
          {assignedTasks.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-muted-foreground text-sm">
                {isActive
                  ? "No tasks in queue. Starting up..."
                  : "Node is inactive. Start the node to process tasks."}
              </p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                    Task
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                    Type
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                    Status
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                    Est. Time
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                    Reward
                  </th>
                </tr>
              </thead>
              <tbody>
          {assignedTasks.map((task) => (
                  <tr
              key={task.id}
                    className={`border-b hover:bg-accent/50 ${
                      currentTask?.id === task.id ? "bg-accent/30" : ""
                    }`}
                  >
                    <td className="px-4 py-2 text-sm truncate max-w-[200px]">
                      {task.id.slice(0, 8)}...
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center">
                    {getTaskTypeIcon(task.type)}
                        <span className="ml-2 text-sm capitalize">
                          {task.type}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center">
                        {task.status === "processing" ? (
                          <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                        ) : (
                          getStatusIcon(task.status)
                        )}
                        <span className="ml-2 text-sm capitalize">
                          {task.status}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-sm">
                      {task.status === "completed"
                        ? `${Math.round(task.compute_time || 0)}s`
                        : task.status === "failed"
                        ? "Failed"
                        : `~${getEstimatedTime(task)}s`}
                    </td>
                    <td className="px-4 py-2 text-sm">
                      {getRewardForTask(task)} SP
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
                    )}
                  </div>
                </div>

      {!autoMode && currentTask && (
        <div className="flex justify-end">
            <Button
            onClick={handleProcessCurrentTask}
            disabled={
              isProcessing ||
              localProcessing ||
              !currentTask ||
              currentTask.status !== "pending" ||
              !isActive
            }
            className="relative"
          >
            {isProcessing || localProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
                </>
              ) : (
                <>
                <Zap className="w-4 h-4 mr-2" />
                Process Task
                </>
              )}
            </Button>
        </div>
      )}
    </div>
  );
};
