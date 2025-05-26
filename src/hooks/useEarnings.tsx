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
  const { session } = useSession();
  const userId = session?.userProfile?.id;

  const [loading, setLoading] = useState(true);
  const [earningsLoading, setEarningsLoading] = useState(true);
  const [transactionsLoading, setTransactionsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [earnings, setEarnings] = useState({
    totalEarnings: 0,
    pendingEarnings: 0,
    completedTasks: 0,
  });
  const [transactions, setTransactions] = useState([]);
  const [transactionsPage, setTransactionsPage] = useState(0);
  const [hasMoreTransactions, setHasMoreTransactions] = useState(true);
  const [lastError, setLastError] = useState(null);

  // Update overall loading state when either earnings or transactions are loading
  useEffect(() => {
    setLoading(earningsLoading || transactionsLoading);
  }, [earningsLoading, transactionsLoading]);

  // Function to fetch user earnings data
  const fetchEarningsData = async (silent = false) => {
    if (!userId) {
      console.log("No user ID available, skipping earnings data fetch");
      setEarningsLoading(false);
      return;
    }

    if (!silent) setEarningsLoading(true);
    setError(null);

    try {
      console.log(`Fetching earnings data for user: ${userId}`);
      const earningsData = await getUserEarnings(userId);
      console.log("Earnings data received:", earningsData);
      setEarnings(earningsData);
    } catch (err) {
      const errorMsg = `Failed to load earnings data: ${
        err.message || JSON.stringify(err)
      }`;
      setError(errorMsg);
      setLastError({
        type: "earnings",
        message: errorMsg,
        timestamp: new Date().toISOString(),
      });
      console.error("Error fetching earnings:", err);
    } finally {
      if (!silent) setEarningsLoading(false);
    }
  };

  // Function to fetch transactions
  const fetchTransactions = async (page = 0, limit = transactionsLimit) => {
    if (!userId) {
      console.log("No user ID available, skipping transactions fetch");
      setTransactionsLoading(false);
      return;
    }

    setTransactionsLoading(true);
    setError(null);

    try {
      const offset = page * limit;
      console.log(
        `Fetching transactions for user: ${userId}, limit: ${limit}, offset: ${offset}`
      );
      const transactionsData = await getUserEarningsTransactions(
        userId,
        limit,
        offset
      );
      console.log(`Received ${transactionsData.length} transactions`);

      if (page === 0) {
        setTransactions(transactionsData);
      } else {
        setTransactions((prev) => [...prev, ...transactionsData]);
      }

      // Check if there are more transactions
      setHasMoreTransactions(transactionsData.length === limit);
      setTransactionsPage(page);
    } catch (err) {
      const errorMsg = `Failed to load transactions: ${
        err.message || JSON.stringify(err)
      }`;
      setError(errorMsg);
      setLastError({
        type: "transactions",
        message: errorMsg,
        timestamp: new Date().toISOString(),
      });
      console.error("Error fetching transactions:", err);
    } finally {
      setTransactionsLoading(false);
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
      console.log(`Initial data load for user: ${userId}`);
      fetchEarningsData();
      fetchTransactions(0);
    } else {
      console.log("No user ID available, skipping initial data load");
      setEarningsLoading(false);
      setTransactionsLoading(false);
    }
  }, [userId]);

  // Set up auto-refresh if enabled
  useEffect(() => {
    if (!autoRefresh || !userId) return;

    console.log(
      `Setting up auto-refresh every ${refreshInterval}ms for user: ${userId}`
    );
    const interval = setInterval(() => {
      fetchEarningsData(true); // Silent refresh of earnings only
    }, refreshInterval);

    return () => {
      console.log("Clearing auto-refresh interval");
      clearInterval(interval);
    };
  }, [autoRefresh, refreshInterval, userId]);

  // Real-time subscription to earnings updates
  useEffect(() => {
    if (!userId) return;

    const client = getSwarmSupabase();
    if (!client) return;

    console.log(
      `Setting up real-time subscription for earnings changes for user: ${userId}`
    );

    // Subscribe to new earnings
    const subscription = client
      .channel("earnings-changes")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "earnings",
          filter: `user_id=eq.${userId}`, // Add filter to only get updates for this user
        },
        (payload) => {
          console.log("Earnings update received:", payload);
          // Refresh earnings data when a new earning is added
          fetchEarningsData(true);
        }
      )
      .subscribe();

    return () => {
      console.log("Removing earnings subscription");
      client.removeChannel(subscription);
    };
  }, [userId]);

  // Add debug info
  const debugInfo = {
    userId,
    lastError,
    earningsLoading,
    transactionsLoading,
    transactionsCount: transactions.length,
    hasMoreTransactions,
    autoRefresh,
    refreshInterval,
  };

  return {
    earnings,
    transactions,
    loading,
    error,
    hasMoreTransactions,
    loadMoreTransactions,
    refreshData,
    debug: debugInfo,
  };
}
