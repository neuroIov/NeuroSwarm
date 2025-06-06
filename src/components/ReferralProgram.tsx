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
  Check,
  X as CloseIcon,
  Link as LinkIcon,
} from "lucide-react";
import { InfoTooltip } from "./InfoTooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "@/store/store";
import {
  generateReferralCode,
  fetchUserReferrals,
  fetchReferralRewards,
  Referral,
  ReferralReward,
  verifyReferralCode,
  createReferralRelationship,
} from "@/store/slices/sessionSlice";
import { formatDistanceToNow } from "date-fns";
import { claimReferralReward } from "@/services/earningsService";
import { getSwarmSupabase } from "@/lib/supabase-client";
import { ReferralStatCard } from "./ReferralStatCard";
import { User as LucideUser } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { FaWhatsapp } from "react-icons/fa6";
import { FaSquareXTwitter } from "react-icons/fa6";
import { FaInstagram, FaTelegram } from "react-icons/fa6";

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

// Social Share Modal Component
const SocialShareModal = ({ isOpen, onClose, inviteLink, referralCode }) => {
  const [isCopied, setIsCopied] = useState(false);

  const socialPlatforms = [
    {
      name: "Telegram",
      icon: <FaTelegram className="w-6 h-6" />,
      color: "from-[#0088CC] to-[#0088CC]",
    },
    {
      name: "WhatsApp",
      icon: <FaWhatsapp className="w-6 h-6" />,
      color: "from-[#25D366] to-[#25D366]",
    },
    // {
    //   name: "Instagram",
    //   icon: <FaInstagram className="w-6 h-6" />,
    //   color: "from-[#833AB4] via-[#C13584] to-[#E1306C]",
    // },
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
    // Twitter message with emojis
    const twitterMessage = `🚀 NeuroSwarm Airdrop Confirmed!\nSecure your spot in the $NLOV Connect-to-Earn revolution 🌐\n💰 100M $NLOV tokens available\n📲 Connect your phone, laptop, or GPU — start earning in one click!\n🎯 Join before TGE\n🔗 ${inviteLink}`;

    // WhatsApp uses single asterisks for bold
    const whatsappMessage = `*NeuroSwarm Airdrop Confirmed!*\nSecure your spot in the $NLOV Connect-to-Earn revolution\n*100M $NLOV tokens available*\nConnect your phone, laptop, or GPU — start earning in one click!\nJoin before TGE\n${inviteLink}`;

    // Telegram - plain text works best through URL params
    const telegramMessage = `NeuroSwarm Airdrop Confirmed!\nSecure your spot in the $NLOV Connect-to-Earn revolution\n100M $NLOV tokens available\nConnect your phone, laptop, or GPU — start earning in one click!\nJoin before TGE\n${inviteLink}`;

    // Encode messages for sharing
    const encodedTwitterMessage = encodeURIComponent(twitterMessage);
    const encodedWhatsappMessage = encodeURIComponent(whatsappMessage);
    const encodedTelegramMessage = encodeURIComponent(telegramMessage);

    switch (platform) {
      case "Instagram":
        return `https://www.instagram.com/?url=${encodeURIComponent(
          inviteLink
        )}`;
      case "Telegram":
        return `https://t.me/share/url?url=${encodeURIComponent(
          inviteLink
        )}&text=${encodedTelegramMessage}`;
      case "WhatsApp":
        return `https://wa.me/?text=${encodedWhatsappMessage}`;
      case "Twitter":
        return `https://twitter.com/intent/tweet?text=${encodedTwitterMessage}`;
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
            <button
              className="absolute top-4 right-4 text-gray-300 hover:text-white"
              onClick={onClose}
            >
              <CloseIcon className="w-5 h-5" />
            </button>

            <div className="text-center mb-6">
              <Share2 className="mx-auto w-12 h-12 text-blue-400 mb-4" />
              <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-600 text-transparent bg-clip-text">
                Share Referral
              </h2>
            </div>

            {/* Larger, more prominent referral link */}
            <div className="mb-6 p-4 bg-gradient-to-r from-blue-900/30 to-purple-900/30 border border-blue-500/30 rounded-xl">
              <p className="text-gray-300 text-sm mb-2">Your Referral Link:</p>
              <div className="flex items-center justify-between bg-black/20 p-3 rounded-lg border border-blue-500/20">
                <input
                  type="text"
                  value={inviteLink}
                  readOnly
                  className="flex-1 bg-transparent text-white focus:outline-none text-sm overflow-x-auto whitespace-nowrap"
                />
                <motion.button
                  className={`ml-2 p-2 rounded-full ${
                    isCopied ? "bg-green-600/20" : "bg-blue-600/20"
                  }`}
                  onClick={copyToClipboard}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                >
                  {isCopied ? (
                    <Check className="w-5 h-5 text-green-400" />
                  ) : (
                    <Copy className="w-5 h-5 text-blue-400" />
                  )}
                </motion.button>
              </div>
            </div>

            <p className="text-gray-300 text-sm mb-3 text-center">Share via:</p>
            <div className="flex flex-row justify-center items-center gap-4 mb-2">
              {socialPlatforms.map((platform) => (
                <motion.button
                  key={platform.name}
                  className={`p-3 rounded-lg bg-gradient-to-br ${platform.color} text-white flex items-center justify-start w-20 h-12`}
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

  const [referralCode, setReferralCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [referralError, setReferralError] = useState("");

  const dispatch = useDispatch<AppDispatch>();
  const { userProfile, loading, referrals, referralRewards } = useSelector(
    (state: RootState) => state.session
  );

  const userReferralCode = userProfile?.referral_code || null;
  const referralLink = userReferralCode
    ? `${window.location.origin}/dashboard?ref=${userReferralCode}`
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

  // Function to extract referral code from a full URL
  const extractReferralCode = (input) => {
    // Check if input is a URL with ref parameter
    if (input.includes("?ref=")) {
      try {
        const url = new URL(input);
        const refCode = url.searchParams.get("ref");
        if (refCode) {
          return refCode;
        }
      } catch (e) {
        // If not a valid URL, try regex approach
        const match = input.match(/[?&]ref=([^&]+)/);
        if (match && match[1]) {
          return match[1];
        }
      }
    }
    // If no URL pattern found, return the original input
    return input;
  };

  // Auto-generate a referral code if user doesn't have one
  useEffect(() => {
    if (
      userProfile?.id &&
      !userProfile?.referral_code &&
      !isGenerating &&
      userProfile?.wallet_address
    ) {
      handleGenerateReferralCode();
    }
  }, [userProfile]);

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

    if (!userProfile?.wallet_address) {
      toast.error(
        "You need to connect a wallet first to generate a referral code"
      );
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

  // Added functions for referral code verification
  const handleVerifyReferralCode = async () => {
    if (!referralCode.trim()) {
      setReferralError("Please enter a referral code");
      return;
    }

    // Extract code if user pasted a full link
    const extractedCode = extractReferralCode(referralCode);

    setIsVerifying(true);

    try {
      const resultAction = await dispatch(verifyReferralCode(extractedCode));

      if (verifyReferralCode.fulfilled.match(resultAction)) {
        const { isValid, referrerId } = resultAction.payload as {
          isValid: boolean;
          referrerId: string;
        };

        if (isValid) {
          // Check if the referrer is the current user (can't refer yourself)
          if (referrerId === userProfile?.id) {
            setReferralError("You cannot use your own referral code");
            setIsVerified(false);
          } else {
            setIsVerified(true);
            toast.success("Referral code verified successfully");
          }
        } else {
          setReferralError("Invalid referral code");
        }
      } else {
        setReferralError("Failed to verify referral code");
      }
    } catch (error) {
      setReferralError("Error verifying referral code");
      console.error("Error verifying referral code:", error);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSubmitReferral = async () => {
    if (!isVerified || !referralCode || !userProfile?.id) {
      setReferralError("Please verify a valid referral code first");
      return;
    }

    // Extract code if user pasted a full link
    const extractedCode = extractReferralCode(referralCode);

    try {
      const resultAction = await dispatch(
        createReferralRelationship({
          referrerCode: extractedCode,
          referredId: userProfile.id,
        })
      );

      if (createReferralRelationship.fulfilled.match(resultAction)) {
        toast.success("Successfully joined referral program!");
        setReferralCode("");
        setIsVerified(false);
        // Refresh referral data after successful submission
        loadReferralData();
      } else {
        setReferralError("Failed to join referral program");
      }
    } catch (error) {
      setReferralError("Error joining referral program");
      console.error("Error submitting referral:", error);
    }
  };

  // Handle input change with automatic code extraction
  const handleReferralInputChange = (e) => {
    const inputValue = e.target.value;
    setReferralCode(inputValue);
    setReferralError("");
    setIsVerified(false);
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

  // Open social share in a popup window
  const openSocialShare = (shareUrl: string) => {
    window.open(shareUrl, "_blank", "width=600,height=400");
  };

  // Get sharing message for different platforms
  const getShareMessage = (platform: string) => {
    // Twitter message with emojis
    const twitterMessage = `🚀 NeuroSwarm Airdrop Confirmed!\nSecure your spot in the $NLOV Connect-to-Earn revolution 🌐\n💰 100M $NLOV tokens available\n📲 Connect your phone, laptop, or GPU — start earning in one click!\n🎯 Join before TGE\n🔗 ${referralLink}`;

    // WhatsApp uses single asterisks for bold
    const whatsappMessage = `*NeuroSwarm Airdrop Confirmed!*\nSecure your spot in the $NLOV Connect-to-Earn revolution\n*100M $NLOV tokens available*\nConnect your phone, laptop, or GPU — start earning in one click!\nJoin before TGE\n${referralLink}`;

    // Telegram - plain text works best through URL params
    const telegramMessage = `NeuroSwarm Airdrop Confirmed!\nSecure your spot in the $NLOV Connect-to-Earn revolution\n100M $NLOV tokens available\nConnect your phone, laptop, or GPU — start earning in one click!\nJoin before TGE\n${referralLink}`;

    // Encode messages for sharing
    const encodedTwitterMessage = encodeURIComponent(twitterMessage);
    const encodedWhatsappMessage = encodeURIComponent(whatsappMessage);
    const encodedTelegramMessage = encodeURIComponent(telegramMessage);

    switch (platform) {
      case "Instagram":
        return `https://www.instagram.com/?url=${encodeURIComponent(
          referralLink
        )}`;
      case "Telegram":
        return `https://t.me/share/url?url=${encodeURIComponent(
          referralLink
        )}&text=${encodedTelegramMessage}`;
      case "WhatsApp":
        return `https://wa.me/?text=${encodedWhatsappMessage}`;
      case "Twitter":
        return `https://twitter.com/intent/tweet?text=${encodedTwitterMessage}`;
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
          backgroundImage={"/images/flower_1.png"}
        />
        <ReferralStatCard
          label="Second Tier"
          value={tier2Referrals.length}
          icon={<LucideUser className="w-5 h-5 text-white" />}
          backgroundImage={"/images/flower_1.png"}
        />
        <ReferralStatCard
          label="Third Tier"
          value={tier3Referrals.length}
          icon={<LucideUser className="w-5 h-5 text-white" />}
          backgroundImage={"/images/flower_1.png"}
        />
        <ReferralStatCard
          label="Total Referral Rewards"
          value={`${totalReferralEarnings.toFixed(2)} SP`}
          backgroundImage={"/images/flower_2.png"}
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
        referralCode={userReferralCode}
      />

      {/* Claims and Pending Rewards Container */}
      <div className="bg-[radial-gradient(ellipse_at_top_left,#0361DA_0%,#090C18_54%)] p-3 sm:p-6 rounded-2xl border border-[#0361DA]/80">
        {/* Use Referral Code Section - Styled to match the theme */}
        <div className="mb-6">
          <div className="bg-gradient-to-r from-blue-600/10 to-purple-600/10 p-5 rounded-xl border border-blue-500/20">
            <div className="flex items-center gap-2 mb-4">
              <LinkIcon className="h-5 w-5 text-blue-400" />
              <h3 className="text-white font-medium">Use Referral Code</h3>
            </div>

            <p className="text-sm text-blue-300/80 mb-4">
              Enter a referral code to join the program and earn rewards. You
              can paste a referral link or code.
            </p>

            <div className="space-y-4">
              <div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                      <LinkIcon className="h-4 w-4 text-blue-400/60" />
                    </div>
                    <Input
                      value={referralCode}
                      onChange={handleReferralInputChange}
                      className="pl-10 py-6 bg-[#111827]/50 border-blue-500/20 focus:border-blue-400 text-white rounded-xl focus-visible:ring-blue-500/30 focus-visible:ring-offset-0"
                      placeholder="Enter referral code or link"
                    />
                  </div>
                  <Button
                    onClick={handleVerifyReferralCode}
                    className="bg-blue-600 hover:bg-blue-700 rounded-xl px-5"
                    disabled={isVerifying || !referralCode.trim()}
                  >
                    {isVerifying ? (
                      <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <CheckCircle className="w-4 h-4 mr-2" />
                    )}
                    <span>{isVerifying ? "Verifying..." : "Verify"}</span>
                  </Button>
                </div>
                {referralError && (
                  <p className="text-red-400 text-sm mt-2 flex items-center">
                    <AlertCircle className="w-3 h-3 mr-1" />
                    {referralError}
                  </p>
                )}
              </div>

              {isVerified && (
                <div className="mt-3 bg-blue-900/20 p-4 rounded-xl border border-blue-500/20">
                  <div className="flex items-center text-green-400 text-sm mb-3">
                    <CheckCircle className="h-4 w-4 mr-2" />
                    <span>
                      Referral code verified! Click below to join the referral
                      program.
                    </span>
                  </div>
                  <Button
                    onClick={handleSubmitReferral}
                    className="bg-blue-600 hover:bg-blue-700 w-full rounded-xl py-5"
                    disabled={loading}
                  >
                    {loading ? (
                      <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <ArrowRight className="w-4 h-4 mr-2" />
                    )}
                    <span>
                      {loading ? "Joining..." : "Join Referral Program"}
                    </span>
                  </Button>
                </div>
              )}
            </div>
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
    </div>
  );
};
