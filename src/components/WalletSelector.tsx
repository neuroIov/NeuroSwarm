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

// Base64 encoded wallet icons
const PHANTOM_ICON =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCIgdmlld0JveD0iMCAwIDEyOCAxMjgiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMjgiIGhlaWdodD0iMTI4IiByeD0iNjQiIGZpbGw9IiM4QTQ1RkYiLz4KPHBhdGggZD0iTTkzLjgxNDkgNTIuMjgwMUw2OS4zNjggOTcuMDQ0MUg1OC4zNzgyTDQwLjEyMTEgNjIuMzkwNUg1My41NzA3TDYyLjk1MTIgODIuMzg1M0w3Ny44MDY3IDUyLjI4MDFIOTMuODE0OVoiIGZpbGw9IndoaXRlIi8+Cjwvc3ZnPgo=";
const METAMASK_ICON =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCIgdmlld0JveD0iMCAwIDEyOCAxMjgiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMjgiIGhlaWdodD0iMTI4IiByeD0iNjQiIGZpbGw9IiNFMTc3MjYiLz4KPHBhdGggZD0iTTkzLjY1MTUgNDIuNjkzOEw2OS4xMDc0IDYwLjg5OTRMNzIuODU4OSA1MC4wODM1TDkzLjY1MTUgNDIuNjkzOFoiIGZpbGw9IndoaXRlIi8+CjxwYXRoIGQ9Ik0zNC4zNDg1IDQyLjY5MzhMNTguNjc0MSA2MS4wNzY5TDU1LjE0MTEgNTAuMDgzNUwzNC4zNDg1IDQyLjY5MzhaIiBmaWxsPSJ3aGl0ZSIvPgo8cGF0aCBkPSJNODIuODcwMSA4MC41OTM4TDc0LjcwMDIgOTEuMDU4M0w5MS4wMjA1IDk1LjY2NjdMOTUuNjI4OSA4MC43NzEzTDgyLjg3MDEgODAuNTkzOFoiIGZpbGw9IndoaXRlIi8+CjxwYXRoIGQ9Ik0zMi4zODg5IDgwLjc3MTNMMzYuOTc5NCA5NS42NjY3TDUzLjI5OTcgOTEuMDU4M0w0NS4xMjk4IDgwLjU5MzhMMzIuMzg4OSA4MC43NzEzWiIgZmlsbD0id2hpdGUiLz4KPHBhdGggZD0iTTUyLjY2MjMgNjUuODU0MUw0OS40ODg4IDc0LjE4MTZMNjUuNjc0IDc0LjcxMTlMNjQuOTY2MiA1Ny40NTk2TDUyLjY2MjMgNjUuODU0MVoiIGZpbGw9IndoaXRlIi8+CjxwYXRoIGQ9Ik03NS4zMzc3IDY1Ljg1NDFMNjIuOTUxNyA1Ny4yODIxTDYyLjMyNiA3NC43MTE5TDc4LjUxMTIgNzQuMTgxNkw3NS4zMzc3IDY1Ljg1NDFaIiBmaWxsPSJ3aGl0ZSIvPgo8cGF0aCBkPSJNNTMuMjk5NyA5MS4wNTgzTDY0LjYxMTMgODUuNzMxOUw1NC44NTcxIDgwLjg4NjRMNTMuMjk5NyA5MS4wNTgzWiIgZmlsbD0id2hpdGUiLz4KPHBhdGggZD0iTTYzLjM4ODcgODUuNzMxOUw3NC43MDAyIDkxLjA1ODNMNzMuMTQyOCA4MC44ODY0TDYzLjM4ODcgODUuNzMxOVoiIGZpbGw9IndoaXRlIi8+Cjwvc3ZnPgo=";

interface WalletSelectorProps {
  onClose?: () => void;
}

export const WalletSelector = ({ onClose }: WalletSelectorProps) => {
  const { connectWallet, session, walletType } = useSession();
  const [isConnecting, setIsConnecting] = useState(false);
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
          onClick={() => connectWallet(session.walletType as WalletType)}
          disabled={isConnecting}
          className={`
            flex items-center gap-2 font-medium rounded-full 
            bg-gradient-to-r from-green-600 to-green-700 text-white
            border-1 border-green-500 hover:opacity-90 transition-opacity
            px-6 py-3 h-auto
          `}
          title="Click to disconnect wallet"
        >
          {isConnecting ? (
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
              <img src={PHANTOM_ICON} alt="Phantom" className="w-5 h-5" />
              <span>Phantom</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleWalletConnect("metamask")}
              className="cursor-pointer flex items-center gap-2 text-white hover:bg-[#112544]"
              disabled={!isLoggedIn || isConnecting}
            >
              <img src={METAMASK_ICON} alt="MetaMask" className="w-5 h-5" />
              <span>MetaMask</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
};
