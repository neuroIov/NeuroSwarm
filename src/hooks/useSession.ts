import { useDispatch, useSelector } from "react-redux";
import { useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { RootState } from "@/store";
import {
  startSession,
  logActivity,
  endSession,
  fetchOrCreateUserProfile
} from "@/store/slices/sessionSlice";
import { AppDispatch } from "@/store";

export const useSession = () => {
  const dispatch = useDispatch<AppDispatch>();
  const session = useSelector((state: RootState) => state.session);

  const [walletConnected, setWalletConnected] = useState(false);
  const [userPublicKey, setUserPublicKey] = useState<PublicKey | null>(null);

  // Start guest session on mount or restore saved session
  useEffect(() => {
    if (!session.sessionId) {
      const savedSession = localStorage.getItem("swarm-session");

      if (savedSession) {
        try {
          const parsed = JSON.parse(savedSession);

          // Start session in Redux
          dispatch(startSession({
            userId: parsed.userId,
            authMethod: parsed.authMethod,
            walletAddress: parsed.walletAddress
          }));

          // If wallet address exists, fetch the user profile
          if (parsed.walletAddress) {
            dispatch(fetchOrCreateUserProfile(parsed.walletAddress));
            setWalletConnected(true);
            try {
              setUserPublicKey(new PublicKey(parsed.walletAddress));
            } catch (e) {
              console.error("Invalid wallet address in saved session:", e);
            }
          } else {
            console.log("Restored guest session (no wallet connected)");
          }
        } catch (e) {
          console.error("Failed to parse saved session:", e);
          // Start a guest session
          dispatch(startSession({ userId: "guest", authMethod: null }));
        }
      } else {
        // Start a guest session if no saved session
        console.log("Starting new guest session");
        dispatch(startSession({ userId: "guest", authMethod: null }));
      }
    }
  }, [dispatch, session.sessionId]);

  // Save session to localStorage when it changes
  useEffect(() => {
    if (session.sessionId) {
      localStorage.setItem("swarm-session", JSON.stringify({
        userId: session.userId,
        authMethod: session.authMethod,
        walletAddress: session.walletAddress
      }));
      console.log("Session saved to localStorage");
    }
  }, [session.sessionId, session.userId, session.authMethod, session.walletAddress]);

  // Function to connect wallet
  const connectWallet = async () => {
    if (walletConnected) {
      logout();
      return;
    }

    // Check if running on mobile
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    // Define Phantom provider interface
    interface PhantomWindow extends Window {
      phantom?: {
        solana?: {
          isPhantom?: boolean;
          connect(): Promise<{ publicKey: { toString(): string } }>;
        };
      };
    }

    const getProvider = () => {
      if ('phantom' in window) {
        const provider = (window as PhantomWindow).phantom?.solana;
        if (provider?.isPhantom) return provider;
      }

      if ('solana' in window && window.solana?.isPhantom) {
        return window.solana;
      }
      
      return null;
    };

    const provider = getProvider();

    if (provider) {
      try {
        console.log("Connecting to Phantom wallet...");
        const resp = await provider.connect();
        const publicKey = new PublicKey(resp.publicKey.toString());
        const walletAddress = publicKey.toString();

        setUserPublicKey(publicKey);
        setWalletConnected(true);
        console.log(`Connected to wallet: ${walletAddress}`);

        // Start session with wallet info
        dispatch(
          startSession({
            userId: walletAddress,
            authMethod: "wallet",
            walletAddress
          })
        );

        // Fetch or create user profile in Supabase
        dispatch(fetchOrCreateUserProfile(walletAddress));

        // Log wallet connection activity
        dispatch(logActivity({
          type: "wallet_connected",
          details: { walletAddress }
        }));

      } catch (err) {
        console.error("Wallet connection failed:", err);
        alert("Phantom Wallet connection failed.");
      }
    } else {
      console.log("Phantom wallet not detected");
      const phantomAppUrl = isMobile 
        ? 'https://phantom.app/download'
        : 'https://phantom.app/';
      
      if (confirm('Phantom wallet is required. Would you like to install it?')) {
        window.open(phantomAppUrl, '_blank');
      }
    }
  };

  // Function to log user activity
  const logUserActivity = (type: string, details: Record<string, unknown>) => {
    dispatch(logActivity({ type, details }));
  };

  // Function to logout
  const logout = () => {
    console.log("Logging out user...");

    // Clear the session from Redux
    dispatch(endSession());

    // Clear local storage
    localStorage.removeItem("swarm-session");
    console.log("Session data cleared from localStorage");

    // Reset wallet connection state
    setWalletConnected(false);
    setUserPublicKey(null);

    // Set guest session
    console.log("Starting new guest session");
    dispatch(startSession({ userId: "guest", authMethod: null }));
  };

  return {
    session,
    walletConnected,
    userPublicKey,
    connectWallet,
    logUserActivity,
    logout,
    isLoading: session.loading,
    error: session.error,
    userProfile: session.userProfile
  };
};
