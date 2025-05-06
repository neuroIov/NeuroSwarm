import { useState, useEffect } from "react";
import { getSwarmSupabase } from "../lib/supabase-client";
import { useSession } from "./useSession";
import {
  getUserEarnings,
  getUserEarningsTransactions,
} from "../services/earningsService";

/**
 * React hook to access and manage user earnings data
 * @param {Object} options - Hook options
 * @param {number} options.transactionsLimit - Number of transactions to fetch
 * @param {boolean} options.autoRefresh - Whether to periodically refresh data
 * @param {number} options.refreshInterval - Refresh interval in milliseconds
 * @returns {Object} User earnings data and methods
 */
export function useEarnings({
  transactionsLimit = 10,
  autoRefresh = true,
  refreshInterval = 60000, // Default: 1 minute
} = {}) {
  const { userProfile } = useSession();
  const userId = userProfile?.id;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [earnings, setEarnings] = useState({
    totalEarnings: 0,
    pendingEarnings: 0,
    completedTasks: 0,
  });
  const [transactions, setTransactions] = useState([]);
  const [transactionsPage, setTransactionsPage] = useState(0);
  const [hasMoreTransactions, setHasMoreTransactions] = useState(true);

  // Function to fetch user earnings data
  const fetchEarningsData = async (silent = false) => {
    if (!userId) return;

    if (!silent) setLoading(true);
    setError(null);

    try {
      const earningsData = await getUserEarnings(userId);
      setEarnings(earningsData);
    } catch (err) {
      setError("Failed to load earnings data");
      console.error("Error fetching earnings:", err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Function to fetch transactions
  const fetchTransactions = async (page = 0, limit = transactionsLimit) => {
    if (!userId) return;

    setLoading(true);
    setError(null);

    try {
      const offset = page * limit;
      const transactionsData = await getUserEarningsTransactions(
        userId,
        limit,
        offset
      );

      if (page === 0) {
        setTransactions(transactionsData);
      } else {
        setTransactions((prev) => [...prev, ...transactionsData]);
      }

      // Check if there are more transactions
      setHasMoreTransactions(transactionsData.length === limit);
      setTransactionsPage(page);
    } catch (err) {
      setError("Failed to load transactions");
      console.error("Error fetching transactions:", err);
    } finally {
      setLoading(false);
    }
  };

  // Function to load more transactions
  const loadMoreTransactions = () => {
    fetchTransactions(transactionsPage + 1);
  };

  // Function to refresh all data
  const refreshData = () => {
    fetchEarningsData();
    fetchTransactions(0);
  };

  // Initial data load
  useEffect(() => {
    if (userId) {
      fetchEarningsData();
      fetchTransactions(0);
    }
  }, [userId]);

  // Set up auto-refresh if enabled
  useEffect(() => {
    if (!autoRefresh || !userId) return;

    const interval = setInterval(() => {
      fetchEarningsData(true); // Silent refresh
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, userId]);

  // Real-time subscription to earnings updates
  useEffect(() => {
    if (!userId) return;

    const client = getSwarmSupabase();
    if (!client) return;

    // Subscribe to new earnings
    const subscription = client
      .channel("earnings-changes")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "earnings",
        },
        (payload) => {
          // Refresh earnings data when a new earning is added
          fetchEarningsData(true);
        }
      )
      .subscribe();

    return () => {
      client.removeChannel(subscription);
    };
  }, [userId]);

  return {
    earnings,
    transactions,
    loading,
    error,
    hasMoreTransactions,
    loadMoreTransactions,
    refreshData,
  };
}
