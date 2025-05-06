import React, { useState, useEffect } from "react";
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
  Timer,
  AlertTriangle,
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
  updateUptime,
  syncUptime,
  FREE_TIER_LIMIT_SECONDS,
} from "@/store/slices/nodeSlice";
import {
  fetchAndAssignTasks,
  clearAssignedTasks,
} from "@/store/slices/taskSlice";
import { useSession } from "@/hooks/useSession";

import { RootState, useAppDispatch } from "@/store";
import { assignTasksToUser } from "@/services/swarmTaskService";

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
  const { userProfile } = useSession();

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
    startTime,
    currentSessionUptime,
    totalUptime,
    remainingFreeTierTime,
  } = useSelector((state: RootState) => state.node);

  const [nodes, setNodes] = useState<NodeInfo[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string>("");
  const [isStarting, setIsStarting] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [showScanDialog, setShowScanDialog] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanStage, setScanStage] = useState("");

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

  // Update selectedNodeId when nodeId from redux changes
  useEffect(() => {
    if (nodeId) {
      setSelectedNodeId(nodeId);
    }
  }, [nodeId]);

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
      } catch (error) {
        console.error("Error fetching user devices:", error);
        toast.error("Failed to load your devices");
      }
    };

    fetchUserDevices();
  }, [userProfile?.id, client]);

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
      !detectedHardware ||
      !selectedDeviceType ||
      !selectedBrand ||
      !selectedModel ||
      !selectedVRAM
    )
      return;

    setIsCreatingDevice(true);

    try {
      // Create device specs object
      const deviceSpecs = {
        type: selectedDeviceType,
        brand: selectedBrand,
        model: selectedModel,
        cpu: customSpecs.cpu,
        gpu: customSpecs.gpu,
        vram: selectedVRAM,
        cpuCores: detectedHardware.cpuCores,
        memory: detectedHardware.deviceMemory,
        gpuInfo: detectedHardware.gpuInfo,
      };

      // Insert device into database
      const { data: device, error } = await client
        .from("devices")
        .insert({
          status: "offline",
          gpu_model: customSpecs.gpu || detectedHardware.gpuInfo,
          vram: selectedVRAM,
          hash_rate: 84,
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
        gpuInfo: detectedHardware.gpuInfo,
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

  // Format time in seconds to human-readable format (hh:mm:ss)
  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    return `${hours}h ${minutes}m ${secs}s`;
  };

  // Format remaining free tier time
  const formatRemainingFreeTime = (seconds: number): string => {
    if (seconds <= 0) return "0h 0m 0s";
    return formatTime(seconds);
  };

  // Update uptime every second when node is active
  useEffect(() => {
    let uptimeInterval: NodeJS.Timeout | null = null;

    if (isActive) {
      // Update uptime immediately
      dispatch(updateUptime());

      // Then update every second
      uptimeInterval = setInterval(() => {
        dispatch(updateUptime());
      }, 1000);

      // Sync to database every 5 minutes
      const syncInterval = setInterval(() => {
        dispatch(syncUptime());
      }, 5 * 60 * 1000);

      return () => {
        if (uptimeInterval) clearInterval(uptimeInterval);
        if (syncInterval) clearInterval(syncInterval);
      };
    }

    return () => {
      if (uptimeInterval) clearInterval(uptimeInterval);
    };
  }, [isActive, dispatch]);

  // Sync uptime to database when user closes the window/tab
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (isActive) {
        dispatch(syncUptime());
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isActive, dispatch]);

  const toggleNodeStatus = async () => {
    if (isActive) {
      // Stop the node
      try {
        // Update device status in database
        const { error: updateError } = await client
          .from("devices")
          .update({ status: "offline" })
          .eq("id", selectedNodeId);

        if (updateError) throw updateError;

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
      }
    } else if (selectedNode) {
      // Start the node
      setIsStarting(true);

      try {
        // Get current uptime from database
        const { data: deviceData, error: fetchError } = await client
          .from("devices")
          .select("uptime")
          .eq("id", selectedNodeId)
          .single();

        if (fetchError) throw fetchError;

        const storedUptime = deviceData?.uptime || 0;

        // Update device status in database
        const { error: updateError } = await client
          .from("devices")
          .update({ status: "busy" })
          .eq("id", selectedNodeId);

        if (updateError) throw updateError;

        // Simulate starting delay
        setTimeout(async () => {
          // Update redux store with node info
          dispatch(
            startNode({
              nodeId: selectedNode.id,
              nodeName: selectedNode.name,
              nodeType: selectedNode.type,
              rewardTier: selectedNode.rewardTier,
              storedUptime: storedUptime,
            })
          );

          // Update node status in local state
          setNodes(
            nodes.map((node) =>
              node.id === selectedNodeId ? { ...node, status: "running" } : node
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

          // Show warning if approaching free tier limit
          if (storedUptime > FREE_TIER_LIMIT_SECONDS * 0.75) {
            toast.warning(
              `You're approaching your free tier limit of 4 hours. Total uptime: ${formatTime(
                storedUptime
              )}`
            );
          } else {
            toast.success(
              `Node "${selectedNode.name}" started and ready for tasks`
            );
          }

          // Fetch and assign tasks to this node
          try {
            // This thunk action will fetch tasks and assign them to the node
            dispatch(
              fetchAndAssignTasks({
                nodeId: selectedNode.id,
                userId: userProfile?.id || "",
              })
            );
          } catch (error) {
            console.error("Error assigning tasks:", error);
            toast.error("Failed to assign tasks to node");
          }
        }, 2000);
      } catch (error) {
        console.error("Error starting node:", error);
        toast.error("Failed to start node. Please try again.");
        setIsStarting(false);
      }
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

  return (
    <div className="stat-card">
      <div className="flex flex-col space-y-4">
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold">Node Control Panel</h2>
            <InfoTooltip content="Manage your computing nodes, start or stop them, and view performance metrics" />
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={startScan}
              disabled={isScanning}
              className="text-swarm-accent-purple border-swarm-accent-purple/50 hover:border-swarm-accent-purple/80 hover:bg-swarm-accent-purple/20"
            >
              {isScanning ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  Scanning...
                </>
              ) : (
                <>
                  <Scan className="w-4 h-4 mr-1" />
                  Scan Device
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 sm:items-center mb-2">
          <div className="flex-1">
            <Select value={selectedNodeId} onValueChange={handleNodeSelect}>
              <SelectTrigger className="w-full bg-slate-800/50">
                <SelectValue placeholder="Select a node" />
              </SelectTrigger>
              <SelectContent>
                {nodes.map((node) => (
                  <SelectItem key={node.id} value={node.id}>
                    <div className="flex items-center gap-2">
                      {getDeviceIcon(node.type)}
                      <span>{node.name}</span>
                      {node.status === "running" && (
                        <span className="ml-2 text-xs bg-green-900/50 text-green-300 px-2 py-0.5 rounded-full">
                          Active
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            variant={isActive ? "destructive" : "default"}
            disabled={isStarting || !selectedNodeId}
            onClick={toggleNodeStatus}
            className={!isActive ? "bg-green-600 hover:bg-green-700" : ""}
          >
            {isStarting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Starting...
              </>
            ) : (
              <>
                <Power className="w-4 h-4 mr-2" />
                {isActive ? "Stop Node" : "Start Node"}
              </>
            )}
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
          <div className="flex flex-col p-3 bg-slate-800/30 rounded-lg">
            <div className="flex items-center text-slate-400 mb-1">
              <Cpu className="w-4 h-4 mr-2" /> CPU Usage
            </div>
            <div className="text-2xl font-bold">{cpuUsage.toFixed(1)}%</div>
            {isActive && (
              <div className="w-full bg-slate-700/50 h-1.5 mt-2 rounded-full overflow-hidden">
                <div
                  className="bg-gradient-to-r from-green-500 to-blue-500 h-1.5 rounded-full"
                  style={{ width: `${cpuUsage}%` }}
                ></div>
              </div>
            )}
          </div>

          <div className="flex flex-col p-3 bg-slate-800/30 rounded-lg">
            <div className="flex items-center text-slate-400 mb-1">
              <HardDrive className="w-4 h-4 mr-2" /> Memory
            </div>
            <div className="text-2xl font-bold">{memoryUsage.toFixed(1)}%</div>
            {isActive && (
              <div className="w-full bg-slate-700/50 h-1.5 mt-2 rounded-full overflow-hidden">
                <div
                  className="bg-gradient-to-r from-blue-500 to-purple-500 h-1.5 rounded-full"
                  style={{ width: `${memoryUsage}%` }}
                ></div>
              </div>
            )}
          </div>

          <div className="flex flex-col p-3 bg-slate-800/30 rounded-lg">
            <div className="flex items-center text-slate-400 mb-1">
              <Activity className="w-4 h-4 mr-2" /> Network
            </div>
            <div className="text-2xl font-bold">
              {networkUsage.toFixed(1)} MB/s
            </div>
            {isActive && (
              <div className="w-full bg-slate-700/50 h-1.5 mt-2 rounded-full overflow-hidden">
                <div
                  className="bg-gradient-to-r from-purple-500 to-pink-500 h-1.5 rounded-full"
                  style={{ width: `${(networkUsage / 10) * 100}%` }}
                ></div>
              </div>
            )}
          </div>

          <div className="flex flex-col p-3 bg-slate-800/30 rounded-lg">
            <div className="flex items-center text-slate-400 mb-1">
              <Clock className="w-4 h-4 mr-2" /> Tasks Completed
            </div>
            <div className="text-2xl font-bold">{tasksCompleted}</div>
          </div>

          <div className="flex flex-col p-3 bg-slate-800/30 rounded-lg">
            <div className="flex items-center text-slate-400 mb-1">
              <Timer className="w-4 h-4 mr-2" /> Total Uptime
            </div>
            <div className="text-2xl font-bold">
              {formatTime(totalUptime + (isActive ? currentSessionUptime : 0))}
            </div>
          </div>

          <div className="flex flex-col p-3 bg-slate-800/30 rounded-lg">
            <div className="flex items-center text-slate-400 mb-1">
              <Clock className="w-4 h-4 mr-2" /> Success Rate
            </div>
            <div className="text-2xl font-bold">{successRate.toFixed(1)}%</div>
            {isActive && tasksCompleted > 0 && (
              <div className="w-full bg-slate-700/50 h-1.5 mt-2 rounded-full overflow-hidden">
                <div
                  className="bg-gradient-to-r from-green-500 to-emerald-500 h-1.5 rounded-full"
                  style={{ width: `${successRate}%` }}
                ></div>
              </div>
            )}
          </div>

          <div className="col-span-1 sm:col-span-2 lg:col-span-3 p-3 bg-slate-800/30 rounded-lg">
            <div className="flex items-center text-slate-400 mb-1">
              <div className="flex-1">Reward Tier</div>
              <div className="flex items-center text-xs bg-purple-900/50 text-purple-300 py-1 px-2 rounded-full">
                {rewardTier ? rewardTier.toUpperCase() : "NONE"}
              </div>
            </div>
            <div className="mt-1 text-slate-300 text-sm">
              {rewardTier === "webgpu" &&
                "This device supports WebGPU acceleration, earning maximum NLOV token rewards."}
              {rewardTier === "wasm" &&
                "This device uses WASM processing, earning high NLOV token rewards."}
              {rewardTier === "webgl" &&
                "This device uses WebGL processing, earning medium NLOV token rewards."}
              {rewardTier === "cpu" &&
                "This device uses CPU processing, earning basic NLOV token rewards."}
            </div>

            {selectedNode && selectedNode.cpuCores && (
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <div className="text-slate-400">
                  CPU Cores:{" "}
                  <span className="text-white">{selectedNode.cpuCores}</span>
                </div>
                <div className="text-slate-400">
                  Memory:{" "}
                  <span className="text-white">{selectedNode.memory}</span> GB
                </div>
                {selectedNode.gpuInfo && (
                  <div className="col-span-2 text-slate-400">
                    GPU:{" "}
                    <span className="text-white">{selectedNode.gpuInfo}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <Dialog open={showScanDialog} onOpenChange={setShowScanDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Scanning Device Hardware</DialogTitle>
            <DialogDescription>
              Analyzing your device capabilities to determine the optimal reward
              tier
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <div className="mb-2 text-sm font-medium">{scanStage}</div>
            <div className="w-full bg-slate-800 rounded-full h-2.5">
              <div
                className="bg-gradient-to-r from-purple-500 to-blue-500 h-2.5 rounded-full transition-all duration-300 ease-in-out"
                style={{ width: `${scanProgress}%` }}
              ></div>
            </div>
            <div className="mt-4 text-sm text-slate-400">
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {deviceGroup === "desktop_laptop"
                ? "Desktop & Laptop Setup"
                : "Mobile & Tablet Setup"}
            </DialogTitle>
            <DialogDescription>
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
                <SelectTrigger>
                  <SelectValue placeholder="Select device type" />
                </SelectTrigger>
                <SelectContent>
                  {getDeviceTypesForGroup(deviceGroup).map((type) => (
                    <SelectItem key={type} value={type}>
                      <div className="flex items-center">
                        {getDeviceIcon(
                          type as "desktop" | "laptop" | "tablet" | "mobile"
                        )}
                        <span className="ml-2">
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
                  <SelectTrigger>
                    <SelectValue placeholder="Select brand" />
                  </SelectTrigger>
                  <SelectContent>
                    {getDeviceBrands(deviceGroup, selectedDeviceType).map(
                      (brand) => (
                        <SelectItem key={brand} value={brand}>
                          {brand}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              )}

              {selectedBrand && (
                <Select value={selectedModel} onValueChange={setSelectedModel}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select model" />
                  </SelectTrigger>
                  <SelectContent>
                    {getDeviceModels(
                      deviceGroup,
                      selectedDeviceType,
                      selectedBrand
                    ).map((model) => (
                      <SelectItem key={model} value={model}>
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
                        className="block text-sm font-medium mb-1"
                      >
                        CPU Model
                      </label>
                      <Input
                        id="cpu"
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
                        className="block text-sm font-medium mb-1"
                      >
                        GPU Model
                      </label>
                      <Input
                        id="gpu"
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
                        className="block text-sm font-medium mb-1"
                      >
                        VRAM (GB)
                      </label>
                      <Select
                        value={selectedVRAM.toString()}
                        onValueChange={(value) =>
                          setSelectedVRAM(Number(value))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select VRAM" />
                        </SelectTrigger>
                        <SelectContent>
                          {[4, 8, 12, 16, 32, 64].map((vram) => (
                            <SelectItem key={vram} value={vram.toString()}>
                              {vram} GB
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
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
                !selectedVRAM ||
                (requiresCustomSpecs(deviceGroup, selectedDeviceType) &&
                  (!customSpecs.cpu || !customSpecs.gpu)) ||
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
    </div>
  );
};
