import React, { useState, useEffect } from "react";
import { getTierByName } from "@/lib/subscriptionTiers";

import {
  Cpu,
  HardDrive,
  Activity,
  Clock,
  PlusCircle,
  Power,
  Loader2,
  Scan,
  Laptop,
  Monitor,
  Tablet,
  Smartphone,
  AlertTriangle,
  Trash2,
} from "lucide-react";
import { getSwarmSupabase } from "@/lib/supabase-client";
import { Button } from "@/components/ui/button";
import { InfoTooltip } from "./InfoTooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  detectHardware,
  getDeviceTypesForGroup,
  getDeviceBrands,
  getDeviceModels,
  requiresCustomSpecs,
} from "@/utils/hardwareDetection";
import { Input } from "@/components/ui/input";
import { useSelector } from "react-redux";
import {
  startNode,
  stopNode,
  updateNodeMetrics,
  loadUptimeFromDatabase,
  setUptimeFromDatabase,
  syncUptime,
} from "@/store/slices/nodeSlice";
import {
  fetchAndAssignTasks,
  clearAssignedTasks,
} from "@/store/slices/taskSlice";
import { useSession } from "@/hooks/useSession";

import { RootState, useAppDispatch } from "@/store";
import { assignTasksToUser } from "@/services/swarmTaskService";
import { useEarnings } from "@/hooks/useEarnings";
import {
  getUserEarnings,
  getUserTotalEarnings,
} from "@/services/earningsService";
import { VscDebugStart } from "react-icons/vsc";
import { IoStopOutline } from "react-icons/io5";

type DeviceGroup = "desktop_laptop" | "mobile_tablet";

// Import the HardwareInfo interface to match the type returned by detectHardware()
interface HardwareInfo {
  cpuCores: number;
  deviceMemory: number | string;
  gpuInfo: string;
  deviceGroup: DeviceGroup;
  deviceType?: "desktop" | "laptop" | "tablet" | "mobile";
  deviceBrand?: string;
  deviceModel?: string;
  customSpecs?: {
    cpu?: string;
    gpu?: string;
  };
  rewardTier: "webgpu" | "wasm" | "webgl" | "cpu";
}

interface NodeInfo {
  id: string;
  name: string;
  type: "desktop" | "laptop" | "tablet" | "mobile";
  brand?: string;
  model?: string;
  customSpecs?: {
    cpu?: string;
    gpu?: string;
  };
  rewardTier: "webgpu" | "wasm" | "webgl" | "cpu";
  status: "idle" | "running" | "offline";
  cpuCores?: number;
  memory?: number | string;
  gpuInfo?: string;
}

