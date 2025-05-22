import React, { useState } from "react";
import { WalletButton } from "./WalletButton";
import { WalletSelector } from "./WalletSelector";
import {
  HelpCircle,
  Mail,
  Wallet,
  X,
  ChevronLeft,
  ChevronRight,
  Menu,
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
  const [activeButton, setActiveButton] = useState<"email" | "wallet">(
    "wallet"
  );
  const [showMessage, setShowMessage] = useState(false);
  const [pendingMode, setPendingMode] = useState<"email" | "wallet" | null>(
    null
  );
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { connectWallet, session, logout } = useSession();

  const handleModeSwitch = (mode: "email" | "wallet") => {
    // If already connected with a different mode, show message
    if (
      session.authMethod &&
      session.authMethod !== mode &&
      session.userId !== "guest"
    ) {
      setShowMessage(true);
      setPendingMode(mode);
      return;
    }

    // If not connected or same mode, proceed normally
    setActiveButton(mode);
    if (mode === "email") {
      setIsAuthModalOpen(true);
    } else {
      connectWallet();
    }
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
          {/* Email Button */}
          <Button
            variant="outline"
            onClick={() => handleModeSwitch("email")}
            className={cn(
              "flex items-center gap-1 md:gap-2 font-medium rounded-full h-auto transition-all duration-300 min-w-[36px] sm:min-w-[40px]",
              isCollapsed || window.innerWidth < 640
                ? "px-1.5 py-1.5 sm:px-2 sm:py-2 justify-center"
                : "w-[100px] sm:w-[160px] px-3 sm:px-6 py-2 sm:py-3",
              session.authMethod === "email"
                ? "bg-gradient-to-r from-[#22c55e] to-[#15803d] text-white border-green-500"
                : activeButton === "email"
                ? "bg-gradient-to-r from-[#0361DA] to-[#20A5EF] text-white border-[#20A5EF]"
                : "bg-[#112544] text-[#0066FF] border-transparent hover:bg-[#0066FF]/10"
            )}
          >
            <Mail
              className={cn(
                "transition-all duration-300",
                isCollapsed || window.innerWidth < 640
                  ? "w-3.5 h-3.5 sm:w-4 sm:h-4"
                  : "w-3 h-3 sm:w-4 sm:h-4"
              )}
            />
            {!isCollapsed && window.innerWidth >= 640 && (
              <span className="transition-all duration-300 text-xs sm:text-sm whitespace-nowrap">
                {session.authMethod === "email" ? "Connected" : "Email Login"}
              </span>
            )}
          </Button>

          {/* Wallet Selector - Replace custom wallet button with WalletSelector */}
          <WalletSelector
            onClose={() => {
              setShowMessage(false);
              setPendingMode(null);
            }}
          />
        </div>

        {/* Switch Connection Message */}
        {showMessage && (
          <div className="absolute top-full mt-2 right-0 bg-[#0A1A2F] border border-[#20A5EF]/20 rounded-lg p-4 shadow-lg min-w-[250px] animate-in fade-in slide-in-from-top-2">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-white font-medium">Switch Connection?</h3>
              <button
                onClick={() => {
                  setShowMessage(false);
                  setPendingMode(null);
                }}
                className="text-gray-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>
            <p className="text-sm text-gray-400 mb-3">
              This will disconnect your current session
            </p>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowMessage(false);
                  setPendingMode(null);
                }}
                className="bg-transparent hover:bg-[#112544] text-gray-400 hover:text-white border-gray-600"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  if (pendingMode) {
                    logout();
                    setActiveButton(pendingMode);
                    if (pendingMode === "email") {
                      setIsAuthModalOpen(true);
                    } else {
                      connectWallet();
                    }
                    setShowMessage(false);
                    setPendingMode(null);
                  }
                }}
                className="bg-[#0066FF] hover:bg-[#0052CC] text-white"
              >
                Switch
              </Button>
            </div>
          </div>
        )}

        <AuthModal
          isOpen={isAuthModalOpen}
          onClose={() => setIsAuthModalOpen(false)}
        />
      </div>
    </header>
  );
};
