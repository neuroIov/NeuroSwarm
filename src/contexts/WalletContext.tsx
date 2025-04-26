
import React, { createContext, useContext, useState, useEffect } from 'react';
import { toast } from 'sonner';
import { getWalletSession, loginWithWallet, logoutWallet } from '@/lib/supabase';

interface WalletContextType {
  walletAddress: string | null;
  isConnected: boolean;
  connectWallet: (walletType: 'phantom' | 'metamask') => Promise<void>;
  disconnectWallet: () => void;
}

const WalletContext = createContext<WalletContextType>({
  walletAddress: null,
  isConnected: false,
  connectWallet: async () => {},
  disconnectWallet: () => {},
});

export const useWallet = () => useContext(WalletContext);

interface WalletProviderProps {
  children: React.ReactNode;
}

export const WalletProvider: React.FC<WalletProviderProps> = ({ children }) => {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  
  useEffect(() => {
    // Check for existing wallet session on mount
    const session = getWalletSession();
    if (session) {
      setWalletAddress(session.walletAddress);
    }
  }, []);
  
  const connectWallet = async (walletType: 'phantom' | 'metamask') => {
    try {
      if (walletType === 'phantom') {
        if (!(window as any).solana?.isPhantom) {
          toast.error('Phantom wallet not found', {
            description: 'Please install Phantom wallet extension first'
          });
          window.open('https://phantom.app/', '_blank');
          return;
        }
        
        const solana = (window as any).solana;
        const res = await solana.connect();
        const address = res.publicKey.toString();
        
        // In a real implementation, we'd ask for a signature to verify the wallet
        // For this example, we'll just use the address
        const loginResult = await loginWithWallet(address, 'dummy-signature');
        
        if (loginResult.success) {
          setWalletAddress(address);
          toast.success('Connected with Phantom wallet');
        }
      } 
      else if (walletType === 'metamask') {
        if (!(window as any).ethereum) {
          toast.error('MetaMask not found', {
            description: 'Please install MetaMask extension first'
          });
          window.open('https://metamask.io/', '_blank');
          return;
        }
        
        const ethereum = (window as any).ethereum;
        
        // Request account access
        const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
        const address = accounts[0];
        
        // In a real implementation, we'd ask for a signature to verify the wallet
        // For this example, we'll just use the address
        const loginResult = await loginWithWallet(address, 'dummy-signature');
        
        if (loginResult.success) {
          setWalletAddress(address);
          toast.success('Connected with MetaMask');
        }
      }
    } catch (error) {
      console.error('Error connecting wallet:', error);
      toast.error('Failed to connect wallet', {
        description: 'There was an error connecting to your wallet'
      });
    }
  };
  
  const disconnectWallet = () => {
    const result = logoutWallet();
    if (result.success) {
      setWalletAddress(null);
      toast.info('Wallet disconnected');
    }
  };
  
  return (
    <WalletContext.Provider
      value={{
        walletAddress,
        isConnected: !!walletAddress,
        connectWallet,
        disconnectWallet
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};
