
import React from 'react';
import { Button } from '@/components/ui/button';
import { Wallet, CheckCircle } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWalletConnection } from '@/hooks/useWalletConnection';

export const WalletButton = () => {
  const { walletInfo, connectPhantom, connectMetamask, disconnect } = useWalletConnection();
  
  if (walletInfo?.connected) {
    return (
      <Button 
        variant="outline" 
        onClick={disconnect}
        className="bg-green-900/20 text-green-400 hover:bg-green-900/30 border-green-800"
      >
        <CheckCircle className="w-4 h-4" />
        <span className="hidden sm:inline">{walletInfo.address.slice(0, 6)}...{walletInfo.address.slice(-4)}</span>
        <span className="sm:hidden">Connected</span>
      </Button>
    );
  }
  
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="bg-swarm-accent-purple text-white hover:bg-swarm-accent-purple/90">
          <Wallet className="w-4 h-4" />
          <span>Connect Wallet</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={connectPhantom}>
          Connect Phantom
        </DropdownMenuItem>
        <DropdownMenuItem onClick={connectMetamask}>
          Connect MetaMask
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
