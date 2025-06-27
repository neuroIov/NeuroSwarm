import React, { useEffect, useState } from "react";
import { ArrowUp, Clock } from "lucide-react";
import { InfoTooltip } from "./InfoTooltip";
import { getSwarmSupabase } from "@/lib/supabase-client";
import { useSelector } from "react-redux";
import { RootState, useAppDispatch } from "@/store";
import { useSession } from "@/hooks/useSession";
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
  const [previousNodeState, setPreviousNodeState] = useState<boolean | null>(null);
  const [userComputeUsage, setUserComputeUsage] = useState(0);
  const [totalComputeUsage, setTotalComputeUsage] = useState(0);
  const [totalTasks, setTotalTasks] = useState(0);

  // Get node status from redux store
  const { isActive, nodeId } = useSelector(
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
      // Include user_id as a parameter if the user is logged in
      const params = userProfile?.id ? { user_id: userProfile.id } : {};
      
      const response = await axios.get("https://zphiymepbkzgczxorqgz.supabase.co/functions/v1/luffy", {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SUPABASE_ANON_KEY}`
        },
        params: params
      });

      const data = response.data;
    
      console.log("Global stats:", data);
    
      if (data) {
        setTotalNodes(data?.totalUsers || 0);
        setTotalActiveNodes(data?.activeDevices || 0);
        setTotalTasks(data?.completedTasks || 0);
        // Set user compute usage if available
        if (data.userComputeUsage !== null) {
          setUserComputeUsage(data.userComputeUsage);
        }
        // Set total compute usage if available
        if (data.totalComputeUsage !== null) {
          setTotalComputeUsage(data.totalComputeUsage);
        }
        
        // Calculate network load
        if (data.totalUsers > 0) {
          const loadPercentage = Math.round(((data.activeDevices || 0) / data.totalUsers) * 100);
          setNetworkLoad(loadPercentage);
        }
        
        console.log("Global stats updated from API:", data);
        
        // Cache the result
        localStorage.setItem("global_stats", JSON.stringify({
          total_nodes: data.totalUsers || 0,
          active_nodes: data.activeDevices || 0,
          total_tasks: data.completedTasks || 0,
          user_compute_usage: data.userComputeUsage || 0,
          total_compute_usage: data.totalComputeUsage || 0,
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
        setTotalTasks(parsedData.total_tasks);
        setUserComputeUsage(parsedData.user_compute_usage || 0);
        setTotalComputeUsage(parsedData.total_compute_usage || 0);
        if (parsedData.total_nodes > 0) {
          const loadPercentage = Math.round((parsedData.active_nodes / parsedData.total_nodes) * 100);
          setNetworkLoad(loadPercentage);
        }
      }
    }
  };

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

    // Poll for global stats every minute
    const globalStatsInterval = setInterval(() => {
      fetchGlobalStats();
    }, 60000); // Every minute

    return () => {
      clearInterval(globalStatsInterval);
    };
  }, [userProfile?.id]);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-4 md:mb-10 w-full">
                    <StatCard
        title="Active Nodes"
        value={totalNodes.toLocaleString()}
        unit="users"
        changePercentage={5.8}
        info="Total number of registered users across the Swarm network"
      />
              <StatCard
        title="Compute Usage"
        value={(totalComputeUsage || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
        unit="TFLOPs"
        changePercentage={2.3}
        info="Total compute usage across the network"
      />
      <StatCard
        title="Total AI Content Generated"
        value={totalTasks.toLocaleString()}
        unit="tasks"
        changePercentage={7.2}
        info="Total number of tasks processed by the network"
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
    </div>
  );
};