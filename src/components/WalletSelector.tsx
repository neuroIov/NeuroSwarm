import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Wallet, CheckCircle, Loader2, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useSession, WalletType } from "@/hooks/useSession";

// Wallet icon paths from public/images folder
const PHANTOM_ICON = "/images/phantom.jpg";
const METAMASK_ICON = "/images/metamask.jpg";

interface WalletSelectorProps {
  onClose?: () => void;
}

export const WalletSelector = ({ onClose }: WalletSelectorProps) => {
  const { connectWallet, disconnectWallet, session } = useSession();
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [currentWalletType, setCurrentWalletType] = useState<WalletType | null>(
    null
  );

  // Check if user is logged in and has a wallet
  const isLoggedIn = session.userId !== "guest" && session.userId !== null;
  const hasWallet = !!session.walletAddress;

  // Update current wallet type when session changes
  useEffect(() => {
    if (session.walletType) {
      setCurrentWalletType(session.walletType);
    }
  }, [session.walletType]);

  // Debug log to check session state
  useEffect(() => {
    console.log("WalletSelector - Current session state:", {
      userId: session.userId,
      email: session.email,
      walletAddress: session.walletAddress,
      walletType: session.walletType,
      isLoggedIn,
      hasWallet,
    });
  }, [session, isLoggedIn, hasWallet]);

  const handleWalletConnect = async (type: WalletType) => {
    if (!isLoggedIn) {
      toast.error("You must be logged in with email first.");
      return;
    }

    if (!session.email) {
      toast.error("Email information missing. Please log in again.");
      return;
    }

    setIsConnecting(true);
    try {
      console.log(`Attempting to connect ${type} wallet...`);
      await connectWallet(type);
      toast.success(`Connected to ${type} wallet`);
      if (onClose) onClose();
    } catch (error) {
      console.error(`${type} wallet connection failed:`, error);
      toast.error(
        error instanceof Error
          ? error.message
          : `Failed to connect ${type} wallet`
      );
    } finally {
      setIsConnecting(false);
    }
  };

  const handleWalletDisconnect = async () => {
    if (!hasWallet) return;

    setIsDisconnecting(true);
    try {
      await disconnectWallet();
      toast.success("Wallet disconnected successfully");
      if (onClose) onClose();
    } catch (error) {
      console.error("Failed to disconnect wallet:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to disconnect wallet"
      );
    } finally {
      setIsDisconnecting(false);
    }
  };

  // Get a shortened version of the wallet address for display
  const shortenAddress = (address: string) => {
    if (!address) return "";
    return `${address.substring(0, 6)}...${address.substring(
      address.length - 4
    )}`;
  };

  // Get the wallet icon based on type
  const getWalletIcon = (type: WalletType | null) => {
    if (type === "phantom") return PHANTOM_ICON;
    if (type === "metamask") return METAMASK_ICON;

    // If type is not available in session, try to detect from address format
    if (session.walletAddress) {
      if (session.walletAddress.startsWith("0x")) return METAMASK_ICON;
      return PHANTOM_ICON;
    }

    return null;
  };

  // Get wallet name for display
  const getWalletName = (type: WalletType | null) => {
    if (type === "phantom") return "Phantom";
    if (type === "metamask") return "MetaMask";
    return "Wallet";
  };

  return (
    <div className="bg-[#040404] rounded-full p-1.5">
      {hasWallet ? (
        <Button
          variant="outline"
          onClick={handleWalletDisconnect}
          disabled={isDisconnecting}
          className={`
            flex items-center gap-2 font-medium rounded-full 
            bg-gradient-to-r from-green-600 to-green-700 text-white
            border-1 border-green-500 hover:opacity-90 transition-opacity
            px-6 py-3 h-auto
          `}
          title="Click to disconnect wallet"
        >
          {isDisconnecting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Disconnecting...</span>
            </>
          ) : (
            <>
              <CheckCircle className="w-5 h-5" />
              <span>
                {getWalletName(session.walletType)}:{" "}
                {shortenAddress(session.walletAddress || "")}
              </span>
            </>
          )}
        </Button>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              disabled={isConnecting || !isLoggedIn}
              className={`
                flex items-center gap-2 font-medium rounded-full 
                ${
                  isLoggedIn
                    ? "bg-gradient-to-r from-[#0361DA] to-[#20A5EF] text-white border-[#20A5EF]"
                    : "bg-gray-700 text-gray-300 border-gray-600 cursor-not-allowed"
                }
                hover:opacity-90 transition-opacity
                px-6 py-3 h-auto
              `}
              title={
                isLoggedIn
                  ? "Connect a wallet"
                  : "Log in first to connect a wallet"
              }
            >
              {isConnecting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Connecting...</span>
                </>
              ) : (
                <>
                  <Wallet className="w-5 h-5" />
                  <span>Connect Wallet</span>
                  <ChevronDown className="w-4 h-4 ml-1" />
                </>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="bg-[#0A1A2F] border border-[#20A5EF]/20"
          >
            <DropdownMenuItem
              onClick={() => handleWalletConnect("phantom")}
              className="cursor-pointer flex items-center gap-2 text-white hover:bg-[#112544]"
              disabled={!isLoggedIn || isConnecting}
            >
              <img src={PHANTOM_ICON} alt="Phantom" className="w-5 h-5 rounded-full object-cover border border-purple-500" />
              <span>Phantom</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleWalletConnect("metamask")}
              className="cursor-pointer flex items-center gap-2 text-white hover:bg-[#112544]"
              disabled={!isLoggedIn || isConnecting}
            >
              <img src={METAMASK_ICON} alt="MetaMask" className="w-5 h-5 rounded-full object-cover border border-orange-500" />
              <span>MetaMask</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
};
