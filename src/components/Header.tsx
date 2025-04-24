
import React from 'react';
import { WalletButton } from './WalletButton';
import { HelpCircle } from 'lucide-react';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export const Header = () => {
  return (
    <header className="flex justify-between items-center py-4 px-6 border-b border-slate-800">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-white">
          <span className="nlov-gradient">Swarm</span> Node Rewards Hub
        </h1>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <HelpCircle className="w-5 h-5 text-slate-400 hover:text-slate-200 cursor-pointer" />
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-md">
              <p>The Swarm Network rewards users for contributing computing resources via nodes. Earn NLOV tokens by running tasks on your devices.</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <WalletButton />
    </header>
  );
};
