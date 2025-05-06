import React, { useState, useEffect } from "react";
import { Wallet, TrendingUp, Calendar, ArrowUpRight } from "lucide-react";
import { InfoTooltip } from "./InfoTooltip";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

type TimeRange = "daily" | "weekly" | "monthly" | "all-time";

export const EarningsDashboard = () => {
  const [timeRange, setTimeRange] = useState<TimeRange>("daily");
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [projectedEarnings, setProjectedEarnings] = useState(0);
  const [dailyAverage, setDailyAverage] = useState(0);
  const [walletConnected, setWalletConnected] = useState(false);

  // Simulate earnings accumulation
  useEffect(() => {
    const timer = setInterval(() => {
      setTotalEarnings((prev) => {
        const newValue = prev + 0.00001;
        return parseFloat(newValue.toFixed(5));
      });
    }, 5000);

    return () => clearInterval(timer);
  }, []);

  // Update projected earnings when total changes
  useEffect(() => {
    setProjectedEarnings(totalEarnings * 30);
    setDailyAverage(totalEarnings / 10);
  }, [totalEarnings]);

  const handleTimeRangeChange = (value: string) => {
    setTimeRange(value as TimeRange);
  };

  const handleWithdraw = () => {
    toast.info("Withdrawals will be available after mainnet launch");
  };

  return (
    <div className="stat-card">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold">Earnings Dashboard</h2>
          <InfoTooltip content="Track your NLOV token earnings from completed tasks" />
        </div>
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
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="flex flex-col p-4 bg-slate-800/30 rounded-lg">
          <div className="flex items-center text-slate-400 mb-1 text-sm">
            <Wallet className="w-4 h-4 mr-2" /> Total Earnings
          </div>
          <div className="text-3xl font-bold">
            {totalEarnings.toFixed(5)} NLOV
          </div>
        </div>

        <div className="flex flex-col p-4 bg-slate-800/30 rounded-lg">
          <div className="flex items-center text-slate-400 mb-1 text-sm">
            <TrendingUp className="w-4 h-4 mr-2" /> Projected Monthly
          </div>
          <div className="text-3xl font-bold">
            {projectedEarnings.toFixed(5)} NLOV
          </div>
        </div>

        <div className="flex flex-col p-4 bg-slate-800/30 rounded-lg">
          <div className="flex items-center text-slate-400 mb-1 text-sm">
            <Calendar className="w-4 h-4 mr-2" /> Daily Average
          </div>
          <div className="text-3xl font-bold">
            {dailyAverage.toFixed(5)} NLOV
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 bg-slate-800/30 rounded-lg flex flex-col justify-between min-h-[240px]">
          <div>
            <h3 className="text-lg font-medium mb-3">Earnings History</h3>
            <div className="flex items-center justify-center h-32 text-slate-400 text-sm">
              <Clock className="w-16 h-16 text-slate-600 mr-2" />
              <p>Earnings history will be available after Mainnet</p>
            </div>
          </div>
        </div>

        <div className="p-4 bg-slate-800/30 rounded-lg">
          <h3 className="text-lg font-medium mb-3">Payout Details</h3>
          <div className="space-y-4">
            <div>
              <div className="text-sm text-slate-400 mb-1">Wallet Address</div>
              <div className="font-medium">
                {walletConnected ? "0x3a5e...4952" : "Not connected"}
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
            >
              Withdraw (Coming Soon)
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

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
