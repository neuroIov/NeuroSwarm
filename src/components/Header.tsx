import React, { useState, useEffect } from "react";
import { WalletButton } from "./WalletButton";
import {
  HelpCircle,
  Mail,
  Wallet,
  X,
  ChevronLeft,
  ChevronRight,
  Menu,
  LogIn,
  LogOut,
  User,
} from "lucide-react";
import { useSession } from "@/hooks/useSession";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AuthModal } from "./auth/AuthModal";
import { WalletConnectionModal } from "./auth/WalletConnectionModal";
import { useDispatch } from "react-redux";
import { fetchOrCreateUserProfile } from "@/store/slices/sessionSlice";
import { AppDispatch } from "@/store";

interface HeaderProps {
  className?: string;
  onMenuToggle?: () => void;
  sidebarOpen?: boolean;
}

export const Header = ({
  className,
  onMenuToggle,
  sidebarOpen,
}: HeaderProps) => {
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { connectWallet, session, logout } = useSession();
  const dispatch = useDispatch<AppDispatch>();

  console.log("userProfile", session?.userProfile);

  // Get the username from userProfile if available
  const displayName =
    session.userProfile?.user_name ||
    (session.email ? session.email.split("@")[0] : "Guest");

  // Determine if the user is logged in
  const isLoggedIn = session.userId !== "guest" && session.userId !== null;

  // Determine if the user has a wallet connected
  const hasWallet = !!session.walletAddress;
  const walletType = session.walletType;

  // Check URL parameters for wallet connection request
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("connect") === "wallet" && isLoggedIn && !hasWallet) {
      setIsWalletModalOpen(true);
      // Remove the parameter from URL to avoid reopening the modal on refresh
      const newUrl = window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);
    }
  }, [isLoggedIn, hasWallet]);

  // Attempt to fetch profile if needed
  useEffect(() => {
    // If logged in, have email, but no userProfile, fetch it
    if (isLoggedIn && session.email && !session.userProfile) {
      console.log("Attempting to fetch user profile for missing profile:", session.email);
      dispatch(fetchOrCreateUserProfile({ 
        email: session.email,
        username: session.email.split('@')[0] 
      }))
      .unwrap()
      .then(result => {
        console.log("Successfully fetched/created user profile:", result);
      })
      .catch(error => {
        console.error("Failed to fetch/create user profile in Header:", error);
      });
    }
  }, [isLoggedIn, session.email, session.userProfile, dispatch]);

  useEffect(() => {
    // Debug log to check session state
    console.log("Header - Current session state:", {
      userId: session.userId,
      email: session.email,
      userProfile: session.userProfile,
      walletAddress: session.walletAddress,
      walletType: session.walletType,
      isLoggedIn,
      hasWallet,
    });
  }, [session, isLoggedIn, hasWallet]);

  const handleEmailAuth = () => {
    setIsAuthModalOpen(true);
  };

  const handleWalletConnect = () => {
    if (!isLoggedIn) {
      // Show auth modal if not logged in
      setIsAuthModalOpen(true);
      return;
    }

    // Show wallet connection modal
    setIsWalletModalOpen(true);
  };

  const handleLogout = () => {
    logout();
    // Close any open modals
    setIsAuthModalOpen(false);
    setIsWalletModalOpen(false);
  };

  // Handle successful auth modal close (login/signup completed)
  const handleAuthSuccess = () => {
    setIsAuthModalOpen(false);
    // If user is logged in but doesn't have a wallet, show wallet modal
    if (isLoggedIn && !hasWallet) {
      setIsWalletModalOpen(true);
    }
  };

  // Handle wallet modal close to refresh state
  const handleWalletModalClose = () => {
    setIsWalletModalOpen(false);
  };

  // Get wallet name for display
  const getWalletName = (type: string | null) => {
    if (type === "phantom") return "Phantom";
    if (type === "metamask") return "MetaMask";
    return "Wallet";
  };

  return (
    <header
      className={cn(
        "flex justify-between items-center h-[50px] sm:h-[60px] rounded-full border bordder-[#064C94] hover:shadow-sm transition-all z-50 duration-300 hover:-translate-y-0.5 hover:shadow-[#0874E3]",
        className
      )}
      style={{
        background: "linear-gradient(270deg, #0874E3 7.24%, #010405 57.23%)",
        width: "95%",
        maxWidth: "100%",
        margin: "8px auto",
      }}
    >
      <div className="flex items-center gap-1 sm:gap-2 md:gap-3 ml-3 sm:ml-4 md:ml-8 mr-2">
        {/* Mobile sidebar toggle button */}
        {!sidebarOpen && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onMenuToggle}
            className="md:hidden text-white/70 hover:text-white hover:bg-transparent"
          >
            <Menu className="h-5 w-5" />
          </Button>
        )}
        <h1
          className="text-xs sm:text-sm md:text-xl font-medium truncate max-w-[120px] sm:max-w-[140px] md:max-w-full"
          style={{
            background: "linear-gradient(to right, #3b82f6 0%, #ffffff 50%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          Swarm Node Rewards Hub
        </h1>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <HelpCircle className="w-3 h-3 sm:w-4 sm:h-4 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer" />
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-md">
              <p>
                The Swarm Network rewards users for contributing computing
                resources via nodes. Earn NLOV tokens by running tasks on your
                devices.
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <div className="flex items-center h-full py-1 sm:py-1.5">
        <div className="bg-[#040404] rounded-full p-1 sm:p-1.5 flex gap-1 sm:gap-2 items-center relative group w-fit">
          {/* Collapse Toggle - Only visible on larger screens */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="absolute -left-8 opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-gray-400 hover:text-white hidden md:block"
          >
            {isCollapsed ? (
              <ChevronRight size={20} />
            ) : (
              <ChevronLeft size={20} />
            )}
          </button>

          {/* Login/User Profile Button */}
          <Button
            variant="outline"
            onClick={isLoggedIn ? handleLogout : handleEmailAuth}
            className={cn(
              "login-button",
              "flex items-center gap-1 md:gap-2 font-medium rounded-full h-auto transition-all duration-300 min-w-[36px] sm:min-w-[40px]",
              isCollapsed || window.innerWidth < 640
                ? "px-1.5 py-1.5 sm:px-2 sm:py-2 justify-center"
                : "w-[100px] sm:w-[160px] px-3 sm:px-6 py-2 sm:py-3",
              isLoggedIn
                ? "bg-gradient-to-r from-[#22c55e] to-[#15803d] text-white border-green-500"
                : "bg-gradient-to-r from-[#0361DA] to-[#20A5EF] text-white border-[#20A5EF]"
            )}
            title={
              isLoggedIn
                ? `Logged in as ${session.email || displayName}`
                : "Login"
            }
          >
            {isLoggedIn ? (
              <LogOut
                className={cn(
                  "transition-all duration-300",
                  isCollapsed || window.innerWidth < 640
                    ? "w-3.5 h-3.5 sm:w-4 sm:h-4"
                    : "w-3 h-3 sm:w-4 sm:h-4"
                )}
              />
            ) : (
              <LogIn
                className={cn(
                  "transition-all duration-300",
                  isCollapsed || window.innerWidth < 640
                    ? "w-3.5 h-3.5 sm:w-4 sm:h-4"
                    : "w-3 h-3 sm:w-4 sm:h-4"
                )}
              />
            )}
            {!isCollapsed && window.innerWidth >= 640 && (
              <span className="transition-all duration-300 text-xs sm:text-sm whitespace-nowrap truncate max-w-[120px]">
                {isLoggedIn ? `Logout (${displayName})` : "Login"}
              </span>
            )}
          </Button>

          {/* Wallet Button - Only visible when logged in */}
          {isLoggedIn && (
            <Button
              variant="outline"
              onClick={handleWalletConnect}
              className={cn(
                "flex items-center gap-1 md:gap-2 font-medium rounded-full h-auto transition-all duration-300 min-w-[36px] sm:min-w-[40px]",
                isCollapsed || window.innerWidth < 640
                  ? "px-1.5 py-1.5 sm:px-2 sm:py-2 justify-center"
                  : "w-[100px] sm:w-[160px] px-3 sm:px-6 py-2 sm:py-3",
                hasWallet
                  ? "bg-gradient-to-r from-[#22c55e] to-[#15803d] text-white border-green-500"
                  : "bg-[#112544] text-[#0066FF] border-transparent hover:bg-[#0066FF]/10"
              )}
              title={
                hasWallet
                  ? `${getWalletName(
                      walletType
                    )} Wallet: ${session.walletAddress?.substring(
                      0,
                      6
                    )}...${session.walletAddress?.substring(
                      session.walletAddress.length - 4
                    )}`
                  : "Connect Wallet"
              }
            >
              <Wallet
                className={cn(
                  "transition-all duration-300",
                  isCollapsed || window.innerWidth < 640
                    ? "w-3.5 h-3.5 sm:w-4 sm:h-4"
                    : "w-3 h-3 sm:w-4 sm:h-4"
                )}
              />
              {!isCollapsed && window.innerWidth >= 640 && (
                <span className="transition-all duration-300 text-xs sm:text-sm whitespace-nowrap">
                  {hasWallet
                    ? `${getWalletName(walletType)}`
                    : "Connect Wallet"}
                </span>
              )}
            </Button>
          )}
        </div>

        <AuthModal isOpen={isAuthModalOpen} onClose={handleAuthSuccess} />

        <WalletConnectionModal
          isOpen={isWalletModalOpen}
          onClose={handleWalletModalClose}
        />
      </div>
    </header>
  );
};
