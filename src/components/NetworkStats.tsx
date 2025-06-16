import React, { useEffect, useState, useMemo } from "react";
import { ArrowUp, Clock } from "lucide-react";
import { InfoTooltip } from "./InfoTooltip";
import { getSwarmSupabase } from "@/lib/supabase-client";
import { useSelector } from "react-redux";
import { RootState, useAppDispatch } from "@/store";
import { formatUptime } from "@/utils/timeUtils";
import { useSession } from "@/hooks/useSession";
import { updateUptime, setUptimeFromDatabase } from "@/store/slices/nodeSlice";
import axios from "axios"

// Import the Supabase anon key
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_KEY;

type StatCardProps = {
  title: string;
  value: string | number;
  unit?: string;
  changePercentage?: number;
  info?: string;
  isUptime?: boolean;
};

const StatCard = ({
  title,
  value,
  unit,
  changePercentage,
  info,
  isUptime = false,
}: StatCardProps) => {
  let isPlan = title === "Your Plan";


  const getColor = () => {
    if (isPlan) {
      if (value === "Basic") {
        return "text-white";
      } else if (value === "Ultimate") {
        return "text-yellow-400";
      } else if (value === "Enterprice") {
        return "text-green-400";
      } else {
        return "text-white";
      }
    }
  };

  return (
    <div className="network-stat-card h-[100px] sm:h-[120px] rounded-2xl sm:rounded-3xl bg-[linear-gradient(135deg,#0361DA_0%,#0240B3_50%,#02072D_100%)] text-white p-2.5 sm:p-4 relative overflow-hidden transition-all duration-300 hover:border hover:border-[#20A5EF] hover:transform hover:scale-[1.02] hover:shadow-lg hover:shadow-[#0361DA]/20">
      <div className="network-stat-glow absolute -inset-1 bg-[radial-gradient(circle_at_50%_-20%,#64C8FF_0%,transparent_70%)] opacity-0 transition-opacity duration-500 z-0"></div>
      <div className="network-stat-shine absolute top-0 left-0 w-full h-full bg-[linear-gradient(90deg,transparent_0%,rgba(100,200,255,0.1)_50%,transparent_100%)] -translate-x-full z-0"></div>
      <div className="flex justify-between items-start mb-0.5 sm:mb-2 relative z-10">
        <div className="text-slate-400 flex items-center gap-1 text-xs sm:text-sm">
          {title}
          {info && <InfoTooltip content={info} />}
        </div>
      </div>
      <div className="flex flex-col relative z-10">
        <div
          className={`text-lg sm:text-2xl font-bold flex items-baseline gap-1 ${getColor()}`}
        >
          {isUptime ? (
            <div className="flex items-center">
              <Clock className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
              {value}
            </div>
          ) : (
            value
          )}
          {unit && (
            <span className="text-xs sm:text-sm text-slate-400">{unit}</span>
          )}
        </div>
        {changePercentage !== undefined && (
          <div className="flex items-center text-xs sm:text-sm text-green-400 mt-0.5 sm:mt-1">
            <ArrowUp className="w-2 h-2 sm:w-3 sm:h-3 mr-1" />
            {changePercentage}%
          </div>
        )}
      </div>
    </div>
  );
};

