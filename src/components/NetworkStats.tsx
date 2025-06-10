import React, { useEffect, useState, useMemo } from "react";
import { ArrowUp, Clock } from "lucide-react";
import { InfoTooltip } from "./InfoTooltip";
import { getSwarmSupabase } from "@/lib/supabase-client";
import { useSelector } from "react-redux";
import { RootState, useAppDispatch } from "@/store";
import { formatUptime } from "@/utils/timeUtils";
import { useSession } from "@/hooks/useSession";
import { updateUptime, setUptimeFromDatabase } from "@/store/slices/nodeSlice";

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

  console.log("value", value);

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

  // Get node status from redux store
  const { isActive, currentSessionUptime, totalUptime, nodeId } = useSelector(
    (state: RootState) => state.node
  );

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

        // Refresh active nodes more frequently when a node is active
        // But not on every tick to avoid excessive API calls
        if (Date.now() - lastUpdate > 5000) {
          // Every 5 seconds
          getTotalActiveNodes();
          setLastUpdate(Date.now());
        }
      }, 1000);
    } else {
      // If not active, still fetch the latest uptime from database
      fetchUserDevicesUptime();
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isActive, dispatch, lastUpdate]);

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

  const getTotalNodes = async () => {
    try {
      const { data, error } = await client.from("devices").select("id");
      if (error) throw error;
      setTotalNodes(data?.length || 0);
      console.log("Total nodes updated:", data?.length || 0);
    } catch (error) {
      console.error("Error getting total nodes:", error);
    }
  };

  const getTotalActiveNodes = async () => {
    try {
      const { data, error } = await client
        .from("devices")
        .select("id, status")
        .eq("status", "busy");

      if (error) throw error;

      console.log("Active nodes data:", data);
      setTotalActiveNodes(data?.length || 0);
      console.log("Active nodes updated:", data?.length || 0);

      // Calculate network load based on active nodes / total nodes
      if (totalNodes > 0) {
        const loadPercentage = Math.round(
          ((data?.length || 0) / totalNodes) * 100
        );
        setNetworkLoad(loadPercentage);
      }
    } catch (error) {
      console.error("Error getting total active nodes:", error);
    }
  };

  // Update active nodes count when a node's status changes in redux
  useEffect(() => {
    // When node becomes active or inactive, immediately update the active nodes count
    if (nodeId) {
      getTotalActiveNodes();
    }
  }, [isActive, nodeId]);

  // Fetch initial data
  useEffect(() => {
    getTotalNodes();
    getTotalActiveNodes();
    fetchUserDevicesUptime();

    // Set up polling for active nodes
    const activeNodesInterval = setInterval(() => {
      getTotalActiveNodes();
    }, 10000); // Poll every 10 seconds

    return () => clearInterval(activeNodesInterval);
  }, [userProfile?.id]);

  // Refresh uptime from database periodically
  useEffect(() => {
    const uptimeRefreshInterval = setInterval(() => {
      fetchUserDevicesUptime();
    }, 60000); // Every minute

    return () => clearInterval(uptimeRefreshInterval);
  }, [userProfile?.id]);

  // Set up real-time subscription for both uptime and status updates
  useEffect(() => {
    // Set up subscription for device changes
    const devicesSubscription = client
      .channel("device-updates")
      .on(
        "postgres_changes",
        {
          event: "*", // Listen for all events (INSERT, UPDATE, DELETE)
          schema: "public",
          table: "devices",
        },
        (payload) => {
          console.log("Device update received:", payload);

          // For any device update, refresh both active nodes and uptime
          getTotalActiveNodes();
          getTotalNodes();

          // If it's an uptime update, also refresh uptime data
          if (
            payload.eventType === "UPDATE" &&
            payload.new &&
            payload.old &&
            payload.new.uptime !== payload.old.uptime
          ) {
            fetchUserDevicesUptime();
          }

          // If it's a status update, refresh active nodes
          if (
            payload.eventType === "UPDATE" &&
            payload.new &&
            payload.old &&
            payload.new.status !== payload.old.status
          ) {
            console.log(
              "Status change detected:",
              payload.old.status,
              "->",
              payload.new.status
            );
            getTotalActiveNodes();
          }
        }
      )
      .subscribe((status) => {
        console.log("Subscription status:", status);
      });

    return () => {
      devicesSubscription.unsubscribe();
    };
  }, [client, userProfile?.id]);

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
