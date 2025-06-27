import React, { useState, useEffect, useRef } from "react";
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
  Lock,
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

// Extract referral code from a URL or plain text
const extractReferralCode = (input: string): string => {
  // If the input appears to be a URL with query parameters
  if (input.includes('?ref=')) {
    try {
      // Try to extract the ref parameter from a URL
      const url = new URL(input);
      const code = url.searchParams.get('ref');
      return code || input; // Return the code if found, otherwise the original input
    } catch (e) {
      // If URL parsing fails, try a more basic extraction
      const refIndex = input.indexOf('?ref=');
      if (refIndex !== -1) {
        return input.substring(refIndex + 5); // Extract everything after "?ref="
      }
    }
  }
  // If no URL detected or extraction failed, return the original input
  return input.trim();
};

// Separate component for reward item to use state
const RewardItem = ({
  reward,
  userProfile,
  onRefresh,
  onRewardClaimed,
}: {
  reward: ReferralReward;
  userProfile: { id: string; referral_code?: string } | null;
  onRefresh: () => void;
  onRewardClaimed: (amount: number) => void;
}) => {
  const [isClaiming, setIsClaiming] = useState(false);
  const [isClaimedLocally, setIsClaimedLocally] = useState(reward.claimed);
  const [rewardAmount, setRewardAmount] = useState(reward.reward_amount);

  // Reset claimed state if the reward changes
  useEffect(() => {
    setIsClaimedLocally(reward.claimed);
    setRewardAmount(reward.reward_amount);
  }, [reward.claimed, reward.reward_amount, reward.id]);

  // Format username - remove wallet part
  const displayUsername = () => {
    let name = reward.referral?.user_profile?.user_name || 
               reward.referral?.referred_name || 
               `User ${reward.referral?.referred_id.substring(0, 6)}...`;
    
    // Remove wallet type information if present
    if (name.includes("[wallet_type")) {
      name = name.split("[")[0].trim();
    }
    
    return name;
  };

  const username = displayUsername();

  const handleClaimReward = async () => {
    if (!userProfile?.id) {
      toast.error("You need to be logged in to claim rewards");
      return;
    }

    try {
      setIsClaiming(true);
      // Store the reward amount before claiming in case backend is slow to update
      const amountToAdd = rewardAmount;
      console.log(`Claiming reward ${reward.id} with amount ${amountToAdd}`);
      
      // Update local state IMMEDIATELY before network request
      setIsClaimedLocally(true);
      setRewardAmount(0); // Reset amount since it's claimed
      
      // Immediately notify parent to update totals
      onRewardClaimed(amountToAdd);
      
      // Now make the actual API call
      const result = await claimReferralReward(userProfile.id, reward.id);

      if (result.success) {
        console.log(`Successfully claimed reward ${reward.id}, refreshing data...`);
        toast.success("Reward claimed successfully!");
      } else {
        console.error(`Failed to claim reward: ${result.message}`);
        toast.error(
          `Failed to claim reward: ${result.message || "Unknown error"}`
        );
        
        // Revert the UI changes if the API call failed
        setIsClaimedLocally(false);
        setRewardAmount(amountToAdd);
        
        // Also notify parent to revert the changes
        onRewardClaimed(-amountToAdd);
      }
    } catch (err) {
      console.error("Error claiming reward:", err);
      toast.error("An error occurred while claiming the reward");
      
      // Revert UI changes on error
      setIsClaimedLocally(false);
      const originalAmount = reward.reward_amount;
      setRewardAmount(originalAmount);
      
      // Also revert parent state changes
      onRewardClaimed(-rewardAmount);
    } finally {
      setIsClaiming(false);
      // Then refresh all data after a short delay to ensure DB updates are complete
      setTimeout(() => {
        onRefresh();
      }, 500);
    }
  };

  // Only show claim button for unclaimed rewards
  const showClaimButton = !isClaimedLocally && rewardAmount > 0;

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
          +{rewardAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
        {isClaimedLocally && (
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
  const [currentInviteLink, setCurrentInviteLink] = useState(inviteLink);
  
  // Update current invite link when props change
  useEffect(() => {
    if (inviteLink) {
      setCurrentInviteLink(inviteLink);
    }
  }, [inviteLink]);

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
    if (!currentInviteLink) {
      toast.error("No referral link available");
      return;
    }
    
    try {
      await navigator.clipboard.writeText(currentInviteLink);
      setIsCopied(true);
      toast.success("Link copied!", { icon: "📋", duration: 2000 });
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      toast.error("Failed to copy link");
      console.error("Failed to copy link:", err);
    }
  };

  const openSocialShare = (shareUrl) => {
    if (!shareUrl) {
      toast.error("No share URL available");
      return;
    }
    window.open(shareUrl, "_blank", "width=600,height=400");
  };

  const getShareMessage = (platform) => {
    if (!currentInviteLink) {
      toast.error("No referral link available to share");
      return null;
    }
    
    // Twitter message with emojis
    const twitterMessage = `🚀 NeuroSwarm Airdrop Confirmed!\nSecure your spot in the $NLOV Connect-to-Earn revolution 🌐\n💰 100M $NLOV tokens available\n📲 Connect your phone, laptop, or GPU — start earning in one click!\n🎯 Join before TGE\n🔗 ${currentInviteLink}`;

    // WhatsApp uses single asterisks for bold
    const whatsappMessage = `*NeuroSwarm Airdrop Confirmed!*\nSecure your spot in the $NLOV Connect-to-Earn revolution\n*100M $NLOV tokens available*\nConnect your phone, laptop, or GPU — start earning in one click!\nJoin before TGE\n${currentInviteLink}`;

    // Telegram - plain text works best through URL params
    const telegramMessage = `NeuroSwarm Airdrop Confirmed!\nSecure your spot in the $NLOV Connect-to-Earn revolution\n100M $NLOV tokens available\nConnect your phone, laptop, or GPU — start earning in one click!\nJoin before TGE\n${currentInviteLink}`;

    // Encode messages for sharing
    const encodedTwitterMessage = encodeURIComponent(twitterMessage);
    const encodedWhatsappMessage = encodeURIComponent(whatsappMessage);
    const encodedTelegramMessage = encodeURIComponent(telegramMessage);

    switch (platform) {
      case "Instagram":
        return `https://www.instagram.com/?url=${encodeURIComponent(
          currentInviteLink
        )}`;
      case "Telegram":
        return `https://t.me/share/url?url=${encodeURIComponent(
          currentInviteLink
        )}&text=${encodedTelegramMessage}`;
      case "WhatsApp":
        return `https://wa.me/?text=${encodedWhatsappMessage}`;
      case "Twitter":
        return `https://twitter.com/intent/tweet?text=${encodedTwitterMessage}`;
      default:
        return currentInviteLink;
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
            {/* How Referrals Work Section */}
            <div className="mb-6 p-4 bg-gradient-to-r from-blue-900/20 to-purple-900/20 border border-blue-500/20 rounded-xl mt-4">
              <p className="text-blue-300 text-sm font-medium mb-2">How Referrals Work:</p>
              <ul className="text-gray-300 text-xs space-y-2">
                <li className="flex items-start">
                  <span className="mr-2">•</span>
                  <span>You get <span className="text-green-400 font-medium">250 SP</span> for each successful referral</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2">•</span>
                  <span>Your friend gets <span className="text-green-400 font-medium">500 SP</span> when they join with your link</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2">•</span>
                  <span>Limited-time promotional period - invite now!</span>
                </li>
              </ul>
            </div>


            {/* Larger, more prominent referral link */}
            <div className="mb-6 p-4 bg-gradient-to-r from-blue-900/30 to-purple-900/30 border border-blue-500/30 rounded-xl">
              <p className="text-gray-300 text-sm mb-2">Your Referral Link:</p>
              <div className="flex items-center justify-between bg-black/20 p-3 rounded-lg border border-blue-500/20">
                <input
                  type="text"
                  value={currentInviteLink || "No referral link available"}
                  readOnly
                  className="flex-1 bg-transparent text-white focus:outline-none text-sm overflow-x-auto whitespace-nowrap"
                />
                <motion.button
                  className={`ml-2 p-2 rounded-full ${
                    isCopied ? "bg-green-600/20" : "bg-blue-600/20"
                  }`}
                  onClick={copyToClipboard}
                  disabled={!currentInviteLink}
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
                    if (shareUrl) {
                      openSocialShare(shareUrl);
                    }
                  }}
                  disabled={!currentInviteLink}
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

// Thank You Dialog Component - Updated for manual process
const ThankYouDialog = ({ isOpen, onClose, referralCode }) => {
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
              <CheckCircle className="mx-auto w-12 h-12 text-green-400 mb-4" />
              <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-600 text-transparent bg-clip-text">
                Welcome to NeuroSwarm!
              </h2>
            </div>

            <div className="text-center mb-6">
              <p className="text-gray-300 mb-2">
                Thank you for joining the referral program!
              </p>
              <p className="text-gray-400 text-sm">
                You can now start referring others and earning rewards.
              </p>
            </div>

            <Button
              onClick={onClose}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-xl"
            >
              Start Earning
            </Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// Error Dialog Component
const ErrorDialog = ({ isOpen, onClose, message }) => {
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
              <AlertCircle className="mx-auto w-12 h-12 text-red-400 mb-4" />
              <h2 className="text-2xl font-bold bg-gradient-to-r from-red-400 to-purple-600 text-transparent bg-clip-text">
                Referral Error
              </h2>
            </div>

            <div className="text-center mb-6">
              <p className="text-gray-300 mb-2">
                {message || "You cannot be referred multiple times."}
              </p>
            </div>

            <Button
              onClick={onClose}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-xl"
            >
              Got It
            </Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// Sign In Required Dialog Component
const SignInRequiredDialog = ({ isOpen, onClose }) => {
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
              <Lock className="mx-auto w-12 h-12 text-blue-400 mb-4" />
              <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-600 text-transparent bg-clip-text">
                Sign In Required
              </h2>
            </div>

            <div className="text-center mb-6">
              <p className="text-gray-300 mb-2">
                Please sign in or sign up to join the referral program and start earning rewards.
              </p>
            </div>

            
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// Add this new component after the other dialog components
const RewardDialog = ({ isOpen, onClose }) => {
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
              <DollarSign className="mx-auto w-12 h-12 text-green-400 mb-4" />
              <h2 className="text-2xl font-bold bg-gradient-to-r from-green-400 to-blue-600 text-transparent bg-clip-text">
                Congratulations!
              </h2>
            </div>

            <div className="text-center mb-6">
              <p className="text-gray-300 mb-2">
                You've received 500 SP for joining the referral program!
              </p>
              <p className="text-gray-400 text-sm">
                Start inviting friends to earn more rewards.
              </p>
            </div>

            <Button
              onClick={onClose}
              className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded-xl"
            >
              Start Earning
            </Button>
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
  // Add state for automatic fading animation
  const [fadeAnimation, setFadeAnimation] = useState(false);
  const [isLoadingEarnings, setIsLoadingEarnings] = useState(false);
  const [dataReady, setDataReady] = useState(false);

  const [referralCode, setReferralCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [referralError, setReferralError] = useState("");
  
  // New state for dialogs - Remove unnecessary states
  const [showThankYouDialog, setShowThankYouDialog] = useState(false);
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [showSignInRequiredDialog, setShowSignInRequiredDialog] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showRewardDialog, setShowRewardDialog] = useState(false);

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
    
  // Sort referrals by joined date (newest first)
  tier1Referrals.sort((a, b) => new Date(b.referred_at).getTime() - new Date(a.referred_at).getTime());
  tier2Referrals.sort((a, b) => new Date(b.referred_at).getTime() - new Date(a.referred_at).getTime());
  tier3Referrals.sort((a, b) => new Date(b.referred_at).getTime() - new Date(a.referred_at).getTime());

  // Calculate totals
  const directReferrals = tier1Referrals.length;
  const indirectReferrals = tier2Referrals.length + tier3Referrals.length;
  const totalReferrals = directReferrals + indirectReferrals;

  // Format username - remove wallet part helper function
  const formatDisplayName = (name: string) => {
    if (!name) return "";
    // Remove wallet type information if present
    if (name.includes("[wallet_type")) {
      return name.split("[")[0].trim();
    }
    return name;
  };

  // Calculate total pending rewards from referral_rewards table
  const calculatePendingRewards = () => {
    if (!referralRewards || referralRewards.length === 0) {
      console.log("No referral rewards data available, pending rewards = 0");
      return 0;
    }
    
    console.log(`Calculating pending rewards from ${referralRewards.length} rewards`);
    
    // Log all unclaimed rewards for debugging
    const unclaimedRewards = referralRewards.filter(
      reward => !reward.claimed && reward.reward_amount > 0
    );
    
    console.log(`Found ${unclaimedRewards.length} unclaimed rewards:`);
    unclaimedRewards.forEach(reward => {
      console.log(`  - ID: ${reward.id}, Amount: ${reward.reward_amount}, Type: ${reward.reward_type}`);
    });
    
    const pendingTotal = referralRewards.reduce(
      (total, reward) => {
        const amount = !reward.claimed && reward.reward_amount > 0 ? Number(reward.reward_amount) : 0;
        return total + amount;
      },
      0
    );
    
    console.log(`Calculated pending rewards: ${pendingTotal}`);
    return pendingTotal;
  };

  // Load referral data when component mounts or when userProfile changes
  useEffect(() => {
    if (userProfile?.id) {
      setDataReady(false); // Reset data ready state
      loadReferralData();
      
      // Auto-generate referral code if user doesn't have one
      if (userProfile?.email && !userProfile?.referral_code) {
        console.log("User has no referral code, auto-generating...");
        handleGenerateReferralCode();
      }
    } else {
      // If user is not logged in, make sure loading states are reset
      setIsLoading(false);
      setIsLoadingEarnings(false);
      setDataReady(true); // Consider data ready to prevent loading spinners
    }
  }, [userProfile?.id, userProfile?.referral_code, userProfile?.email]);

  // Fetch referral earnings whenever referralRewards change
  useEffect(() => {
    if (userProfile?.id && referralRewards) {
      fetchReferralEarnings(userProfile.id);
    }
  }, [referralRewards, userProfile?.id]);

  const loadReferralData = async () => {
    if (!userProfile?.id) return;

    try {
      setIsLoading(true);
      setDataReady(false);
      
      // Fetch referrals and rewards data
      await Promise.all([
        dispatch(fetchUserReferrals(userProfile.id)).unwrap(),
        dispatch(fetchReferralRewards(userProfile.id)).unwrap(),
      ]);
      
      // Also refresh earnings data
      if (userProfile?.id) {
        await fetchReferralEarnings(userProfile.id);
      }
    } catch (err) {
      console.error("Failed to load referral data:", err);
      toast.error("Failed to load referral data");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = () => {
    setDataReady(false);
    loadReferralData();
    toast.success("Refreshing referral data...");
  };

  // Function to fetch claimed referral earnings from the earnings table
  const fetchReferralEarnings = async (userWalletAddress: string) => {
    if (!userProfile?.id) {
      console.error("Cannot fetch referral earnings without user ID");
      setIsLoadingEarnings(false); // Ensure loading state is off if no user
      return;
    }

    try {
      setIsLoadingEarnings(true);
      console.log("Fetching referral earnings data...");
      const client = getSwarmSupabase();

      // Get total referral earnings where task_id is null and type is referral
      const { data: earnings, error } = await client
        .from("earnings")
        .select("amount")
        .eq("user_id", userProfile.id)
        .eq("earning_type", "referral")
        .is("task_id", null);

      if (error) {
        console.error("Error fetching referral earnings:", error);
        setIsLoadingEarnings(false);
        return;
      }

      // Calculate total claimed earnings from the database
      const totalClaimedEarnings = earnings.reduce(
        (sum, record) => sum + Number(record.amount),
        0
      );

      console.log(`Fetched claimed referral earnings from database: ${totalClaimedEarnings}`);

      // Calculate total pending rewards directly from current referral rewards data
      const totalPendingRewards = calculatePendingRewards();

      // Calculate total referral earnings (claimed + pending)
      const totalEarnings = totalClaimedEarnings + totalPendingRewards;

      console.log(
        `Fetched referral earnings: Claimed=${totalClaimedEarnings}, Pending=${totalPendingRewards}, Total=${totalEarnings}`
      );

      // Update state
      setClaimedRewards(totalClaimedEarnings);
      setPendingRewards(totalPendingRewards);
      setTotalReferralEarnings(totalEarnings);
      
      // Now all data is ready
      setDataReady(true);
    } catch (error) {
      console.error("Error in fetchReferralEarnings:", error);
      setDataReady(true); // Set to true even on error to allow UI to show
    } finally {
      setIsLoadingEarnings(false);
    }
  };

  const handleGenerateReferralCode = async (showToast = true) => {
    if (!userProfile?.id) {
      if (showToast) toast.error("You need to be logged in to generate a referral code");
      return;
    }

    if (!userProfile?.email) {
      if (showToast) toast.error(
        "You need to have an email address to generate a referral code"
      );
      return;
    }

    // Skip if user already has a referral code
    if (userProfile?.referral_code) {
      console.log("User already has referral code:", userProfile.referral_code);
      return;
    }

    try {
      setIsGenerating(true);
      const result = await dispatch(generateReferralCode(userProfile?.id)).unwrap();
      if (showToast) toast.success("Referral code generated successfully!");
      
      // Force reload referral data to get the new code
      await loadReferralData();
      
      return result;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error occurred";
      if (showToast) toast.error(`Failed to generate referral code: ${errorMessage}`);
      console.error("Failed to generate referral code:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyReferralLink = async () => {
    // If no referral link exists, try to generate one first
    if (!referralLink) {
      console.log("No referral link available, attempting to generate one");
      await handleGenerateReferralCode(false); // Don't show toast for auto-generation
      
      // Check again after generation attempt
      if (!userProfile?.referral_code) {
        toast.error("Please connect a wallet to generate a referral code");
        return;
      }
    }
    
    // Get the most up-to-date referral link
    const currentReferralLink = userProfile?.referral_code
      ? `${window.location.origin}/dashboard?ref=${userProfile.referral_code}`
      : null;
      
    if (!currentReferralLink) {
      toast.error("Unable to generate referral link");
      return;
    }

    // Copy to clipboard
    navigator.clipboard
      .writeText(currentReferralLink)
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

  // Function to handle reward claim
  const handleRewardClaimed = (amount: number) => {
    console.log(`Handling reward claimed: ${amount} SP`);
    
    // Update claimed and pending rewards immediately in UI
    setClaimedRewards(prev => {
      const newValue = prev + amount;
      console.log(`Updated claimed rewards: ${prev} -> ${newValue} SP`);
      return newValue;
    });
    
    setPendingRewards(prev => {
      const newValue = Math.max(0, prev - amount);
      console.log(`Updated pending rewards: ${prev} -> ${newValue} SP`);
      return newValue;
    });
    
    // Force a full data refresh immediately
    setDataReady(false);
    
    // First immediate refresh attempt
    if (userProfile?.id) {
      // Invalidate current data to force complete reload
      dispatch(fetchReferralRewards(userProfile.id)).unwrap()
        .then(() => {
          console.log("Refreshed referral rewards immediately after claim");
          fetchReferralEarnings(userProfile.id);
        })
        .catch(err => console.error("Error refreshing data after claim:", err));
    }
    
    // Second attempt after a short delay
    setTimeout(() => {
      if (userProfile?.id) {
        console.log("Performing delayed reload after claim");
        loadReferralData(); // Complete full data reload
      }
    }, 1500);
    
    // Third attempt to ensure consistency
    setTimeout(() => {
      if (userProfile?.id) {
        console.log("Performing final verification reload after claim");
        fetchReferralEarnings(userProfile.id);
      }
    }, 3000);
  };

  // Function to check if user is already part of any referral program
  const checkUserHasReferrer = async () => {
    if (!userProfile?.id) return false;
    
    try {
      const client = getSwarmSupabase();
      
      // Check if there's any entry in the referrals table where this user is the referred_id
      const { data, error } = await client
        .from("referrals")
        .select("id")
        .eq("referred_id", userProfile.id)
        .limit(1)
        .maybeSingle();
        
      if (error) {
        console.error("Error checking if user has a referrer:", error);
        return false;
      }
      
      console.log("User referrer check:", data ? "User already has a referrer" : "User has no referrer");
      return !!data; // Return true if user already has a referrer
    } catch (err) {
      console.error("Error checking if user has a referrer:", err);
      return false;
    }
  };

  // Function to check if user already has a referral relationship
  const checkExistingReferralRelationship = async (referrerId: string) => {
    if (!userProfile?.id || !referrals) {
      console.log("Cannot check relationship: missing user profile or referrals data");
      return false;
    }
    
    console.log(`Checking if user ${userProfile.id} has existing referral relationship with ${referrerId}`);
    
    // First check if the user is directly referred by this referrer (tier 1)
    const directReferral = referrals.find(
      ref => ref.referrer_id === referrerId && ref.tier_level === "tier_1"
    );
    
    if (directReferral) {
      console.log("Found existing direct referral relationship:", directReferral);
      return true;
    }
    
    // If we have a connection to the database, we can also check the referrals table directly
    try {
      const client = getSwarmSupabase();
      
      // Check if there's any referral relationship where this user is referred by the given referrer
      const { data, error } = await client
        .from("referrals")
        .select("id")
        .eq("referred_id", userProfile.id)
        .eq("referrer_id", referrerId)
        .maybeSingle();
        
      if (error) {
        console.error("Error checking existing referral:", error);
        return false;
      }
      
      console.log("Database check for existing referral:", data ? "Found" : "Not found");
      return !!data; // Return true if a relationship exists
    } catch (err) {
      console.error("Error checking referral relationship:", err);
      return false;
    }
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
      // First check if the user already has any referrer
      const hasReferrer = await checkUserHasReferrer();
      if (hasReferrer) {
        setReferralError("You are already part of a referral program and cannot join another one.");
        setIsVerified(false);
        setIsVerifying(false);
        return;
      }

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
            // Check if the user already has a referral relationship with the given code
            const hasRelationship = await checkExistingReferralRelationship(referrerId);
            if (hasRelationship) {
              setReferralError("You cannot use this code again. You are already part of this referral program.");
              setIsVerified(false);
            } else {
              setIsVerified(true);
              toast.success("Referral code verified successfully");
            }
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
      // First check if the user already has any referrer
      const hasReferrer = await checkUserHasReferrer();
      if (hasReferrer) {
        setReferralError("You are already part of a referral program and cannot join another one.");
        setIsVerified(false);
        return;
      }
      
      // Then verify the code to get the referrer ID
      const verifyResult = await dispatch(verifyReferralCode(extractedCode));
      if (!verifyReferralCode.fulfilled.match(verifyResult)) {
        setReferralError("Invalid referral code");
        return;
      }

      const { isValid, referrerId } = verifyResult.payload as {
        isValid: boolean;
        referrerId: string;
      };

      if (!isValid) {
        setReferralError("Invalid referral code");
        return;
      }

      // Check if user already has a referral relationship with this code
      const hasRelationship = await checkExistingReferralRelationship(referrerId);
      if (hasRelationship) {
        setReferralError("You cannot use this code again. You are already part of this referral program.");
        return;
      }

      const resultAction = await dispatch(
        createReferralRelationship({
          referrerCode: extractedCode,
          referredId: userProfile.id,
        })
      );

      if (createReferralRelationship.fulfilled.match(resultAction)) {
        toast.success("Successfully joined referral program!");
        
        // Give 100 SP to the referrer (user A)
        try {
          if (referrerId) {
            const client = getSwarmSupabase();
            
            // Create an earnings entry for the referral
            await client.from("earnings").insert({
              user_id: referrerId,
              amount: 250,
              earning_type: "referral",
              task_id: null
            });
            
            // Update earnings_history by fetching latest amount and adding to it
            const { data: latestEarnings, error: fetchError } = await client
              .from("earnings_history")
              .select("*")
              .eq("user_id", referrerId)
              .order("timestamp", { ascending: false })
              .limit(1)
              .single();
            
            if (fetchError && fetchError.code !== "PGRST116") {
              console.error("Error fetching latest earnings history:", fetchError);
            }
            
            const currentAmount = latestEarnings ? parseFloat(latestEarnings.amount) : 0;
            const newAmount = currentAmount + 100;
            const currentTaskCount = latestEarnings ? latestEarnings.task_count : 0;
            
            // Insert or update earnings_history
            if (latestEarnings) {
              await client
                .from("earnings_history")
                .update({ 
                  amount: newAmount,
                  timestamp: new Date().toISOString()
                })
                .eq("id", latestEarnings.id);
            } else {
              await client
                .from("earnings_history")
                .insert({
                  user_id: referrerId,
                  amount: 100,
                  task_count: currentTaskCount,
                  payout_status: "pending"
                });
            }
            
            console.log("Added 100 SP reward to referrer:", referrerId);
          }
        } catch (err) {
          console.error("Error adding referrer reward:", err);
        }
        
        setReferralCode("");
        setIsVerified(false);
        // Show the reward dialog
        setShowRewardDialog(true);
        // Refresh referral data after successful submission
        loadReferralData();
      } else {
        setReferralError("Failed to join referral program");
      }
    } catch (error) {
      console.error("Error joining referral program:", error);
      setReferralError("Error joining referral program");
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
    // Format display name for referral
    let displayName = referral.user_profile?.user_name || 
                     referral.referred_name || 
                     `User ${referral.referred_id.substring(0, 6)}...`;
    
    // Remove wallet type information
    displayName = formatDisplayName(displayName);
    
    // Get tier badge color based on tier level
    const getTierBadgeColor = (tierLevel: string) => {
      switch(tierLevel) {
        case 'tier_1': return 'bg-blue-500/20 text-blue-400 border-blue-500/40';
        case 'tier_2': return 'bg-purple-500/20 text-purple-400 border-purple-500/40';
        case 'tier_3': return 'bg-indigo-500/20 text-indigo-400 border-indigo-500/40';
        default: return 'bg-slate-700 text-slate-400';
      }
    };
    
    // Format joined date
    const joinDate = new Date(referral.referred_at);
    const formattedDate = joinDate.toLocaleDateString();
    
    return (
      <div
        key={referral.id}
        className="flex justify-between items-center p-3 bg-slate-800/50 rounded-lg"
      >
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-blue-400" />
          <div>
            <div className="font-medium">
              {displayName}
            </div>
            <div className="text-xs text-slate-400">
              Joined on {formattedDate} ({formatDistanceToNow(joinDate, {addSuffix: true})})
            </div>
          </div>
        </div>
        <div className={`text-xs px-2 py-1 rounded border ${getTierBadgeColor(referral.tier_level)}`}>
          {referral.tier_level.replace('_', ' ').toUpperCase()}
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

  // Add effect to periodically verify data consistency - only run when logged in
  useEffect(() => {
    // Only run this if we have user data and the component is mounted
    if (!userProfile?.id || !dataReady) return;
    
    // Check consistency between claimed and pending rewards
    const verifyDataConsistency = () => {
      console.log("Verifying data consistency...");
      
      // If we have inconsistent data or values that don't make sense, reload
      if (pendingRewards < 0 || 
          (referralRewards?.some(r => !r.claimed && r.reward_amount > 0) && pendingRewards === 0)) {
        console.log("Data inconsistency detected! Reloading data...");
        loadReferralData();
      } else {
        console.log("Data appears consistent");
      }
    };
    
    // Run initial check after data is loaded
    const initialCheck = setTimeout(verifyDataConsistency, 1000);
    
    // Then set up a periodic check that runs every 10 seconds
    const intervalCheck = setInterval(verifyDataConsistency, 10000);
    
    return () => {
      clearTimeout(initialCheck);
      clearInterval(intervalCheck);
    };
  }, [dataReady, referralRewards, pendingRewards, userProfile?.id]);

  return (
    <div className="space-y-6 sm:space-y-8 p-3 sm:p-6 rounded-3xl max-w-full overflow-x-hidden">
      {/* Dialogs */}
      <ThankYouDialog 
        isOpen={showThankYouDialog}
        onClose={() => setShowThankYouDialog(false)}
        referralCode={referralCode}
      />
      
      <ErrorDialog 
        isOpen={showErrorDialog}
        onClose={() => setShowErrorDialog(false)}
        message={errorMessage}
      />
      
      <SignInRequiredDialog 
        isOpen={showSignInRequiredDialog}
        onClose={() => setShowSignInRequiredDialog(false)}
      />

      {/* Add the RewardDialog component */}
      <RewardDialog 
        isOpen={showRewardDialog}
        onClose={() => setShowRewardDialog(false)}
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <ReferralStatCard
          label="First Tier"
          value={isLoading || !dataReady ? "..." : directReferrals}
          icon={<LucideUser className="w-5 h-5 text-white" />}
          backgroundImage={"/images/flower_1.png"}
        />
        <ReferralStatCard
          label="Second Tier"
          value={isLoading || !dataReady ? "..." : tier2Referrals.length}
          icon={<LucideUser className="w-5 h-5 text-white" />}
          backgroundImage={"/images/flower_1.png"}
        />
        <ReferralStatCard
          label="Third Tier"
          value={isLoading || !dataReady ? "..." : tier3Referrals.length}
          icon={<LucideUser className="w-5 h-5 text-white" />}
          backgroundImage={"/images/flower_1.png"}
        />
        <ReferralStatCard
          label="Total Referral Rewards"
          value={isLoadingEarnings || !dataReady ? 
            "..." : 
            `${totalReferralEarnings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SP`}
          backgroundImage={"/images/flower_2.png"}
          highlight
        />
      </div>

      {/* Share and Tweet Buttons - Only show if user is logged in */}
      {userProfile?.id ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-6">
          <motion.button
            className="gradient-button py-3 sm:py-4 flex items-center justify-center gap-2 relative overflow-hidden"
            onClick={() => setIsShareModalOpen(true)}
            initial="initial"
            whileHover="hover"
          >
            <Share2 className="w-4 h-4 sm:w-5 sm:h-5" />
            <div className="relative w-36 text-center">
              <motion.span 
                className="text-sm sm:text-base absolute left-0 right-0 whitespace-nowrap"
                variants={{
                  initial: { opacity: 1 },
                  hover: { opacity: 0 }
                }}
                transition={{ duration: 0.3 }}
              >
                Promotional Period
              </motion.span>
              <motion.span 
                className="text-sm sm:text-base whitespace-nowrap"
                variants={{
                  initial: { opacity: 0 },
                  hover: { opacity: 1 }
                }}
                transition={{ duration: 0.3 }}
              >
                Share Referral
              </motion.span>
            </div>
          </motion.button>

          <motion.button
            className="gradient-button py-3 sm:py-4 flex items-center justify-center gap-2 relative overflow-hidden"
            onClick={() => openSocialShare(getShareMessage("Twitter"))}
            initial="initial"
            whileHover="hover"
          >
            <FaSquareXTwitter className="w-4 h-4 sm:w-5 sm:h-5" />
            <div className="relative w-36 text-center">
              <motion.span 
                className="text-sm sm:text-base absolute left-0 right-0 whitespace-nowrap"
                variants={{
                  initial: { opacity: 1 },
                  hover: { opacity: 0 }
                }}
                transition={{ duration: 0.3 }}
              >
                Promotional Period
              </motion.span>
              <motion.span 
                className="text-sm sm:text-base whitespace-nowrap"
                variants={{
                  initial: { opacity: 0 },
                  hover: { opacity: 1 }
                }}
                transition={{ duration: 0.3 }}
              >
                Tweet Referral
              </motion.span>
            </div>
          </motion.button>
        </div>
      ) : (
        <div className="bg-gradient-to-r from-blue-600/10 to-purple-600/10 p-5 rounded-xl border border-blue-500/20 text-center">
          <Lock className="mx-auto h-10 w-10 text-blue-400 mb-2" />
          <h3 className="text-white font-medium mb-2">Sign In Required</h3>
          <p className="text-sm text-blue-300/80 mb-4">
            Please sign in or sign up to join the referral program and start earning rewards.
          </p>
          
        </div>
      )}

      <SocialShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        inviteLink={referralLink}
        referralCode={userReferralCode}
      />

      {/* Claims and Pending Rewards Container */}
      {userProfile?.id && (
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
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-2 w-full">
  <div className="relative flex-1 w-full">
    <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
      <LinkIcon className="h-4 w-4 text-blue-400/60" />
    </div>
    <Input
      value={referralCode}
      onChange={handleReferralInputChange}
      className="pl-10 py-3 bg-[#111827]/50 border-blue-500/20 focus:border-blue-400 text-white rounded-xl focus-visible:ring-blue-500/30 focus-visible:ring-offset-0 w-full"
      placeholder="Enter referral code or link"
    />
  </div>
  <Button
    onClick={handleVerifyReferralCode}
    className="bg-blue-600 hover:bg-blue-700 rounded-xl px-5 py-3 flex items-center justify-center w-full sm:w-auto"
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
                    <div className="flex items-center gap-2">
                      {isLoadingEarnings || !dataReady ? (
                        <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />
                      ) : (
                        <span className="text-green-400 font-bold text-sm sm:text-base">
                          {claimedRewards.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SP
                        </span>
                      )}
                      <button 
                        className="text-blue-400 hover:text-blue-300 p-1 rounded-full hover:bg-blue-500/10"
                        onClick={() => fetchReferralEarnings(userProfile?.id || '')}
                        title="Refresh earnings data"
                      >
                        <RefreshCw className="w-3 h-3" />
                      </button>
                    </div>
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
                    <div className="flex items-center gap-2">
                      {isLoadingEarnings || !dataReady ? (
                        <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />
                      ) : (
                        <span className="text-amber-400 font-bold text-sm sm:text-base">
                          {pendingRewards.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SP
                        </span>
                      )}
                      <button 
                        className="text-blue-400 hover:text-blue-300 p-1 rounded-full hover:bg-blue-500/10"
                        onClick={handleRefresh}
                        title="Refresh rewards data"
                      >
                        <RefreshCw className="w-3 h-3" />
                      </button>
                    </div>
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
      )}

      {/* Referrals and Rewards Lists */}
      <div className="bg-[radial-gradient(ellipse_at_top_left,#0361DA_0%,#090C18_54%)] p-3 sm:p-6 rounded-2xl border border-[#0361DA]/80">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-6">
          <div className="bg-[#161628] rounded-2xl p-3 sm:p-6">
            <div className="flex items-center justify-between mb-2 sm:mb-3">
              <h3 className="text-white font-medium text-sm sm:text-base">
                All Referrals
              </h3>
                              <span className="text-[#515194]/80 text-xs sm:text-sm">
                {totalReferrals.toLocaleString()} total
              </span>
            </div>

            {isLoading || !dataReady ? (
              <div className="flex justify-center items-center py-6">
                <RefreshCw className="w-6 h-6 text-blue-400 animate-spin" />
              </div>
                          ) : totalReferrals > 0 ? (
                <div className="h-[200px] overflow-y-auto custom-scrollbar pr-2">
                  <div className="space-y-2">
                    {/* Combined list of all referrals across tiers */}
                    {[...tier1Referrals, ...tier2Referrals, ...tier3Referrals]
                      .sort((a, b) => new Date(b.referred_at).getTime() - new Date(a.referred_at).getTime())
                      .map(renderReferralItem)}
                  </div>
            
                </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-6 bg-[#090C18]/50 rounded-lg text-center">
                <Share2 className="w-8 h-8 text-[#515194] mb-2" />
                <div className="text-sm text-[#515194]/80">
                  No referrals yet. Share your link to start earning!
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
                {referralRewards.length.toLocaleString()} total
              </span>
            </div>

            {isLoading || isLoadingEarnings || !dataReady ? (
              <div className="flex justify-center items-center py-6">
                <RefreshCw className="w-6 h-6 text-blue-400 animate-spin" />
              </div>
            ) : referralRewards && referralRewards.length > 0 ? (
              <>
                
                  
                {/* Rewards List */}
                <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                  {referralRewards.map((reward) => (
                    <RewardItem
                      key={reward.id}
                      reward={reward}
                      userProfile={userProfile}
                      onRefresh={loadReferralData}
                      onRewardClaimed={handleRewardClaimed}
                    />
                  ))}
                </div>
              </>
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