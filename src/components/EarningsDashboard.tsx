import React, { useState, useEffect } from "react";
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

type TimeRange = "daily" | "weekly" | "monthly" | "all-time";

export const EarningsDashboard = () => {
  const [timeRange, setTimeRange] = useState<TimeRange>("daily");
  const { userProfile } = useSession();
  const walletAddress = userProfile?.wallet_address;

  // Use the real earnings hook with auto-refresh
  const {
    earnings,
    transactions,
    loading,
    error,
    hasMoreTransactions,
    loadMoreTransactions,
    refreshData,
  } = useEarnings({
    transactionsLimit: 10,
    autoRefresh: true,
    refreshInterval: 35000, // 35 seconds
  });

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

  return (
    <div className="stat-card">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold">Earnings Dashboard</h2>
          <InfoTooltip content="Track your NLOV token earnings from completed tasks" />
        </div>
        <div className="flex gap-2">
          <Select value={timeRange} onValueChange={handleTimeRangeChange}>
            <SelectTrigger className="w-[120px] bg-slate-800/50">
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
            size="sm"
            onClick={handleRefresh}
            disabled={loading}
          >
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="flex flex-col p-4 bg-slate-800/30 rounded-lg">
          <div className="flex items-center text-slate-400 mb-1 text-sm">
            <Wallet className="w-4 h-4 mr-2" /> Total Earnings
          </div>
          <div className="text-3xl font-bold">
            {loading ? "..." : earnings.totalEarnings.toFixed(5)} NLOV
          </div>
          <div className="text-sm text-slate-400 mt-1">
            Lifetime earnings from tasks
          </div>
        </div>

        <div className="flex flex-col p-4 bg-slate-800/30 rounded-lg">
          <div className="flex items-center text-slate-400 mb-1 text-sm">
            <TrendingUp className="w-4 h-4 mr-2" /> Projected{" "}
            {timeRange === "all-time"
              ? "Annual"
              : timeRange.charAt(0).toUpperCase() + timeRange.slice(1)}
          </div>
          <div className="text-3xl font-bold">
            {loading ? "..." : calculateProjectedEarnings().toFixed(5)} NLOV
          </div>
          <div className="text-sm text-slate-400 mt-1">
            Based on current rate
          </div>
        </div>

        <div className="flex flex-col p-4 bg-slate-800/30 rounded-lg">
          <div className="flex items-center text-slate-400 mb-1 text-sm">
            <Calendar className="w-4 h-4 mr-2" /> Pending Earnings
          </div>
          <div className="text-3xl font-bold">
            {loading ? "..." : earnings.pendingEarnings.toFixed(5)} NLOV
          </div>
          <div className="text-sm text-slate-400 mt-1">
            Awaiting next payout
          </div>
        </div>

        <div className="flex flex-col p-4 bg-slate-800/30 rounded-lg">
          <div className="flex items-center text-slate-400 mb-1 text-sm">
            <CheckCircle className="w-4 h-4 mr-2" /> Tasks Completed
          </div>
          <div className="text-3xl font-bold">
            {loading ? "..." : earnings.completedTasks}
          </div>
          <div className="text-sm text-slate-400 mt-1">
            Total tasks processed
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 bg-slate-800/30 rounded-lg flex flex-col min-h-[240px]">
          <h3 className="text-lg font-medium mb-3">Recent Transactions</h3>
          {loading && (
            <div className="text-center py-8">Loading transactions...</div>
          )}

          {!loading && transactions.length === 0 && (
            <div className="flex items-center justify-center h-32 text-slate-400 text-sm">
              <Clock className="w-16 h-16 text-slate-600 mr-2" />
              <p>No transaction history available yet</p>
            </div>
          )}

          {!loading && transactions.length > 0 && (
            <div className="space-y-2 overflow-y-auto max-h-[320px] pr-1 custom-scrollbar">
              {transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="p-2 border border-slate-700 rounded-md flex justify-between"
                >
                  <div>
                    <div className="font-medium">
                      +{Number(tx.amount).toFixed(5)} NLOV
                    </div>
                    <div className="text-xs text-slate-400">
                      {tx.tasks?.type || "Unknown"} task •{" "}
                      {formatDate(tx.created_at)}
                    </div>
                  </div>
                  {tx.transaction_hash && (
                    <a
                      href={`https://solscan.io/tx/${tx.transaction_hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 flex items-center"
                    >
                      <ArrowUpRight className="w-4 h-4" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}

          {!loading && hasMoreTransactions && (
            <Button
              variant="outline"
              className="mt-4"
              onClick={loadMoreTransactions}
            >
              Load More
            </Button>
          )}
        </div>

        <div className="p-4 bg-slate-800/30 rounded-lg">
          <h3 className="text-lg font-medium mb-3">Payout Details</h3>
          <div className="space-y-4">
            <div>
              <div className="text-sm text-slate-400 mb-1">Wallet Address</div>
              <div className="font-medium">
                {walletAddress
                  ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
                  : "Not connected"}
              </div>
            </div>

            <div>
              <div className="text-sm text-slate-400 mb-1">Network</div>
              <div className="font-medium">Solana</div>
            </div>

            <div>
              <div className="text-sm text-slate-400 mb-1">Minimum Payout</div>
              <div className="font-medium">10 NLOV</div>
            </div>

            <div>
              <div className="text-sm text-slate-400 mb-1">
                Next Payout Date
              </div>
              <div className="font-medium">1st of next month</div>
            </div>

            <Button
              className="w-full bg-blue-600 hover:bg-blue-700 mt-2"
              onClick={handleWithdraw}
              disabled={earnings.pendingEarnings < 10}
            >
              {earnings.pendingEarnings < 10
                ? `Withdraw (${earnings.pendingEarnings.toFixed(2)}/10 NLOV)`
                : "Withdraw (Coming Soon)"}
            </Button>
          </div>
        </div>
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
