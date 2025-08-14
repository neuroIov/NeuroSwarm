import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";

interface UnclaimedRewardsResponse {
  unclaimed_reward: number;
}

interface ClaimRewardsResponse {
  success: boolean;
  message: string;
  data?: {
    claimed_amount: number;
    new_total_earnings: number;
  };
  error?: string;
}

interface EarningsResponse {
  total_earnings: number;
}

export const useSimpleEarnings = () => {
  const [unclaimedAmount, setUnclaimedAmount] = useState<number>(0);
  const [totalEarnings, setTotalEarnings] = useState<number>(0);
  const [isLoadingUnclaimed, setIsLoadingUnclaimed] = useState(false);
  const [isLoadingTotal, setIsLoadingTotal] = useState(false);
  const [isClaimingRewards, setIsClaimingRewards] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const { session } = useAuth();

  // Load unclaimed rewards from Supabase
  const loadUnclaimedRewards = useCallback(async () => {
    if (!session) return;
    
    setIsLoadingUnclaimed(true);
    setClaimError(null);
    
    try {
      const response = await fetch('/api/unclaimed-rewards', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error(`Failed to load unclaimed rewards: ${response.status}`);
      }
      
      const data: UnclaimedRewardsResponse = await response.json();
      setUnclaimedAmount(data.unclaimed_reward || 0);
    } catch (error) {
      console.error('Error loading unclaimed rewards:', error);
      setClaimError('Failed to load unclaimed rewards');
    } finally {
      setIsLoadingUnclaimed(false);
    }
  }, [session]);

  // Load total earnings from earnings_leaderboard
  const loadTotalEarnings = useCallback(async () => {
    if (!session) return;
    
    setIsLoadingTotal(true);
    
    try {
      // Try the main earnings endpoint first
      const response = await fetch('/api/earnings', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store'
      });
      
      if (!response.ok) {
        throw new Error(`Failed to load total earnings: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Earnings data received:', data);
      setTotalEarnings(data.totalEarnings || 0);
    } catch (error) {
      console.error('Error loading total earnings:', error);
      // Don't update state on error to keep previous value
    } finally {
      setIsLoadingTotal(false);
    }
  }, [session]);

  // Claim rewards function - calls the local API route
  const claimRewards = useCallback(async () => {
    if (!session) return;
    
    setIsClaimingRewards(true);
    setClaimError(null);
    
    try {
      const response = await fetch('/api/claim-rewards', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to claim rewards: ${response.status}`);
      }
      
      const data: ClaimRewardsResponse = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to claim rewards');
      }
      
      // Reset unclaimed amount and refresh total earnings
      setUnclaimedAmount(0);
      loadTotalEarnings();
      
      return data;
    } catch (error) {
      console.error('Error claiming rewards:', error);
      setClaimError(error instanceof Error ? error.message : 'Failed to claim rewards');
      throw error;
    } finally {
      setIsClaimingRewards(false);
    }
  }, [session, loadTotalEarnings]);

  // Load both unclaimed rewards and total earnings on mount and when session changes
  useEffect(() => {
    if (session) {
      loadUnclaimedRewards();
      loadTotalEarnings();
      
      // Set up periodic refresh of unclaimed rewards (every 60 seconds)
      const intervalId = setInterval(() => {
        loadUnclaimedRewards();
      }, 60000);
      
      return () => clearInterval(intervalId);
    }
  }, [session, loadUnclaimedRewards, loadTotalEarnings]);

  return {
    unclaimedAmount,
    totalEarnings,
    isLoadingUnclaimed,
    isLoadingTotal,
    isClaimingRewards,
    claimError,
    loadUnclaimedRewards,
    loadTotalEarnings,
    claimRewards
  };
};
