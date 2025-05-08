import React, { useState, useEffect } from "react";
import {
  Copy,
  Users,
  CheckCircle,
  User,
  Key,
  Clock,
  DollarSign,
  ArrowRight,
  RefreshCw,
  AlertCircle,
  Share2,
} from "lucide-react";
import { InfoTooltip } from "./InfoTooltip";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "@/store/store";
import {
  generateReferralCode,
  fetchUserReferrals,
  fetchReferralRewards,
  Referral,
  ReferralReward,
} from "@/store/slices/sessionSlice";
import { formatDistanceToNow } from "date-fns";
import { claimReferralReward } from "@/services/earningsService";
import { getSwarmSupabase } from "@/lib/supabase-client";

// Separate component for reward item to use state
const RewardItem = ({
  reward,
  userProfile,
  onRefresh,
}: {
  reward: ReferralReward;
  userProfile: { id: string; referral_code?: string } | null;
  onRefresh: () => void;
}) => {
  const [isClaiming, setIsClaiming] = useState(false);

  const username =
    reward.referral?.user_profile?.user_name ||
    reward.referral?.referred_name ||
    `User ${reward.referral?.referred_id.substring(0, 6)}...`;

  const handleClaimReward = async () => {
    if (!userProfile?.id) {
      toast.error("You need to be logged in to claim rewards");
      return;
    }

    try {
      setIsClaiming(true);
      const result = await claimReferralReward(userProfile.id, reward.id);

      if (result.success) {
        toast.success("Reward claimed successfully!");
        onRefresh(); // Call the refresh function passed from parent
      } else {
        toast.error(
          `Failed to claim reward: ${result.message || "Unknown error"}`
        );
      }
    } catch (err) {
      console.error("Error claiming reward:", err);
      toast.error("An error occurred while claiming the reward");
    } finally {
      setIsClaiming(false);
    }
  };

  // Only show claim button for unclaimed rewards
  const showClaimButton = !reward.claimed && reward.reward_amount > 0;

  // Format reward type for display
  const formatRewardType = (type: string) => {
    switch (type) {
      case "signup":
        return "Sign-up Bonus";
      case "task_completion":
        return "Task Completion";
      case "others":
        return "Other Reward";
      default:
        return type;
    }
  };

  return (
    <div
      key={reward.id}
      className="flex justify-between items-center p-3 bg-slate-800/50 rounded-lg"
    >
      <div className="flex items-center gap-2">
        <DollarSign className="w-4 h-4 text-green-400" />
        <div>
          <div className="font-medium">
            {formatRewardType(reward.reward_type)}{" "}
            <span className="text-xs">from {username}</span>
          </div>
          <div className="text-xs text-slate-400">
            {formatDistanceToNow(new Date(reward.reward_timestamp), {
              addSuffix: true,
            })}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="text-green-400 font-medium">
          +{reward.reward_amount.toFixed(2)}
        </div>
        {showClaimButton && (
          <Button
            variant="outline"
            size="sm"
            className="ml-2 bg-green-600 hover:bg-green-700 text-white border-0"
            onClick={handleClaimReward}
            disabled={isClaiming}
          >
            {isClaiming ? (
              <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
            ) : (
              <CheckCircle className="w-3 h-3 mr-1" />
            )}
            <span>{isClaiming ? "Claiming..." : "Claim"}</span>
          </Button>
        )}
        {reward.claimed && (
          <span className="text-xs bg-slate-700 px-2 py-1 rounded text-slate-400">
            Claimed
          </span>
        )}
      </div>
    </div>
  );
};

