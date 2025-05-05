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
    <Button
      variant={walletConnected ? "outline" : "default"}
      onClick={handleWalletAction}
      disabled={isLoading}
      className={`
        flex items-center gap-2 font- rounded-full border-4 h-full border-black-800
        ${walletConnected
          ? "bg-green-900/20 text-green-400 hover:bg-green-900/30 border-green-800"
          : "bg-blue-600 text-white hover:bg-blue-700"
        }
        text-sm md:text-base
      `}
    >
      {isLoading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Loading...</span>
        </>
      ) : walletConnected ? (
        <>
          <CheckCircle className="w-4 h-4" />
          <span className="hidden sm:inline">{displayAddress}</span>
          <span className="sm:hidden">Connected</span>
        </>
      ) : (
        <>
          <Wallet className="w-4 h-4 " />
          <span>Connect Wallet</span>
        </>
      )}
    </Button>
  );
};