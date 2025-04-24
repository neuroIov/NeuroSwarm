
import { useState, useEffect } from 'react';
import { toast } from 'sonner';

export type WalletProvider = 'phantom' | 'metamask';

interface WalletInfo {
  address: string;
  provider: WalletProvider;
  connected: boolean;
}

export const useWalletConnection = () => {
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null);
  
  const connectPhantom = async () => {
    try {
      // @ts-ignore - Phantom types
      const provider = window.phantom?.solana;
      
      if (!provider?.isPhantom) {
        window.open('https://phantom.app/', '_blank');
        return;
      }
      
      const response = await provider.connect();
      const address = response.publicKey.toString();
      
      setWalletInfo({
        address,
        provider: 'phantom',
        connected: true
      });
      
      toast.success('Connected to Phantom wallet');
      return address;
      
    } catch (error) {
      toast.error('Failed to connect Phantom wallet');
      return null;
    }
  };
  
  const connectMetamask = async () => {
    try {
      // @ts-ignore - Ethereum types
      if (!window.ethereum?.isMetaMask) {
        window.open('https://metamask.io/download/', '_blank');
        return;
      }
      
      // @ts-ignore - Ethereum types
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts'
      });
      
      const address = accounts[0];
      setWalletInfo({
        address,
        provider: 'metamask',
        connected: true
      });
      
      toast.success('Connected to MetaMask wallet');
      return address;
      
    } catch (error) {
      toast.error('Failed to connect MetaMask wallet');
      return null;
    }
  };
  
  const disconnect = () => {
    setWalletInfo(null);
    toast.success('Wallet disconnected');
  };
  
  return {
    walletInfo,
    connectPhantom,
    connectMetamask,
    disconnect
  };
};