export const ReferralProgram = () => {
  const [copySuccess, setCopySuccess] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [totalReferralEarnings, setTotalReferralEarnings] = useState(0);
  const [claimedRewards, setClaimedRewards] = useState(0);
  const [pendingRewards, setPendingRewards] = useState(0);

  const dispatch = useDispatch<AppDispatch>();
  const { userProfile, loading, referrals, referralRewards } = useSelector(
    (state: RootState) => state.session
  );

  const referralCode = userProfile?.referral_code || null;
  const referralLink = referralCode
    ? `http://localhost:8080/dashboard?ref=${referralCode}`
    : null;

  // Filter referrals by tier
  const tier1Referrals =
    referrals?.filter((ref) => ref.tier_level === "tier_1") || [];
  const tier2Referrals =
    referrals?.filter((ref) => ref.tier_level === "tier_2") || [];
  const tier3Referrals =
    referrals?.filter((ref) => ref.tier_level === "tier_3") || [];

  // Calculate totals
  const directReferrals = tier1Referrals.length;
  const indirectReferrals = tier2Referrals.length + tier3Referrals.length;

  // Calculate total pending rewards from referral_rewards table
  const pendingReferralRewards =
    referralRewards?.reduce(
      (total, reward) =>
        total +
        (!reward.claimed && reward.reward_amount > 0
          ? Number(reward.reward_amount)
          : 0),
      0
    ) || 0;

  // Function to fetch claimed referral earnings from the earnings table
  const fetchReferralEarnings = async (userWalletAddress: string) => {
    if (!userWalletAddress) {
      console.error("Cannot fetch referral earnings without wallet address");
      return;
    }

    try {
      const client = getSwarmSupabase();

      // Get total referral earnings where task_id is null and type is referral
      const { data: earnings, error } = await client
        .from("earnings")
        .select("amount")
        .eq("user_address", userWalletAddress)
        .eq("earning_type", "referral")
        .is("task_id", null);

      if (error) {
        console.error("Error fetching referral earnings:", error);
        return;
      }

      // Calculate total earnings
      const totalEarnings = earnings.reduce(
        (sum, record) => sum + Number(record.amount),
        0
      );
      setClaimedRewards(totalEarnings);
      setTotalReferralEarnings(totalEarnings + pendingReferralRewards);
      setPendingRewards(pendingReferralRewards);

      console.log(
        `Fetched referral earnings: Claimed=${totalEarnings}, Pending=${pendingReferralRewards}, Total=${
          totalEarnings + pendingReferralRewards
        }`
      );
    } catch (error) {
      console.error("Error in fetchReferralEarnings:", error);
    }
  };

  // Load referral data when component mounts or when userProfile changes
  useEffect(() => {
    if (userProfile?.id) {
      loadReferralData();
    }
  }, [userProfile?.id]);

  // Fetch referral earnings whenever referralRewards change
  useEffect(() => {
    if (userProfile?.wallet_address) {
      fetchReferralEarnings(userProfile.wallet_address);
    }
  }, [referralRewards, userProfile?.wallet_address]);

  const loadReferralData = async () => {
    if (!userProfile?.id) return;

    try {
      setIsLoading(true);
      await Promise.all([
        dispatch(fetchUserReferrals(userProfile.id)).unwrap(),
        dispatch(fetchReferralRewards(userProfile.id)).unwrap(),
      ]);
    } catch (err) {
      console.error("Failed to load referral data:", err);
      toast.error("Failed to load referral data");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = () => {
    loadReferralData();
    toast.success("Refreshing referral data...");
  };

  const handleGenerateReferralCode = async () => {
    if (!userProfile?.id) {
      toast.error("You need to be logged in to generate a referral code");
      return;
    }

    try {
      setIsGenerating(true);
      await dispatch(generateReferralCode(userProfile?.id)).unwrap();
      toast.success("Referral code generated successfully!");
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error occurred";
      toast.error(`Failed to generate referral code: ${errorMessage}`);
      console.error("Failed to generate referral code:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyReferralLink = () => {
    if (!referralLink) {
      toast.error("Please generate a referral code first");
      return;
    }

    // Copy to clipboard
    navigator.clipboard
      .writeText(referralLink)
      .then(() => {
        setCopySuccess(true);
        toast.success("Referral link copied to clipboard!");

        // Reset after 3 seconds
        setTimeout(() => setCopySuccess(false), 3000);
      })
      .catch((err) => {
        toast.error("Failed to copy referral link");
        console.error("Failed to copy: ", err);
      });
  };

  // Format reward type for display
  const formatRewardType = (type: string) => {
    switch (type) {
      case "signup":
        return "Sign-up Bonus";
      case "task_completion":
        return "Task Completion";
      case "others":
        return "Other Reward";
      default:
        return type;
    }
  };

  // Render a single referral item
  const renderReferralItem = (referral: Referral) => {
    return (
      <div
        key={referral.id}
        className="flex justify-between items-center p-3 bg-slate-800/50 rounded-lg"
      >
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-blue-400" />
          <div>
            <div className="font-medium">
              {referral.user_profile?.user_name ||
                referral.referred_name ||
                `User ${referral.referred_id.substring(0, 6)}...`}
            </div>
            <div className="text-xs text-slate-400">
              Joined{" "}
              {formatDistanceToNow(new Date(referral.referred_at), {
                addSuffix: true,
              })}
            </div>
          </div>
        </div>
        <div className="text-xs bg-slate-700 px-2 py-1 rounded">
          {referral.user_profile?.wallet_address
            ? `${referral.user_profile.wallet_address.substring(
                0,
                6
              )}...${referral.user_profile.wallet_address.substring(
                referral.user_profile.wallet_address.length - 4
              )}`
            : "Address unknown"}
        </div>
      </div>
    );
  };

  return (
    <div className="stat-card">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold">Referral Program</h2>
          <InfoTooltip content="Invite friends to join Swarm Network and earn a percentage of their rewards" />
        </div>

        <Button
          variant="outline"
          size="sm"
          className="text-slate-300 border-slate-700"
          onClick={handleRefresh}
          disabled={isLoading}
        >
          <RefreshCw
            className={`w-4 h-4 mr-1 ${isLoading ? "animate-spin" : ""}`}
          />
          <span>Refresh</span>
        </Button>
      </div>

      {/* Referral Earnings Breakdown */}
      <div className="bg-slate-800/30 p-4 rounded-lg mb-6">
        <h3 className="text-md font-semibold mb-3">
          Referral Earnings Breakdown:
        </h3>
        <ul className="space-y-2">
          <li className="flex items-start">
            <span className="font-bold mr-2">•</span>
            <div>
              <span className="font-medium">Tier 1:</span> Earn{" "}
              <span className="text-blue-400 font-bold">10%</span> from your
              direct referrals
            </div>
          </li>
          <li className="flex items-start">
            <span className="font-bold mr-2">•</span>
            <div>
              <span className="font-medium">Tier 2:</span> Earn{" "}
              <span className="text-blue-400 font-bold">5%</span> from their
              referrals
            </div>
          </li>
          <li className="flex items-start">
            <span className="font-bold mr-2">•</span>
            <div>
              <span className="font-medium">Tier 3:</span> Earn{" "}
              <span className="text-blue-400 font-bold">2.5%</span> from the
              next level
            </div>
          </li>
        </ul>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="flex flex-col items-center p-4 bg-slate-800/30 rounded-lg">
          <div className="flex items-center gap-2 mb-1">
            <User className="w-5 h-5 text-blue-400" />
            <span className="text-xl font-bold">{directReferrals}</span>
          </div>
          <div className="text-sm text-slate-400">Direct Referrals</div>
        </div>

        <div className="flex flex-col items-center p-4 bg-slate-800/30 rounded-lg">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-5 h-5 text-indigo-400" />
            <span className="text-xl font-bold">{indirectReferrals}</span>
          </div>
          <div className="text-sm text-slate-400">Indirect Referrals</div>
        </div>

        <div className="flex flex-col items-center p-4 bg-slate-800/30 rounded-lg">
          <div className="text-xl font-bold">
            {totalReferralEarnings.toFixed(2)}
          </div>
          <div className="text-sm text-slate-400">Total Rewards</div>
        </div>
      </div>

      {/* Rewards Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="flex flex-col p-4 bg-slate-800/30 rounded-lg">
          <div className="flex justify-between items-center mb-2">
            <div className="text-sm font-medium text-slate-300">
              Claimed Rewards
            </div>
            <div className="text-green-400 font-medium">
              {claimedRewards.toFixed(2)}
            </div>
          </div>
          <div className="text-xs text-slate-500">
            Total earnings from claimed referral rewards
          </div>
        </div>

        <div className="flex flex-col p-4 bg-slate-800/30 rounded-lg">
          <div className="flex justify-between items-center mb-2">
            <div className="text-sm font-medium text-slate-300">
              Pending Rewards
            </div>
            <div className="text-amber-400 font-medium">
              {pendingRewards.toFixed(2)}
            </div>
          </div>
          <div className="text-xs text-slate-500">
            Available rewards ready to claim
          </div>
        </div>
      </div>

      <div className="mb-6">
        <div className="text-sm text-slate-300 mb-2">Your Referral Link</div>
        <div className="flex gap-2">
          <div className="flex-1 bg-slate-800 rounded-lg py-2 px-3 text-slate-400 border border-slate-700">
            {referralLink || "Generate a referral code to get your unique link"}
          </div>
          <Button
            className={`${
              copySuccess
                ? "bg-green-600 hover:bg-green-700"
                : "bg-swarm-accent-blue hover:bg-swarm-accent-blue/90"
            }`}
            onClick={handleCopyReferralLink}
            disabled={!referralLink}
          >
            {copySuccess ? (
              <>
                <CheckCircle className="w-4 h-4 mr-1" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 mr-1" />
                <span>Copy</span>
              </>
            )}
          </Button>
        </div>
        {!referralCode && (
          <div className="mt-3">
            <Button
              className="bg-swarm-accent-blue hover:bg-swarm-accent-blue/90"
              onClick={handleGenerateReferralCode}
              disabled={loading || isGenerating || !userProfile?.id}
            >
              <Key className="w-4 h-4 mr-1" />
              <span>
                {isGenerating ? "Generating..." : "Generate Referral Code"}
              </span>
            </Button>
            {!userProfile?.id && (
              <div className="text-xs text-amber-400 mt-1">
                You need to connect your wallet to generate a referral code
              </div>
            )}
          </div>
        )}
        <div className="text-sm text-slate-400 mt-2">
          Share this link to earn 10% of your direct referrals' earnings, 5%
          from their referrals, and 2.5% from the next level!
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-slate-300">
              Direct Referrals (Tier 1)
            </h3>
            <span className="text-xs text-slate-400">
              {directReferrals} total
            </span>
          </div>

          {isLoading ? (
            <div className="flex justify-center items-center py-6">
              <RefreshCw className="w-6 h-6 text-blue-400 animate-spin" />
            </div>
          ) : tier1Referrals && tier1Referrals.length > 0 ? (
            <div className="space-y-2">
              {tier1Referrals.slice(0, 3).map(renderReferralItem)}

              {tier1Referrals.length > 3 && (
                <div className="flex justify-center mt-2">
                  <Button variant="link" className="text-blue-400 text-xs">
                    View all direct referrals{" "}
                    <ArrowRight className="w-3 h-3 ml-1" />
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-6 bg-slate-800/30 rounded-lg text-center">
              <Share2 className="w-8 h-8 text-slate-600 mb-2" />
              <div className="text-sm text-slate-400">
                No direct referrals yet. Share your link to start earning!
              </div>
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-slate-300">
              Recent Rewards
            </h3>
            <span className="text-xs text-slate-400">
              {referralRewards.length} total
            </span>
          </div>

          {isLoading ? (
            <div className="flex justify-center items-center py-6">
              <RefreshCw className="w-6 h-6 text-blue-400 animate-spin" />
            </div>
          ) : referralRewards && referralRewards.length > 0 ? (
            <div className="space-y-2">
              {referralRewards.slice(0, 3).map((reward) => (
                <RewardItem
                  key={reward.id}
                  reward={reward}
                  userProfile={userProfile}
                  onRefresh={loadReferralData}
                />
              ))}

              {referralRewards.length > 3 && (
                <div className="flex justify-center mt-2">
                  <Button variant="link" className="text-blue-400 text-xs">
                    View all rewards <ArrowRight className="w-3 h-3 ml-1" />
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-6 bg-slate-800/30 rounded-lg text-center">
              <DollarSign className="w-8 h-8 text-slate-600 mb-2" />
              <div className="text-sm text-slate-400">
                No rewards yet. Invite friends to earn passive income!
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Indirect Referrals Section */}
      {indirectReferrals > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-slate-300">
              Indirect Referrals Network
            </h3>
            <span className="text-xs text-slate-400">
              {indirectReferrals} total
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-800/30 p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <div className="bg-blue-900/30 p-1 rounded">
                  <Users className="w-4 h-4 text-blue-400" />
                </div>
                <h4 className="text-sm font-medium">Tier 2 Referrals</h4>
                <span className="text-xs text-slate-400 ml-auto">
                  {tier2Referrals.length} total
                </span>
              </div>

              {tier2Referrals.length > 0 ? (
                <div className="text-xs text-slate-300">
                  You earn 5% from these referrals' activities
                </div>
              ) : (
                <div className="text-xs text-slate-400 italic">
                  No tier 2 referrals yet
                </div>
              )}
            </div>

            <div className="bg-slate-800/30 p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <div className="bg-indigo-900/30 p-1 rounded">
                  <Users className="w-4 h-4 text-indigo-400" />
                </div>
                <h4 className="text-sm font-medium">Tier 3 Referrals</h4>
                <span className="text-xs text-slate-400 ml-auto">
                  {tier3Referrals.length} total
                </span>
              </div>

              {tier3Referrals.length > 0 ? (
                <div className="text-xs text-slate-300">
                  You earn 2.5% from these referrals' activities
                </div>
              ) : (
                <div className="text-xs text-slate-400 italic">
                  No tier 3 referrals yet
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
