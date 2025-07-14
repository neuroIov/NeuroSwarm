import React, { useState, useEffect, useMemo } from "react";
import {
  Wallet,
  TrendingUp,
  Calendar,
  ArrowUpRight,
  Bug,
  Check,
  Loader2,
  HelpCircle,
} from "lucide-react";
import { InfoTooltip } from "./InfoTooltip";
import { Button } from "./ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { toast } from "sonner";
import { useEarnings } from "../hooks/useEarnings";
import { useSession } from "../hooks/useSession";
import { formatDate } from "../utils/dateUtils";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  ReferenceLine,
  Cell,
  TooltipProps,
} from "recharts";
import { useSelector } from "react-redux";
import { RootState } from "@/store";
import {
  debugEarningsData,
  createTestEarning,
} from "../services/earningsService";
import { useDailyCheckIn } from "../hooks/useDailyCheckIn";

type TimeRange = "daily" | "weekly" | "monthly" | "all-time";

// Define interface for chart data point
interface ChartDataPoint {
  date: string;
  earnings: number;
  highlight: boolean;
  percentage?: string;
  value?: string;
  timestamp?: number;
}

export const EarningsDashboard = () => {
  const [timeRange, setTimeRange] = useState<TimeRange>("daily");
  const [chartPeriod, setChartPeriod] = useState<TimeRange>("daily");
  const [debugMode, setDebugMode] = useState<boolean>(false);
  const [debugData, setDebugData] = useState<any>(null);
  const [checkInLoading, setCheckInLoading] = useState<boolean>(false);
  // Removed streakCompleted and streakReward states as they're no longer needed
  const [showWalletPrompt, setShowWalletPrompt] = useState<boolean>(true);

  const { session } = useSession();
  const userId = session?.userProfile?.id;
  const hasWallet = !!session.walletAddress;

  const { streakData, fetchStreakData, checkIn } = useDailyCheckIn(userId);

  const walletAddress = useSelector(
    (state: RootState) => state.session.walletAddress
  );

  const [walletError, setWalletError] = useState<boolean>(false);
  const [loadingTimeout, setLoadingTimeout] = useState<boolean>(false);

  // Use the real earnings hook with auto-refresh to fetch 20 recent transactions
  const { earnings, transactions, loading, error, refreshData, debug } =
    useEarnings({
      autoRefresh: true,
      refreshInterval: 35000, // 35 seconds
    });

  // Process transactions into chart data based on selected period
  const chartData = useMemo<ChartDataPoint[]>(() => {
    if (!transactions || transactions.length === 0) {
      console.log('No transactions available for chart data');
      return [];
    }

    console.log(`Processing ${transactions.length} transactions for ${chartPeriod} chart`);

    // Sort transactions by date
    const sortedTransactions = [...transactions].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    
    console.log('Transactions sorted by date:', sortedTransactions.map(t => ({
      id: t.id,
      date: t.created_at,
      amount: t.amount
    })));

    // Group transactions by date based on the selected period
    const groupedData = new Map<string, number>();

    // Generate date labels for the last 8 days/weeks/months
    const today = new Date();
    const labels: ChartDataPoint[] = [];
    let dateFormat = "";

    // Create date labels based on the selected period
    for (let i = 7; i >= 0; i--) {
      const date = new Date();

      if (chartPeriod === "daily") {
        date.setDate(today.getDate() - i);
        dateFormat = `${date.getDate()} ${date.toLocaleString("default", {
          month: "short",
        })}`;
      } else if (chartPeriod === "weekly") {
        date.setDate(today.getDate() - i * 7);
        dateFormat = `W${Math.ceil(
          (date.getDate() +
            new Date(date.getFullYear(), date.getMonth(), 0).getDate()) /
            7
        )}`;
      } else if (chartPeriod === "monthly") {
        date.setMonth(today.getMonth() - i);
        dateFormat = date.toLocaleString("default", { month: "short" });
      }

      labels.push({
        date: dateFormat,
        timestamp: date.getTime(),
        earnings: 0,
        highlight: false,
      });
    }

    // Process transactions and group them
    sortedTransactions.forEach((tx) => {
      const txDate = new Date(tx.created_at);
      let groupKey = "";

      if (chartPeriod === "daily") {
        groupKey = `${txDate.getDate()} ${txDate.toLocaleString("default", {
          month: "short",
        })}`;
      } else if (chartPeriod === "weekly") {
        groupKey = `W${Math.ceil(
          (txDate.getDate() +
            new Date(txDate.getFullYear(), txDate.getMonth(), 0).getDate()) /
            7
        )}`;
      } else if (chartPeriod === "monthly") {
        groupKey = txDate.toLocaleString("default", { month: "short" });
      }

      if (!groupedData.has(groupKey)) {
        groupedData.set(groupKey, 0);
      }

      groupedData.set(groupKey, groupedData.get(groupKey) + Number(tx.amount));
    });

    console.log('Grouped data by date:', Object.fromEntries(groupedData));

    // Map the data to chart format
    const chartResult: ChartDataPoint[] = labels.map((label) => {
      return {
        date: label.date,
        earnings: groupedData.has(label.date)
          ? Number(groupedData.get(label.date)?.toFixed(2) || 0)
          : 0,
        highlight: false,
      };
    });

    console.log('Final chart data format:', chartResult);

    // Find the day with maximum earnings and highlight it
    let maxEarningsIdx = 0;
    let maxEarnings = 0;

    chartResult.forEach((day, idx) => {
      if (day.earnings > maxEarnings) {
        maxEarnings = day.earnings;
        maxEarningsIdx = idx;
      }
    });

    if (maxEarnings > 0) {
      const resultWithHighlight = [...chartResult];

      // Calculate percentage increase from average of other days
      const otherDaysTotal = chartResult.reduce(
        (sum, day, idx) => (idx !== maxEarningsIdx ? sum + day.earnings : sum),
        0
      );
      const otherDaysAvg = otherDaysTotal / (chartResult.length - 1) || 1;
      const percentageIncrease = (
        ((maxEarnings - otherDaysAvg) / otherDaysAvg) *
        100
      ).toFixed(2);

      resultWithHighlight[maxEarningsIdx] = {
        ...resultWithHighlight[maxEarningsIdx],
        highlight: true,
        percentage: `+${percentageIncrease}%`,
        value: maxEarnings.toFixed(2),
      };

      return resultWithHighlight;
    }

    return chartResult;
  }, [transactions, chartPeriod]);
  
  // Debug console logs to see backend data
  useEffect(() => {
    if (transactions && transactions.length > 0) {
      console.log('Recent transactions from backend:', transactions);
      
      // Log the structure of the first transaction for debugging
      if (transactions[0]) {
        console.log('Sample transaction structure:', {
          id: transactions[0].id,
          amount: transactions[0].amount,
          created_at: transactions[0].created_at,
          transaction_hash: transactions[0].transaction_hash,
          earning_type: transactions[0].earning_type,
          task_id: transactions[0].task_id
        });
      }
    }
    
    if (earnings) {
      console.log('Earnings data structure:', {
        totalEarnings: earnings.totalEarnings,
        pendingEarnings: earnings.pendingEarnings,
        completedTasks: earnings.completedTasks
      });
      
      if (chartData && chartData.length > 0) {
        console.log('Chart data calculated:', chartData);
        console.log('Chart data sample:', chartData[0]);
      }
    }
  }, [transactions, earnings, chartData]);

  // Set a timeout for loading state
  useEffect(() => {
    let timer: NodeJS.Timeout;

    if (loading) {
      // If still loading after 20 seconds, show timeout error
      timer = setTimeout(() => {
        setLoadingTimeout(true);
      }, 20000);
    } else {
      setLoadingTimeout(false);
    }

    return () => {
      clearTimeout(timer);
    };
  }, [loading]);

  // Check wallet connection status
  useEffect(() => {
    // If wallet is not connected, consider it an error
    if (walletAddress === null) {
      setWalletError(true);
    } else {
      setWalletError(false);
    }
  }, [walletAddress]);

  // Fetch streak data on component mount
  useEffect(() => {
    if (userId) {
      fetchStreakData();
    }
  }, [userId, fetchStreakData]);

  // Handle period change for chart
  const handleChartPeriodChange = (value: string) => {
    setChartPeriod(value as TimeRange);
  };

  // Calculate projected earnings based on current rate
  const calculateProjectedEarnings = () => {
    // Use task count and pendingEarnings to calculate a daily rate
    if (earnings.completedTasks <= 0) return 0;

    // Estimate using simple projection based on timeRange
    const dailyRate =
      earnings.pendingEarnings / Math.max(earnings.completedTasks, 1);

    switch (timeRange) {
      case "daily":
        return dailyRate * 5; // Assume 5 tasks per day
      case "weekly":
        return dailyRate * 5 * 7; // 5 tasks per day * 7 days
      case "monthly":
        return dailyRate * 5 * 30; // 5 tasks per day * 30 days
      case "all-time":
        return earnings.totalEarnings * 2; // Just double the total as an estimate
      default:
        return dailyRate * 5 * 30;
    }
  };

  // Calculate monthly expected earnings based on recent performance
  const calculateMonthlyExpectedEarnings = () => {
    if (earnings.completedTasks <= 0) return 0;

    // Calculate average daily earnings from recent history
    const dailyAverage = earnings.totalEarnings / 30;
    // Project to monthly (30 days)
    return dailyAverage * 30;
  };

  // Get total balance directly from earnings.pendingEarnings (from earnings_history)
  const getTotalBalance = () => {
    return earnings.pendingEarnings || 0;
  };

  // Get task count from earnings_history or fall back to counted tasks from earnings
  const getTaskCount = () => {
    // If we have debug data available with earnings history, use that
    if (debugData?.history?.length > 0) {
      const latestHistory = debugData.history[0];
      if (latestHistory && latestHistory.task_count) {
        return latestHistory.task_count;
      }
    }
    // Otherwise fall back to the count from earnings
    return earnings.completedTasks || 0;
  };

  const handleTimeRangeChange = (value: string) => {
    setTimeRange(value as TimeRange);
  };

  const handleWithdraw = () => {
    toast.info("Withdrawals will be available after mainnet launch");
  };

  const handleRefresh = () => {
    refreshData();
    toast.success("Earnings data refreshed");
  };

  // Function to toggle debug mode
  const toggleDebugMode = async () => {
    const newMode = !debugMode;
    setDebugMode(newMode);

    if (newMode && userId) {
      try {
        const data = await debugEarningsData(userId);
        setDebugData(data);
      } catch (err) {
        console.error("Error fetching debug data:", err);
        setDebugData({ error: "Failed to fetch debug data" });
      }
    }
  };

  // Function to trigger test earning
  const handleCreateTestEarning = async () => {
    if (!userId) {
      toast.error("No user ID available");
      return;
    }

    try {
      const result = await createTestEarning(userId);
      if (result.success) {
        toast.success("Test earning created successfully");
        // Refresh data to show the new earning
        refreshData();
        // Update debug data if debug mode is enabled
        if (debugMode) {
          const data = await debugEarningsData(userId);
          setDebugData(data);
        }
      } else {
        toast.error(`Failed to create test earning: ${result.error}`);
      }
    } catch (err) {
      toast.error(`Error: ${err.message || "Unknown error"}`);
      console.error("Error creating test earning:", err);
    }
  };

  // Handle daily check-in
  const handleDailyCheckIn = async () => {
    if (!userId) {
      toast.error("Please connect your wallet first");
      return;
    }

    setCheckInLoading(true);
    try {
      const result = await checkIn();

      switch (result.status) {
        case "checked_in":
          toast.success(
            `Day ${result.streak} checked in! You earned ${result.amount} SP!`
          );
          // Refresh earnings data to show updated balance
          refreshData();
          break;
        case "already_checked_in":
          toast.info("You've already checked in today");
          break;
        case "error":
          toast.error(`Error: ${result.error}`);
          break;
      }
    } catch (err) {
      toast.error("Failed to check in. Please try again.");
      console.error("Check-in error:", err);
    } finally {
      setCheckInLoading(false);
    }
  };

  // No longer need the streak completion message effect with immediate rewards

  // Chart tooltip components
  const CustomTooltip = ({
    active,
    payload,
    label,
  }: TooltipProps<number, string>) => {
    if (active && payload && payload.length) {
      return (
        <div
          className="bg-[#161628] p-3 rounded-md border border-blue-500/30 shadow-lg text-white z-50"
          style={{
            zIndex: 9999,
            boxShadow: "0 4px 12px rgba(3, 97, 218, 0.2)",
          }}
        >
          <p className="text-sm font-medium text-blue-400">{`${label}`}</p>
          <p className="text-md font-semibold">{`${Number(payload[0].value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SP`}</p>
        </div>
      );
    }
    return null;
  };

  // Render a tooltip for highlighted bar
  const renderTooltipContent = ({
    active,
    payload,
  }: TooltipProps<number, string>) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload as {
        highlight?: boolean;
        percentage?: string;
      };
      if (data.highlight) {
        return (
          <div
            className="bg-[#161628] px-3 py-2 rounded-md border border-green-500/30 text-green-400 text-xs font-medium"
            style={{
              zIndex: 9999,
              boxShadow: "0 4px 12px rgba(16, 185, 129, 0.2)",
            }}
          >
            {data.percentage}
          </div>
        );
      }
    }
    return null;
  };

  // If user is not logged in, show login message
  if (!userId) {
    return (
      <div className="flex flex-col stat-card">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-xl ">Earnings Dashboard</h2>
        </div>

        <div className="flex flex-col items-center justify-center h-[400px] p-8 bg-[#161628] rounded-lg">
          <img
            src="/images/nlov-coin.png"
            alt="NLOV"
            className="w-16 h-16 mb-4 opacity-50"
          />
          <h3 className="text-xl font-semibold text-amber-400 mb-2">
            Login Required
          </h3>
          <p className="text-slate-400 text-center mb-6">
            Please log in with your email to view your earnings dashboard.
          </p>
          <div className="flex items-center justify-center text-blue-400">
            <svg
              className="w-6 h-6 mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              ></path>
            </svg>
            <span className="text-sm font-medium">
              Log in using your email address
            </span>
          </div>
        </div>
      </div>
    );
  }

  // If there's a loading timeout but wallet is connected, show timeout error
  if (loadingTimeout) {
    return (
      <div className="flex flex-col stat-card">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-xl ">Earnings Dashboard</h2>
        </div>

        <div className="flex flex-col items-center justify-center h-[400px] p-8 bg-[#161628] rounded-lg">
          <img
            src="/images/nlov-coin.png"
            alt="NLOV"
            className="w-16 h-16 mb-4 opacity-50"
          />
          <h3 className="text-xl font-semibold text-red-400 mb-2">
            Connection Timeout
          </h3>
          <p className="text-slate-400 text-center mb-6">
            Unable to load earnings data. Please check your connection and try
            again.
          </p>
          <Button
            className="gradient-button rounded-full"
            onClick={() => {
              refreshData();
              setLoadingTimeout(false);
            }}
          >
            Retry Connection
          </Button>
        </div>
      </div>
    );
  }

  // If there's an API error
  if (error) {
    return (
      <div className="flex flex-col stat-card">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-xl ">Earnings Dashboard</h2>
          <Button
            variant="outline"
            className="h-8 m-0 bg-[#1D1D33] rounded-full font-md font-thin"
            size="sm"
            onClick={handleRefresh}
          >
            Retry
          </Button>
        </div>

        <div className="flex flex-col items-center justify-center h-[400px] p-8 bg-[#161628] rounded-lg">
          <img
            src="/images/error.png"
            alt="Error"
            className="w-16 h-16 mb-4 opacity-50"
            onError={(e) => {
              e.currentTarget.src = "/images/nlov-coin.png";
            }}
          />
          <h3 className="text-xl font-semibold text-red-400 mb-2">
            Network Error
          </h3>
          <p className="text-slate-400 text-center mb-6">
            Unable to load earnings data. Please check your connection and try
            again.
            {walletAddress === null &&
              " Make sure your wallet is connected from the navbar."}
          </p>
          <div className="flex gap-4">
            <Button
              className="gradient-button rounded-full"
              onClick={refreshData}
            >
              Retry Connection
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Show a loading spinner for the initial loading state, but not indefinitely
  if (loading && !loadingTimeout) {
    return (
      <div className="flex flex-col stat-card">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-xl ">Earnings Dashboard</h2>
        </div>

        <div className="flex flex-col items-center justify-center h-[400px] p-8 bg-[#161628] rounded-lg">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mb-4"></div>
          <h3 className="text-xl font-semibold text-blue-400 mb-2">
            Loading Data
          </h3>
          <p className="text-slate-400 text-center">
            Please wait while we fetch your earnings data...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col stat-card max-w-full overflow-x-hidden">
      <div className="flex justify-between items-center mb-8 flex-wrap gap-2">
        <h2 className="text-xl">Earnings Dashboard</h2>
        <div className="flex gap-2">
{

  /* Enable the debug button to view debugging information */
  true && <>          <Select value={timeRange} onValueChange={handleTimeRangeChange}>
  <SelectTrigger className="w-[80px] h-8 m-0 bg-[#1D1D33] rounded-full ">
    <SelectValue placeholder="Time Range" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="daily">Daily</SelectItem>
    <SelectItem value="weekly">Weekly</SelectItem>
    <SelectItem value="monthly">Monthly</SelectItem>
    <SelectItem value="all-time">All Time</SelectItem>
  </SelectContent>
</Select>
<Button
  variant="outline"
  className="h-8 m-0 bg-[#1D1D33] rounded-full font-md font-thin"
  size="sm"
  onClick={toggleDebugMode}
>
  <Bug className="h-4 w-4" />
</Button></>
}
          <Button
            variant="outline"
            className="h-8 m-0 bg-[#1D1D33] rounded-full font-md font-thin"
            size="sm"
            onClick={handleRefresh}
            disabled={loading}
          >
            Refresh
          </Button>

        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {/* Total Earning Card */}
        <div className="flex flex-col p-4 earning-cards bg-[#161628] rounded-lg">
          <div className="flex gap-3 items-center">
            <div className="icon-bg icon-container flex items-center justify-center rounded-md p-2">
              <img
                src="/images/nlov-coin.png"
                alt="NLOV"
                className="w-8 h-8 relative z-10"
              />
            </div>
            <div className="flex flex-col">
              <span className="text-sm text-[#515194]">Total Earning</span>
              <span className="text-xl font-bold text-white">
                {loading ? "..." : earnings.totalEarnings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SP
              </span>
            </div>
          </div>
        </div>

        {/* Total Balance Card */}
        <div className="flex flex-col p-4 earning-cards bg-[#161628] rounded-lg">
          <div className="flex gap-3 items-center">
            <div className="icon-bg icon-container flex items-center justify-center rounded-md p-2">
              <img
                src="/images/dollar.png"
                alt="NLOV"
                className="w-8 h-9 relative z-10"
              />
            </div>
            <div className="flex flex-col">
              <span className="text-sm text-[#515194]">Total Balance</span>
              <span className="text-xl font-bold text-white">
                {loading ? "..." : getTotalBalance().toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SP
              </span>
            </div>
          </div>
        </div>

        {/* Total Tasks Card */}
        <div className="flex flex-col p-4 earning-cards bg-[#161628] rounded-lg">
          <div className="flex gap-3 items-center">
            <div className="icon-bg icon-container flex items-center justify-center rounded-md p-2">
              <img
                src="/images/menu.png"
                alt="NLOV"
                className="w-8 h-7 relative z-10"
              />
            </div>
            <div className="flex flex-col">
              <span className="text-sm text-[#515194]">Total Tasks</span>
              <span className="text-xl font-bold text-white">
                {loading ? "..." : getTaskCount().toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Daily Average Card */}
        <div className="flex flex-col p-4 earning-cards bg-[#161628] rounded-lg">
          <div className="flex gap-3 items-center">
            <div className="icon-bg icon-container flex items-center justify-center rounded-md p-2">
              <img
                src="/images/coins.png"
                alt="NLOV"
                className="w-8 h-8 relative z-10"
              />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1">
                <span className="text-sm text-[#515194]">Monthly Expected</span>
                <InfoTooltip content="Projected monthly earnings based on your recent performance" />
              </div>
              <span className="text-xl font-bold text-white">
                {loading ? "..." : calculateMonthlyExpectedEarnings().toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SP
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Chart and Payout sections */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-6">
        {/* Earnings Chart */}
        <div className="md:col-span-8 p-6 border border-[#1a1a36]/80 bg-[radial-gradient(ellipse_at_top,#0361DA_0%,#090C18_78%)] rounded-lg relative overflow-hidden chart-panel">
          <div className="flex justify-between items-center mb-6 relative z-10">
            <div className="flex items-center gap-2">
              <img
                src="/images/earnings.png"
                alt="NLOV"
                className="w-5 h-5 relative z-10"
              />
              <h3 className="text-lg font-medium">Earning History</h3>
            </div>
            <Select value={chartPeriod} onValueChange={handleChartPeriodChange}>
              <SelectTrigger className="w-[100px] gradient-button border-1 border-[#1a1a36]  rounded-full h-8 text-sm">
                <SelectValue placeholder="Period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="h-[250px] w-full relative z-10">
            {loading && chartData.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 10, right: 30, left: 0, bottom: 10 }}
                  className="z-20"
                >
                  <defs>
                    <linearGradient
                      id="barGradient"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="0%" stopColor="#0361DA" />
                      <stop offset="100%" stopColor="#161628" />
                    </linearGradient>
                    <linearGradient
                      id="highlightGradient"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="0%" stopColor="#3B82F6" />
                      <stop offset="100%" stopColor="#1D4ED8" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#2d2d57"
                  />
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#515194", fontSize: 12 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#515194", fontSize: 12 }}
                  />
                  <Tooltip
                    content={<CustomTooltip />}
                    wrapperStyle={{ zIndex: 9999 }}
                    cursor={{ fill: "rgba(59, 130, 246, 0.1)" }}
                  />
                  <ReferenceLine
                    y={0}
                    stroke="#444"
                    strokeWidth={1}
                    strokeDasharray="0"
                  />
                  <Bar dataKey="earnings" radius={[20, 20, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={
                          entry.highlight
                            ? "url(#highlightGradient)"
                            : "#273c75"
                        }
                        className={entry.highlight ? "bar-highlight" : ""}
                      />
                    ))}
                  </Bar>
                  {chartData.map(
                    (entry, index) =>
                      entry.highlight && (
                        <Tooltip
                          key={`tooltip-${index}`}
                          content={renderTooltipContent}
                          position={{ x: 0, y: 0 }}
                          active={true}
                          payload={[{ payload: entry }]}
                          wrapperStyle={{ zIndex: 9999 }}
                        />
                      )
                  )}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Background effect for chart */}
          <div className="absolute inset-0 bg-gradient-to-b from-blue-900/10 to-transparent opacity-30 z-0"></div>
          <div className="absolute inset-0 bg-grid opacity-10 z-0"></div>
        </div>

        {/* Payout Details */}
        <div className="md:col-span-4 p-4 bg-[#161628] rounded-lg data-panel">
          <div className="flex gap-2 items-center">
            <div className="icon-container">
              <img
                src="/images/payout.png"
                style={{
                  objectFit: "contain",
                }}
                alt="NLOV"
                className="w-8 h-8 relative z-10 mt-2"
              />
            </div>
            <h3 className="text-lg font-medium ">Payout Details</h3>
          </div>
          <div className="w-full h-[1px] bg-[#2C2C53]/80 my-4" />
          <div className="space-y-5 p-4 ">
            <div>
              <div className="text-sm text-[#515194] mb-1">Wallet Address</div>
              <div className="font-medium text-white">
                {walletAddress
                  ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
                  : "N/A"}
              </div>
            </div>

            <div>
              <div className="text-sm text-[#515194] mb-1">Network</div>
              <div className="font-medium text-white">SOLANA</div>
            </div>

            <div>
              <div className="text-sm text-[#515194] mb-1">Minimum Payout</div>
              <div className="font-medium text-white">10,000 Swarm Point</div>
            </div>

            <div>
              <div className="text-sm text-[#515194] mb-1">
                Next Payout Date
              </div>
              <div className="font-medium text-white">Coming Soon</div>
            </div>

            <Button
              className="gradient-button w-full mt-6 rounded-full"
              disabled={true}
              onClick={handleWithdraw}
            >
              <div className="icon-container">
                <img
                  src="/images/withdraw.png"
                  alt="NLOV"
                  className="w-5 h-5 relative z-10"
                />
              </div>
              Withdraw Earnings{" "}
              <span className="text-white text-[12px] font-thin">
                / Coming Soon
              </span>
            </Button>
          </div>
        </div>
      </div>

      {/* Daily Rewards */}
      <div className="w-full p-4 bg-[#161628] rounded-lg data-panel mt-6">
        <div className="flex justify-between items-center mb-6">
          <div className="flex gap-2 items-center">
            <div className="icon-container">
              <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div className="flex items-center">
              <h3 className="text-lg font-medium">Daily Rewards</h3>
              <div className="ml-2 mt-2">
                <InfoTooltip
                  content={
                    <div className="max-w-xs">
                      <p className="mb-2">Check in daily to earn rewards!</p>
                      <p className="mb-1">
                        • Each day you check in, earn SP instantly
                      </p>
                      <p className="mb-1">
                        • Rewards increase with consecutive days
                      </p>
                      <p className="mb-1">
                        • Day 1: 10 SP, Day 2: 20 SP, Day 3: 30 SP, etc.
                      </p>
                      <p className="mb-1">
                        • If you miss a day, your streak resets to day 1
                      </p>
                      <p className="text-xs text-blue-300 mt-2">
                        Rewards are added to your balance immediately
                      </p>
                    </div>
                  }
                  side="right"
                />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {userId && (
              <div className="flex items-center bg-blue-900/20 px-3 py-1 rounded-full">
                <span className="text-xs text-blue-300 mr-1">
                  Current streak:
                </span>
                <span className="text-sm font-medium text-blue-400">
                  {streakData.streak.toLocaleString()} days
                </span>
              </div>
            )}
            <Button
              className="gradient-button rounded-full"
              onClick={handleDailyCheckIn}
              disabled={checkInLoading || !userId}
            >
              {checkInLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Check In
            </Button>
          </div>
        </div>

        {/* Daily reward cards */}
        <div className="grid grid-cols-3 sm:grid-cols-7 gap-2 sm:gap-4">
          <DailyRewardCard
            day={1}
            points={10}
            isActive={streakData.streak === 0}
            isCompleted={streakData.streak >= 1}
            description="Earn instantly"
          />
          <DailyRewardCard
            day={2}
            points={20}
            isActive={streakData.streak === 1}
            isCompleted={streakData.streak >= 2}
            description="Earn instantly"
          />
          <DailyRewardCard
            day={3}
            points={30}
            isActive={streakData.streak === 2}
            isCompleted={streakData.streak >= 3}
            description="Earn instantly"
          />
          <DailyRewardCard
            day={4}
            points={40}
            isActive={streakData.streak === 3}
            isCompleted={streakData.streak >= 4}
            description="Earn instantly"
          />
          <DailyRewardCard
            day={5}
            points={50}
            isActive={streakData.streak === 4}
            isCompleted={streakData.streak >= 5}
            description="Earn instantly"
          />
          <DailyRewardCard
            day={6}
            points={60}
            isActive={streakData.streak === 5}
            isCompleted={streakData.streak >= 6}
            description="Earn instantly"
          />
          <DailyRewardCard
            day={7}
            points={70}
            isActive={streakData.streak === 6}
            isCompleted={streakData.streak >= 7}
            description="Earn instantly"
          />
        </div>

        {/* Last check-in info */}
        {streakData.lastCheckIn && (
          <div className="flex justify-center mt-4">
            <div className="text-xs text-slate-400">
              Last check-in:{" "}
              {streakData.lastCheckIn ===
              new Date().toISOString().split("T")[0] ? (
                <span className="text-green-400">Today</span>
              ) : (
                new Date(streakData.lastCheckIn).toLocaleDateString()
              )}
            </div>
          </div>
        )}
      </div>

      {/* We no longer need the streak completion message with immediate rewards */}

      {/* Recent Transactions */}
      <div className="w-full p-4 bg-[#161628] rounded-lg data-panel mt-6">
        <div className="flex gap-2 items-center mb-4">
          <div className="icon-container">
            <img
              src="/images/transactions.png"
              alt="NLOV"
              className="w-6 h-6 relative z-10"
              style={{
                objectFit: "contain",
              }}
            />
          </div>
          <h3 className="text-lg font-medium">Recent Transactions</h3>
        </div>

        {loading && (
          <div className="flex justify-center items-center h-40">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          </div>
        )}

        {!loading && transactions.length === 0 && (
          <div className="flex items-center justify-center h-40 text-slate-400 text-sm">
            <Clock className="w-16 h-16 text-slate-600 mr-2" />
            <p>No transaction history available yet</p>
          </div>
        )}

        {!loading && transactions.length > 0 && (
          <div className="flex flex-col">
            <div className="space-y-2 h-[320px] overflow-y-auto pr-1 custom-scrollbar">
              {transactions.map((tx) => (
                <div key={tx.id} className="transaction-item p-3">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium transaction-date">
                      {formatDate(tx.created_at)}
                    </span>
                    <span className="text-xs text-[#515194]">
                      {tx.earning_type === "task" ? "Task completed" : "Referral reward"}
                    </span>
                  </div>

                  <div className="flex flex-col items-end">
                    <div className="transaction-amount">
                      <span className="text-sm font-medium text-green-500">
                        +{Number(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SP
                      </span>
                      {tx.transaction_hash && (
                        <a
                          href={`https://solscan.io/tx/${tx.transaction_hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 ml-2"
                        >
                          <ArrowUpRight className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                    {/* <span className="text-xs text-[#515194]">
                      ≈ ${(Number(tx.amount) * 3.27).toFixed(2)}
                    </span> */}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Debug section */}
      {debugMode && (
        <div className="w-full p-4 mt-6 bg-[#161628] rounded-lg overflow-auto">
          <h3 className="text-lg font-medium mb-4 text-red-400">
            Debug Information
          </h3>

          <div className="flex justify-between items-center mb-3">
            <span className="text-sm text-gray-400">Test Tools</span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 m-0 bg-[#1D1D33] rounded-full font-md font-thin"
                onClick={handleCreateTestEarning}
              >
                Create Test Earning
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 m-0 bg-[#1D1D33] rounded-full font-md font-thin"
                onClick={fetchStreakData}
              >
                Refresh Streak Data
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <h4 className="text-md font-medium mb-2 text-blue-400">
                Daily Check-in Status
              </h4>
              <pre className="text-xs bg-[#0D0D1A] p-2 rounded overflow-auto max-h-40">
                {JSON.stringify(
                  {
                    streak: streakData.streak,
                    lastCheckIn: streakData.lastCheckIn,
                    today: new Date().toISOString().split("T")[0],
                  },
                  null,
                  2
                )}
              </pre>
            </div>

            <div>
              <h4 className="text-md font-medium mb-2 text-blue-400">
                Hook Debug Info
              </h4>
              <pre className="text-xs bg-[#0D0D1A] p-2 rounded overflow-auto max-h-40">
                {JSON.stringify(debug, null, 2)}
              </pre>
            </div>

            {debugData?.error ? (
              <div className="text-red-500">{debugData.error}</div>
            ) : debugData ? (
              <>
                <div>
                  <h4 className="text-md font-medium mb-2 text-blue-400">
                    User Profile
                  </h4>
                  <pre className="text-xs bg-[#0D0D1A] p-2 rounded overflow-auto max-h-40">
                    {JSON.stringify(debugData.userProfile, null, 2)}
                  </pre>
                </div>

                <div>
                  <h4 className="text-md font-medium mb-2 text-blue-400">
                    Earnings Records ({debugData.earnings_count})
                  </h4>
                  <pre className="text-xs bg-[#0D0D1A] p-2 rounded overflow-auto max-h-40">
                    {JSON.stringify(debugData.earnings, null, 2)}
                  </pre>
                </div>

                <div>
                  <h4 className="text-md font-medium mb-2 text-blue-400">
                    Earnings History ({debugData.history_count})
                  </h4>
                  <pre className="text-xs bg-[#0D0D1A] p-2 rounded overflow-auto max-h-40">
                    {JSON.stringify(debugData.history, null, 2)}
                  </pre>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};

// Additional icons
const CheckCircle = ({ className }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
    <polyline points="22 4 12 14.01 9 11.01"></polyline>
  </svg>
);

// Clock icon for the earnings history placeholder
const Clock = ({ className }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10"></circle>
    <polyline points="12 6 12 12 16 14"></polyline>
  </svg>
);

// Daily reward card component
const DailyRewardCard = ({
  day,
  points,
  isActive,
  isCompleted,
  description,
}: {
  day: number;
  points: number;
  isActive: boolean;
  isCompleted: boolean;
  description?: string;
}) => {
  return (
    <div
      className={`relative group transition-all duration-300 ${
        isActive ? "scale-105" : ""
      }`}
    >
      <div
        className={`
          relative overflow-hidden rounded-2xl p-2 sm:p-4 
          ${
            isActive
              ? "bg-gradient-to-br from-blue-500/20 to-purple-600/20 border-2 border-blue-500/50"
              : isCompleted
              ? "bg-[#161628] border-2 border-green-500/50"
              : "bg-gradient-to-br from-[#1a1a36] to-[#090C18] border-2 border-[#1a1a36]"
          }
          hover:scale-105 transition-all duration-300 hover:border-blue-500/50
          hover:shadow-[0_0_20px_rgba(59,130,246,0.2)]
        `}
      >
        <div className="text-center">
          <div
            className={`text-sm sm:text-lg font-medium ${
              isActive ? "text-blue-400" : "text-white"
            }`}
          >
            Day {day}
          </div>
          <div className="text-xs sm:text-sm text-blue-400/80 mt-1">
            {points} SP
          </div>
          {description && (
            <div className="text-[10px] sm:text-xs text-blue-300/60 mt-1">
              {description}
            </div>
          )}
        </div>
        {isCompleted && (
          <div className="absolute -top-1 -right-1 bg-green-500 rounded-full p-1">
            <Check className="w-2 h-2 sm:w-3 sm:h-3 text-white" />
          </div>
        )}
      </div>
    </div>
  );
};
