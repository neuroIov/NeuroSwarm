import React, { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";
import { InfoTooltip } from "./InfoTooltip";
import { getSwarmSupabase } from "@/lib/supabase-client";

type StatCardProps = {
  title: string;
  value: string | number;
  unit?: string;
  changePercentage?: number;
  info?: string;
};

const StatCard = ({
  title,
  value,
  unit,
  changePercentage,
  info,
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
          {value}
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
  const [totalNodes, setTotalNodes] = useState(0);
  const [totalActiveNodes, setTotalActiveNodes] = useState(0);

  const getTotalNodes = async () => {
    try {
      const { data, error } = await client.from("devices").select("*");
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
        .select("*")
        .eq("status", "busy");

      if (error) throw error;
      setTotalActiveNodes(data?.length || 0);
      console.log("Active nodes updated:", data?.length || 0);
    } catch (error) {
      console.error("Error getting total active nodes:", error);
    }
  };

  useEffect(() => {
    getTotalNodes();
    getTotalActiveNodes();

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
            const newStatus = payload.new.status;
            const oldStatus = payload.old.status;

            getTotalActiveNodes();
          } else if (
            payload.eventType === "INSERT" ||
            payload.eventType === "DELETE"
          ) {
            getTotalNodes();
            getTotalActiveNodes();
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
  }, [client]);

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
        value={60}
        unit="%"
        changePercentage={2.0}
        info="Current utilization of the network's total processing capacity"
      />
      <StatCard
        title="Uptime"
        value="9h 56m"
        changePercentage={5.0}
        info="How long your nodes have been running in this session"
      />
    </div>
  );
};
