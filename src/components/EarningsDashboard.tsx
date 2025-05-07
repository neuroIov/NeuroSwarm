import React, { useState, useEffect, useMemo } from "react";
import { Wallet, TrendingUp, Calendar, ArrowUpRight } from "lucide-react";
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
  const { userProfile, walletConnected, connectWallet } = useSession();
  const walletAddress = userProfile?.wallet_address;
  const [walletError, setWalletError] = useState<boolean>(false);
  const [loadingTimeout, setLoadingTimeout] = useState<boolean>(false);

  // Use the real earnings hook with auto-refresh and higher transaction limit for chart data
  const {
    earnings,
    transactions,
    loading,
    error,
    hasMoreTransactions,
    loadMoreTransactions,
    refreshData,
  } = useEarnings({
    transactionsLimit: 100,
    autoRefresh: true,
    refreshInterval: 35000, // 35 seconds
  });

  // Set a timeout for loading state
  useEffect(() => {
    let timer: NodeJS.Timeout;

    if (loading) {
      // If still loading after 10 seconds, show timeout error
      timer = setTimeout(() => {
        setLoadingTimeout(true);
      }, 10000);
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
    if (!walletConnected) {
      setWalletError(true);
    } else {
      setWalletError(false);
    }
  }, [walletConnected]);

  // Process transactions into chart data based on selected period
  const chartData = useMemo<ChartDataPoint[]>(() => {
    if (!transactions || transactions.length === 0) return [];

    // Sort transactions by date
    const sortedTransactions = [...transactions].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

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

  // Calculate daily average based on completed tasks and time range
  const calculateDailyAverage = () => {
    if (earnings.completedTasks <= 0) return 0;

    // Simple daily average calculation
    return earnings.totalEarnings / 30; // Simplified: total earnings divided by a month
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

  // Chart tooltip components
  const CustomTooltip = ({
    active,
    payload,
    label,
  }: TooltipProps<number, string>) => {
    if (active && payload && payload.length) {
      return (
        <div
          className="bg-[#161628] p-2 rounded-md border border-blue-900/50 shadow-lg text-white z-50"
          style={{ zIndex: 9999 }}
        >
          <p className="text-sm">{`${label}`}</p>
          <p className="text-sm font-semibold">{`${payload[0].value} NLOV`}</p>
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
            className="bg-green-600 px-2 py-1 rounded text-white text-xs font-medium"
            style={{ zIndex: 9999 }}
          >
            {data.percentage}
          </div>
        );
      }
    }
    return null;
  };

  // If wallet is not connected, show wallet connection message
  if (!walletConnected) {
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
            Wallet Not Connected
          </h3>
          <p className="text-slate-400 text-center mb-4">
            Please connect your wallet to view your earnings and transaction
            history.
          </p>
          <div className="flex items-center justify-center text-blue-400 mb-4">
            <svg
              className="w-5 h-5 mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              ></path>
            </svg>
            <span className="text-sm">
              Look for the wallet icon in the header
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
            {!walletConnected &&
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
    <div className="flex flex-col stat-card">
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-xl ">Earnings Dashboard</h2>
        <div className="flex gap-2">
          <Select value={timeRange} onValueChange={handleTimeRangeChange}>
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
                {loading ? "..." : earnings.totalEarnings.toFixed(2)} NLOV
              </span>
            </div>
          </div>
        </div>

        {/* Projected Monthly Card */}
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
                {loading ? "..." : calculateProjectedEarnings().toFixed(2)} NLOV
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
                {loading ? "..." : earnings.completedTasks}
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
              <span className="text-sm text-[#515194]">Daily Average</span>
              <span className="text-xl font-bold text-white">
                {loading ? "..." : calculateDailyAverage().toFixed(2)} NLOV
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
              <div className="font-medium text-white">100 NLOV</div>
            </div>

            <div>
              <div className="text-sm text-[#515194] mb-1">
                Next Payout Date
              </div>
              <div className="font-medium text-white">30/04/2025</div>
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

      {/* Recent Transactions */}
      <div className="w-full p-4 bg-[#161628] rounded-lg data-panel">
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
                      {tx.tasks?.type || "Task"} Completed
                    </span>
                  </div>

                  <div className="flex flex-col items-end">
                    <div className="transaction-amount">
                      <span className="text-sm font-medium text-green-500">
                        +{Number(tx.amount).toFixed(2)} NLOV
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
                    <span className="text-xs text-[#515194]">
                      ≈ ${(Number(tx.amount) * 3.27).toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {hasMoreTransactions && (
              <Button
                variant="outline"
                className="gradient-button mt-4 w-full py-2 rounded-full"
                onClick={loadMoreTransactions}
                disabled={loading}
              >
                {loading ? (
                  <div className="flex items-center">
                    <div className="animate-spin mr-2 h-4 w-4 border-2 border-b-0 border-white rounded-full"></div>
                    Loading...
                  </div>
                ) : (
                  "Load More"
                )}
              </Button>
            )}
          </div>
        )}
      </div>
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
