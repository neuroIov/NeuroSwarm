import React from "react";
import { Button } from "@/components/ui/button";
import { Wallet, CheckCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "@/hooks/useSession";

export const WalletButton = () => {
  const {
    walletConnected,
    userPublicKey,
    connectWallet,
    isLoading,
    error,
    userProfile,
    session,
  } = useSession();

  const handleWalletAction = async () => {
    try {
      await connectWallet();

      if (!walletConnected) {
        toast.success("Connecting to wallet...");
      }
    } catch (err) {
      console.error("Wallet action failed:", err);
      toast.error("Failed to perform wallet action");
    }
  };

  // Display error toast if there's an error
  React.useEffect(() => {
    if (error) {
      toast.error(`Session error: ${error}`);
    }
  }, [error]);

  // Display success toast when user profile is loaded
  React.useEffect(() => {
    if (userProfile && walletConnected) {
      toast.success(
        `Welcome back! Reputation: ${userProfile.reputation_score}/100`
      );
      console.log("User profile loaded:", userProfile);
    }
  }, [userProfile, walletConnected]);

  // Handle session state changes
  React.useEffect(() => {
    if (session.sessionId) {
      if (!walletConnected) {
        console.log("Guest session active:", {
          sessionId: session.sessionId,
          userId: session.userId,
          startTime: session.startTime,
        });
      } else {
        console.log("Wallet session active:", {
          sessionId: session.sessionId,
          wallet: session.walletAddress,
          startTime: session.startTime,
        });
      }
    }
  }, [
    session.sessionId,
    walletConnected,
    session.userId,
    session.walletAddress,
    session.startTime,
  ]);

  const displayAddress = userPublicKey
    ? `${userPublicKey.toString().slice(0, 6)}...${userPublicKey
        .toString()
        .slice(-4)}`
    : "Connected";

  return (
    <div className="bg-[#040404] rounded-full p-1.5 ">
      <Button
        variant="outline"
        onClick={handleWalletAction}
        disabled={isLoading}
        className={`
        flex items-center gap-2 font-medium rounded-full 
        bg-gradient-to-r from-[#0361DA] to-[#20A5EF] text-white
        border-1 border-[#20A5EF] hover:opacity-90 transition-opacity
        px-6 py-3 h-auto
      `}
        title={
          walletConnected && userProfile
            ? `Reputation: ${userProfile.reputation_score}/100 | Tasks: ${userProfile.total_tasks_completed} | Earnings: ${userProfile.total_earnings}`
            : "Connect your wallet"
        }
      >
        {isLoading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Loading...</span>
          </>
        ) : walletConnected ? (
          <>
            <CheckCircle className="w-5 h-5" />
            <span>{displayAddress}</span>
          </>
        ) : (
          <>
            <Wallet className="w-5 h-5" />
            <span>Connect Wallet</span>
          </>
        )}
      </Button>
    </div>
  );
};
