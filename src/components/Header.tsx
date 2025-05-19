import React, { useState } from "react";
import { WalletButton } from "./WalletButton";
import {
  HelpCircle,
  Mail,
  Wallet,
  X,
  ChevronLeft,
  ChevronRight,
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
}

export const Header = ({ className }: HeaderProps) => {
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
        "flex  justify-between items-center h-[60px] rounded-full border bordder-[#064C94] hover:shadow-sm transition-all z-50 duration-300 hover:-translate-y-0.5 hover:shadow-[#0874E3]",
        className
      )}
      style={{
        background: "linear-gradient(270deg, #0874E3 7.24%, #010405 57.23%)",
        width: "90%",
        maxWidth: "100%",
        margin: "8px auto",
      }}
    >
      <div className="flex items-center gap-3 ml-8 mr-2">
        <h1
          className="text-lg md:text-xl font-medium"
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
              <HelpCircle className="w-4 h-4 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer" />
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
      <div className="flex items-center h-full py-1.5">
        <div className="bg-[#040404] rounded-full p-1.5 flex gap-2 items-center relative group w-fit">
          {/* Collapse Toggle */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="absolute -left-8 opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-gray-400 hover:text-white"
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
              "flex items-center gap-2 font-medium rounded-full h-auto transition-all duration-300 min-w-[44px]",
              isCollapsed ? "px-3 py-3 justify-center" : "w-[160px] px-6 py-3",
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
                isCollapsed ? "w-5 h-5" : "w-4 h-4"
              )}
            />
            {!isCollapsed && (
              <span className="transition-all duration-300">
                {session.authMethod === "email" ? "Connected" : "Email Login"}
              </span>
            )}
          </Button>

          {/* Wallet Button */}
          <Button
            variant="outline"
            onClick={() => handleModeSwitch("wallet")}
            className={cn(
              "flex items-center gap-2 font-medium rounded-full h-auto transition-all duration-300 min-w-[44px]",
              isCollapsed ? "px-3 py-3 justify-center" : "w-[160px] px-6 py-3",
              session.authMethod === "wallet"
                ? "bg-gradient-to-r from-[#22c55e] to-[#15803d] text-white border-green-500"
                : activeButton === "wallet"
                ? "bg-gradient-to-r from-[#0361DA] to-[#20A5EF] text-white border-[#20A5EF]"
                : "bg-[#112544] text-[#0066FF] border-transparent hover:bg-[#0066FF]/10"
            )}
          >
            <Wallet
              className={cn(
                "transition-all duration-300",
                isCollapsed ? "w-5 h-5" : "w-4 h-4"
              )}
            />
            {!isCollapsed && (
              <span className="transition-all duration-300">
                {session.authMethod === "wallet"
                  ? "Connected"
                  : "Connect Wallet"}
              </span>
            )}
          </Button>
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
