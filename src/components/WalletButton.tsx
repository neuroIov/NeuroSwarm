
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Wallet, CheckCircle, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { useWallet } from '@/contexts/WalletContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const WalletButton = () => {
  const { walletAddress, isConnected, connectWallet, disconnectWallet } = useWallet();
  const [isConnecting, setIsConnecting] = useState(false);
  
  const handleWalletConnection = async (walletType: 'phantom' | 'metamask') => {
    if (isConnected) {
      disconnectWallet();
      return;
    }
    
    setIsConnecting(true);
    
    try {
      await connectWallet(walletType);
    } finally {
      setIsConnecting(false);
    }
  };
  
  if (isConnected) {
    return (
      <Button 
        variant="outline" 
        onClick={() => disconnectWallet()}
        className="bg-green-900/20 text-green-400 hover:bg-green-900/30 border-green-800 flex items-center gap-2 font-medium"
      >
        <CheckCircle className="w-4 h-4" />
        <span className="hidden sm:inline">
          {walletAddress?.slice(0, 6)}...{walletAddress?.slice(-4)}
        </span>
        <span className="sm:hidden">Connected</span>
      </Button>
    );
  }
  
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="default" 
          className="bg-swarm-accent-purple text-white hover:bg-swarm-accent-purple/90 flex items-center gap-2"
          disabled={isConnecting}
        >
          <Wallet className="w-4 h-4" />
          {isConnecting ? 'Connecting...' : 'Connect Wallet'}
          <ChevronDown className="w-4 h-4 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleWalletConnection('phantom')}>
          <img 
            src="https://phantom.app/img/phantom-logo.svg" 
            alt="Phantom" 
            className="w-4 h-4 mr-2"
          />
          Connect Phantom
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleWalletConnection('metamask')}>
          <img 
            src="https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg" 
            alt="MetaMask" 
            className="w-4 h-4 mr-2"
          />
          Connect MetaMask
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