export const NodeControlPanel = () => {
  const dispatch = useAppDispatch();
  const client = getSwarmSupabase();
  const { session } = useSession();
  const userProfile = session.userProfile;
  const walletConnected = !!session.walletAddress;

  const {
    isActive,
    nodeId,
    nodeName,
    nodeType,
    rewardTier,
    cpuUsage,
    memoryUsage,
    networkUsage,
    tasksCompleted,
    successRate,
  } = useSelector((state: RootState) => state.node);

  const [nodes, setNodes] = useState<NodeInfo[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string>("");
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [showScanDialog, setShowScanDialog] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanStage, setScanStage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalEarnings, setTotalEarnings] = useState(0);
  const { subscriptionTier } = useSession();
  const tierInfo = getTierByName(subscriptionTier);

  // Device selection state
  const [showDeviceTypeDialog, setShowDeviceTypeDialog] = useState(false);
  const [detectedHardware, setDetectedHardware] = useState<HardwareInfo | null>(
    null
  );
  const [deviceGroup, setDeviceGroup] = useState<DeviceGroup>("desktop_laptop");
  const [selectedDeviceType, setSelectedDeviceType] = useState<
    "desktop" | "laptop" | "tablet" | "mobile"
  >("desktop");
  const [selectedBrand, setSelectedBrand] = useState<string>("");
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [customSpecs, setCustomSpecs] = useState<{
    cpu?: string;
    gpu?: string;
  }>({});
  const [selectedVRAM, setSelectedVRAM] = useState<number>(0);
  const [isCreatingDevice, setIsCreatingDevice] = useState(false);

  // Delete node state
  const [isDeletingNode, setIsDeletingNode] = useState(false);
  const [showDeleteConfirmDialog, setShowDeleteConfirmDialog] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  // Add useEffect for refreshing total earnings every 30 seconds
  useEffect(() => {
    // Skip if user is not logged in
    if (!userProfile?.id) return;

    // Initial fetch
    fetchEarningsData(true);

    // Set up interval to refresh earnings every 30 seconds
    const earningsInterval = setInterval(() => {
      fetchEarningsData(true);
    }, 30000); // 30 seconds

    // Clean up interval on component unmount
    return () => {
      clearInterval(earningsInterval);
    };
  }, [userProfile?.id]);

  const fetchEarningsData = async (silent = false) => {
    if (!userProfile?.id) return;

    if (!silent) setLoading(true);
    setError(null);

    try {
      const totalAmount = await getUserTotalEarnings(userProfile?.id);
      setTotalEarnings(totalAmount);
    } catch (err) {
      setError("Failed to load earnings data");
      console.error("Error fetching earnings:", err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Update selectedNodeId when nodeId from redux changes
  useEffect(() => {
    if (nodeId) {
      setSelectedNodeId(nodeId);
    }
  }, [nodeId]);

  // Fetch node uptime when selected node changes
  useEffect(() => {
    const fetchNodeUptime = async () => {
      if (!selectedNodeId || !userProfile?.id) return;

      try {
        const { data, error } = await client
          .from("devices")
          .select("uptime")
          .eq("id", selectedNodeId)
          .single();

        if (error) throw error;

        if (data) {
          console.log(
            `Fetched uptime for node ${selectedNodeId}: ${data.uptime} seconds`
          );
          // If the node is currently active, we don't want to override the current uptime
          // as it's being tracked in real-time
          if (!isActive || nodeId !== selectedNodeId) {
            // Use the new action creator to set the uptime in Redux
            dispatch(setUptimeFromDatabase(data.uptime || 0));
          }
        }
      } catch (error) {
        console.error("Error fetching node uptime:", error);
      }
    };

    fetchNodeUptime();
  }, [selectedNodeId, userProfile?.id, isActive, nodeId, dispatch]);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  // Node metrics simulation when active
  useEffect(() => {
    let metricsInterval: NodeJS.Timeout | null = null;

    if (isActive) {
      metricsInterval = setInterval(() => {
        const newCpuUsage = Math.min(95, cpuUsage + (Math.random() * 10 - 5));
        const newMemoryUsage = Math.min(
          95,
          memoryUsage + (Math.random() * 8 - 4)
        );
        const newNetworkUsage = Math.max(
          0.1,
          networkUsage + (Math.random() * 1 - 0.5)
        );

        dispatch(
          updateNodeMetrics({
            cpuUsage: newCpuUsage,
            memoryUsage: newMemoryUsage,
            networkUsage: newNetworkUsage,
          })
        );
      }, 3000);
    }

    return () => {
      if (metricsInterval) {
        clearInterval(metricsInterval);
      }
    };
  }, [isActive, cpuUsage, memoryUsage, networkUsage, dispatch]);

  // Fetch user's devices when component mounts or user profile changes
  useEffect(() => {
    const fetchUserDevices = async () => {
      if (!userProfile?.id) return;

      try {
        const { data: devices, error } = await client
          .from("devices")
          .select("*")
          .eq("owner", userProfile.id);

        if (error) throw error;

        // Convert devices to NodeInfo format
        const userNodes: NodeInfo[] = devices.map((device) => ({
          id: device.id,
          name: `${device.device_specs.brand} ${device.device_specs.model}`,
          type: device.device_specs.type,
          brand: device.device_specs.brand,
          model: device.device_specs.model,
          customSpecs: {
            cpu: device.device_specs.cpu,
            gpu: device.device_specs.gpu,
          },
          rewardTier: device.device_specs.gpuInfo
            ?.toLowerCase()
            .includes("webgpu")
            ? "webgpu"
            : device.device_specs.gpuInfo?.toLowerCase().includes("wasm")
            ? "wasm"
            : device.device_specs.gpuInfo?.toLowerCase().includes("webgl")
            ? "webgl"
            : "cpu",
          status: device.status === "offline" ? "idle" : "running",
          cpuCores: device.device_specs.cpuCores,
          memory: device.device_specs.memory,
          gpuInfo: device.gpu_model,
        }));

        setNodes(userNodes);

        // If there's no selected node and we have nodes, select the first one
        if (!selectedNodeId && userNodes.length > 0) {
          setSelectedNodeId(userNodes[0].id);
        }

        // Check if there's any inconsistency between Redux node state and database
        if (isActive && nodeId) {
          const activeDevice = devices.find((device) => device.id === nodeId);
          if (activeDevice && activeDevice.status === "offline") {
            console.log(
              "Detected inconsistency: Node is active in Redux but offline in database"
            );
            // Fix the inconsistency by updating the database
            try {
              const { data, error } = await client
                .from("devices")
                .update({ status: "busy" })
                .eq("id", nodeId)
                .select("status");

              if (error) throw error;
              console.log("Fixed node status inconsistency:", data);
            } catch (err) {
              console.error("Error fixing node status inconsistency:", err);
            }
          }
        } else if (!isActive && nodeId) {
          const inactiveDevice = devices.find((device) => device.id === nodeId);
          if (inactiveDevice && inactiveDevice.status === "busy") {
            console.log(
              "Detected inconsistency: Node is inactive in Redux but busy in database"
            );
            // Fix the inconsistency by updating the database
            try {
              const { data, error } = await client
                .from("devices")
                .update({ status: "offline" })
                .eq("id", nodeId)
                .select("status");

              if (error) throw error;
              console.log("Fixed node status inconsistency:", data);
            } catch (err) {
              console.error("Error fixing node status inconsistency:", err);
            }
          }
        }
      } catch (error) {
        console.error("Error fetching user devices:", error);
        toast.error("Failed to load your devices");
      }
    };

    fetchUserDevices();
  }, [userProfile?.id, client, isActive, nodeId]);

  const handleNodeSelect = (value: string) => {
    setSelectedNodeId(value);
  };

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

  const startScan = () => {
    setShowScanDialog(true);
    setIsScanning(true);
    setScanProgress(0);
    setScanStage("Detecting device type...");

    setTimeout(() => {
      setScanProgress(10);
      performHardwareScan();
    }, 1000);
  };

  const performHardwareScan = async () => {
    try {
      const updateProgress = (progress: number, stage: string) => {
        setScanProgress(progress);
        setScanStage(stage);
      };

      updateProgress(20, "Analyzing system capabilities...");
      await new Promise((resolve) => setTimeout(resolve, 800));

      updateProgress(40, "Checking hardware specs...");
      await new Promise((resolve) => setTimeout(resolve, 800));

      updateProgress(60, "Determining device category...");
      const hardwareInfo = await detectHardware();
      setDetectedHardware(hardwareInfo);
      setDeviceGroup(hardwareInfo.deviceGroup);

      updateProgress(100, "Initial scan complete!");
      setIsScanning(false);

      // Close scan dialog and open device selection
      setTimeout(() => {
        setShowScanDialog(false);
        setShowDeviceTypeDialog(true);
        // Reset selection state
        setSelectedDeviceType("desktop");
        setSelectedBrand("");
        setSelectedModel("");
        setCustomSpecs({});
      }, 1000);
    } catch (error) {
      console.error("Hardware scan error:", error);
      toast.error("Failed to scan hardware. Please try again.");
      setShowScanDialog(false);
      setIsScanning(false);
    }
  };

  const confirmDeviceType = async () => {
    if (
      !userProfile?.id ||
      !detectedHardware ||
      !selectedDeviceType ||
      !selectedBrand ||
      !selectedModel
    )
      return;

    setIsCreatingDevice(true);

    try {
      // Create device specs object with different handling based on device type
      const deviceSpecs: any = {
        type: selectedDeviceType,
        brand: selectedBrand,
        model: selectedModel,
        cpuCores: detectedHardware.cpuCores,
        memory: detectedHardware.deviceMemory,
        gpuInfo: detectedHardware.gpuInfo,
      };

      // Add CPU and GPU info for devices that require custom specs
      if (requiresCustomSpecs(deviceGroup, selectedDeviceType)) {
        deviceSpecs.cpu = customSpecs.cpu;
        deviceSpecs.gpu = customSpecs.gpu;
      }

      // Insert device into database
      const { data: device, error } = await client
        .from("devices")
        .insert({
          status: "offline",
          gpu_model: requiresCustomSpecs(deviceGroup, selectedDeviceType)
            ? customSpecs.gpu
            : `${selectedBrand} ${selectedModel} GPU`,
          vram: selectedVRAM,
          hash_rate: Math.floor(Math.random() * 50) + 50, // Random value between 50-100
          device_specs: deviceSpecs,
          owner: userProfile.id,
        })
        .select("id")
        .single();

      if (error) throw error;

      // Create local node representation
      const newNode: NodeInfo = {
        id: device.id,
        name: `${selectedBrand} ${selectedModel}`,
        type: selectedDeviceType,
        brand: selectedBrand,
        model: selectedModel,
        customSpecs: requiresCustomSpecs(deviceGroup, selectedDeviceType)
          ? customSpecs
          : undefined,
        rewardTier: detectedHardware.rewardTier,
        status: "idle",
        cpuCores: detectedHardware.cpuCores,
        memory: detectedHardware.deviceMemory,
        gpuInfo: requiresCustomSpecs(deviceGroup, selectedDeviceType)
          ? customSpecs.gpu
          : `${selectedBrand} ${selectedModel} GPU`,
      };

      setNodes([...nodes, newNode]);
      setSelectedNodeId(newNode.id);
      setShowDeviceTypeDialog(false);
      toast.success("Device added successfully!");
    } catch (error) {
      console.error("Error creating device:", error);
      toast.error("Failed to create device. Please try again.");
    } finally {
      setIsCreatingDevice(false);
    }
  };

  const toggleNodeStatus = async () => {
    // Skip if user profile is not loaded yet
    if (!userProfile?.id) {
      toast.error("User profile not loaded. Please reload the page.");
      return;
    }

    if (isActive) {
      // Stop the node
      setIsStopping(true);
      try {
        console.log(
          `Stopping node ${selectedNodeId} - updating status to offline`
        );

        // Update device status in database
        const { data, error: updateError } = await client
          .from("devices")
          .update({ status: "offline" })
          .eq("id", selectedNodeId)
          .select("status")
          .single();

        if (updateError) throw updateError;

        console.log(`Node status updated in database: ${JSON.stringify(data)}`);

        dispatch(stopNode());
        dispatch(clearAssignedTasks());

        // Update node status in local state
        setNodes(
          nodes.map((node) =>
            node.id === selectedNodeId ? { ...node, status: "idle" } : node
          )
        );

        toast.info(`Node "${selectedNode?.name}" stopped`);
      } catch (error) {
        console.error("Error stopping node:", error);
        toast.error("Failed to stop node. Please try again.");
      } finally {
        setIsStopping(false);
      }
    } else if (selectedNode) {
      // Start the node
      setIsStarting(true);

      try {
        console.log(
          `Starting node ${selectedNodeId} - updating status to busy`
        );

        // Update device status in database
        const { data, error: updateError } = await client
          .from("devices")
          .update({ status: "busy" })
          .eq("id", selectedNodeId)
          .select("status")
          .single();

        if (updateError) throw updateError;

        console.log(`Node status updated in database: ${JSON.stringify(data)}`);

        // Load the current uptime from the database
        try {
          // Directly fetch uptime from the database
          const { data: uptimeData, error: uptimeError } = await client
            .from("devices")
            .select("uptime")
            .eq("id", selectedNodeId)
            .single();

          if (uptimeError) throw uptimeError;

          const databaseUptime = uptimeData?.uptime || 0;
          console.log(
            `Loaded uptime from database for node ${selectedNodeId}: ${databaseUptime} seconds`
          );

          // Simulate starting delay
          setTimeout(async () => {
            // Update redux store with node info, including the uptime from database
            dispatch(
              startNode({
                nodeId: selectedNode.id,
                nodeName: selectedNode.name,
                nodeType: selectedNode.type,
                rewardTier: selectedNode.rewardTier,
                maxUptime: tierInfo.maxUptime,
                storedUptime: databaseUptime, // Pass the uptime from database
              })
            );

            // Update node status in local state
            setNodes(
              nodes.map((node) =>
                node.id === selectedNodeId
                  ? { ...node, status: "running" }
                  : node
              )
            );

            // Initial resource usage
            dispatch(
              updateNodeMetrics({
                cpuUsage: Math.random() * 30 + 10,
                memoryUsage: Math.random() * 20 + 5,
                networkUsage: Math.random() * 5 + 0.5,
              })
            );

            setIsStarting(false);
            toast.success(
              `Node "${selectedNode.name}" started and ready for tasks`
            );

            // Fetch and assign tasks to this node
            try {
              // This thunk action will fetch tasks and assign them to the node
              dispatch(
                fetchAndAssignTasks({
                  nodeId: selectedNode.id,
                  userId: userProfile?.id,
                })
              );
            } catch (error) {
              console.error("Error assigning tasks:", error);
              toast.error("Failed to assign tasks to node");
            }
          }, 2000);
        } catch (error) {
          console.error("Error loading uptime from database:", error);
          setIsStarting(false);
          toast.error("Failed to load node uptime data");
        }
      } catch (error) {
        console.error("Error starting node:", error);
        toast.error("Failed to start node. Please try again.");
        setIsStarting(false);
      }
    }
  };

  const deleteNode = async () => {
    if (!selectedNodeId || !userProfile?.id) return;

    // Don't allow deleting an active node
    if (isActive && nodeId === selectedNodeId) {
      toast.error("Please stop the node before deleting it");
      return;
    }

    setIsDeletingNode(true);

    try {
      // Delete the device from the database
      const { error } = await client
        .from("devices")
        .delete()
        .eq("id", selectedNodeId)
        .eq("owner", userProfile.id);

      if (error) throw error;

      // Remove from local state
      const updatedNodes = nodes.filter((node) => node.id !== selectedNodeId);
      setNodes(updatedNodes);

      // If there are other nodes, select the first one
      if (updatedNodes.length > 0) {
        setSelectedNodeId(updatedNodes[0].id);
      } else {
        setSelectedNodeId("");
      }

      toast.success("Node deleted successfully");
      setShowDeleteConfirmDialog(false);
    } catch (error) {
      console.error("Error deleting node:", error);
      toast.error("Failed to delete node");
    } finally {
      setIsDeletingNode(false);
    }
  };

  const getRewardTierLabel = (tier: NodeInfo["rewardTier"] | null) => {
    if (!tier) return "";

    switch (tier) {
      case "webgpu":
        return "WebGPU (Maximum Rewards)";
      case "wasm":
        return "WASM (High Rewards)";
      case "webgl":
        return "WebGL (Medium Rewards)";
      case "cpu":
        return "CPU (Basic Rewards)";
      default:
        return String(tier);
    }
  };

  // Sync uptime on app close/refresh
  useEffect(() => {
    const handleBeforeUnload = async (event: BeforeUnloadEvent) => {
      if (isActive) {
        console.log("App closing/refreshing - syncing uptime data...");

        // Only sync uptime to database - don't stop the node yet
        dispatch(syncUptime());

        // Display confirmation dialog
        const message =
          "If you reload or close this tab, the current process will be terminated. Are you sure?";
        event.preventDefault();
        event.returnValue = message; // Required for Chrome

        return message; // For older browsers
      }
    };

    // This function will be called when the page is actually being unloaded
    const handleUnload = () => {
      if (isActive && selectedNodeId) {
        console.log("Page actually unloading - stopping node");

        // Use synchronous localStorage to mark node for offline status
        // This will be checked on next load to update the database
        try {
          localStorage.setItem("nodeToStop", selectedNodeId);
          localStorage.setItem("nodeStopTime", new Date().toISOString());
        } catch (e) {
          console.error("Failed to save node stop info to localStorage", e);
        }
      }
    };

    // Separate effect to handle database updates when page is unloading
    const updateDeviceStatus = async () => {
      if (isActive && userProfile?.id) {
        try {
          if (selectedNodeId) {
            console.log(
              `Setting node ${selectedNodeId} to offline in database`
            );
            await client
              .from("devices")
              .update({ status: "offline" })
              .eq("id", selectedNodeId);
          }
        } catch (err) {
          console.error("Error updating device status:", err);
        }
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden" && isActive) {
        console.log("Page hidden - syncing uptime data");
        dispatch(syncUptime());
      }
    };

    // Check if we need to stop a node from a previous unload
    const checkPreviousUnload = async () => {
      try {
        const nodeToStop = localStorage.getItem("nodeToStop");
        const nodeStopTime = localStorage.getItem("nodeStopTime");

        if (nodeToStop && nodeStopTime) {
          const stopTime = new Date(nodeStopTime);
          const now = new Date();
          const timeDiff = now.getTime() - stopTime.getTime();

          // If the stored data is recent (within last 10 seconds), update the node status
          if (timeDiff < 10000) {
            console.log(
              `Found node ${nodeToStop} that needs to be stopped from previous session`
            );

            await client
              .from("devices")
              .update({ status: "offline" })
              .eq("id", nodeToStop);

            console.log("Successfully updated node status to offline");

            // If this is the currently active node, also update Redux state
            if (isActive && nodeId === nodeToStop) {
              dispatch(stopNode());
              dispatch(clearAssignedTasks());
            }
          }

          // Clear the stored data
          localStorage.removeItem("nodeToStop");
          localStorage.removeItem("nodeStopTime");
        }
      } catch (e) {
        console.error("Error checking previous unload", e);
      }
    };

    // Run once on component mount
    checkPreviousUnload();

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("unload", handleUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const syncInterval = isActive
      ? setInterval(() => dispatch(syncUptime()), 5 * 60 * 1000)
      : null;

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("unload", handleUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (syncInterval) clearInterval(syncInterval);
    };
  }, [isActive, selectedNodeId, dispatch, client, userProfile?.id, nodeId]);

  return (
    <div className="p-2.5 sm:p-4 md:p-6 rounded-2xl sm:rounded-3xl stat-card overflow-x-hidden">
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
            onClick={startScan}
            disabled={isScanning}
            className="gradient-button rounded-full text-[#8BBEFF] text-xs sm:text-sm px-2 py-1 sm:px-3 sm:py-2"
          >
            <Scan className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
            Scan Device
          </Button>
        </div>

        <div className="flex flex-row gap-2 sm:gap-4 items-center mb-3 sm:mb-6">
          <Select
            value={selectedNodeId}
            onValueChange={handleNodeSelect}
            open={isOpen}
            onOpenChange={setIsOpen}
          >
            <SelectTrigger className="w-full bg-[#1D1D33] border-0 rounded-full text-[#515194] text-xs sm:text-sm h-9 sm:h-10">
              <div className="flex items-center gap-2">
                {selectedNode && (
                  <>
                    {getDeviceIcon(selectedNode.type)}
                    <span>{selectedNode.name}</span>
                  </>
                )}
                {!selectedNode && <span>Select Node</span>}
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
                    </div>
                  </SelectItem>
                  <div
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSelectedNodeId(node.id);
                      setShowDeleteConfirmDialog(true);
                    }}
                  >
                    <button
                      type="button"
                      className="p-1.5 rounded-full hover:bg-red-500/20 focus:outline-none"
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </button>
                  </div>
                </div>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="default"
            disabled={
              isStarting ||
              isStopping ||
              !selectedNodeId ||
              (!isActive && !walletConnected)
            }
            onClick={toggleNodeStatus}
            className={`rounded-full transition-all duration-300 shadow-md hover:shadow-lg text-white text-xs sm:text-sm px-3 py-1 sm:px-4 sm:py-2 h-9 sm:h-10 hover:translate-y-[-0.5px] ${
              isActive
                ? "bg-red-600 hover:bg-red-700 hover:shadow-red-500/30 shadow-red-500"
                : "bg-green-600 hover:bg-green-700 hover:shadow-green-500/30 shadow-green-500"
            }`}
            title={
              !walletConnected && !isActive
                ? "Connect wallet to start node"
                : ""
            }
          >
            {isStarting && (
              <>
                <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2 animate-spin" />
                Starting...
              </>
            )}
            {isStopping && (
              <>
                <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2 animate-spin" />
                Stopping...
              </>
            )}
            {!isStarting && !isStopping && (
              <>
                {isActive ? "Stop Node" : "Start Node"}
                {!isActive ? (
                  <VscDebugStart className="text-white/90 ml-1 sm:ml-2" />
                ) : (
                  <IoStopOutline className="text-white/90 ml-1 sm:ml-2" />
                )}
              </>
            )}
          </Button>
        </div>

        {/* Show wallet connection notice when wallet is not connected */}
        {!walletConnected && !isActive && (
          <div className="bg-amber-800/20 border border-amber-700/30 rounded-lg p-2 mb-4 text-amber-200 text-xs">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              <span>Wallet connection required to start a node</span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 sm:gap-4 mb-3 sm:mb-6">
          <div className="p-2 sm:p-4 rounded-xl bg-[#1D1D33] flex flex-col">
            <div className="flex items-center gap-1.5 sm:gap-3 mb-0.5 sm:mb-2">
              <div className="icon-bg flex items-center justify-center p-1 sm:p-2">
                <img
                  src="/images/cpu_usage.png"
                  alt="CPU"
                  className="w-5 h-5 sm:w-7 sm:h-7 object-contain z-10"
                />
              </div>
              <div className="flex flex-col overflow-hidden">
                <span className="text-[#515194] text-[10px] sm:text-sm whitespace-nowrap">
                  CPU Usage
                </span>
                <div className="text-sm sm:text-xl font-medium text-white">
                  {cpuUsage.toFixed(2)}%
                </div>
              </div>
            </div>
          </div>

          <div className="p-2 sm:p-4 rounded-xl bg-[#1D1D33] flex flex-col">
            <div className="flex items-center gap-1.5 sm:gap-3 mb-0.5 sm:mb-2">
              <div className="icon-bg flex items-center justify-center p-1 sm:p-2">
                <img
                  src="/images/memory_usage.png"
                  alt="Memory"
                  className="w-5 h-5 sm:w-7 sm:h-7 object-contain z-10"
                />
              </div>
              <div className="flex flex-col overflow-hidden">
                <span className="text-[#515194] text-[10px] sm:text-sm whitespace-nowrap">
                  Memory
                </span>
                <div className="text-sm sm:text-xl font-medium text-white">
                  {memoryUsage.toFixed(2)}%
                </div>
              </div>
            </div>
          </div>

          <div className="p-2 sm:p-4 rounded-xl bg-[#1D1D33] flex flex-col">
            <div className="flex items-center gap-1.5 sm:gap-3 mb-0.5 sm:mb-2">
              <div className="icon-bg flex items-center justify-center p-1 sm:p-2">
                <img
                  src="/images/network_usage.png"
                  alt="Network"
                  className="w-5 h-5 sm:w-7 sm:h-7 object-contain z-10"
                />
              </div>
              <div className="flex flex-col overflow-hidden">
                <span className="text-[#515194] text-[10px] sm:text-sm whitespace-nowrap">
                  Network
                </span>
                <div className="text-sm sm:text-xl font-medium text-white">
                  {networkUsage.toFixed(2)} MB/s
                </div>
              </div>
            </div>
          </div>

          <div className="p-2 sm:p-4 rounded-xl bg-[#1D1D33] flex flex-col">
            <div className="flex items-center gap-1.5 sm:gap-3 mb-0.5 sm:mb-2">
              <div className="icon-bg flex items-center justify-center p-1 sm:p-2">
                <img
                  src="/images/success.png"
                  alt="Success Rate"
                  className="w-5 h-5 sm:w-7 sm:h-7 object-contain z-10"
                />
              </div>
              <div className="flex flex-col overflow-hidden">
                <span className="text-[#515194] text-[10px] sm:text-sm whitespace-nowrap">
                  Success Rate
                </span>
                <div className="text-sm sm:text-xl font-medium text-white">
                  {successRate.toFixed(2)}%
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-2 sm:p-4 rounded-xl bg-[#1D1D33] mb-3 sm:mb-6 overflow-hidden">
          <div className="flex items-center justify-between mb-1 sm:mb-2">
            <span className="text-[#515194] text-[10px] sm:text-sm">
              Reward Tier
            </span>
            <span className="px-1.5 sm:px-3 py-0.5 sm:py-1 bg-purple-500/20 text-purple-400 text-[10px] sm:text-xs font-medium rounded-full uppercase">
              {rewardTier}
            </span>
          </div>
          <p className="text-[10px] sm:text-sm text-[#515194] break-words">
            {rewardTier === "webgpu" &&
              "This device supports WebGPU acceleration, earning maximum Swarm Point rewards."}
            {rewardTier === "wasm" &&
              "This device uses WASM processing, earning high Swarm Point rewards."}
            {rewardTier === "webgl" &&
              "This device uses WebGL processing, earning medium Swarm Point rewards."}
            {rewardTier === "cpu" &&
              "This device uses CPU processing, earning basic Swarm Point rewards."}
          </p>
          {selectedNode && selectedNode.cpuCores && (
            <div className="grid grid-cols-2 gap-1 sm:gap-4 mt-2 sm:mt-4 text-[10px] sm:text-sm overflow-hidden">
              <div className="text-[#515194] truncate">
                CPU Cores:{" "}
                <span className="text-white">{selectedNode.cpuCores}</span>
              </div>
              <div className="text-[#515194] truncate">
                Memory:{" "}
                <span className="text-white">{selectedNode.memory} GB</span>
              </div>
              {selectedNode.gpuInfo && (
                <div className="col-span-2 text-[#515194] truncate">
                  GPU:{" "}
                  <span className="text-white">{selectedNode.gpuInfo}</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-4 sm:p-6 flex flex-row items-center justify-between rounded-xl sm:rounded-2xl bg-gradient-to-r from-[#090C18] to-[#14273F] border border-[#1D5AB3] relative overflow-hidden gap-4">
          <div className="flex items-center gap-4 z-10">
            <div className="flex items-center justify-center flex-shrink-0">
              <img
                src="/images/nlov-coin.png"
                alt="coin"
                className="w-11 h-11 object-contain z-10"
              />
            </div>
            <span className="text-white/90 text-2xl  whitespace-nowrap">
              Total Earnings
            </span>
          </div>
          <div className="flex items-baseline gap-2 z-10 flex-shrink-0">
            <span
              className="font-medium lg:text-4xl md:text-3xl sm:text-2xl text-transparent bg-clip-text bg-gradient-to-b from-[#20A5EF] to-[#0361DA] leading-none"
              style={{
                lineHeight: "1",
                minWidth: "fit-content",
                display: "inline-block",
              }}
            >
              {parseFloat(totalEarnings.toFixed(2))}
            </span>
            <span className="text-white/90 text-sm">SP</span>
          </div>
        </div>
      </div>

      <Dialog open={showScanDialog} onOpenChange={setShowScanDialog}>
        <DialogContent
          className="sm:max-w-md"
          style={{ backgroundColor: "rgba(9, 12, 24, 1)" }}
        >
          <DialogHeader>
            <DialogTitle className="text-[#515194]">
              Scanning Device Hardware
            </DialogTitle>
            <DialogDescription className="text-[#515194]/80">
              Analyzing your device capabilities to determine the optimal reward
              tier
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <div className="mb-2 text-sm font-medium text-[#515194]">
              {scanStage}
            </div>
            <div className="w-full bg-slate-800 rounded-full h-2.5">
              <div
                className="bg-gradient-to-r from-purple-500 to-blue-500 h-2.5 rounded-full transition-all duration-300 ease-in-out"
                style={{ width: `${scanProgress}%` }}
              ></div>
            </div>
            <div className="mt-4 text-sm text-[#515194]">
              {scanProgress < 100
                ? "Please wait while we analyze your device. Do not close this window."
                : "Scan completed successfully!"}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showDeviceTypeDialog}
        onOpenChange={setShowDeviceTypeDialog}
      >
        <DialogContent
          className="sm:max-w-md"
          style={{ backgroundColor: "rgba(9, 12, 24, 1)" }}
        >
          <DialogHeader>
            <DialogTitle className="text-[#515194]">
              {deviceGroup === "desktop_laptop"
                ? "Desktop & Laptop Setup"
                : "Mobile & Tablet Setup"}
            </DialogTitle>
            <DialogDescription className="text-[#515194]/80">
              {deviceGroup === "desktop_laptop"
                ? "We detected a desktop or laptop device. Please specify your exact device type."
                : "We detected a mobile or tablet device. Please specify your exact device type."}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <div className="space-y-4">
              <Select
                value={selectedDeviceType}
                onValueChange={(
                  value: "desktop" | "laptop" | "tablet" | "mobile"
                ) => {
                  setSelectedDeviceType(value);
                  setSelectedBrand("");
                  setSelectedModel("");
                  setCustomSpecs({});
                }}
              >
                <SelectTrigger
                  style={{
                    backgroundColor: "#1D1D33",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: "1px solid rgba(15, 23, 42, 0.3)",
                  }}
                >
                  <SelectValue
                    placeholder="Select device type"
                    style={{
                      color: "#515194",
                      fontSize: "14px",
                    }}
                  />
                </SelectTrigger>
                <SelectContent
                  style={{
                    backgroundColor: "rgba(9, 12, 24, 1)",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: "1px solid rgba(9, 12, 24, 1)",
                  }}
                >
                  {getDeviceTypesForGroup(deviceGroup).map((type) => (
                    <SelectItem
                      key={type}
                      value={type}
                      style={{
                        backgroundColor: "rgba(9, 12, 24, 1)",
                        padding: "8px 12px",
                        borderRadius: "6px",
                        border: "1px solid rgba(9, 12, 24, 1)",
                      }}
                    >
                      <div className="flex items-center">
                        {getDeviceIcon(
                          type as "desktop" | "laptop" | "tablet" | "mobile"
                        )}
                        <span
                          className="ml-2"
                          style={{
                            color: "#515194",
                            fontSize: "14px",
                          }}
                        >
                          {type.charAt(0).toUpperCase() + type.slice(1)}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedDeviceType && (
                <Select
                  value={selectedBrand}
                  onValueChange={(value: string) => {
                    setSelectedBrand(value);
                    setSelectedModel("");
                  }}
                >
                  <SelectTrigger style={{ backgroundColor: "#1D1D33" }}>
                    <SelectValue
                      placeholder="Select brand"
                      style={{ color: "#515194" }}
                    />
                  </SelectTrigger>
                  <SelectContent
                    style={{ backgroundColor: "rgba(9, 12, 24, 1)" }}
                  >
                    {getDeviceBrands(deviceGroup, selectedDeviceType).map(
                      (brand) => (
                        <SelectItem
                          key={brand}
                          value={brand}
                          style={{
                            backgroundColor: "rgba(9, 12, 24, 1)",
                            color: "#515194",
                          }}
                        >
                          {brand}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              )}

              {selectedBrand && (
                <Select value={selectedModel} onValueChange={setSelectedModel}>
                  <SelectTrigger style={{ backgroundColor: "#1D1D33" }}>
                    <SelectValue
                      placeholder="Select model"
                      style={{ color: "#515194" }}
                    />
                  </SelectTrigger>
                  <SelectContent
                    style={{ backgroundColor: "rgba(9, 12, 24, 1)" }}
                  >
                    {getDeviceModels(
                      deviceGroup,
                      selectedDeviceType,
                      selectedBrand
                    ).map((model) => (
                      <SelectItem
                        key={model}
                        value={model}
                        style={{
                          backgroundColor: "rgba(9, 12, 24, 1)",
                          color: "#515194",
                        }}
                      >
                        {model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {requiresCustomSpecs(deviceGroup, selectedDeviceType) &&
                selectedModel && (
                  <div className="space-y-4">
                    <div>
                      <label
                        htmlFor="cpu"
                        className="block text-sm font-medium mb-1 text-[#515194]"
                      >
                        CPU Model
                      </label>
                      <Input
                        id="cpu"
                        style={{ backgroundColor: "#1D1D33" }}
                        placeholder="e.g. Intel Core i7-12700K"
                        value={customSpecs.cpu || ""}
                        onChange={(e) =>
                          setCustomSpecs((prev) => ({
                            ...prev,
                            cpu: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="gpu"
                        className="block text-sm font-medium mb-1 text-[#515194]"
                      >
                        GPU Model
                      </label>
                      <Input
                        id="gpu"
                        style={{ backgroundColor: "#1D1D33" }}
                        placeholder="e.g. NVIDIA RTX 4070"
                        value={customSpecs.gpu || ""}
                        onChange={(e) =>
                          setCustomSpecs((prev) => ({
                            ...prev,
                            gpu: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="vram"
                        className="block text-sm font-medium mb-1 text-[#515194]"
                      >
                        VRAM (GB)
                      </label>
                      <Select
                        value={selectedVRAM.toString()}
                        onValueChange={(value) =>
                          setSelectedVRAM(Number(value))
                        }
                      >
                        <SelectTrigger
                          style={{
                            backgroundColor: "#1D1D33",
                            color: "#515194",
                          }}
                        >
                          <SelectValue placeholder="Select VRAM" />
                        </SelectTrigger>
                        <SelectContent
                          style={{ backgroundColor: "rgba(9, 12, 24, 1)" }}
                        >
                          {[4, 8, 12, 16, 32, 64].map((vram) => (
                            <SelectItem
                              key={vram}
                              value={vram.toString()}
                              style={{ color: "#515194" }}
                            >
                              {vram} GB
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

              {!requiresCustomSpecs(deviceGroup, selectedDeviceType) &&
                selectedModel && (
                  <div>
                    <label
                      htmlFor="vram"
                      className="block text-sm font-medium mb-1 text-[#515194]"
                    >
                      VRAM (GB)
                    </label>
                    <Select
                      value={selectedVRAM.toString()}
                      onValueChange={(value) => setSelectedVRAM(Number(value))}
                    >
                      <SelectTrigger
                        style={{
                          backgroundColor: "#1D1D33",
                          color: "#515194",
                        }}
                      >
                        <SelectValue placeholder="Select VRAM" />
                      </SelectTrigger>
                      <SelectContent
                        style={{ backgroundColor: "rgba(9, 12, 24, 1)" }}
                      >
                        {[2, 4, 8, 12, 16].map((vram) => (
                          <SelectItem
                            key={vram}
                            value={vram.toString()}
                            style={{ color: "#515194" }}
                          >
                            {vram} GB
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={confirmDeviceType}
              disabled={
                !selectedDeviceType ||
                !selectedBrand ||
                !selectedModel ||
                (requiresCustomSpecs(deviceGroup, selectedDeviceType) &&
                  (!customSpecs.cpu || !customSpecs.gpu || !selectedVRAM)) ||
                (!requiresCustomSpecs(deviceGroup, selectedDeviceType) &&
                  !selectedVRAM) ||
                isCreatingDevice
              }
            >
              {isCreatingDevice ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating Device...
                </>
              ) : (
                "Confirm Device"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showDeleteConfirmDialog}
        onOpenChange={setShowDeleteConfirmDialog}
      >
        <DialogContent
          className="sm:max-w-md"
          style={{ backgroundColor: "rgba(9, 12, 24, 1)" }}
        >
          <DialogHeader>
            <DialogTitle className="text-[#515194]">Delete Node</DialogTitle>
            <DialogDescription className="text-[#515194]/80">
              Are you sure you want to delete this node? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            {selectedNode && (
              <div className="flex items-center gap-3 p-3 bg-[#1D1D33] rounded-lg">
                {getDeviceIcon(selectedNode.type)}
                <div>
                  <p className="text-white font-medium">{selectedNode.name}</p>
                  <p className="text-[#515194] text-sm">
                    {selectedNode.brand} {selectedNode.model}
                  </p>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteConfirmDialog(false)}
              disabled={isDeletingNode}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={deleteNode}
              disabled={isDeletingNode}
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
    </div>
  );
};
