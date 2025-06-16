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
import { TASK_PROCESSING_CONFIG } from "@/services/config";
import { getSwarmSupabase } from "@/lib/supabase-client";

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

  // Function to refresh task list
  const refreshTaskList = () => {
    // If node is active, refresh assigned tasks
    if (isActive) {
      dispatch(fetchAndAssignTasks({ userId, nodeId }));
    }
  };

  // Set up real-time subscription for task updates
  useEffect(() => {
    if (!userProfile?.id) return;
    
    const client = getSwarmSupabase();
    
    // Subscribe only to the user's own tasks
    const tasksSubscription = client
      .channel(`tasks-${userProfile.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tasks",
          filter: `user_id=eq.${userProfile.id}`, // CRITICAL: Only listen for user's own tasks
        },
        (payload) => {
          console.log("Task update received:", payload);
          
          // Only refresh if needed, don't reload everything
          if (payload.eventType === "UPDATE" && payload.new && payload.old) {
            // If status changed, refresh the task list
            if (payload.new.status !== payload.old.status) {
              console.log("Task status changed, refreshing task list");
              refreshTaskList();
            }
          } else if (payload.eventType === "INSERT") {
            // New task assigned to user, refresh list
            console.log("New task assigned, refreshing task list");
            refreshTaskList();
          }
        }
      )
      .subscribe();
      
    return () => {
      client.removeChannel(tasksSubscription);
    };
  }, [userProfile?.id, dispatch]);

  return (
    <div className="task-pipeline p-2.5 sm:p-6 rounded-2xl sm:rounded-3xl stat-card relative">
      <div className="flex flex-row justify-between items-center gap-2 sm:gap-0 mb-3 sm:mb-6">
        <div className="flex items-center gap-1 sm:gap-2">
          <h2 className="text-sm sm:text-lg font-medium text-white/90">
            Task Pipeline
          </h2>
          <InfoTooltip content="The task pipeline shows all tasks assigned to your nodes. Tasks are automatically processed when your nodes are active." />
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="hidden sm:flex items-center gap-3 order-2 sm:order-1">
            <span className="text-green-400 text-xs">
              Image ({stats.imageTasksCount})
            </span>
            <span className="text-blue-400 text-xs">
              Text ({stats.textTasksCount})
            </span>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 order-1 sm:order-2">
            <span className="text-[10px] sm:text-sm text-white/60">Auto</span>
            <Switch checked={autoMode} onCheckedChange={toggleAutoMode} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-3 sm:mb-6">
        <div className="rounded-xl overflow-hidden bg-[#1D1D33] relative">
          <div className="p-2 sm:p-4 pb-1.5 sm:pb-3 flex flex-col items-center">
            <img
              src="/images/completed.png"
              alt="Completed"
              className="w-3.5 h-3.5 sm:w-5 sm:h-5 object-contain mb-0.5 sm:mb-2"
            />
            <span className="text-[10px] sm:text-sm text-white/60">
              Completed
            </span>
            <span className="text-lg sm:text-2xl font-semibold text-white mt-0.5 sm:mt-1">
              {stats.completed}
            </span>
          </div>
          <div className="h-1.5 sm:h-2 w-full bg-[#0361DA]"></div>
        </div>

        <div className="rounded-xl overflow-hidden bg-[#1D1D33] relative">
          <div className="p-2 sm:p-4 pb-1.5 sm:pb-3 flex flex-col items-center">
            <img
              src="/images/processing.png"
              alt="Processing"
              className="w-3.5 h-3.5 sm:w-5 sm:h-5 object-contain mb-0.5 sm:mb-2"
            />
            <span className="text-[10px] sm:text-sm text-white/60">
              Processing
            </span>
            <span className="text-lg sm:text-2xl font-semibold text-white mt-0.5 sm:mt-1">
              {stats.processing}
            </span>
          </div>
          <div className="h-1.5 sm:h-2 w-full bg-[#0361DA]"></div>
        </div>

        <div className="rounded-xl overflow-hidden bg-[#1D1D33] relative">
          <div className="p-2 sm:p-4 pb-1.5 sm:pb-3 flex flex-col items-center">
            <img
              src="/images/pending.png"
              alt="Pending"
              className="w-3.5 h-3.5 sm:w-5 sm:h-5 object-contain mb-0.5 sm:mb-2"
            />
            <span className="text-[10px] sm:text-sm text-white/60">
              Pending
            </span>
            <span className="text-lg sm:text-2xl font-semibold text-white mt-0.5 sm:mt-1">
              {stats.pending}
            </span>
          </div>
          <div className="h-1.5 sm:h-2 w-full bg-[#0361DA]"></div>
        </div>

        <div className="rounded-xl overflow-hidden bg-[#1D1D33] relative">
          <div className="p-2 sm:p-4 pb-1.5 sm:pb-3 flex flex-col items-center">
            <img
              src="/images/error.png"
              alt="Failed"
              className="w-3.5 h-3.5 sm:w-5 sm:h-5 object-contain mb-0.5 sm:mb-2"
            />
            <span className="text-[10px] sm:text-sm text-white/60">Failed</span>
            <span className="text-lg sm:text-2xl font-semibold text-white mt-0.5 sm:mt-1">
              {stats.failed}
            </span>
          </div>
          <div className="h-1.5 sm:h-2 w-full bg-[#0361DA]"></div>
        </div>
      </div>

      {!isActive ? (
        <div className="flex flex-col items-center justify-center py-6 sm:py-16 text-white/60">
          <div className="w-10 h-10 sm:w-16 sm:h-16 flex items-center justify-center rounded-md bg-[#1D1D33]/50 mb-3 sm:mb-6">
            <FileCode className="w-5 h-5 sm:w-8 sm:h-8 text-white/30" />
          </div>
          <p className="text-base sm:text-xl font-medium">Node is not active</p>
          <p className="text-[10px] sm:text-sm mt-1 sm:mt-2">
            Start your node to receive and view tasks
          </p>
        </div>
      ) : isLoading ? (
        <div className="flex justify-center items-center py-6 sm:py-16">
          <Loader2 className="w-5 h-5 sm:w-8 sm:h-8 animate-spin text-blue-500" />
          <span className="ml-2 sm:ml-3 text-sm sm:text-lg text-white/70">
            Loading tasks...
          </span>
        </div>
      ) : assignedTasks.length > 0 ? (
        <div className="space-y-2 sm:space-y-4 max-h-[500px] sm:max-h-[600px] overflow-y-auto pr-1 sm:pr-2 custom-scrollbar">
          {!autoMode && currentTask && currentTask.status === "pending" && (
            <div className="mb-2 sm:mb-4 flex justify-center">
              <Button
                disabled={localProcessing}
                onClick={handleProcessCurrentTask}
                className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] sm:text-sm py-1 px-2 sm:py-2 sm:px-4 h-7 sm:h-auto"
              >
                {localProcessing ? (
                  <>
                    <Loader2 className="w-2.5 h-2.5 sm:w-4 sm:h-4 mr-1 sm:mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Zap className="w-2.5 h-2.5 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                    Process Task
                  </>
                )}
              </Button>
            </div>
          )}

          {assignedTasks.map((task) => (
            <div
              key={task.id}
              className="rounded-xl overflow-hidden bg-[#1D1D33] border border-[#252547] transition-all duration-200 hover:border-blue-600/30"
            >
              <div className="p-2 sm:p-4">
                <div className="flex items-start gap-1.5 sm:gap-3">
                  <div className="flex-shrink-0 mt-0.5 sm:mt-1">
                    {getTaskTypeIcon(task.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-1 sm:gap-2">
                      <div className="flex items-center rounded-full py-0.5 sm:py-1">
                        <span className="text-[10px] sm:text-sm text-[#0361DA] font-medium truncate">
                          {task.type === "image"
                            ? "neuro-image-gen"
                            : "freedomai-llm"}
                        </span>
                      </div>
                      <div>
                        {task.status === "completed" && (
                          <div className="border rounded-full border-green-500 bg-green-500/10 text-green-400 text-[10px] sm:text-xs font-medium px-1.5 sm:px-3 py-0.5 sm:py-1">
                            Completed
                          </div>
                        )}
                        {task.status === "processing" && (
                          <div className="border rounded-full border-blue-500 bg-blue-500/10 text-blue-400 text-[10px] sm:text-xs font-medium px-1.5 sm:px-3 py-0.5 sm:py-1">
                            Processing
                          </div>
                        )}
                        {task.status === "pending" && (
                          <div className="border border-amber-500 bg-amber-500/10 text-amber-400 text-[10px] sm:text-xs font-medium px-1.5 sm:px-3 py-0.5 sm:py-1 rounded-full">
                            Pending
                          </div>
                        )}
                        {task.status === "failed" && (
                          <div className="border border-red-500 bg-red-500/10 text-red-400 text-[10px] sm:text-xs font-medium px-1.5 sm:px-3 py-0.5 sm:py-1 rounded-full">
                            Failed
                          </div>
                        )}
                      </div>
                    </div>
                    <p className="text-[10px] sm:text-sm text-white/80 mt-1 sm:mt-2 break-all">
                      Task ID: {task.id}
                    </p>

                    {task.status === "completed" && (
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-[#515194] mt-1">
                          Task completed successfully
                        </p>
                        <span className="text-xs mt-1 text-stone-50">
                          {task.type === "image"
                            ? TASK_PROCESSING_CONFIG.PROCESSING_TIME.image
                            : TASK_PROCESSING_CONFIG.PROCESSING_TIME.text}
                          s
                        </span>
                      </div>
                    )}

                    {task.status === "processing" && (
                      <>
                        <p className="text-xs text-white/55 mt-1">
                          Processing...
                        </p>
                        <div className="w-full h-1.5 bg-[#1A1A4C] rounded-full overflow-hidden mt-2">
                          <div className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-blue-500 rounded-full w-1/2 animate-pulse"></div>
                        </div>
                      </>
                    )}

                    {task.status === "pending" && (
                      <p className="text-xs text-[#515194] mt-1">
                        Awaiting transaction...
                      </p>
                    )}

                    {task.status === "failed" && (
                      <p className="text-xs text-[#515194] mt-1">Task failed</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-white/60">
          <div className="w-16 h-16 flex items-center justify-center rounded-md bg-[#1D1D33]/50 mb-6">
            <FileCode className="w-8 h-8 text-white/30" />
          </div>
          <p className="text-xl font-medium">No tasks assigned yet</p>
          <p className="text-sm mt-2">
            {isActive
              ? "Tasks will be assigned when they become available"
              : "Start your node to receive tasks"}
          </p>
          {isActive && (
            <Button
              size="sm"
              className="mt-6 bg-blue-600 hover:bg-blue-700 text-white"
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
