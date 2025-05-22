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
  Twitter,
  Check,
  X as CloseIcon,
  Facebook,
  Linkedin,
  Link as LinkIcon,
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
import { ReferralStatCard } from "./ReferralStatCard";
import { User as LucideUser } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { FaWhatsapp } from "react-icons/fa6";
import { FaSquareXTwitter } from "react-icons/fa6";

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

// Add these new components before the main return statement
const DailyRewardCard = ({
  day,
  points,
  isActive,
  isCompleted,
}: {
  day: number;
  points: number;
  isActive: boolean;
  isCompleted: boolean;
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
            {points} Points
          </div>
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

// Social Share Modal Component
const SocialShareModal = ({ isOpen, onClose, inviteLink, referralCode }) => {
  const [isCopied, setIsCopied] = useState(false);

  const socialPlatforms = [
    {
      name: "Facebook",
      icon: <Facebook className="w-6 h-6" />,
      color: "from-[#1877F2] to-[#1877F2]",
    },
    {
      name: "LinkedIn",
      icon: <Linkedin className="w-6 h-6" />,
      color: "from-[#0077B5] to-[#0077B5]",
    },
    {
      name: "WhatsApp",
      icon: <FaWhatsapp className="w-6 h-6" />,
      color: "from-[#25D366] to-[#25D366]",
    },
  ];

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setIsCopied(true);
      toast.success("Link copied!", { icon: "📋", duration: 2000 });
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      toast.error("Failed to copy link");
    }
  };

  const openSocialShare = (shareUrl) => {
    window.open(shareUrl, "_blank", "width=600,height=400");
  };

  const getShareMessage = (platform) => {
    const message = `Check out this new earning resource Neuro Swarm: ${inviteLink}`;
    const encodedMessage = encodeURIComponent(message);
    switch (platform) {
      case "Facebook":
        return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
          inviteLink
        )}&quote=${encodedMessage}`;
      case "LinkedIn":
        return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
          inviteLink
        )}&summary=${encodedMessage}`;
      case "WhatsApp":
        return `https://wa.me/?text=${encodedMessage}`;
      case "Twitter":
        return `https://twitter.com/intent/tweet?text=${encodedMessage}`;
      default:
        return inviteLink;
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="bg-gradient-to-br from-[#1a1a2e] to-[#16213e] rounded-2xl shadow-2xl w-96 p-8 relative overflow-hidden"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
          >
            <motion.button
              className="absolute top-4 right-4 text-gray-300 hover:text-white"
              onClick={onClose}
              whileHover={{ rotate: 90 }}
              whileTap={{ scale: 0.9 }}
            >
              <CloseIcon className="w-5 h-5" />
            </motion.button>

            <div className="text-center mb-6">
              <Share2 className="mx-auto w-12 h-12 text-blue-400 mb-4" />
              <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-600 text-transparent bg-clip-text">
                Share Referral
              </h2>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-6">
              {socialPlatforms.map((platform) => (
                <motion.button
                  key={platform.name}
                  className={`p-3 rounded-xl bg-gradient-to-br ${platform.color} text-white`}
                  onClick={() => {
                    const shareUrl = getShareMessage(platform.name);
                    openSocialShare(shareUrl);
                  }}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                >
                  {platform.icon}
                </motion.button>
              ))}
            </div>

            <div className="flex items-center justify-between">
              <input
                type="text"
                value={inviteLink}
                readOnly
                className="flex-1 bg-transparent text-sm text-white focus:outline-none"
              />
              <motion.button
                className={`ml-2 ${
                  isCopied ? "text-green-400" : "text-gray-300"
                }`}
                onClick={copyToClipboard}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
              >
                {isCopied ? "✓" : <Copy className="w-4 h-4" />}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export const ReferralProgram = () => {
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
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

  // Paths to images in public/images
  const flower1 = "/images/flower_1.png";
  const flower2 = "/images/flower_2.png";

  const openSocialShare = (shareUrl: string) => {
    window.open(shareUrl, "_blank", "width=600,height=400");
  };

  const getShareMessage = (platform: string) => {
    const message = `Check out this new earning resource Neuro Swarm: ${referralLink}`;
    const encodedMessage = encodeURIComponent(message);
    switch (platform) {
      case "Facebook":
        return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
          referralLink
        )}&quote=${encodedMessage}`;
      case "LinkedIn":
        return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
          referralLink
        )}&summary=${encodedMessage}`;
      case "WhatsApp":
        return `https://wa.me/?text=${encodedMessage}`;
      case "Twitter":
        return `https://twitter.com/intent/tweet?text=${encodedMessage}`;
      default:
        return referralLink;
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8 p-3 sm:p-6 rounded-3xl">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <ReferralStatCard
          label="First Tier"
          value={directReferrals}
          icon={<LucideUser className="w-5 h-5 text-white" />}
          backgroundImage={flower1}
        />
        <ReferralStatCard
          label="Second Tier"
          value={tier2Referrals.length}
          icon={<LucideUser className="w-5 h-5 text-white" />}
          backgroundImage={flower1}
        />
        <ReferralStatCard
          label="Third Tier"
          value={tier3Referrals.length}
          icon={<LucideUser className="w-5 h-5 text-white" />}
          backgroundImage={flower1}
        />
        <ReferralStatCard
          label="Total Referral Rewards"
          value={`${totalReferralEarnings.toFixed(2)} NLOV`}
          backgroundImage={flower2}
          highlight
        />
      </div>

      {/* Share and Tweet Buttons */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-6">
        <button
          className="gradient-button py-3 sm:py-4 flex items-center justify-center gap-2"
          onClick={() => setIsShareModalOpen(true)}
        >
          <Share2 className="w-4 h-4 sm:w-5 sm:h-5" />
          <span className="text-sm sm:text-base">Share Referral</span>
        </button>

        <button
          className="gradient-button py-3 sm:py-4 flex items-center justify-center gap-2"
          onClick={() => openSocialShare(getShareMessage("Twitter"))}
        >
          <FaSquareXTwitter className="w-4 h-4 sm:w-5 sm:h-5" />
          <span className="text-sm sm:text-base">Tweet Referral</span>
        </button>
      </div>

      <SocialShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        inviteLink={referralLink}
        referralCode={referralCode}
      />

      {/* Claims and Pending Rewards Container */}
      <div className="bg-[radial-gradient(ellipse_at_top_left,#0361DA_0%,#090C18_54%)] p-3 sm:p-6 rounded-2xl border border-[#0361DA]/80">
        {/* Referral Link Section */}
        <div className="mb-4 sm:mb-6">
          <h3 className="text-white font-medium text-sm sm:text-base mb-2">
            Your Referral Link
          </h3>
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <div className="flex-1 w-full bg-gradient-to-r from-blue-600/20 to-blue-400/5 rounded-full px-3 sm:px-4 py-2 sm:py-3 border border-blue-500/20">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                <input
                  type="text"
                  value={referralLink || "https://swarm.network/r/xxxxx"}
                  readOnly
                  className="bg-transparent text-white w-full outline-none text-xs sm:text-sm truncate"
                />
              </div>
            </div>
            <button
              onClick={
                referralCode
                  ? handleCopyReferralLink
                  : handleGenerateReferralCode
              }
              className="gradient-button bg-gradient-to-r from-blue-600 to-blue-500 text-white h-10 sm:h-11 w-full sm:w-28 rounded-full hover:shadow-[0_0_20px_rgba(59,130,246,0.3)] transition-all duration-300 flex items-center justify-center gap-2"
              disabled={isGenerating}
            >
              {isGenerating ? (
                <RefreshCw className="w-3 h-3 sm:w-4 sm:h-4 animate-spin" />
              ) : referralCode ? (
                <Copy className="w-3 h-3 sm:w-4 sm:h-4" />
              ) : (
                <Key className="w-3 h-3 sm:w-4 sm:h-4" />
              )}
              <span className="text-xs sm:text-sm font-medium">
                {isGenerating
                  ? "Generating..."
                  : referralCode
                  ? "Copy"
                  : "Generate"}
              </span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-6">
          <div className="bg-[#161628] rounded-2xl p-4 sm:p-6 hover:shadow-lg transition-all duration-300">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="icon-bg icon-container flex items-center justify-center rounded-md p-2">
                <img
                  src="/images/claimed_reward.png"
                  alt="Claimed"
                  className="w-6 h-6 sm:w-8 sm:h-8 relative z-10"
                />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-white font-medium text-sm sm:text-base">
                    Claimed Rewards
                  </h3>
                  <span className="text-green-400 font-bold text-sm sm:text-base">
                    {claimedRewards.toFixed(2)}
                  </span>
                </div>
                <p className="text-[#515194]/80 text-xs sm:text-sm mt-1">
                  Total earning from claimed referral rewards
                </p>
              </div>
            </div>
          </div>

          <div className="bg-[#161628] rounded-2xl p-4 sm:p-6 hover:shadow-lg transition-all duration-300">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="icon-bg icon-container flex items-center justify-center rounded-md p-2">
                <img
                  src="/images/pending_reward.png"
                  alt="Pending"
                  className="w-6 h-6 sm:w-8 sm:h-8 relative z-10"
                />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-white font-medium text-sm sm:text-base">
                    Pending Rewards
                  </h3>
                  <span className="text-amber-400 font-bold text-sm sm:text-base">
                    {pendingRewards.toFixed(2)}
                  </span>
                </div>
                <p className="text-[#515194]/80 text-xs sm:text-sm mt-1">
                  Available rewards ready to claim
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Referral Earnings Breakdown */}
        <div className="space-y-3 sm:space-y-4 mt-4 sm:mt-6">
          <h3 className="text-white font-medium text-sm sm:text-base">
            Referral Earnings Breakdown
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-6">
            <div className="bg-[#161628] rounded-2xl p-3 sm:p-6 hover:shadow-lg transition-all duration-300">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="icon-bg icon-container flex items-center justify-center rounded-md p-2">
                  <img
                    src="/images/referrals.png"
                    alt="Tier 1"
                    className="w-6 h-6 sm:w-8 sm:h-8 relative z-10"
                    style={{ objectFit: "contain" }}
                  />
                </div>
                <div>
                  <h4 className="text-white font-medium text-sm sm:text-base">
                    Tier 1
                  </h4>
                  <p className="text-blue-400 text-xs sm:text-sm">
                    Earn 10% from your direct referrals
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-[#161628] rounded-2xl p-3 sm:p-6 hover:shadow-lg transition-all duration-300">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="icon-bg icon-container flex items-center justify-center rounded-md p-2">
                  <img
                    src="/images/referrals.png"
                    alt="Tier 2"
                    className="w-6 h-6 sm:w-8 sm:h-8 relative z-10"
                    style={{ objectFit: "contain" }}
                  />
                </div>
                <div>
                  <h4 className="text-white font-medium text-sm sm:text-base">
                    Tier 2
                  </h4>
                  <p className="text-blue-400 text-xs sm:text-sm">
                    Earn 5% from their referrals
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-[#161628] rounded-2xl p-3 sm:p-6 hover:shadow-lg transition-all duration-300">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="icon-bg icon-container flex items-center justify-center rounded-md p-2">
                  <img
                    src="/images/referrals.png"
                    alt="Tier 3"
                    className="w-6 h-6 sm:w-8 sm:h-8 relative z-10"
                    style={{ objectFit: "contain" }}
                  />
                </div>
                <div>
                  <h4 className="text-white font-medium text-sm sm:text-base">
                    Tier 3
                  </h4>
                  <p className="text-blue-400 text-xs sm:text-sm">
                    Earn 2.5% from the next level
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Referrals and Rewards Lists */}
      <div className="bg-[radial-gradient(ellipse_at_top_left,#0361DA_0%,#090C18_54%)] p-3 sm:p-6 rounded-2xl border border-[#0361DA]/80">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-6">
          <div className="bg-[#161628] rounded-2xl p-3 sm:p-6">
            <div className="flex items-center justify-between mb-2 sm:mb-3">
              <h3 className="text-white font-medium text-sm sm:text-base">
                Direct Referrals (Tier 1)
              </h3>
              <span className="text-[#515194]/80 text-xs sm:text-sm">
                {directReferrals} total
              </span>
            </div>

            {isLoading ? (
              <div className="flex justify-center items-center py-6">
                <RefreshCw className="w-6 h-6 text-blue-400 animate-spin" />
              </div>
            ) : tier1Referrals && tier1Referrals.length > 0 ? (
              <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                {tier1Referrals.map(renderReferralItem)}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-6 bg-[#090C18]/50 rounded-lg text-center">
                <Share2 className="w-8 h-8 text-[#515194] mb-2" />
                <div className="text-sm text-[#515194]/80">
                  No direct referrals yet. Share your link to start earning!
                </div>
              </div>
            )}
          </div>

          <div className="bg-[#161628] rounded-2xl p-3 sm:p-6">
            <div className="flex items-center justify-between mb-2 sm:mb-3">
              <h3 className="text-white font-medium text-sm sm:text-base">
                Recent Rewards
              </h3>
              <span className="text-[#515194]/80 text-xs sm:text-sm">
                {referralRewards.length} total
              </span>
            </div>

            {isLoading ? (
              <div className="flex justify-center items-center py-6">
                <RefreshCw className="w-6 h-6 text-blue-400 animate-spin" />
              </div>
            ) : referralRewards && referralRewards.length > 0 ? (
              <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                {referralRewards.map((reward) => (
                  <RewardItem
                    key={reward.id}
                    reward={reward}
                    userProfile={userProfile}
                    onRefresh={loadReferralData}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-6 bg-[#090C18]/50 rounded-lg text-center">
                <DollarSign className="w-8 h-8 text-[#515194] mb-2" />
                <div className="text-sm text-[#515194]/80">
                  No rewards yet. Invite friends to earn passive income!
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Daily Rewards Section */}
      <div className="bg-[radial-gradient(ellipse_at_top_left,#0361DA_0%,#090C18_54%)] p-3 sm:p-6 rounded-2xl border border-[#0361DA]/80">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0 mb-4 sm:mb-6">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400" />
            <h2 className="text-white text-base sm:text-lg font-medium">
              Daily Rewards
            </h2>
          </div>
          <button className="gradient-button bg-gradient-to-r from-blue-600 to-blue-400 text-white w-full sm:w-auto px-4 sm:px-6 py-2 rounded-full hover:shadow-[0_0_20px_rgba(59,130,246,0.3)] transition-all duration-300">
            Check In
          </button>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-7 gap-2 sm:gap-4">
          <DailyRewardCard
            day={1}
            points={10}
            isActive={true}
            isCompleted={false}
          />
          <DailyRewardCard
            day={2}
            points={20}
            isActive={false}
            isCompleted={false}
          />
          <DailyRewardCard
            day={3}
            points={30}
            isActive={false}
            isCompleted={false}
          />
          <DailyRewardCard
            day={4}
            points={40}
            isActive={false}
            isCompleted={false}
          />
          <DailyRewardCard
            day={5}
            points={50}
            isActive={false}
            isCompleted={false}
          />
          <DailyRewardCard
            day={6}
            points={60}
            isActive={false}
            isCompleted={false}
          />
          <DailyRewardCard
            day={7}
            points={70}
            isActive={false}
            isCompleted={false}
          />
        </div>
      </div>
    </div>
  );
};
