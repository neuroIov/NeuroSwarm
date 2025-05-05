import React from 'react';
import { WalletButton } from './WalletButton';
import { HelpCircle, Menu } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export const Header = ({ toggleSidebar }: { toggleSidebar?: () => void }) => {
  return (
    <header
      className="flex container justify-between items-center rounded-full h-[60px] px-4 md:pl-6 md:pr-0 border-b border-white-800 py-0"
      style={{
        background: 'linear-gradient(270deg, #0874E3 7.24%, #010405 57.23%)',
        width: '100%',
        maxWidth: '100%',
        margin: '0 auto',
      }}
    >
      <div className="flex items-center gap-3">
        {/* Mobile menu button */}
        <button
          className="md:hidden text-white"
          onClick={toggleSidebar}
        >
          <Menu className="w-5 h-5" />
        </button>

        <h1 className="text-lg md:text-xl  text-white font-urbanist">
          Swarm Node Rewards Hub
        </h1>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger className="hidden md:block">
              <HelpCircle className="w-5 h-5 text-slate-400 hover:text-slate-200 cursor-pointer" />
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-md">
              <p>The Swarm Network rewards users for contributing computing resources via nodes. Earn NLOV tokens by running tasks on your devices.</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <div className="flex items-center h-full">
        <WalletButton />
      </div>
    </header>
  );
};