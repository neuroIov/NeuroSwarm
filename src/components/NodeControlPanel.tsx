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
} from "lucide-react";
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
} from "@/store/slices/nodeSlice";
import {
  fetchAndAssignTasks,
  clearAssignedTasks,
} from "@/store/slices/taskSlice";
import { RootState, useAppDispatch } from "@/store";
import { assignTasksToNode } from "@/services/swarmTaskService";

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

  const confirmDeviceType = () => {
    if (
      !detectedHardware ||
      !selectedDeviceType ||
      !selectedBrand ||
      !selectedModel
    )
      return;

    const newNode: NodeInfo = {
      id: `node-${nodes.length + 1}`,
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
  };

  const toggleNodeStatus = async () => {
    if (isActive) {
      // Stop the node
      dispatch(stopNode());
      dispatch(clearAssignedTasks());

      // Update node status in local state
      setNodes(
        nodes.map((node) =>
          node.id === selectedNodeId ? { ...node, status: "idle" } : node
        )
      );

      toast.info(`Node "${selectedNode?.name}" stopped`);
    } else if (selectedNode) {
      // Start the node
      setIsStarting(true);

      // Simulate starting delay
      setTimeout(async () => {
        // Update redux store with node info
        dispatch(
          startNode({
            nodeId: selectedNode.id,
            nodeName: selectedNode.name,
            nodeType: selectedNode.type,
            rewardTier: selectedNode.rewardTier,
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
        toast.success(
          `Node "${selectedNode.name}" started and ready for tasks`
        );

        // Fetch and assign tasks to this node
        try {
          // This thunk action will fetch tasks and assign them to the node
          dispatch(fetchAndAssignTasks(selectedNode.id));
        } catch (error) {
          console.error("Error assigning tasks:", error);
          toast.error("Failed to assign tasks to node");
        }
      }, 2000);
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
    <div className="stat-card rounded-3xl h-auto md:h-[420px] overflow-auto" style={{
      backgroundColor: 'rgba(9, 12, 24, 1)',
      width: '100%',
      marginBottom: '1rem'
    }}>
      <div className="flex flex-col space-y-4 justify-center">
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-2">
            <h2 className="text-xl ">Node Control Panel</h2>
            <InfoTooltip content="Manage your computing nodes, start or stop them, and view performance metrics" />
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={startScan}
              disabled={isScanning}
              style={{ color: "rgba(3, 97, 218, 1)", borderColor: "rgba(3, 97, 218, 0.5)" }}
              className="rounded-full hover:border-[rgba(3,97,218,0.8)] hover:bg-[rgba(3,97,218,0.2)]"
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
              <SelectTrigger className="w-full bg-slate-800/50 rounded-full">
                <SelectValue placeholder="Select a node" />
              </SelectTrigger>
              <SelectContent style={{ backgroundColor: 'rgba(9, 12, 24, 1)', borderColor: 'rgba(255, 255, 255, 0.1)' }}>
                {nodes.map((node) => (
                  <SelectItem key={node.id} value={node.id} style={{ backgroundColor: 'rgba(9, 12, 24, 1)' }}>
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
            className={`rounded-full ${!isActive ? "bg-green-600 hover:bg-green-700" : ""}`}
          >
            {isStarting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Starting...
              </>
            ) : (
              <>
                <span className="h-4 mr-2" />
                {isActive ? "Stop Node" : "Start Node"}
                <img src="Vector (6).png" alt="" />
              </>
            )}
          </Button>
        </div>


        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-3 mt-4">
          <div className="flex flex-col p-3 bg-slate-800/30 rounded-lg" style={{ backgroundColor: 'rgba(15, 23, 42, 0.3)' }}>
            <div className="flex items-center text-slate-400 mb-1">
              <div className="p-2 rounded-[10px] px-3" style={{
                background: 'radial-gradient(91.65% 91.65% at 50% 0%,  #69AAFF 0%, #0361DA 36.8%, #161628 100%)'

              }}>
                <img src="Vector (1).png" alt="" />
              </div>
              <span className="w-4 h-4 mr-2" /> CPU Usage
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

          <div className="flex flex-col p-3 bg-slate-800/30 rounded-lg" style={{ backgroundColor: 'rgba(15, 23, 42, 0.3)' }}>
            <div className="flex items-center text-slate-400 mb-1">
              <div className="p-2 rounded-[10px] px-3" style={{
                background: 'radial-gradient(91.65% 91.65% at 50% 0%, #69AAFF 0%, #0361DA 36.8%, #161628 100%)'
              }}>
                <img src="Group 5.png" alt="" />
              </div>
              <span className="w-4 h-4 mr-2" /> Memory
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

          <div className="flex flex-col p-3 bg-slate-800/30 rounded-lg" style={{ backgroundColor: 'rgba(15, 23, 42, 0.3)' }}>
            <div className="flex items-center text-slate-400 mb-1">
              <div className="p-2 rounded-[10px] px-3" style={{
                background: 'radial-gradient(91.65% 91.65% at 50% 0%, #69AAFF 0%, #0361DA 36.8%, #161628 100%)'
              }}>
                <img src="Vector (3).png" alt="" />
              </div>
              <span className="w-4 h-4 mr-2" /> Network
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

          <div className="flex flex-col p-3 bg-slate-800/30 rounded-lg" style={{ backgroundColor: 'rgba(15, 23, 42, 0.3)' }}>
            <div className="flex items-center text-slate-400 mb-1">
              <div className="px-3 py-3   rounded-[10px] " style={{
                background: 'radial-gradient(91.65% 91.65% at 50% 0%, #69AAFF 0%, #0361DA 36.8%, #161628 100%)'
              }}>
                <img src="Vector.png" alt="" className="h-4 w-6" />
              </div>
              <span className="w-4 h-4 mr-2" /> Tasks Completed
            </div>
            <div className="text-2xl font-bold">{tasksCompleted}</div>
          </div>

          <div className="flex flex-col p-3 bg-slate-800/30 rounded-lg col-span-1 sm:col-span-2 lg:col-span-1" style={{ backgroundColor: 'rgba(15, 23, 42, 0.3)' }}>
            <div className="flex items-center text-slate-400 mb-1">
              <div className="p-2 rounded-[10px] px-3" style={{
                background: 'radial-gradient(91.65% 91.65% at 50% 0%, #69AAFF 0%, #0361DA 36.8%, #161628 100%)'
              }}>
                <img src="Vector (2).png" alt="" />
              </div>
              <span className="w-4 h-4 mr-2" /> Success Rate
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

          <div className="col-span-1 sm:col-span-2 lg:col-span-3 p-3 bg-slate-800/30 rounded-lg" style={{ backgroundColor: 'rgba(15, 23, 42, 0.3)' }}>
            <div className="flex items-center text-slate-400 mb-1">
              <div className="flex-1">Reward Tier</div>
            </div>
            <div>
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
        <DialogContent className="sm:max-w-md" style={{ backgroundColor: 'rgba(9, 12, 24, 1)' }}>
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
        <DialogContent className="sm:max-w-md" style={{ backgroundColor: 'rgba(9, 12, 24, 1)' }}>
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
                <SelectTrigger style={{ backgroundColor: 'rgba(15, 23, 42, 0.3)' }}>
                  <SelectValue placeholder="Select device type" />
                </SelectTrigger>
                <SelectContent style={{ backgroundColor: 'rgba(9, 12, 24, 1)' }}>
                  {getDeviceTypesForGroup(deviceGroup).map((type) => (
                    <SelectItem key={type} value={type} style={{ backgroundColor: 'rgba(9, 12, 24, 1)' }}>
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
                  <SelectTrigger style={{ backgroundColor: 'rgba(15, 23, 42, 0.3)' }}>
                    <SelectValue placeholder="Select brand" />
                  </SelectTrigger>
                  <SelectContent style={{ backgroundColor: 'rgba(9, 12, 24, 1)' }}>
                    {getDeviceBrands(deviceGroup, selectedDeviceType).map(
                      (brand) => (
                        <SelectItem key={brand} value={brand} style={{ backgroundColor: 'rgba(9, 12, 24, 1)' }}>
                          {brand}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              )}

              {selectedBrand && (
                <Select value={selectedModel} onValueChange={setSelectedModel}>
                  <SelectTrigger style={{ backgroundColor: 'rgba(15, 23, 42, 0.3)' }}>
                    <SelectValue placeholder="Select model" />
                  </SelectTrigger>
                  <SelectContent style={{ backgroundColor: 'rgba(9, 12, 24, 1)' }}>
                    {getDeviceModels(
                      deviceGroup,
                      selectedDeviceType,
                      selectedBrand
                    ).map((model) => (
                      <SelectItem key={model} value={model} style={{ backgroundColor: 'rgba(9, 12, 24, 1)' }}>
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
                        style={{ backgroundColor: 'rgba(15, 23, 42, 0.3)' }}
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
                        style={{ backgroundColor: 'rgba(15, 23, 42, 0.3)' }}
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
                  (!customSpecs.cpu || !customSpecs.gpu))
              }
            >
              Confirm Device
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="flex mt-2 h-[88px] flex-col p-3 bg-slate-800/30 rounded-lg" style={{ backgroundColor: 'rgba(15, 23, 42, 0.3)' }}>
        <div className="flex items-center text-slate-400 mb-1">
          <div style={{
            // background: 'radial-gradient(91.65% 91.65% at 50% 0%, #69AAFF 0%, #0361DA 36.8%, #161628 100%)',
            width: '24px',
            height: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '6px'
          }}>
            <img src="PNG 1.png" alt="Earnings" className="w-4 h-4" />
          </div>
          <span className="ml-2">Total Earnings</span>
          <div className="text-[40px] font-bold ml-auto" style={{
            background: 'linear-gradient(267.93deg, #20A5EF 35.94%, #0361DA 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            // textFillColor: 'transparent'
          }}>27.053</div>
          <sub><div className="text-sm text-slate-400" >NLOV</div></sub>


        </div>

      </div>
    </div>
  );
};
