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
  switchCurrentNode
} from "@/store/slices/nodeSlice";
import {
  fetchAndAssignTasks,
  clearAssignedTasks,
} from "@/store/slices/taskSlice";
import { useSession } from "@/hooks/useSession";

import { RootState, useAppDispatch } from "@/store";
import { store } from "@/store";
import { assignTasksToUser } from "@/services/swarmTaskService";
import { useEarnings } from "@/hooks/useEarnings";
import {
  getUserEarnings,
  getUserTotalEarnings,
} from "@/services/earningsService";
import { VscDebugStart } from "react-icons/vsc";
import { IoStopOutline } from "react-icons/io5";
import { setCurrentDevice } from "@/store/slices/deviceSlice";
import { extractGPUModel } from "@/utils/gpuUtils";

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
  const [isRegistering, setIsRegistering] = useState(false);

  // Device selection state
  const [showScanResultDialog, setShowScanResultDialog] = useState(false);
  const [detectedHardware, setDetectedHardware] = useState<HardwareInfo | null>(
    null
  );

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

  const [showNameDialog, setShowNameDialog] = useState(false);
  const [deviceName, setDeviceName] = useState("");
  const [tempDeviceSpecs, setTempDeviceSpecs] = useState<any>(null);

  const handleRegisterClick = () => {
    if (!detectedHardware || !userProfile?.id) {
      toast.error("Unable to register device. Please try again.");
      return;
    }

    // Create temporary device info to be used during registration
    const deviceSpecs = {
      cpu: `${detectedHardware.cpuCores || 'Unknown'} Cores`,
      gpu: detectedHardware.gpuInfo || 'Unknown',
      ram: detectedHardware.deviceMemory || 0,
      deviceType: detectedHardware.deviceType || 'desktop' as const,
      deviceBrand: detectedHardware.deviceBrand || 'Generic',
      deviceModel: detectedHardware.deviceModel || `${detectedHardware.rewardTier.toUpperCase()} Device`,
      maxUptime: tierInfo?.maxUptime || 4 * 60 * 60
    };

    setTempDeviceSpecs(deviceSpecs);
    setShowNameDialog(true);
    setShowScanResultDialog(false);
  };

  const registerDevice = async (customName: string) => {
    if (!tempDeviceSpecs || !userProfile?.id || !detectedHardware) {
      toast.error("Unable to register device. Please try again.");
      return;
    }

    console.log("Registering device with hardware:", detectedHardware);

    // Check device limit based on subscription
    const { data: existingDevices } = await client
      .from("devices")
      .select("id")
      .eq("owner", userProfile.id);

    const deviceCount = existingDevices?.length || 0;
    const deviceLimit = tierInfo?.deviceLimit || 1;

    if (deviceCount >= deviceLimit) {
      toast.error(`Your ${subscriptionTier} plan is limited to ${deviceLimit} device(s). Please upgrade your subscription to add more devices.`);
      return;
    }

    setIsRegistering(true);
    try {
      // Only include fields that exist in the database schema
      const deviceData = {
        status: "offline",
        gpu_model: detectedHardware.gpuInfo || "Unknown",
        hash_rate: Math.floor(Math.random() * 50) + 50,
        owner: userProfile.id,
        created_at: new Date().toISOString(),
        last_seen: new Date().toISOString(),
        uptime: 0,
        stake_amount: 0,
        performance_score: 100,
        reward_tier: detectedHardware.rewardTier,
        device_name: customName
      };

      console.log("Final device data:", deviceData);

      const { data: device, error } = await client
        .from("devices")
        .insert(deviceData)
        .select("*")
        .single();

      if (error) {
        console.error("Registration error details:", error);
        throw error;
      }

      console.log("Registered device:", device);

      if (device) {
        // Update Redux store with the full device data
        dispatch(setCurrentDevice(device.id));
        
        // Convert device to NodeInfo format and update local state
        const nodeInfo: NodeInfo = {
          id: device.id,
          name: device.device_name || 'Unnamed Device',
          type: tempDeviceSpecs.deviceType || 'desktop',
          brand: tempDeviceSpecs.deviceBrand,
          model: tempDeviceSpecs.deviceModel,
          rewardTier: device.reward_tier,
          status: device.status === "offline" ? "idle" : "running",
          cpuCores: parseInt(tempDeviceSpecs.cpu) || undefined,
          memory: tempDeviceSpecs.ram,
          gpuInfo: device.gpu_model
        };
        
        setNodes(prev => [...prev, nodeInfo]);
        setSelectedNodeId(device.id);
      }

      toast.success("Device registered successfully!");
      setShowNameDialog(false);
      setDeviceName("");
    } catch (error: any) {
      console.error("Error registering device:", error);
      toast.error(error.message || "Failed to register device. Please try again.");
    } finally {
      setIsRegistering(false);
    }
  };

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
          .select("uptime, device_name, reward_tier")
          .eq("id", selectedNodeId)
          .single();

        if (error) throw error;

        if (data) {
          console.log(
            `Fetched uptime for node "${data.device_name}" (${selectedNodeId}): ${data.uptime} seconds`
          );
          
          // If the node is currently active, we don't want to override the current uptime
          // as it's being tracked in real-time
          if (!isActive || nodeId !== selectedNodeId) {
            // Use switchCurrentNode to properly update the Redux store with this node's info
            dispatch(switchCurrentNode({
              nodeId: selectedNodeId,
              nodeName: data.device_name || `Device ${selectedNodeId.substring(0, 6)}`,
              nodeType: 'desktop', // Default to desktop since we don't have this info in the DB
              rewardTier: data.reward_tier || 'cpu',
              uptime: data.uptime || 0
            }));
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
        const userNodes: NodeInfo[] = devices.map((device) => {
          // Create a basic node info object with available data
          return {
            id: device.id,
            name: device.device_name || `Device ${device.id.substring(0, 6)}`,
            type: 'desktop', // Default to desktop if not specified
            brand: 'Generic',
            model: device.gpu_model.substring(0, 30), // Use first part of GPU model as device model
            rewardTier: device.reward_tier,
            status: device.status === "offline" ? "idle" : "running",
            cpuCores: undefined, // We don't have this in the new schema
            memory: undefined, // We don't have this in the new schema
            gpuInfo: device.gpu_model
          };
        });

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
    // Prevent changing nodes while a node is active
    if (isActive) {
      toast.error("Please stop the current node before switching to another node");
      return;
    }
    
    // Set the selected node ID in the local state
    setSelectedNodeId(value);
    
    // The fetchNodeUptime effect will be triggered by the selectedNodeId change
    // This will fetch the uptime and update Redux with the switchCurrentNode action
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

      updateProgress(60, "Detecting hardware tier...");
      const hardwareInfo = await detectHardware();
      setDetectedHardware(hardwareInfo);

      updateProgress(100, "Scan complete!");
      setIsScanning(false);

      // Show scan results dialog
      setShowScanDialog(false);
      setShowScanResultDialog(true);
    } catch (error) {
      console.error("Hardware scan error:", error);
      toast.error("Failed to scan hardware. Please try again.");
      setShowScanDialog(false);
      setIsScanning(false);
    }
  };

  const toggleNodeStatus = async () => {
    // Skip if user profile is not loaded yet
    if (!userProfile?.id) {
      toast.error("User profile not loaded. Please reload the page.");
      return;
    }

    // Define fetchNodeUptime function to be used after stopping a node
    const fetchNodeUptime = async () => {
      if (!selectedNodeId || !userProfile?.id) return;

      try {
        const { data, error } = await client
          .from("devices")
          .select("uptime, device_name, reward_tier")
          .eq("id", selectedNodeId)
          .single();

        if (error) throw error;

        if (data) {
          console.log(
            `Fetched uptime for node "${data.device_name}" (${selectedNodeId}): ${data.uptime} seconds`
          );
          
          // Use switchCurrentNode to properly update the Redux store with this node's info
          dispatch(switchCurrentNode({
            nodeId: selectedNodeId,
            nodeName: data.device_name || `Device ${selectedNodeId.substring(0, 6)}`,
            nodeType: 'desktop', // Default to desktop since we don't have this info in the DB
            rewardTier: data.reward_tier || 'cpu',
            uptime: data.uptime || 0
          }));
        }
      } catch (error) {
        console.error("Error fetching node uptime:", error);
      }
    };

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
          .select("status, device_name, uptime")
          .single();

        if (updateError) throw updateError;

        console.log(`Node "${data?.device_name}" status updated in database: ${JSON.stringify(data)}`);

        // Stop the node in Redux
        dispatch(stopNode());
        dispatch(clearAssignedTasks());

        // Update node status in local state
        setNodes(
          nodes.map((node) =>
            node.id === selectedNodeId ? { ...node, status: "idle" } : node
          )
        );

        toast.info(`Node "${selectedNode?.name}" stopped`);
        
        // Fetch the latest uptime for this node after stopping
        setTimeout(() => {
          fetchNodeUptime();
        }, 1000);
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
          .select("status, device_name")
          .single();

        if (updateError) throw updateError;

        console.log(`Node "${data?.device_name}" status updated in database: ${JSON.stringify(data)}`);

        // Load the current uptime from the database
        try {
          // Directly fetch uptime from the database
          const { data: uptimeData, error: uptimeError } = await client
            .from("devices")
            .select("uptime, device_name")
            .eq("id", selectedNodeId)
            .single();

          if (uptimeError) throw uptimeError;

          const databaseUptime = uptimeData?.uptime || 0;
          console.log(
            `Loaded uptime from database for node "${uptimeData?.device_name}" (${selectedNodeId}): ${databaseUptime} seconds`
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

  const getTierDescription = (tier?: string) => {
    switch (tier) {
      case "webgpu":
        return "High-performance GPU with WebGPU support - Maximum rewards";
      case "wasm":
        return "Powerful system with 4+ CPU cores and 4GB+ memory";
      case "webgl":
        return "Standard GPU with WebGL support";
      case "cpu":
        return "Basic CPU-only processing";
      default:
        return "Unknown device tier";
    }
  };

  // Sync uptime on app close/refresh
  useEffect(() => {
    const handleBeforeUnload = async (event: BeforeUnloadEvent) => {
      if (isActive) {
        console.log("App closing/refreshing - syncing uptime data...");

        // Sync uptime to database
        dispatch(syncUptime());
        
        // Store the current session info for recovery
        if (selectedNodeId) {
          try {
            // Get values from Redux state
            const { startTime, totalUptime } = store.getState().node;
            
            // Calculate current session uptime
            const sessionUptime = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;
            
            // Store detailed session info
            localStorage.setItem("node-session-info", JSON.stringify({
              nodeId: selectedNodeId,
              sessionUptime,
              totalUptime,
              timestamp: Date.now()
            }));
          } catch (e) {
            console.error("Failed to save session info to localStorage", e);
          }
        }

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

        try {
          // Store node stop info
          localStorage.setItem("nodeToStop", selectedNodeId);
          localStorage.setItem("nodeStopTime", new Date().toISOString());
          
          // Get values from Redux state
          const { startTime, totalUptime } = store.getState().node;
          
          // Calculate and store final uptime
          if (startTime) {
            const sessionUptime = Math.floor((Date.now() - startTime) / 1000);
            const finalUptime = totalUptime + sessionUptime;
            
            localStorage.setItem(`node-uptime-sync-pending-${selectedNodeId}`, JSON.stringify({
              totalUptime: finalUptime,
              timestamp: Date.now()
            }));
          }
        } catch (e) {
          console.error("Failed to save node stop info to localStorage", e);
        }
      }
    };

    // Check if we need to stop a node from a previous unload
    const checkPreviousUnload = async () => {
      try {
        const nodeToStop = localStorage.getItem("nodeToStop");
        const nodeStopTime = localStorage.getItem("nodeStopTime");
        const sessionInfo = localStorage.getItem("node-session-info");

        // Process node stop info
        if (nodeToStop && nodeStopTime) {
          const stopTime = new Date(nodeStopTime);
          const now = new Date();
          const timeDiff = now.getTime() - stopTime.getTime();

          // If the stored data is recent (within last 30 seconds), update the node status
          if (timeDiff < 30000) {
            console.log(
              `Found node ${nodeToStop} that needs to be stopped from previous session`
            );

            // Update node status in database
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
        
        // Process session info
        if (sessionInfo) {
          const parsedInfo = JSON.parse(sessionInfo);
          const sessionTimestamp = parsedInfo.timestamp;
          const now = Date.now();
          const timeDiff = now - sessionTimestamp;
          
          // If the session info is recent (within last 30 seconds)
          if (timeDiff < 30000 && parsedInfo.nodeId) {
            console.log(`Found recent session info for node ${parsedInfo.nodeId}`);
            
            // Ensure the uptime is synced to the database
            try {
              await client
                .from("devices")
                .update({ 
                  uptime: parsedInfo.totalUptime + parsedInfo.sessionUptime,
                  status: "offline",
                  last_seen: new Date().toISOString()
                })
                .eq("id", parsedInfo.nodeId);
                
              console.log(`Successfully synced final uptime for node ${parsedInfo.nodeId}`);
            } catch (error) {
              console.error("Error syncing final uptime:", error);
            }
          }
          
          // Clear the session info
          localStorage.removeItem("node-session-info");
        }
      } catch (e) {
        console.error("Error checking previous unload", e);
      }
    };

    // Run once on component mount
    checkPreviousUnload();

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("unload", handleUnload);
    
    // Add visibility change handler
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden" && isActive) {
        console.log("Page hidden - syncing uptime data");
        dispatch(syncUptime());
      }
    };
    
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
              {isActive ? rewardTier : selectedNode?.rewardTier}
            </span>
          </div>
          <p className="text-[10px] sm:text-sm text-[#515194] break-words">
            {(isActive ? rewardTier : selectedNode?.rewardTier) === "webgpu" &&
              "This device supports WebGPU acceleration, earning maximum Swarm Point rewards."}
            {(isActive ? rewardTier : selectedNode?.rewardTier) === "wasm" &&
              "This device uses WASM processing, earning high Swarm Point rewards."}
            {(isActive ? rewardTier : selectedNode?.rewardTier) === "webgl" &&
              "This device uses WebGL processing, earning medium Swarm Point rewards."}
            {(isActive ? rewardTier : selectedNode?.rewardTier) === "cpu" &&
              "This device uses CPU processing, earning basic Swarm Point rewards."}
          </p>
          {selectedNode && (
            <div className="grid grid-cols-1 gap-1 sm:gap-4 mt-2 sm:mt-4 text-[10px] sm:text-sm overflow-hidden">
              {selectedNode.gpuInfo && (
                <div className="col-span-2 text-[#515194] truncate">
                  GPU:{" "}
                  <span className="text-white">{extractGPUModel(selectedNode.gpuInfo)}</span>
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

      <Dialog open={showScanResultDialog} onOpenChange={setShowScanResultDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Hardware Scan Results</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="flex flex-col items-center gap-4 text-center">
              <h3 className="text-xl font-semibold">
                Your Device Tier:{" "}
                <span className="text-primary">{detectedHardware?.rewardTier.toUpperCase()}</span>
              </h3>
              <p className="text-sm text-muted-foreground">
                {getTierDescription(detectedHardware?.rewardTier)}
              </p>

              <div className="flex flex-col w-full gap-4 mt-4">
                <Button
                  onClick={handleRegisterClick}
                  disabled={isRegistering}
                  className="w-full"
                >
                  Register Device
                </Button>

                <Button
                  variant="outline"
                  onClick={() => {
                    setShowScanResultDialog(false);
                    startScan();
                  }}
                  className="w-full"
                >
                  Scan Again
                </Button>

                <div className="flex flex-col items-center gap-2">
                  <p className="text-sm">Think this scan result is incorrect?</p>
                  <Button
                    variant="ghost"
                    onClick={() => window.open('https://forms.gle/yourFormUrl', '_blank')}
                    className="text-sm"
                  >
                    Submit Device Validation Form
                  </Button>
                </div>
              </div>
            </div>
          </div>
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
                  <p className="text-[#515194] text-sm truncate">
                    {extractGPUModel(selectedNode.gpuInfo)}
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

      <Dialog open={showNameDialog} onOpenChange={setShowNameDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Name Your Device</DialogTitle>
            <DialogDescription>
              Give your device a memorable name to help identify it in your dashboard.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Input
                id="deviceName"
                placeholder="My Mining Rig"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowNameDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => registerDevice(deviceName)}
              disabled={!deviceName.trim() || isRegistering}
            >
              {isRegistering ? "Registering..." : "Register"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
