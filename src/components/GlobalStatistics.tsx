import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
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

  // Get tasks from Redux store
  const { allTasks } = useSelector((state: RootState) => state.tasks);

  const [stats, setStats] = useState({
    totalTasks: 0,
    avgComputeTime: 0,
    totalUsers: 0,
    activeNodes: 0,
    networkLoad: 0,
  });

  // Fetch total users from the database
  const fetchTotalUsers = async () => {
    try {
      // Get count of total user profiles
      const { count, error } = await client
        .from("user_profiles")
        .select("*", { count: "exact", head: true });

      if (error) throw error;

      return count || 0;
    } catch (error) {
      console.error("Error fetching total users:", error);
      return 0;
    }
  };

  // Fetch active nodes from the devices table
  const fetchActiveNodes = async () => {
    try {
      // Get count of devices where status is "busy"
      const { count, error } = await client
        .from("devices")
        .select("*", { count: "exact", head: true })
        .eq("status", "busy");

      if (error) throw error;

      return count || 0;
    } catch (error) {
      console.error("Error fetching active nodes:", error);
      return 0;
    }
  };

  // Calculate network load based on active nodes / total nodes
  const calculateNetworkLoad = async (activeNodesCount: number) => {
    try {
      const { data, error } = await client.from("devices").select("id");

      if (error) throw error;

      const totalNodes = data?.length || 0;

      if (totalNodes > 0) {
        return Math.round((activeNodesCount / totalNodes) * 100);
      }
      return 0;
    } catch (error) {
      console.error("Error calculating network load:", error);
      return 0;
    }
  };

  // Fetch average uptime from all devices
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

  // Fetch leaderboard data
  const fetchLeaderboard = async () => {
    try {
      setIsLeaderboardLoading(true);

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

  // Fetch database statistics
  const fetchDatabaseStats = useCallback(async () => {
    try {
      const [totalUsersCount, activeNodesCount, averageUptimeSeconds] =
        await Promise.all([
          fetchTotalUsers(),
          fetchActiveNodes(),
          fetchAverageUptime(),
        ]);

      const networkLoadPercentage = await calculateNetworkLoad(
        activeNodesCount
      );

      return {
        totalUsers: totalUsersCount,
        activeNodes: activeNodesCount,
        avgComputeTime: averageUptimeSeconds,
        networkLoad: networkLoadPercentage,
      };
    } catch (error) {
      console.error("Error fetching database statistics:", error);
      return null;
    }
  }, []);

  // Helper function to calculate and update stats
  const calculateAndUpdateStats = useCallback(
    async (tasks: AITask[]) => {
      // Get database statistics
      const dbStats = await fetchDatabaseStats();

      const computeTimes = tasks
        .map((t) => t.compute_time || 0)
        .filter((t) => t > 0);

      const avgTime =
        dbStats?.avgComputeTime ||
        (computeTimes.length > 0
          ? computeTimes.reduce((sum, time) => sum + time, 0) /
            computeTimes.length
          : 0);

      setStats({
        totalTasks: tasks.length,
        avgComputeTime: avgTime,
        totalUsers: dbStats?.totalUsers || 0,
        activeNodes: dbStats?.activeNodes || 0,
        networkLoad: dbStats?.networkLoad || 0,
      });
    },
    [fetchDatabaseStats]
  );

  // Function to load tasks
  const loadTasks = useCallback(
    async (showToast = true) => {
      try {
        if (isRefreshing) {
          return;
        }

        setIsRefreshing(true);

        // Check for available unassigned tasks
        let availableTaskCount = 0;
        try {
          const availableTasks = await getQueuedTasks(10);
          availableTaskCount = availableTasks.length;
        } catch (error) {
          console.error("Error checking available tasks:", error);
        }

        // Fetch tasks
        const tasks = await dispatch(fetchPendingTasks()).unwrap();
        console.log(`Fetched ${tasks.length} tasks total`);

        // Update last refresh time
        const now = Date.now();
        setLastRefreshTime(now);
        safeStorage.setItem(LAST_REFRESH_KEY, now.toString());

        // Calculate stats from the fetched tasks
        if (tasks.length > 0) {
          await calculateAndUpdateStats(tasks);
        }

        // Fetch leaderboard data
        await fetchLeaderboard();

        setIsRefreshing(false);
        if (showToast) {
          toast.success(t("globalStatistics.toasts.refreshSuccess"));
        }
      } catch (error) {
        console.error("Error loading tasks:", error);
        setIsRefreshing(false);
        if (showToast) {
          toast.error(t("globalStatistics.toasts.refreshFailed"));
        }
      }
    },
    [dispatch, calculateAndUpdateStats, isRefreshing, fetchLeaderboard, t]
  );

  // Load initial tasks on component mount
  useEffect(() => {
    const initialLoad = async () => {
      try {
        // Load initial statistics from database
        const dbStats = await fetchDatabaseStats();
        if (dbStats) {
          setStats((prev) => ({
            ...prev,
            totalUsers: dbStats.totalUsers,
            activeNodes: dbStats.activeNodes,
            avgComputeTime: dbStats.avgComputeTime,
            networkLoad: dbStats.networkLoad,
          }));
        }

        // If we have cached tasks, use them first
        if (taskCache.length > 0) {
          calculateAndUpdateStats(taskCache);
          // Then refresh in the background without showing toast
          loadTasks(false);
        } else {
          // No cached tasks, do a normal load
          loadTasks(true);
        }

        // Also load the leaderboard on initial mount
        await fetchLeaderboard();
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
      const [dbStats, tasksResult, leaderboardResult] = await Promise.all([
        fetchDatabaseStats(),
        dispatch(fetchPendingTasks()).unwrap(),
        fetchLeaderboard(),
      ]);

      // Update stats from database
      if (dbStats) {
        setStats((prev) => ({
          ...prev,
          totalUsers: dbStats.totalUsers,
          activeNodes: dbStats.activeNodes,
          avgComputeTime: dbStats.avgComputeTime,
          networkLoad: dbStats.networkLoad,
          totalTasks: tasksResult.length || prev.totalTasks,
        }));
      }

      // Update last refresh time
      const now = Date.now();
      setLastRefreshTime(now);
      safeStorage.setItem(LAST_REFRESH_KEY, now.toString());

      setIsRefreshing(false);
      toast.success(t("globalStatistics.toasts.refreshSuccess"));
    } catch (error) {
      console.error("Error refreshing data:", error);
      setIsRefreshing(false);
      toast.error(t("globalStatistics.toasts.refreshFailed"));
    }
  }, [dispatch, fetchDatabaseStats]);

  // Format currency for display
  const formatCurrency = (amount: number) => {
    // Format as SP tokens instead of dollars
    return `${amount.toFixed(2)} SP`;
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

  const scrollRef = useRef(null);

  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    // Container width fixed 1170px
    const containerWidth = 1170;

    // Viewport width (scroll container width)
    const viewportWidth = scrollEl.clientWidth;

    // Calculate scrollLeft to center the container horizontally in viewport
    const scrollLeft = (containerWidth - viewportWidth) / 1.6;

    if (scrollLeft > 0) {
      scrollEl.scrollLeft = scrollLeft;
    }
  }, []);

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
      <div
        ref={scrollRef}
        className="overflow-auto rounded-md"
        style={{ scrollBehavior: "smooth" }}
      >
        <div className="global-map w-[1170px] h-[330px] mb-6 border border-blue-900/30 relative  ">
          <div className="absolute inset-0 bg-grid opacity-[0.15] z-0"></div>
          <img
            src="/images/map.png"
            alt={t("globalStatistics.map.alt")}
            className="absolute top-0 left-0 w-full h-[330px] object-contain z-10"
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
                    {currentUserRank.rank}
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
                alt="Processing Time"
                className="w-6 h-6 sm:w-7 sm:h-7 relative z-10"
                onError={(e) => {
                  e.currentTarget.src =
                    "https://raw.githubusercontent.com/Neurolov/NeuroSwarm/main/public/images/computing.png";
                }}
              />
            </div>
            <div className="flex flex-col">
              <span className="text-sm text-[#515194]">
                {t("globalStatistics.cards.processingTime")}
              </span>
              <span className="text-xl font-bold text-white">
                {(() => {
                  const seconds = stats.avgComputeTime || 0;
                  if (seconds < 1) {
                    return `${(seconds * 1000).toFixed(0)}ms`;
                  }
                  if (seconds < 60) {
                    return `${seconds.toFixed(1)}s`;
                  }
                  if (seconds < 3600) {
                    const minutes = Math.floor(seconds / 60);
                    return `${minutes}m`;
                  }
                  const hours = Math.floor(seconds / 3600);
                  return `${hours}h`;
                })()}
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
                {stats.totalUsers}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col p-4 earning-cards rounded-lg">
          <div className="flex gap-3 items-center">
            <div className="icon-bg icon-container flex items-center justify-center rounded-md p-1 sm:p-2">
              <img
                src="/images/active_nodes.png"
                alt="Active Nodes"
                className="w-6 h-6 sm:w-7 sm:h-7 relative z-10"
                onError={(e) => {
                  e.currentTarget.src =
                    "https://raw.githubusercontent.com/Neurolov/NeuroSwarm/main/public/images/active_nodes.png";
                }}
              />
            </div>
            <div className="flex flex-col">
              <span className="text-sm text-[#515194]">
                {t("globalStatistics.cards.activeNodes")}
              </span>
              <span className="text-xl font-bold text-white">
                {stats.activeNodes}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Leaderboard - Mobile Compatible */}
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
          <div className="bg-slate-900/60 rounded-lg border border-slate-800/50 overflow-hidden">
            {/* Scrollable container */}
            <div className="max-h-[400px] overflow-y-auto overflow-x-auto custom-scrollbar">
              <div className="min-w-[500px]">
                {" "}
                {/* Minimum width for proper column layout */}
                {/* Header row - Sticky */}
                <div className="sticky top-0 bg-slate-800/80 backdrop-blur-sm border-b border-slate-700/50 z-10">
                  <div className="grid grid-cols-12 gap-2 px-3 sm:px-4 py-3 text-slate-300 text-xs sm:text-sm font-medium">
                    <div className="col-span-1 flex items-center justify-center">
                      {t("globalStatistics.leaderboard.rank", "Rank")}
                    </div>
                    <div className="col-span-5 sm:col-span-6">
                      {t("globalStatistics.leaderboard.user", "User")}
                    </div>
                    <div className="col-span-3 text-right">
                      {t("globalStatistics.leaderboard.earnings", "Earnings")}
                    </div>
                    <div className="col-span-3 sm:col-span-2 text-right">
                      {t("globalStatistics.leaderboard.tasks", "Tasks")}
                    </div>
                  </div>
                </div>
                {/* Leaderboard entries */}
                <div className="divide-y divide-slate-800/30">
                  {/* Top 10 Users */}
                  {leaderboard.map((entry, index) => (
                    <div
                      key={entry.user_id}
                      className={`grid grid-cols-12 gap-2 py-3 px-3 sm:px-4 transition-colors duration-200
                  ${
                    userProfile && entry.user_id === userProfile.id
                      ? "bg-blue-900/30 border-l-2 border-blue-500"
                      : "hover:bg-slate-800/40"
                  }`}
                    >
                      {/* Rank column */}
                      <div className="col-span-1 flex items-center justify-center">
                        <div className="flex items-center justify-center w-6 h-6">
                          {getMedalIcon(entry.rank)}
                        </div>
                      </div>

                      {/* User column */}
                      <div className="col-span-5 sm:col-span-6 flex items-center min-w-0">
                        <div className="truncate">
                          <span className="font-medium text-sm sm:text-base">
                            {cleanUsername(entry.username)}
                          </span>
                          {userProfile && entry.user_id === userProfile.id && (
                            <span className="ml-2 text-xs bg-blue-900/40 text-blue-300 px-2 py-0.5 rounded-full whitespace-nowrap">
                              {t("globalStatistics.leaderboard.you", "You")}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Earnings column */}
                      <div className="col-span-3 flex items-center justify-end">
                        <span className="font-medium text-sm sm:text-base text-green-400">
                          {formatCurrency(entry.total_earnings)}
                        </span>
                      </div>

                      {/* Tasks column */}
                      <div className="col-span-3 sm:col-span-2 flex items-center justify-end">
                        <span className="text-slate-300 text-sm sm:text-base">
                          {entry.task_count}
                        </span>
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
                        {/* Separator */}
                        <div className="flex justify-center py-3 bg-slate-900/40">
                          <div className="text-slate-500 text-sm font-medium">
                            • • •
                          </div>
                        </div>

                        {/* Current user row */}
                        <div className="grid grid-cols-12 gap-2 py-3 px-3 sm:px-4 bg-blue-900/30 border-l-2 border-blue-500">
                          {/* Rank column */}
                          <div className="col-span-1 flex items-center justify-center">
                            <div className="flex items-center justify-center w-6 h-6">
                              <span className="text-xs sm:text-sm font-medium">
                                {currentUserRank.rank}
                              </span>
                            </div>
                          </div>

                          {/* User column */}
                          <div className="col-span-5 sm:col-span-6 flex items-center min-w-0">
                            <div className="truncate">
                              <span className="font-medium text-sm sm:text-base">
                                {cleanUsername(currentUserRank.username)}
                              </span>
                              <span className="ml-2 text-xs bg-blue-900/40 text-blue-300 px-2 py-0.5 rounded-full whitespace-nowrap">
                                {t("globalStatistics.leaderboard.you", "You")}
                              </span>
                            </div>
                          </div>

                          {/* Earnings column */}
                          <div className="col-span-3 flex items-center justify-end">
                            <span className="font-medium text-sm sm:text-base text-green-400">
                              {formatCurrency(currentUserRank.total_earnings)}
                            </span>
                          </div>

                          {/* Tasks column */}
                          <div className="col-span-3 sm:col-span-2 flex items-center justify-end">
                            <span className="text-slate-300 text-sm sm:text-base">
                              {currentUserRank.task_count}
                            </span>
                          </div>
                        </div>
                      </>
                    )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-slate-400 bg-slate-900/60 rounded-lg border border-slate-800/50">
            <TrendingUp className="w-10 h-10 mb-2 text-slate-600" />
            <p className="text-sm sm:text-base text-center px-4">
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
