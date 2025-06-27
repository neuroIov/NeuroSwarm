import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Activity,
  Clock,
  Users,
  Server,
  RefreshCw,
  Crown,
  Medal,
  TrendingUp,
  Goal,
} from "lucide-react";
import { InfoTooltip } from "./InfoTooltip";
import { Button } from "@/components/ui/button";
import { logger } from "@/utils/logger";
import { safeStorage } from "@/utils/storage";
import { toast } from "sonner";
import { getQueuedTasks } from "@/services/swarmTaskService";
import { AITask } from "@/services/types";
import { FileCode } from "./ui/file-code";
import { useSelector } from "react-redux";
import { RootState, useAppDispatch } from "@/store";
import { fetchPendingTasks } from "@/store/slices/taskSlice";
import { getSwarmSupabase } from "@/lib/supabase-client";
import { formatUptime } from "@/utils/timeUtils";

// Cache keys for localStorage
const TASK_CACHE_KEY = "global_statistics_task_cache";
const LAST_REFRESH_KEY = "global_statistics_last_refresh";

// Interface for leaderboard entry
interface LeaderboardEntry {
  user_id: string;
  username: string;
  total_earnings: number;
  rank: number;
  task_count: number;
}

export const GlobalStatistics = () => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const client = getSwarmSupabase();
  // Get logged in user from Redux store's session state
  const { userProfile } = useSelector((state: RootState) => state.session);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Cache for storing tasks to reduce duplicate requests
  const [taskCache, setTaskCache] = useState<AITask[]>([]);
  const [lastRefreshTime, setLastRefreshTime] = useState<number>(0);
  // Leaderboard state
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [currentUserRank, setCurrentUserRank] =
    useState<LeaderboardEntry | null>(null);
  const [isLeaderboardLoading, setIsLeaderboardLoading] = useState(false);
  const [totalEarnings, setTotalEarnings] = useState(0);

  // Get tasks from Redux store
  const { allTasks } = useSelector((state: RootState) => state.tasks);

  const [stats, setStats] = useState({
    totalTasks: 0,
    avgComputeTime: 0,
    totalUsers: 0,
    activeNodes: 0,
    networkLoad: 0,
  });

  // Fetch network statistics from the edge function
  const fetchNetworkStats = async () => {
    try {
      // Get the session token for authentication
      const { data: { session } } = await client.auth.getSession();
      const token = session?.access_token;
      
      if (!token) {
        console.error("No authentication token available");
        return null;
      }
      
      const response = await fetch('https://zphiymepbkzgczxorqgz.supabase.co/functions/v1/luffy', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.error("Error fetching network stats:", error);
      return null;
    }
  };

  // Calculate average uptime from all devices - keep this separate as it's not included in edge function
  const fetchAverageUptime = async () => {
    try {
      const { data, error } = await client.from("devices").select("uptime");

      if (error) throw error;

      if (!data || data.length === 0) return 0;

      // Calculate average uptime across all devices
      const totalUptime = data.reduce(
        (sum, device) => sum + (device.uptime || 0),
        0
      );
      const averageUptime = totalUptime / data.length;

      return averageUptime;
    } catch (error) {
      console.error("Error fetching average uptime:", error);
      return 0;
    }
  };

  // Fetch leaderboard data
  const fetchLeaderboard = async () => {
    try {
      setIsLeaderboardLoading(true);
      
      // Get the current user ID for targeting in the leaderboard API
      const userId = userProfile?.id || null;
      
      try {
        // Call the RPC function to get top 10 and user rank in one call
        const { data, error } = await client
          .rpc('get_top10_with_user_rank', {
            target_user_id: userId
          });
          
        if (error) {
          console.error('Leaderboard API error:', error);
          throw error;
        }
        
        if (data && data.success) {
          // Map the API response to our existing interface structure
          const topTenLeaderboard = data.top_10_leaderboard.map(entry => ({
            user_id: entry.user_id || `rank-${entry.rank}`, // Use rank as fallback ID
            username: entry.user_name,
            total_earnings: entry.total_earnings,
            rank: entry.rank,
            task_count: entry.total_tasks
          }));
          
          setLeaderboard(topTenLeaderboard);
          setTotalEarnings(data.total_earnings);
          
          // Set current user rank if available
          if (data.target_user && userId) {
            setCurrentUserRank({
              user_id: data.target_user.user_id,
              username: data.target_user.user_name,
              total_earnings: data.target_user.total_earnings,
              rank: data.target_user.rank,
              task_count: data.target_user.total_tasks
            });
          } else {
            setCurrentUserRank(null);
          }
          
          setIsLeaderboardLoading(false);
          return;
        }
      } catch (apiError) {
        console.error("Error calling leaderboard API:", apiError);
        // Fall back to the existing method if the API call fails
      }

      // Fallback to original implementation if RPC call fails
      
      // First get user profiles to have usernames ready
      const { data: userProfiles } = await client
        .from("user_profiles")
        .select("id, user_name, total_earnings, total_tasks_completed");

      // Create a map of user IDs to usernames for quick lookup
      const userMap = new Map();
      if (userProfiles) {
        userProfiles.forEach((profile: any) => {
          userMap.set(profile.id, {
            username: profile.user_name || "Anonymous",
            totalEarnings: parseFloat(profile.total_earnings) || 0,
            totalTasks: profile.total_tasks_completed || 0,
          });
        });
      }

      // Now get earnings aggregated by user_id
      const { data: earnings, error: earningsError } = await client.from(
        "earnings_history"
      ).select(`
          user_id,
          amount,
          task_count
        `);

      if (earningsError) throw earningsError;

      // Aggregate earnings by user
      const userEarnings = new Map<string, { total: number; tasks: number }>();

      if (earnings) {
        earnings.forEach((entry: any) => {
          const userId = entry.user_id;
          const amount = parseFloat(entry.amount);
          const tasks = entry.task_count || 0;

          if (userEarnings.has(userId)) {
            const userData = userEarnings.get(userId)!;
            userData.total += amount;
            userData.tasks += tasks;
          } else {
            userEarnings.set(userId, {
              total: amount,
              tasks: tasks,
            });
          }
        });
      }

      // Convert to array for sorting
      let leaderboardData: LeaderboardEntry[] = [];

      // Combine user profile data with earnings
      userMap.forEach((userData, userId) => {
        // Get earnings data or use zeroes if no earnings yet
        const earningsData = userEarnings.get(userId) || { total: 0, tasks: 0 };

        leaderboardData.push({
          user_id: userId,
          username: userData.username,
          // Add profile earnings to transaction earnings for total
          total_earnings: userData.totalEarnings + earningsData.total,
          task_count: userData.totalTasks + earningsData.tasks,
          rank: 0, // Will be assigned after sorting
        });
      });

      // Sort by earnings (highest first)
      leaderboardData.sort((a, b) => b.total_earnings - a.total_earnings);

      // Assign ranks
      leaderboardData = leaderboardData.map((entry, index) => ({
        ...entry,
        rank: index + 1,
      }));

      // Take only top 10 for the leaderboard display
      const topTen = leaderboardData.slice(0, 10);
      setLeaderboard(topTen);

      // Always set the current user rank if the user exists in the data
      if (userProfile) {
        const currentUserEntry = leaderboardData.find(
          (entry) => entry.user_id === userProfile.id
        );

        if (currentUserEntry) {
          setCurrentUserRank(currentUserEntry);
        } else {
          // User not found in leaderboard data
          setCurrentUserRank(null);
        }
      }

      setIsLeaderboardLoading(false);
    } catch (error) {
      console.error("Error fetching leaderboard data:", error);
      setIsLeaderboardLoading(false);
    }
  };

  // Update stats when refreshing or initial load
  const updateStats = async () => {
    setIsRefreshing(true);
    try {
      // Fetch all network stats with a single API call
      const networkStats = await fetchNetworkStats();
      
      if (!networkStats) {
        throw new Error("Failed to fetch network statistics");
      }
      
      // Calculate network load from the returned counts
      const networkLoad = networkStats.totalDevices > 0 
        ? Math.round((networkStats.activeDevices / networkStats.totalDevices) * 100)
        : 0;
      
      // Calculate average compute time
      let avgTime = 0;
      if (taskCache.length > 0) {
        const totalTime = taskCache.reduce((sum, task) => {
          const computeTime = task.compute_time || 0;
          return sum + computeTime;
        }, 0);
        avgTime = Math.round(totalTime / taskCache.length);
      }

      // Get average uptime (still needs separate call as it's not in edge function)
      const avgUptime = await fetchAverageUptime();
      
      // Update stats with values from edge function and calculated stats
      setStats({
        totalTasks: taskCache.length || 0,
        avgComputeTime: avgTime,
        totalUsers: networkStats.totalUsers || 0,
        activeNodes: networkStats.totalComputeUsage || 0,
        networkLoad,
      });

      // Set last refresh time
      const now = Date.now();
      setLastRefreshTime(now);
      safeStorage.setItem(LAST_REFRESH_KEY, now.toString());
    } catch (error) {
      console.error("Error updating stats:", error);
      toast.error("Failed to update statistics");
    } finally {
      setIsRefreshing(false);
    }
  };

  // Load any cached tasks from localStorage on initial load
  useEffect(() => {
    try {
      const cachedTasks = safeStorage.getItem(TASK_CACHE_KEY);
      if (cachedTasks) {
        const parsedTasks = JSON.parse(cachedTasks) as AITask[];
        if (parsedTasks.length > 0) {
          setTaskCache(parsedTasks);
        }
      }

      // Load the last refresh time from localStorage here inside useEffect
      const savedLastRefreshTime = safeStorage.getItem(LAST_REFRESH_KEY);
      if (savedLastRefreshTime) {
        setLastRefreshTime(Number(savedLastRefreshTime));
      }
    } catch (error) {
      console.error("Error loading task cache:", error);
    }
  }, []);

  // Cache tasks whenever they change
  useEffect(() => {
    if (allTasks.length > 0) {
      try {
        safeStorage.setItem(TASK_CACHE_KEY, JSON.stringify(allTasks));
      } catch (error) {
        console.error("Error saving task cache:", error);
      }
    }
  }, [allTasks]);

  // Load initial tasks on component mount
  useEffect(() => {
    const initialLoad = async () => {
      try {
        // If we have cached tasks, use them first
        if (taskCache.length > 0) {
          await updateStats();
          // Then refresh in the background without showing toast
          await fetchLeaderboard();
        } else {
          // No cached tasks, do a normal load
          await updateStats();
          await fetchLeaderboard();
        }
      } catch (error) {
        console.error("Error during initial data load:", error);
        toast.error(t("globalStatistics.toasts.initialLoadFailed"));
      }
    };
    
    // Execute the initial load
    initialLoad();
  // Remove all dependencies to ensure this only runs once on mount
  }, []);

  const handleRefresh = useCallback(async () => {
    try {
      setIsRefreshing(true);
      
      // Fetch all data in parallel
      await Promise.all([
        updateStats(),
        fetchLeaderboard()
      ]);
      
      setIsRefreshing(false);
      toast.success(t("globalStatistics.toasts.refreshSuccess"));
    } catch (error) {
      console.error("Error refreshing data:", error);
      setIsRefreshing(false);
      toast.error(t("globalStatistics.toasts.refreshFailed"));
    }
  }, [t]);

  // Format currency for display
  const formatCurrency = (amount: number) => {
    // Format as SP tokens instead of dollars with comma separation
    return `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SP`;
  };

  // Clean username by removing wallet type information
  const cleanUsername = (username: string) => {
    if (!username) return "Anonymous";
    // Remove wallet type information like [wallet_type:phantom]
    return username.replace(/\[wallet_type:[^\]]+\]/g, "").trim();
  };

  // Get medal icon based on rank
  const getMedalIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <span className="text-yellow-500">👑</span>;
      case 2:
        return <span className="text-gray-400">🥈</span>;
      case 3:
        return <span className="text-amber-700">🥉</span>;
      default:
        return (
          <span className="w-4 h-4 flex items-center justify-center text-xs font-medium">
            {rank}
          </span>
        );
    }
  };

  return (
    <div className="stat-card overflow-x-hidden">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0 mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-base sm:text-xl font-semibold">
            {t("globalStatistics.title")}
          </h2>
          <InfoTooltip content={t("globalStatistics.tooltip")} />
        </div>
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 w-full sm:w-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="gradient-button border-0 h-8 rounded-full ml-auto sm:ml-0"
          >
            <RefreshCw
              className={`w-4 h-4 mr-1 ${isRefreshing ? "animate-spin" : ""}`}
            />
            {t("globalStatistics.refresh")}
          </Button>
        </div>
      </div>

      {/* Global Map Visualization */}
      <div className="global-map w-full h-[250px] sm:h-[330px] mb-6 border border-blue-900/30 relative">
        <div className="absolute inset-0 bg-grid opacity-[0.15] z-0"></div>
        <img
          src="/images/map.png"
          alt={t("globalStatistics.map.alt")}
          className="absolute inset-0 w-full h-full object-contain z-10"
          onError={(e) => {
            e.currentTarget.src =
              "https://raw.githubusercontent.com/Neurolov/NeuroSwarm/main/public/images/map.png";
          }}
        />
        <div className="absolute inset-0 z-30 pointer-events-none cursor-pointer"></div>
        {/* Hardcoded Node Indicators (yellow dots) - Responsive positions */}
        <div
          className="node-indicator absolute z-20"
          style={{ top: "20%", left: "30%" }}
        />
        <div
          className="node-indicator absolute z-20"
          style={{ top: "30%", left: "58%" }}
        />
        <div
          className="node-indicator absolute z-20"
          style={{ top: "40%", left: "63%" }}
        />
        <div
          className="node-indicator absolute z-20"
          style={{ top: "53%", left: "59%" }}
        />
        <div
          className="node-indicator absolute z-20"
          style={{ top: "65%", left: "50%" }}
        />
        <div
          className="node-indicator absolute z-20"
          style={{ top: "70%", left: "40%" }}
        />
        <div
          className="node-indicator absolute z-20"
          style={{ top: "20%", left: "65%" }}
        />

        <div
          className="node-indicator absolute z-20"
          style={{ top: "30%", left: "35%" }}
        />
        <div
          className="node-indicator absolute z-20"
          style={{ top: "10%", left: "42%" }}
        />
        <div
          className="node-indicator absolute z-20"
          style={{ top: "61%", left: "40%" }}
        />
        <div
          className="node-indicator absolute z-20"
          style={{ top: "50%", left: "48%" }}
        />

        {/* -------------- l--25 to 74% and t --5 to 90  */}
        <div
          className="node-indicator absolute z-20"
          style={{ top: "12%", left: "35%" }}
        />
        <div
          className="node-indicator absolute z-20"
          style={{ top: "15%", left: "45%" }}
        />
        <div
          className="node-indicator absolute z-20"
          style={{ top: "40%", left: "59%" }}
        />
        <div
          className="node-indicator absolute z-20"
          style={{ top: "44%", left: "66%" }}
        />
        <div
          className="node-indicator absolute z-20"
          style={{ top: "57%", left: "52%" }}
        />
        <div
          className="node-indicator absolute z-20"
          style={{ top: "39%", left: "33%" }}
        />
        <div
          className="node-indicator absolute z-20"
          style={{ top: "79%", left: "39%" }}
        />
        <div
          className="node-indicator absolute z-20"
          style={{ top: "80%", left: "69%" }}
        />
        <div
          className="node-indicator absolute z-20"
          style={{ top: "28%", left: "52%" }}
        />
        <div
          className="node-indicator absolute z-20"
          style={{ top: "17%", left: "60%" }}
        />
      </div>

      {/* Stats Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="flex flex-col p-4 earning-cards rounded-lg">
          <div className="flex gap-3 items-center">
            <div className="icon-bg icon-container flex items-center justify-center rounded-md p-1 sm:p-2">
              <Goal className="w-6 h-6 sm:w-7 sm:h-7 relative z-10" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm text-[#515194]">Your rank</span>
                              <span className="text-xl font-bold text-white">
                {currentUserRank ? (
                  <>
                    {currentUserRank.rank.toLocaleString()}
                    {currentUserRank.rank <= 3 && (
                      <span className="ml-1">
                        {currentUserRank.rank === 1 && "👑"}
                        {currentUserRank.rank === 2 && "🥈"}
                        {currentUserRank.rank === 3 && "🥉"}
                      </span>
                    )}
                  </>
                ) : userProfile ? (
                  "N/A"
                ) : (
                  "-"
                )}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col p-4 earning-cards rounded-lg">
          <div className="flex gap-3 items-center">
            <div className="icon-bg icon-container flex items-center justify-center rounded-md p-1 sm:p-2">
                              <img
                src="/images/computing.png"
                alt="Global SPs"
                className="w-6 h-6 sm:w-7 sm:h-7 relative z-10"
                onError={(e) => {
                  e.currentTarget.src =
                    "https://raw.githubusercontent.com/Neurolov/NeuroSwarm/main/public/images/computing.png";
                }}
              />
            </div>
            <div className="flex flex-col">
              <span className="text-sm text-[#515194]">
                Global SP
              </span>
              <span className="text-xl font-bold text-white">
                {formatCurrency(totalEarnings)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col p-4 earning-cards rounded-lg">
          <div className="flex gap-3 items-center">
            <div className="icon-bg icon-container flex items-center justify-center rounded-md p-1 sm:p-2">
              <img
                src="/images/total_users.png"
                alt="Users"
                className="w-6 h-6 sm:w-7 sm:h-7 relative z-10"
                onError={(e) => {
                  e.currentTarget.src =
                    "https://raw.githubusercontent.com/Neurolov/NeuroSwarm/main/public/images/total_users.png";
                }}
              />
            </div>
            <div className="flex flex-col">
              <span className="text-sm text-[#515194]">
                {t("globalStatistics.cards.totalUsers")}
              </span>
              <span className="text-xl font-bold text-white">
                {stats.totalUsers.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col p-4 earning-cards rounded-lg">
          <div className="flex gap-3 items-center">
            <div className="icon-bg icon-container flex items-center justify-center rounded-md p-1 sm:p-2">
                              <img
                src="/images/active_nodes.png"
                alt="Global Compute Generated"
                className="w-6 h-6 sm:w-7 sm:h-7 relative z-10"
                onError={(e) => {
                  e.currentTarget.src =
                    "https://raw.githubusercontent.com/Neurolov/NeuroSwarm/main/public/images/active_nodes.png";
                }}
              />
            </div>
            <div className="flex flex-col">
              <span className="text-sm text-[#515194]">
                Global Compute Generated
              </span>
              <span className="text-xl font-bold text-white">
                {stats.activeNodes.toLocaleString(undefined, { maximumFractionDigits: 2 })} TFLOPs
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Leaderboard - Replacing task list */}
      <div className="mb-6 w-full">
        <h3 className="text-base sm:text-lg font-medium mb-4 flex items-center">
          <TrendingUp className="w-5 h-5 mr-2 text-blue-400" />
          {t("globalStatistics.leaderboard.title", "Leaderboard")}
        </h3>

        {isLeaderboardLoading ? (
          <div className="flex flex-col items-center justify-center py-8 text-slate-400">
            <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mb-2"></div>
            <p>
              {t(
                "globalStatistics.leaderboard.loading",
                "Loading leaderboard..."
              )}
            </p>
          </div>
        ) : leaderboard.length > 0 ? (
          <div className="space-y-0 max-h-[300px] overflow-y-auto overflow-x-hidden pr-2 custom-scrollbar bg-slate-900/60 rounded-lg border border-slate-800/50">
            {/* Header row */}
            <div className="grid grid-cols-12 gap-2 px-4 py-3 text-slate-400 text-sm border-b border-slate-800/50">
              <div className="col-span-1">
                {t("globalStatistics.leaderboard.rank", "Rank")}
              </div>
              <div className="col-span-5">
                {t("globalStatistics.leaderboard.user", "User")}
              </div>
              <div className="col-span-3 text-right">
                {t("globalStatistics.leaderboard.earnings", "Earnings")}
              </div>
              <div className="col-span-3 text-right">
                {t("globalStatistics.leaderboard.tasks", "Tasks")}
              </div>
            </div>

            {/* Top 10 Users */}
            {leaderboard.map((entry) => (
              <div
                key={entry.user_id}
                className={`grid grid-cols-12 gap-2 py-3 px-4 
                  ${
                    userProfile && entry.user_id === userProfile.id
                      ? "bg-blue-900/30 border-l-2 border-blue-500"
                      : "hover:bg-slate-800/40"
                  }`}
              >
                <div className="col-span-1 flex items-center">
                  {getMedalIcon(entry.rank)}
                </div>
                <div className="col-span-5 font-medium truncate">
                  {cleanUsername(entry.username)}
                  {userProfile && entry.user_id === userProfile.id && (
                    <span className="ml-2 text-xs bg-blue-900/40 text-blue-300 px-2 py-0.5 rounded-full">
                      {t("globalStatistics.leaderboard.you", "You")}
                    </span>
                  )}
                </div>
                <div className="col-span-3 text-right font-medium">
                  {formatCurrency(entry.total_earnings)}
                </div>
                <div className="col-span-3 text-right text-slate-300">
                  {entry.task_count.toLocaleString()}
                </div>
              </div>
            ))}

            {/* Current user outside top 10 */}
            {currentUserRank &&
              userProfile &&
              !leaderboard.some(
                (entry) => entry.user_id === userProfile.id
              ) && (
                <>
                  <div className="flex justify-center py-2 border-t border-slate-800/50">
                    <div className="text-slate-500 text-sm">. . .</div>
                  </div>
                  <div className="grid grid-cols-12 gap-2 py-3 px-4 bg-blue-900/30 border-l-2 border-blue-500">
                    <div className="col-span-1 flex items-center">
                      <span className="w-4 h-4 flex items-center justify-center text-xs font-medium">
                        {currentUserRank.rank}
                      </span>
                    </div>
                    <div className="col-span-5 font-medium truncate">
                      {cleanUsername(currentUserRank.username)}
                      <span className="ml-2 text-xs bg-blue-900/40 text-blue-300 px-2 py-0.5 rounded-full">
                        {t("globalStatistics.leaderboard.you", "You")}
                      </span>
                    </div>
                    <div className="col-span-3 text-right font-medium">
                      {formatCurrency(currentUserRank.total_earnings)}
                    </div>
                    <div className="col-span-3 text-right text-slate-300">
                      {currentUserRank.task_count.toLocaleString()}
                    </div>
                  </div>
                </>
              )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-slate-400">
            <TrendingUp className="w-10 h-10 mb-2 text-slate-600" />
            <p>
              {t(
                "globalStatistics.leaderboard.noData",
                "No leaderboard data available yet"
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
