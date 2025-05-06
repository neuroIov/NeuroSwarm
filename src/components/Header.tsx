import React from "react";
import { WalletButton } from "./WalletButton";
import { HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface HeaderProps {
  className?: string;
}

export const Header = ({ className }: HeaderProps) => {
  return (
    <header
      className={cn(
        "flex  justify-between items-center h-[60px] rounded-full border bordder-[#064C94] hover:shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[#0874E3]",
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
        <WalletButton />
      </div>
    </header>
  );
};
