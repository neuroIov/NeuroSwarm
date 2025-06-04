import { useState, useCallback, useEffect } from "react";
import {
  handleDailyCheckIn,
  getUserStreakData,
} from "../services/earningsService";

interface CheckInResult {
  status: "checked_in" | "already_checked_in" | "rewarded" | "error";
  streak?: number;
  amount?: number;
  error?: string;
}

export const useDailyCheckIn = (userId?: string) => {
  const [loading, setLoading] = useState(false);
  const [streakData, setStreakData] = useState<{
    streak: number;
    lastCheckIn: string | null;
  }>({ streak: 0, lastCheckIn: null });

  // Fetch current streak data
  const fetchStreakData = useCallback(async () => {
    if (!userId) return;

    try {
      setLoading(true);
      const data = await getUserStreakData(userId);
      setStreakData(data);
    } catch (err) {
      console.error("Failed to fetch streak data:", err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Fetch streak data on mount and when userId changes
  useEffect(() => {
    if (userId) {
      fetchStreakData();
    }
  }, [userId, fetchStreakData]);

  // Handle daily check-in
  const checkIn = useCallback(async (): Promise<CheckInResult> => {
    if (!userId) {
      return { status: "error", error: "No user ID available" };
    }

    try {
      setLoading(true);
      const result = await handleDailyCheckIn(userId);

      // Update local streak data after check-in
      if (
        result.status === "checked_in" ||
        result.status === "already_checked_in"
      ) {
        setStreakData({
          streak: result.streak || 0,
          lastCheckIn: new Date().toISOString().split("T")[0],
        });
      } else if (result.status === "rewarded") {
        // Reset streak after reward
        setStreakData({
          streak: 0,
          lastCheckIn: new Date().toISOString().split("T")[0],
        });
      }

      return result;
    } catch (err) {
      console.error("Check-in error:", err);
      return {
        status: "error",
        error: err instanceof Error ? err.message : "Unknown error",
      };
    } finally {
      setLoading(false);
    }
  }, [userId]);

  return {
    loading,
    streakData,
    fetchStreakData,
    checkIn,
  };
};
