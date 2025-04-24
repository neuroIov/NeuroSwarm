
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Wallet, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

export const WalletButton = () => {
  const [connected, setConnected] = useState(false);
  const [address, setAddress] = useState("");
  
  const connectWallet = () => {
    if (connected) {
      setConnected(false);
      setAddress("");
      toast.success("Wallet disconnected");
      return;
    }
    
    // Simulate wallet connection
    setTimeout(() => {
      const mockAddress = "0x" + Math.random().toString(16).slice(2, 14);
      setAddress(mockAddress);
      setConnected(true);
      toast.success("Wallet connected successfully");
    }, 1000);
  };
  
  return (
    <Button 
      variant={connected ? "outline" : "default"} 
      onClick={connectWallet}
      className={`
        flex items-center gap-2 font-medium
        ${connected ? 'bg-green-900/20 text-green-400 hover:bg-green-900/30 border-green-800' : 'bg-swarm-accent-purple text-white hover:bg-swarm-accent-purple/90'}
      `}
    >
      {connected ? (
        <>
          <CheckCircle className="w-4 h-4" />
          <span className="hidden sm:inline">{address.slice(0, 6)}...{address.slice(-4)}</span>
          <span className="sm:hidden">Connected</span>
        </>
      ) : (
        <>
          <Wallet className="w-4 h-4" />
          <span>Connect Wallet</span>
        </>
      )}
    </Button>
  );
};