export const NetworkStats = () => {
  const client = getSwarmSupabase();
  const dispatch = useAppDispatch();
  const { session, subscriptionTier } = useSession();
  const userProfile = session?.userProfile;
  const [totalNodes, setTotalNodes] = useState(0);
  const [totalActiveNodes, setTotalActiveNodes] = useState(0);
  const [networkLoad, setNetworkLoad] = useState(0);
  const [nodesUptimeMap, setNodesUptimeMap] = useState<Record<string, number>>({});
  const [totalStoredUptime, setTotalStoredUptime] = useState(0);
  const [localUptime, setLocalUptime] = useState(0);
  const [lastUpdate, setLastUpdate] = useState(Date.now()); // Track last update time
  const [previousNodeState, setPreviousNodeState] = useState<boolean | null>(null);

  // Get node status from redux store
  const { isActive, currentSessionUptime, totalUptime, nodeId } = useSelector(
    (state: RootState) => state.node
  );

  // Update active nodes count locally when node status changes
  useEffect(() => {
    // Only run this after initial render and when isActive changes
    if (previousNodeState !== null && previousNodeState !== isActive) {
      if (isActive) {
        // Node was activated - increment active nodes count
        setTotalActiveNodes(prev => prev + 1);
        console.log("Node activated: Incrementing active nodes count locally");
      } else if (previousNodeState === true) {
        // Node was deactivated - decrement active nodes count
        setTotalActiveNodes(prev => Math.max(0, prev - 1));
        console.log("Node deactivated: Decrementing active nodes count locally");
      }
      
      // Recalculate network load
      if (totalNodes > 0) {
        const newActiveCount = isActive ? totalActiveNodes + 1 : Math.max(0, totalActiveNodes - 1);
        const loadPercentage = Math.round((newActiveCount / totalNodes) * 100);
        setNetworkLoad(loadPercentage);
      }
    }
    
    // Update previous state for next comparison
    setPreviousNodeState(isActive);
  }, [isActive, totalNodes]);

  // Fetch global stats from edge function
  const fetchGlobalStats = async () => {
    try {
      const response = await axios.get("https://zphiymepbkzgczxorqgz.supabase.co/functions/v1/luffy", {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SUPABASE_ANON_KEY}`
        }
      });

      const data = response.data;
    

      console.log("Global stats:", data);
      
      if (data) {
        setTotalNodes(data?.totalDevices || 0);
        setTotalActiveNodes(data?.activeDevices || 0);
        
        // Calculate network load
        if (data.totalDevices > 0) {
          const loadPercentage = Math.round(((data.activeDevices || 0) / data.totalDevices) * 100);
          setNetworkLoad(loadPercentage);
        }
        
        console.log("Global stats updated from API:", data);
        
        // Cache the result
        localStorage.setItem("global_stats", JSON.stringify({
          total_nodes: data.totalDevices || 0,
          active_nodes: data.activeDevices || 0,
          timestamp: Date.now()
        }));
      }
    } catch (error) {
      console.error("Error fetching global stats:", error);
      
      // Use cached data if available
      const cachedData = localStorage.getItem("global_stats");
      if (cachedData) {
        const parsedData = JSON.parse(cachedData);
        setTotalNodes(parsedData.total_nodes);
        setTotalActiveNodes(parsedData.active_nodes);
        
        if (parsedData.total_nodes > 0) {
          const loadPercentage = Math.round((parsedData.active_nodes / parsedData.total_nodes) * 100);
          setNetworkLoad(loadPercentage);
        }
      }
    }
  };

  // Fetch uptime data from all user's devices from the database
  const fetchUserDevicesUptime = async () => {
    if (!userProfile?.id) return;

    try {
      const { data, error } = await client
        .from("devices")
        .select("uptime, id, device_name")
        .eq("owner", userProfile.id);

      if (error) throw error;

      // Create a map of node ID to uptime
      const uptimeMap: Record<string, number> = {};
      data.forEach(device => {
        uptimeMap[device.id] = device.uptime || 0;
      });
      
      // Store the map for individual node tracking
      setNodesUptimeMap(uptimeMap);

      // Calculate total uptime across all user's devices
      const totalUserUptime = data.reduce(
        (sum, device) => sum + (device.uptime || 0),
        0
      );
      setTotalStoredUptime(totalUserUptime);

      // If the current node is in the devices, update its local uptime
      if (nodeId) {
        const currentDevice = data.find((device) => device.id === nodeId);
        if (currentDevice) {
          console.log(
            `Found device uptime for current node ${currentDevice.device_name} (${nodeId}): ${currentDevice.uptime} seconds`
          );
          
          // Only update Redux if the node is not active (to avoid overwriting active session tracking)
          if (!isActive) {
            dispatch(setUptimeFromDatabase(currentDevice.uptime || 0));
          }
        }
      }
    } catch (error) {
      console.error("Error fetching user devices uptime:", error);
    }
  };

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

  // Listen for node changes to update the displayed uptime
  useEffect(() => {
    if (nodeId) {
      // When node ID changes, fetch the latest uptime for all devices
      fetchUserDevicesUptime();
    }
  }, [nodeId]);

  // Update active nodes count when a node's status changes in redux
  useEffect(() => {
    // When node becomes active or inactive, we don't need to fetch global stats
    // because we're updating the count locally
    // We'll still fetch periodically via the polling mechanism
  }, [isActive, nodeId]);

  // Set up polling for global stats and user data
  useEffect(() => {
    // Fetch initial data
    fetchGlobalStats();
    fetchUserDevicesUptime();

    // Poll for global stats every minute
    const globalStatsInterval = setInterval(() => {
      fetchGlobalStats();
    }, 60000); // Every minute

    // Poll for user device data every minute
    const userDataInterval = setInterval(() => {
      fetchUserDevicesUptime();
    }, 60000); // Every minute

    return () => {
      clearInterval(globalStatsInterval);
      clearInterval(userDataInterval);
    };
  }, [userProfile?.id]);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-4 md:mb-10 w-full">
      <StatCard
        title="Total Nodes"
        value={totalNodes}
        unit="nodes"
        changePercentage={5.8}
        info="Total number of registered nodes across the Swarm network"
      />
      <StatCard
        title="Active Nodes"
        value={totalActiveNodes}
        unit="nodes"
        changePercentage={0.8}
        info="Currently active nodes processing tasks on the network"
      />
      <StatCard
        title="Your Plan"
        value={
          subscriptionTier
            ? subscriptionTier?.charAt(0).toUpperCase() +
              subscriptionTier?.slice(1)
            : "Free"
        }
        unit=""
        info="Current utilization of the network's total processing capacity"
      />
      <StatCard
        title="Uptime"
        value={formatUptime(calculatedDisplayUptime)}
        changePercentage={5}
        info={nodeId ? "Current selected node uptime" : "Total accumulated uptime across all your nodes"}
        isUptime={true}
      />
    </div>
  );
};