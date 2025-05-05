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
} from "@/store/slices/taskSlice";
import {
  incrementTasksCompleted,
  updateSuccessRate,
} from "@/store/slices/nodeSlice";
import { processTask } from "@/services/swarmTaskService";
import { AITask, TaskStatus, TaskType } from "@/services/types";
import { Button } from "@/components/ui/button";

export const TaskPipeline = () => {
  const dispatch = useAppDispatch();
  const { isActive, nodeId } = useSelector((state: RootState) => state.node);
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

      // Schedule task assignment with a delay to avoid overwhelming the system
      taskAssignTimerRef.current = setTimeout(() => {
        dispatch(fetchAndAssignTasks({ userId, nodeId }));
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
                : "Text processed"
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
        // Reset local processing state with a short delay
        setTimeout(() => {
          setLocalProcessing(false);
        }, 1000);
      }
    };

    // Start processing if we have a pending task selected
    if (currentTask?.status === "pending") {
      processTask();
    } else if (!currentTask && !isLoading) {
      // No current task, try to select one
      selectNextTask();
    }

    // Check if we need more tasks
    checkAndFetchMoreTasks();

    // Cleanup function
    return () => {
      clearAllTimers();
    };
  }, [
    autoMode,
    isActive,
    userId,
    nodeId,
    currentTask,
    isProcessing,
    localProcessing,
    isLoading,
    assignedTasks,
    stats,
    clearAllTimers,
    recoverStuckTasksHandler,
    selectNextTask,
    checkAndFetchMoreTasks,
    dispatch,
  ]);

  // Toggle auto mode
  const toggleAutoMode = (checked: boolean) => {
    setAutoMode(checked);
    setLocalProcessing(false);

    // Clear all timers
    clearAllTimers();

    // Recover any stuck tasks
    recoverStuckTasksHandler();

    toast(checked ? "Auto-processing enabled" : "Auto-processing disabled");
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

  // Get task type icon
  const getTaskTypeIcon = (type: TaskType) => {
    switch (type) {
      case "image":
        return <ImageIcon className="w-5 h-5 text-green-400" />;
      case "text":
        return <AlignLeft className="w-5 h-5 text-blue-400" />;
      default:
        return <Calculator className="w-5 h-5 text-purple-400" />;
    }
  };

  // Calculate estimated time remaining for a task
  const getEstimatedTime = (task: AITask): number => {
    if (task.status !== "processing") return 0;
    return task.type === "image" ? 30 : 15;
  };

  return (
    <div className="stat-card">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold">Task Pipeline</h2>
          <InfoTooltip content="The task pipeline shows all tasks assigned to your nodes. Tasks are automatically processed when your nodes are active." />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 mr-2">
            <span className="text-green-400 text-xs">
              Image ({stats.imageTasksCount})
            </span>
            <span className="text-blue-400 text-xs">
              Text ({stats.textTasksCount})
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-swarm-text-secondary">Auto</span>
            <Switch checked={autoMode} onCheckedChange={toggleAutoMode} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="flex flex-col items-center p-3 bg-slate-800/30 rounded-lg">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-500" />
            <span className="text-xl font-bold">{stats.completed}</span>
          </div>
          <span className="text-xs text-slate-400">Completed</span>
        </div>

        <div className="flex flex-col items-center p-3 bg-slate-800/30 rounded-lg">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-blue-500" />
            <span className="text-xl font-bold">{stats.processing}</span>
          </div>
          <span className="text-xs text-slate-400">Processing</span>
        </div>

        <div className="flex flex-col items-center p-3 bg-slate-800/30 rounded-lg">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-500" />
            <span className="text-xl font-bold">{stats.pending}</span>
          </div>
          <span className="text-xs text-slate-400">Pending</span>
        </div>

        <div className="flex flex-col items-center p-3 bg-slate-800/30 rounded-lg">
          <div className="flex items-center gap-2">
            <XCircle className="w-4 h-4 text-red-500" />
            <span className="text-xl font-bold">{stats.failed}</span>
          </div>
          <span className="text-xs text-slate-400">Failed</span>
        </div>
      </div>

      {!isActive ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
          <FileCode className="w-12 h-12 mb-4 text-slate-600" />
          <p className="text-lg">Node is not active</p>
          <p className="text-sm mt-2">
            Start your node to receive and view tasks
          </p>
        </div>
      ) : isLoading ? (
        <div className="flex justify-center items-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-swarm-accent-purple" />
          <span className="ml-3 text-lg">Loading tasks...</span>
        </div>
      ) : assignedTasks.length > 0 ? (
        <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
          {!autoMode && currentTask && currentTask.status === "pending" && (
            <div className="mb-4 flex justify-center">
              <Button
                disabled={localProcessing}
                onClick={handleProcessCurrentTask}
                className="bg-swarm-accent-purple hover:bg-swarm-accent-purple/80"
              >
                {localProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 mr-2" />
                    Process Selected Task
                  </>
                )}
              </Button>
            </div>
          )}

          {assignedTasks.map((task) => (
            <div
              key={task.id}
              className={`task-card ${
                currentTask?.id === task.id
                  ? "border border-swarm-accent-purple/50"
                  : ""
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-1">{getTaskTypeIcon(task.type)}</div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-sm font-medium ${
                        task.type === "image"
                          ? "text-green-400"
                          : "text-blue-400"
                      }`}
                    >
                      {task.type}
                    </span>
                    <span className="text-xs bg-slate-700/50 px-2 py-0.5 rounded text-slate-300">
                      {task.model || "default"}
                    </span>
                    {currentTask?.id === task.id && (
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ml-2 flex items-center gap-1 
                        ${
                          task.status === "processing"
                            ? "bg-blue-900/40 text-blue-300"
                            : "bg-amber-900/40 text-amber-300"
                        }`}
                      >
                        {task.status === "processing" ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Processing
                          </>
                        ) : (
                          <>
                            <Clock className="w-3 h-3" />
                            Selected
                          </>
                        )}
                      </span>
                    )}
                  </div>
                  <p className="text-sm mt-1 text-slate-200">
                    {task.prompt.substring(0, 100)}
                    {task.prompt.length > 100 ? "..." : ""}
                  </p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                    {task.result ? (
                      <span className="text-green-400">
                        {task.type === "image"
                          ? "Image generated successfully"
                          : task.result.substring(0, 50) +
                            (task.result.length > 50 ? "..." : "")}
                      </span>
                    ) : task.status === "processing" ? (
                      <span className="text-blue-400">Processing...</span>
                    ) : (
                      <span>Awaiting processing...</span>
                    )}
                    <span>{task.compute_time || 0}s</span>
                  </div>

                  {task.status === "processing" && (
                    <div className="w-full bg-slate-700/50 h-1 mt-2 rounded-full overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-blue-500 to-purple-500 h-1 rounded-full animate-pulse"
                        style={{ width: "60%" }}
                      ></div>
                    </div>
                  )}
                </div>
                <div className="ml-2 flex flex-col items-end">
                  <div
                    className={`
                    text-xs rounded-full px-2 py-0.5
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
                    {task.status === "processing" ? (
                      <div className="flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Processing</span>
                      </div>
                    ) : (
                      task.status.charAt(0).toUpperCase() + task.status.slice(1)
                    )}
                  </div>
                  {task.status === "processing" && (
                    <span className="text-xs mt-1 text-slate-400">
                      ~{getEstimatedTime(task)}s estimated
                    </span>
                  )}
                  {task.type === "image" && task.status !== "processing" && (
                    <span className="text-xs mt-1 text-green-400">
                      30s task
                    </span>
                  )}
                  {task.type === "text" && task.status !== "processing" && (
                    <span className="text-xs mt-1 text-blue-400">15s task</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
          <FileCode className="w-12 h-12 mb-4 text-slate-600" />
          <p className="text-lg">No tasks assigned yet</p>
          <p className="text-sm mt-2">
            {isActive
              ? "Tasks will be assigned when they become available"
              : "Start your node to receive tasks"}
          </p>
          {isActive && (
            <Button
              size="sm"
              className="mt-4"
              disabled={isLoading || localProcessing}
              onClick={() =>
                nodeId &&
                userId &&
                dispatch(fetchAndAssignTasks({ userId, nodeId }))
              }
            >
              {isLoading || localProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Get New Tasks
                </>
              )}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
