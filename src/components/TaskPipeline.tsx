import React, { useState, useEffect } from "react";
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
  updateTaskProgress,
  fetchAndAssignTasks,
  updateTask,
  TasksState,
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
  const { assignedTasks, currentTask, isLoading } = useSelector(
    (state: RootState) => state.tasks
  );

  const [autoMode, setAutoMode] = useState(true);
  const [stats, setStats] = useState({
    completed: 0,
    processing: 0,
    pending: 0,
    failed: 0,
    imageTasksCount: 0,
    textTasksCount: 0,
  });

  // Set current task when no current task is selected and tasks are available
  useEffect(() => {
    if (!currentTask && assignedTasks.length > 0 && isActive) {
      const nextTask = assignedTasks.find(
        (task) => task.status === "pending" || task.status === "processing"
      );
      if (nextTask) {
        dispatch(setCurrentTask(nextTask));
      }
    }
  }, [currentTask, assignedTasks, isActive, dispatch]);

  // Update stats when tasks change
  useEffect(() => {
    const newStats = {
      completed: assignedTasks.filter((t) => t.status === "completed").length,
      processing: assignedTasks.filter((t) => t.status === "processing").length,
      pending: assignedTasks.filter((t) => t.status === "pending").length,
      failed: assignedTasks.filter((t) => t.status === "failed").length,
      imageTasksCount: assignedTasks.filter((t) => t.type === "image").length,
      textTasksCount: assignedTasks.filter((t) => t.type === "text").length,
    };

    setStats(newStats);
  }, [assignedTasks]);

  // Process tasks in auto mode
  useEffect(() => {
    if (!autoMode || !isActive || !nodeId || !currentTask) return;

    let taskProcessingTimer: NodeJS.Timeout | null = null;

    const processCurrentTask = async () => {
      if (
        currentTask &&
        (currentTask.status === "pending" ||
          currentTask.status === "processing")
      ) {
        // Update task to processing if it's pending
        if (currentTask.status === "pending") {
          dispatch(
            updateTaskProgress({
              taskId: currentTask.id,
              status: "processing",
            })
          );
        }

        // Determine the processing time based on task type
        const processingTime = currentTask.type === "image" ? 30 : 15;

        // Process the task
        try {
          const { success, result } = await processTask(
            currentTask.id,
            processingTime
          );

          if (success) {
            // Update the task to completed with the result
            dispatch(
              updateTask({
                taskId: currentTask.id,
                status: "completed",
                result,
              })
            );

            // Update node stats
            dispatch(incrementTasksCompleted());

            // Toast for completed task
            toast.success(
              `Task completed: ${currentTask.type === "image"
                ? "Image generated"
                : "Text processed"
              }`
            );

            // Find the next pending task
            const nextTask = assignedTasks.find(
              (task) => task.id !== currentTask.id && task.status === "pending"
            );

            if (nextTask) {
              dispatch(setCurrentTask(nextTask));
            } else {
              // If no more tasks, check if we need to fetch more
              if (nodeId) {
                dispatch(fetchAndAssignTasks(nodeId));
              }
            }

            // Update success rate
            const successRate =
              ((stats.completed + 1) / (stats.completed + 1 + stats.failed)) *
              100;
            dispatch(updateSuccessRate(successRate));
          } else {
            // Mark task as failed
            dispatch(
              updateTask({
                taskId: currentTask.id,
                status: "failed",
              })
            );

            // Toast for failed task
            toast.error(`Task processing failed: ${currentTask.type}`);

            // Find the next pending task
            const nextTask = assignedTasks.find(
              (task) => task.id !== currentTask.id && task.status === "pending"
            );

            if (nextTask) {
              dispatch(setCurrentTask(nextTask));
            } else {
              // If no more tasks, check if we need to fetch more
              if (nodeId) {
                dispatch(fetchAndAssignTasks(nodeId));
              }
            }

            // Update success rate
            const successRate =
              (stats.completed / (stats.completed + stats.failed + 1)) * 100;
            dispatch(updateSuccessRate(successRate));
          }
        } catch (error) {
          console.error("Error processing task:", error);
          toast.error("Error processing task");

          // Mark task as failed
          dispatch(
            updateTask({
              taskId: currentTask.id,
              status: "failed",
            })
          );
        }
      }
    };

    if (
      currentTask &&
      (currentTask.status === "pending" || currentTask.status === "processing")
    ) {
      // Process tasks with a 3-second delay between tasks
      taskProcessingTimer = setTimeout(processCurrentTask, 3000);
    } else if (assignedTasks.length === 0 && nodeId) {
      // If there are no more tasks, try to fetch new ones
      dispatch(fetchAndAssignTasks(nodeId));
    } else if (!currentTask && assignedTasks.length > 0) {
      // If we have tasks but no current task, select one
      const nextTask = assignedTasks.find((task) => task.status === "pending");
      if (nextTask) {
        dispatch(setCurrentTask(nextTask));
      }
    }

    // Set up periodic task check every 30 seconds to fetch new tasks
    const periodicTaskCheck = setInterval(() => {
      // Only fetch new tasks if we have less than 3 pending tasks
      const pendingTasksCount = assignedTasks.filter(
        (t) => t.status === "pending"
      ).length;
      if (isActive && nodeId && pendingTasksCount < 3) {
        dispatch(fetchAndAssignTasks(nodeId));
      }
    }, 30000);

    return () => {
      if (taskProcessingTimer) {
        clearTimeout(taskProcessingTimer);
      }
      clearInterval(periodicTaskCheck);
    };
  }, [currentTask, autoMode, isActive, nodeId, assignedTasks, dispatch, stats]);

  const toggleAutoMode = (checked: boolean) => {
    setAutoMode(checked);
    toast(checked ? "Auto-processing enabled" : "Auto-processing disabled");
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
    <div className="stat-card rounded-3xl h-auto md:h-[50%]" style={{
      backgroundColor: 'rgba(9, 12, 24, 1)',
      width: '110%'
    }}>
      <div className="flex justify-between items-center mb-4 ">
        <div className="flex items-center gap-2">
          <h2 className="text-xl">Task Pipeline</h2>
          <InfoTooltip content="The task pipeline shows all tasks assigned to your nodes. Tasks are automatically processed when your nodes are active." />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 mr-2">
            {/* <span className="text-green-400 text-xs">
              Image ({stats.imageTasksCount})
            </span>
            <span className="text-blue-400 text-xs">
              Text ({stats.textTasksCount})
            </span> */}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400">NLOV Network Auto</span>
            <Switch checked={autoMode} onCheckedChange={toggleAutoMode} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 md:gap-4 mb-6 max-w-md">

        <div className="relative flex flex-col items-center p-3 bg-slate-800/30 rounded-2xl overflow-hidden" style={{ backgroundColor: 'rgba(15, 23, 42, 0.3)' }}>
          <div className="flex items-center gap-2">
            <img src="Check Icon.png" alt="" />
          </div>
          <span className="text-xs text-slate-400">Completed</span>
          <span className="text-xl font-bold">{stats.completed}</span>

          {/* Blue bottom bar */}
          <div className="absolute bottom-0 left-0 w-full h-2 bg-blue-600 rounded-b-lg" />
        </div>


        <div className="relative flex flex-col items-center p-3 bg-slate-800/30 rounded-2xl overflow-hidden" style={{ backgroundColor: 'rgba(15, 23, 42, 0.3)' }}>
          <div className="flex items-center gap-2">
            <img src="Vector (4).png" alt="" />
          </div>
          <span className="text-xs text-slate-400">Processing</span>
          <span className="text-xl font-bold">{stats.processing}</span>

          {/* Blue bottom bar */}
          <div className="absolute bottom-0 left-0 w-full h-2 bg-blue-600 rounded-b-lg" />
        </div>


        <div className="relative flex flex-col items-center p-3 bg-slate-800/30 rounded-2xl overflow-hidden" style={{ backgroundColor: 'rgba(15, 23, 42, 0.3)' }}>
          <div className="flex items-center gap-2">
            <img src="Group.png" alt="" />
          </div>
          <span className="text-xs text-slate-400">Pending</span>
          <span className="text-xl font-bold">{stats.pending}</span>

          {/* Bottom color bar */}
          <div className="absolute bottom-0 left-0 w-full h-2 bg-blue-600 rounded-b-lg" />
        </div>


        <div className="relative flex flex-col items-center p-3 bg-slate-800/30 rounded-2xl overflow-hidden" style={{ backgroundColor: 'rgba(15, 23, 42, 0.3)' }}>
          <div className="flex items-center gap-2">
            <img src="Vector (5).png" alt="" />
          </div>
          <span className="text-xs text-slate-400">Failed</span>
          <span className="text-xl font-bold">{stats.failed}</span>

          {/* Bottom color bar */}
          <div className="absolute bottom-0 left-0 w-full h-2 bg-blue-600 rounded-b-lg" />
        </div>

      </div>

      {isLoading ? (
        <div className="flex justify-center items-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-swarm-accent-purple" />
          <span className="ml-3 text-lg">Loading tasks...</span>
        </div>
      ) : assignedTasks.length > 0 ? (
        <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
          {assignedTasks.map((task) => (
            <div
              key={task.id}
              className={`task-card p-4 rounded-lg ${currentTask?.id === task.id ? "border border-swarm-accent-purple/50" : ""}`}
              style={{ backgroundColor: 'rgba(15, 23, 42, 0.3)' }}
            >
              <div className="flex items-start gap-3">
                <div className="mt-1">{getTaskTypeIcon(task.type)}</div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-sm font-medium ${task.type === "image"
                        ? "text-green-400"
                        : "text-blue-400"
                        }`}
                    >
                      {task.type}
                    </span>
                    <span className="text-xs bg-slate-700/50 px-2 py-0.5 rounded text-slate-300">
                      {task.model || "default"}
                    </span>
                    {currentTask?.id === task.id &&
                      task.status === "processing" && (
                        <span className="text-xs bg-blue-900/40 px-2 py-0.5 rounded-full text-blue-300 ml-2 flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Current
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
                    ${task.status === "completed"
                        ? "bg-green-900/50 text-green-300"
                        : ""
                      }
                    ${task.status === "processing"
                        ? "bg-blue-900/50 text-blue-300"
                        : ""
                      }
                    ${task.status === "pending"
                        ? "bg-amber-900/50 text-amber-300"
                        : ""
                      }
                    ${task.status === "failed"
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
        <div className="flex flex-col items-center justify-center py-16 text-slate-400" style={{ backgroundColor: 'rgba(15, 23, 42, 0.3)' }}>
          <FileCode className="w-12 h-12 mb-4 text-slate-600" />
          <p className="text-lg">No tasks assigned yet</p>
          <p className="text-sm mt-2">
            {isActive
              ? "Tasks will be assigned when they become available"
              : "Start your node to receive tasks"}
          </p>
          {isActive && (
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => nodeId && dispatch(fetchAndAssignTasks(nodeId))}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Check for tasks
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
