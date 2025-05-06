import React, { useEffect, useState } from "react";
import { ArrowUp, Clock } from "lucide-react";
import { InfoTooltip } from "./InfoTooltip";
import { getSwarmSupabase } from "@/lib/supabase-client";
import { useSelector } from "react-redux";
import { RootState } from "@/store";
import { formatUptime } from "@/utils/timeUtils";
import { useSession } from "@/hooks/useSession";

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
  return (
    <div className="stat-card">
      <div className="flex justify-between items-start mb-2">
        <div className="text-slate-400 flex items-center gap-1">
          {title}
          {info && <InfoTooltip content={info} />}
        </div>
      </div>
      <div className="flex flex-col">
        <div className="text-2xl font-bold flex items-baseline gap-1">
          {isUptime ? (
            <div className="flex items-center">
              <Clock className="w-4 h-4 mr-2" />
              {value}
            </div>
          ) : (
            value
          )}
          {unit && <span className="text-sm text-slate-400">{unit}</span>}
        </div>
        {changePercentage !== undefined && (
          <div className="flex items-center text-sm text-green-400 mt-1">
            <ArrowUp className="w-3 h-3 mr-1" />
            {changePercentage}%
          </div>
        )}
      </div>
    </div>
  );
};

export const NetworkStats = () => {
  const client = getSwarmSupabase();
  const { userProfile } = useSession();
  const [totalNodes, setTotalNodes] = useState(0);
  const [totalActiveNodes, setTotalActiveNodes] = useState(0);
  const [networkLoad, setNetworkLoad] = useState(0);
  const [storedUptime, setStoredUptime] = useState(0);

  // Get uptime from redux store for current session
  const { isActive, currentSessionUptime, totalUptime, nodeId } = useSelector(
    (state: RootState) => state.node
  );

  // Fetch uptime data from all user's devices from the database
  const fetchUserDevicesUptime = async () => {
    if (!userProfile?.id) return;

    try {
      const { data, error } = await client
        .from("devices")
        .select("uptime")
        .eq("owner", userProfile.id);

      if (error) throw error;

      // Calculate total uptime across all user's devices
      const totalUserUptime = data.reduce(
        (sum, device) => sum + (device.uptime || 0),
        0
      );
      setStoredUptime(totalUserUptime);
    } catch (error) {
      console.error("Error fetching user devices uptime:", error);
    }
  };

  // Calculate total uptime including current session if active
  const calculatedTotalUptime =
    storedUptime + (isActive ? currentSessionUptime : 0);

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
        .select("id")
        .eq("status", "busy");

      if (error) throw error;
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

  // Fetch initial data
  useEffect(() => {
    getTotalNodes();
    getTotalActiveNodes();
    fetchUserDevicesUptime();
  }, [userProfile?.id]);

  // Refresh uptime from database periodically
  useEffect(() => {
    const uptimeRefreshInterval = setInterval(() => {
      fetchUserDevicesUptime();
    }, 60000); // Every minute

    return () => clearInterval(uptimeRefreshInterval);
  }, [userProfile?.id]);

  // Listen for realtime updates
  useEffect(() => {
    const devicesSubscription = client
      .channel("devices-status-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "devices",
        },
        (payload) => {
          console.log("Realtime update received:", payload);

          if (payload.eventType === "UPDATE") {
            console.log("Full update payload:", payload);

            // If uptime was updated, refresh the uptime data
            if (payload.new.uptime !== payload.old.uptime) {
              fetchUserDevicesUptime();
            }

            getTotalActiveNodes();
          } else if (
            payload.eventType === "INSERT" ||
            payload.eventType === "DELETE"
          ) {
            getTotalNodes();
            getTotalActiveNodes();
            fetchUserDevicesUptime();
          }
        }
      )
      .subscribe((status) => {
        console.log("Subscription status:", status);
      });

    return () => {
      console.log("Cleaning up subscriptions");
      devicesSubscription.unsubscribe();
    };
  }, [client, totalNodes]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <StatCard
        title="Total Nodes"
        value={totalNodes}
        unit="nodes"
        changePercentage={5.0}
        info="Total number of registered nodes across the Swarm network"
      />
      <StatCard
        title="Active Nodes"
        value={totalActiveNodes}
        unit="nodes"
        changePercentage={3.0}
        info="Currently active nodes processing tasks on the network"
      />
      <StatCard
        title="Network Load"
        value={networkLoad}
        unit="%"
        changePercentage={2.0}
        info="Current utilization of the network's total processing capacity"
      />
      <StatCard
        title="Uptime"
        value={formatUptime(calculatedTotalUptime)}
        changePercentage={5.0}
        info="Total accumulated uptime across all your nodes"
        isUptime={true}
      />
    </div>
  );
};
