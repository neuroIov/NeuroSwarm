import React, { useState, useEffect, useMemo, useCallback } from "react";
import { getTierByName, getMaxUptimeByTier } from "@/lib/subscriptionTiers";
import { formatUptime } from "@/utils/timeUtils";

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
  switchCurrentNode,
  updateUptime
} from "@/store/slices/nodeSlice";
import {
  fetchAndAssignTasks,
  clearAssignedTasks,
} from "@/store/slices/taskSlice";
import { clearProcessingLocks } from "@/services/taskService";
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
  
  // Add render count tracking for debugging
  const renderCount = React.useRef(0);

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
    currentSessionUptime,
    totalUptime,
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
  const [showUptimeLimitDialog, setShowUptimeLimitDialog] = useState(false);
  const [nodesUptimeMap, setNodesUptimeMap] = useState<Record<string, number>>({});
  const [totalStoredUptime, setTotalStoredUptime] = useState(0);
  const [localUptime, setLocalUptime] = useState(0);

  // Calculate displayed uptime based on current node selection and active status
  const calculatedDisplayUptime = useMemo(() => {
    // If a node is selected (either active or not)
    if (nodeId) {
      // If the node is active, add current session uptime to its stored uptime
      if (isActive) {
        const baseNodeUptime = nodesUptimeMap[nodeId] || 0;
        return baseNodeUptime + currentSessionUptime;
      } 
      // If node is selected but not active, just show its stored uptime
      else {
        return nodesUptimeMap[nodeId] || 0;
      }
    }
    
    // If no node is selected, show total uptime across all nodes
    return totalStoredUptime;
  }, [isActive, nodeId, currentSessionUptime, nodesUptimeMap, totalStoredUptime]);

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
        device_name: customName,
        device_type: detectedHardware.deviceType || 'desktop'
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
  
  // Set up polling for user uptime data
  useEffect(() => {
    // Skip if user is not logged in
    if (!userProfile?.id) return;
    
    // Fetch initial data
    fetchUserDevicesUptime();

    // Create ONE single data refresh interval instead of multiple ones
    const dataRefreshInterval = setInterval(() => {
      console.log("Running scheduled uptime data refresh");
      fetchUserDevicesUptime(true); // true = silent mode (no loading indicators)
    }, 30000); // Every 30 seconds

    return () => {
      clearInterval(dataRefreshInterval);
    };
  }, [userProfile?.id]);

  // Modify the fetchUserDevicesUptime function to avoid unnecessary updates
  const fetchUserDevicesUptime = async (silent = false) => {
    if (!userProfile?.id) return;

    try {
      const { data, error } = await client
        .from("devices")
        .select("uptime, id, device_name")
        .eq("owner", userProfile.id);

      if (error) throw error;

      // Check if there are actual changes before updating state
      let hasChanges = false;
      const uptimeMap: Record<string, number> = {};
      
      data.forEach(device => {
        uptimeMap[device.id] = device.uptime || 0;
        // Check if this device's uptime has changed
        if (nodesUptimeMap[device.id] !== device.uptime) {
          hasChanges = true;
        }
      });
      
      // Only update state if there are actual changes
      if (hasChanges || Object.keys(nodesUptimeMap).length !== data.length) {
        console.log("Uptime data changed, updating local state");
        setNodesUptimeMap(uptimeMap);
      
        // Calculate total uptime across all user's devices
        const totalUserUptime = data.reduce(
          (sum, device) => sum + (device.uptime || 0),
          0
        );
        
        // Only update if the value has changed
        if (totalStoredUptime !== totalUserUptime) {
          setTotalStoredUptime(totalUserUptime);
        }

        // If the current node is in the devices, update its local uptime
        if (nodeId && !isActive) { // Only update if node is not active
          const currentDevice = data.find((device) => device.id === nodeId);
          if (currentDevice && currentDevice.uptime !== nodesUptimeMap[nodeId]) {
            console.log(
              `Found updated uptime for current node ${currentDevice.device_name} (${nodeId}): ${currentDevice.uptime} seconds`
            );
            
            // Only update Redux if the node is not active (to avoid overwriting active session tracking)
            dispatch(setUptimeFromDatabase(currentDevice.uptime || 0));
          }
        }
      } else if (!silent) {
        console.log("No uptime changes detected");
      }
    } catch (error) {
      console.error("Error fetching user devices uptime:", error);
    }
  };

  // Update selectedNodeId when nodeId from redux changes
  useEffect(() => {
    if (nodeId) {
      // Prevent unnecessary updates by checking if value is different
      if (selectedNodeId !== nodeId) {
        console.log(`Syncing selectedNodeId with Redux nodeId: ${nodeId}`);
        setSelectedNodeId(nodeId);
      }
    }
  }, [nodeId]);
  
  // Update uptime in real-time when active
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (isActive) {
      // Update uptime in redux store every second
      interval = setInterval(() => {
        dispatch(updateUptime());
        setLocalUptime((prev) => prev + 1); // Force component re-render
      }, 1000);
    } else {
      // If not active, still fetch the latest uptime from database
      fetchUserDevicesUptime();
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isActive, dispatch]);

  // Listen for node changes to update the displayed uptime
  useEffect(() => {
    if (nodeId) {
      // When node ID changes, fetch the latest uptime for all devices
      fetchUserDevicesUptime();
    }
  }, [nodeId]);
  
  // Listen for Redux uptime sync events to update local state
  useEffect(() => {
    // When totalUptime changes in Redux, refresh our local uptime map
    if (nodeId && totalUptime > 0 && !isActive) {
      // After a sync or node stop, update the local map with the latest value
      setNodesUptimeMap(prev => ({
        ...prev,
        [nodeId]: totalUptime
      }));
    }
  }, [nodeId, totalUptime, isActive]);

  // Fetch node uptime when selected node changes
  useEffect(() => {
    const fetchNodeUptime = async () => {
      if (!selectedNodeId || !userProfile?.id) return;
      // Skip if we're just syncing with Redux state to avoid circular updates
      if (selectedNodeId === nodeId && nodeId) return;

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
          
          // Update the local uptime map
          setNodesUptimeMap(prev => ({
            ...prev,
            [selectedNodeId]: data.uptime || 0
          }));
          
          // Only update Redux if this is an actual node change, not just a sync
          // This breaks the circular dependency
          if (nodeId !== selectedNodeId) {
            console.log(`Switching current node in Redux from ${nodeId} to ${selectedNodeId}`);
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
    
    // Don't create a polling interval for every selection change
    // Only set up polling if this is a "real" selection (not just syncing from Redux)
    const selectedNodeInterval = (nodeId !== selectedNodeId) 
      ? setInterval(fetchNodeUptime, 5000) // Only poll every 5 seconds if this is a user-initiated change
      : null;
    
    return () => {
      if (selectedNodeInterval) clearInterval(selectedNodeInterval);
    };
  }, [selectedNodeId, userProfile?.id, isActive, nodeId, dispatch, client]);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  // Node metrics simulation when active - optimize to prevent excessive state updates
  useEffect(() => {
    let metricsInterval: NodeJS.Timeout | null = null;

    // Only set up interval if node is active
    if (isActive) {
      console.log("Starting node metrics simulation");
      
      // Set initial metrics with small random values
      dispatch(
        updateNodeMetrics({
          cpuUsage: Math.random() * 30 + 10,
          memoryUsage: Math.random() * 20 + 5,
          networkUsage: Math.random() * 5 + 0.5,
        })
      );
      
      metricsInterval = setInterval(() => {
        // Get current metrics from Redux to ensure we're working with latest values
        const { cpuUsage: currentCpu, memoryUsage: currentMemory, networkUsage: currentNetwork } = 
          store.getState().node;
        
        // Calculate new values with dampened randomization to prevent wild swings
        const newCpuUsage = Math.min(95, Math.max(5, currentCpu + (Math.random() * 8 - 4)));
        const newMemoryUsage = Math.min(95, Math.max(5, currentMemory + (Math.random() * 6 - 3)));
        const newNetworkUsage = Math.max(0.1, Math.min(10, currentNetwork + (Math.random() * 0.8 - 0.4)));

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
        console.log("Cleaning up metrics simulation interval");
        clearInterval(metricsInterval);
      }
    };
  }, [isActive, dispatch]); // Remove cpuUsage, memoryUsage, networkUsage from deps to prevent unnecessary reruns

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
            type: device.device_type || 'desktop', // Use device_type from database
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

        // Only select first node on initial load when there's no selection at all
        if ((!selectedNodeId && !nodeId) && userNodes.length > 0) {
          console.log(`No node selected, selecting first node: ${userNodes[0].id}`);
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

  const handleNodeSelect = useCallback(async (value: string) => {
    // Skip if already selected (prevents unnecessary updates)
    if (value === selectedNodeId) {
      console.log(`Node ${value} already selected, skipping update`);
      return;
    }
    
    // Prevent changing nodes while a node is active
    if (isActive) {
      toast.error("Please stop the current node before switching to another node");
      return;
    }
    
    console.log(`User selected node: ${value}`);
    
    // Set the selected node ID in the local state
    setSelectedNodeId(value);
    
    // Immediately fetch the latest uptime data for the selected node
    try {
      const { data, error } = await client
        .from("devices")
        .select("uptime, device_name, reward_tier")
        .eq("id", value)
        .single();

      if (error) throw error;

      if (data) {
        console.log(
          `Fetched uptime for node "${data.device_name}" (${value}): ${data.uptime} seconds`
        );
        
        // Update the local uptime map
        setNodesUptimeMap(prev => ({
          ...prev,
          [value]: data.uptime || 0
        }));
        
        // Update Redux store with the selected node's info
        dispatch(switchCurrentNode({
          nodeId: value,
          nodeName: data.device_name || `Device ${value.substring(0, 6)}`,
          nodeType: 'desktop', // Default to desktop since we don't have this info in the DB
          rewardTier: data.reward_tier || 'cpu',
          uptime: data.uptime || 0
        }));
      }
    } catch (error) {
      console.error("Error fetching node uptime during selection:", error);
    }
  }, [selectedNodeId, isActive, dispatch, client]);

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
    
    // If trying to start a node, check if uptime limit has been reached
    if (!isActive && selectedNode) {
      try {
        // Fetch the current uptime from the database
        const { data, error } = await client
          .from("devices")
          .select("uptime")
          .eq("id", selectedNodeId)
          .single();
          
        if (error) throw error;
        
        const currentUptime = data?.uptime || 0;
        const maxUptime = tierInfo?.maxUptime || 3600; // Default to 1 hour if not specified
        
        // Check if the uptime has reached the limit
        if (currentUptime >= maxUptime) {
          setShowUptimeLimitDialog(true);
          return;
        }
      } catch (error) {
        console.error("Error checking uptime limit:", error);
      }
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
        
        // Reset all pending and processing tasks for this user/node to pending with null user_id and node_id
        const { error: taskResetError } = await client
          .from("tasks")
          .update({
            status: "pending",
            user_id: null,
            node_id: null,
            updated_at: new Date().toISOString()
          })
          .eq("user_id", userProfile?.id)
          .eq("node_id", selectedNodeId)
          .in("status", ["pending", "processing"]);
          
        if (taskResetError) {
          console.error("Error resetting tasks:", taskResetError);
        } else {
          console.log("Successfully reset pending and processing tasks for this node");
        }

        // Clear processing locks and stop node
        if (userProfile?.id) {
          await clearProcessingLocks(userProfile.id, selectedNodeId);
        }
        dispatch(stopNode());
        dispatch(clearAssignedTasks());

        // Update node status in local state
        setNodes(
          nodes.map((node) =>
            node.id === selectedNodeId ? { ...node, status: "idle" } : node
          )
        );
        
        // Update the local uptime map with the latest value from database
        setTimeout(async () => {
          const { data: deviceData, error: deviceError } = await client
            .from("devices")
            .select("uptime")
            .eq("id", selectedNodeId)
            .single();
            
          if (!deviceError && deviceData) {
            console.log(`Updated local uptime map for ${selectedNodeId}: ${deviceData.uptime} seconds`);
            setNodesUptimeMap(prev => ({
              ...prev,
              [selectedNodeId]: deviceData.uptime
            }));
          }
        }, 500);

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
      // Before starting, refresh uptime data for this node
      await fetchUserDevicesUptime();
      
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
      if (isActive && selectedNodeId && userProfile?.id) {
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

          // Clear processing locks before unload
          clearProcessingLocks(userProfile.id, selectedNodeId);
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

  // Component mount/unmount logging
  useEffect(() => {
    console.log("NodeControlPanel mounted");
    renderCount.current = 1; // Initialize render count
    console.log(`Initial render (${renderCount.current})`);
    
    // Return cleanup function
    return () => {
      console.log("NodeControlPanel unmounting - cleaning up resources");
      // Make sure any active intervals are cleared
    };
  }, []);

  // Performance logging at component render - removed duplicate declaration

  return (
    <>
      {/* Uptime Limit Dialog */}
      <Dialog open={showUptimeLimitDialog} onOpenChange={setShowUptimeLimitDialog}>
        <DialogContent className="sm:max-w-md bg-[#0A1A2F] border-[#112544]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Subscription Tier Limit Reached
            </DialogTitle>
            <DialogDescription className="text-white/70">
              Your {subscriptionTier} tier uptime limit of {tierInfo?.maxUptime} seconds has been reached.
              You cannot start this node until your uptime is reset or you upgrade your subscription plan.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="flex items-center justify-between rounded-lg border border-[#112544] p-3 shadow-sm bg-[#112544]/30">
              <div className="flex flex-col">
                <span className="text-sm font-medium text-white">Current Plan</span>
                <span className="text-xs text-white/70">{subscriptionTier}</span>
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowUptimeLimitDialog(false)} className="border-[#112544] text-white hover:bg-[#112544]/30">
                Close
              </Button>
            </div>
          </div>
          <DialogFooter className="flex flex-col sm:flex-row sm:justify-between sm:space-x-0">
            <Button
              type="button"
              variant="default"
              onClick={() => {
                setShowUptimeLimitDialog(false);
                // Here you would typically navigate to upgrade page
                // For now just show a toast
                toast.info("Please upgrade your subscription plan to get more uptime");
              }}
              className="bg-[#0066FF] hover:bg-[#0052CC] text-white"
            >
              Upgrade Plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <div className="node-control-panel p-2.5 sm:p-4 md:p-6 rounded-2xl sm:rounded-3xl stat-card overflow-x-hidden">
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
              (!isActive && !userProfile?.id)
            }
            onClick={toggleNodeStatus}
            className={`rounded-full transition-all duration-300 shadow-md hover:shadow-lg text-white text-xs sm:text-sm px-3 py-1 sm:px-4 sm:py-2 h-9 sm:h-10 hover:translate-y-[-0.5px] ${
              isActive
                ? "bg-red-600 hover:bg-red-700 hover:shadow-red-500/30 shadow-red-500"
                : "bg-green-600 hover:bg-green-700 hover:shadow-green-500/30 shadow-green-500"
            }`}
            title={
              !userProfile?.id && !isActive
                ? "Login required to start node"
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
        {!userProfile?.id && !isActive && (
          <div className="bg-amber-800/20 border border-amber-700/30 rounded-lg p-2 mb-4 text-amber-200 text-xs">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              <span>Login required to start node</span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 sm:gap-4 mb-3 sm:mb-6">
          <div className="p-2 sm:p-4 rounded-xl bg-[#1D1D33] flex flex-col">
            <div className="flex items-center gap-1.5 sm:gap-3 mb-0.5 sm:mb-2">
              <div className="icon-bg flex items-center justify-center p-1 sm:p-2">
                <img
                  src="/images/coins.png"
                  alt="Reward Tier"
                  className="w-5 h-5 sm:w-7 sm:h-7 object-contain z-10"
                />
              </div>
              <div className="flex flex-col overflow-hidden">
                <span className="text-[#515194] text-[10px] sm:text-sm whitespace-nowrap">
                  Reward Tier
                </span>
                <div className="text-sm sm:text-xl font-medium text-white">
                  {selectedNode?.rewardTier?.toUpperCase() || 'N/A'}
                </div>
              </div>
            </div>
          </div>

          <div className="p-2 sm:p-4 rounded-xl bg-[#1D1D33] flex flex-col">
            <div className="flex items-center gap-1.5 sm:gap-3 mb-0.5 sm:mb-2">
              <div className="icon-bg flex items-center justify-center p-1 sm:p-2">
                <Clock className="w-5 h-5 sm:w-7 sm:h-7 text-white z-10" />
              </div>
              <div className="flex flex-col overflow-hidden">
                <span className="text-[#515194] text-[10px] sm:text-sm whitespace-nowrap">
                  Node Uptime
                </span>
                <div className="text-sm sm:text-xl font-medium text-white">
                  {formatUptime(calculatedDisplayUptime)}
                </div>
              </div>
            </div>
          </div>
        </div>

          <div className="grid grid-cols-2 gap-2 sm:gap-4 mb-3 sm:mb-6">
            <div className="p-2 sm:p-4 rounded-xl bg-[#1D1D33] flex flex-col">
              <div className="flex items-center gap-1.5 sm:gap-3 mb-0.5 sm:mb-2">
                <div className="icon-bg flex items-center justify-center p-1 sm:p-2">
                  <img
                    src="/images/devices.png"
                    alt="Connected Devices"
                    className="w-5 h-5 sm:w-7 sm:h-7 object-contain z-10"
                  />
                </div>
                <div className="flex flex-col overflow-hidden">
                  <span className="text-[#515194] text-[10px] sm:text-sm whitespace-nowrap">
                    Connected Devices
                  </span>
                  <div className="text-sm sm:text-xl font-medium text-white">
                    {nodes.length}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-2 sm:p-4 rounded-xl bg-[#1D1D33] flex flex-col">
              <div className="flex items-center gap-1.5 sm:gap-3 mb-0.5 sm:mb-2">
                <div className="icon-bg flex items-center justify-center p-1 sm:p-2">
                  <img
                    src="/images/gpu_model.png"
                    alt="GPU Model"
                    className="w-5 h-5 sm:w-7 sm:h-7 object-contain z-10"
                  />
                </div>
                <div className="flex flex-col overflow-hidden">
                  <span className="text-[#515194] text-[10px] sm:text-sm whitespace-nowrap">
                    GPU Model
                  </span>
                  <div className="text-sm sm:text-xl font-medium text-white">
                    {selectedNode ? extractGPUModel(selectedNode.gpuInfo) : 'N/A'}
                  </div>
                </div>
              </div>
            </div>
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
          <p className="absolute bottom-2 right-4 text-[10px] text-white/50 italic">*All Swarm Points will be converted to $NLOV after TGE</p>
        </div>
      </div>

      <Dialog open={showScanDialog} onOpenChange={setShowScanDialog}>
        <DialogContent
          className="sm:max-w-md bg-[#0A1A2F] border-[#112544]"
        >
          <DialogHeader>
            <DialogTitle className="text-white">
              Scanning Device Hardware
            </DialogTitle>
            <DialogDescription className="text-white/70">
              Analyzing your device capabilities to determine the optimal reward
              tier
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <div className="mb-2 text-sm font-medium text-white">
              {scanStage}
            </div>
            <div className="w-full bg-[#112544] rounded-full h-2.5">
              <div
                className="bg-[#0066FF] h-2.5 rounded-full transition-all duration-300 ease-in-out"
                style={{ width: `${scanProgress}%` }}
              ></div>
            </div>
            <div className="mt-4 text-sm text-white/70">
              {scanProgress < 100
                ? "Please wait while we analyze your device. Do not close this window."
                : "Scan completed successfully!"}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showScanResultDialog} onOpenChange={setShowScanResultDialog}>
        <DialogContent className="sm:max-w-md bg-[#0A1A2F] border-[#112544]">
          <DialogHeader>
            <DialogTitle className="text-white">Hardware Scan Results</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="flex flex-col items-center gap-4 text-center">
              <h3 className="text-xl font-semibold text-white">
                Your Device Tier:{" "}
                <span className="text-[#0066FF]">{detectedHardware?.rewardTier.toUpperCase()}</span>
              </h3>
              <p className="text-sm text-white/70">
                {getTierDescription(detectedHardware?.rewardTier)}
              </p>

              <div className="flex flex-col w-full gap-4 mt-4">
                <Button
                  onClick={handleRegisterClick}
                  disabled={isRegistering}
                  className="w-full bg-[#0066FF] hover:bg-[#0052CC] text-white"
                >
                  Register Device
                </Button>

                <Button
                  variant="outline"
                  onClick={() => {
                    setShowScanResultDialog(false);
                    startScan();
                  }}
                  className="w-full border-[#112544] text-white hover:bg-[#112544]/30"
                >
                  Scan Again
                </Button>

                <div className="flex flex-col items-center gap-2">
                  <p className="text-sm text-white/70">Think this scan result is incorrect?</p>
                  <Button
                    variant="ghost"
                    onClick={() => window.open('https://forms.gle/yourFormUrl', '_blank')}
                    className="text-sm text-[#0066FF] hover:text-[#0052CC] hover:bg-[#0066FF]/10"
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
          className="sm:max-w-md bg-[#0A1A2F] border-[#112544]"
        >
          <DialogHeader>
            <DialogTitle className="text-white">Delete Node</DialogTitle>
            <DialogDescription className="text-white/70">
              Are you sure you want to delete this node? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            {selectedNode && (
              <div className="flex items-center gap-3 p-3 bg-[#112544] rounded-lg">
                {getDeviceIcon(selectedNode.type)}
                <div>
                  <p className="text-white font-medium">{selectedNode.name}</p>
                  <p className="text-white/70 text-sm truncate">
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
              className="border-[#112544] text-white hover:bg-[#112544]/30"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={deleteNode}
              disabled={isDeletingNode}
              className="bg-red-600 hover:bg-red-700 text-white"
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
        <DialogContent className="sm:max-w-[425px] bg-[#0A1A2F] border-[#112544]">
          <DialogHeader>
            <DialogTitle className="text-white">Name Your Device</DialogTitle>
            <DialogDescription className="text-white/70">
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
                className="bg-[#0A1A2F] border-[#112544] text-white"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowNameDialog(false)}
              className="border-[#112544] text-white hover:bg-[#112544]/30"
            >
              Cancel
            </Button>
            <Button
              onClick={() => registerDevice(deviceName)}
              disabled={!deviceName.trim() || isRegistering}
              className="bg-[#0066FF] hover:bg-[#0052CC] text-white"
            >
              {isRegistering ? "Registering..." : "Register"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </>
  );
};
