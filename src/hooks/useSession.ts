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
import { getSwarmSupabase } from "@/lib/supabase-client";

// ✅ Helper function for max uptime by subscription tier
export const getMaxUptimeByTier = (tier: string): number => {
  switch (tier) {
    case "Basic":
      return (4 + 6) * 60 * 60; // 10 hours
    case "Pro":
      return (4 + 8) * 60 * 60; // 12 hours
    case "Elite":
      return 24 * 60 * 60; // 24 hours
    default:
      return 4 * 60 * 60; // Guest or unrecognized
  }
};

export const useSession = () => {
  const dispatch = useDispatch<AppDispatch>();
  const session = useSelector((state: RootState) => state.session);
  const supabase = getSwarmSupabase();

  const [walletConnected, setWalletConnected] = useState(false);
  const [userPublicKey, setUserPublicKey] = useState<PublicKey | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  const loginWithEmail = async (email: string, password: string) => {
    setIsAuthLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      if (!data.user) throw new Error('No user data');

      dispatch(
        startSession({
          userId: data.user.id,
          authMethod: 'email',
          walletAddress: null
        })
      );

      dispatch(fetchOrCreateUserProfile(data.user.id));

      dispatch(logActivity({
        type: 'email_login',
        details: { email }
      }));

    } catch (error) {
      console.error('Email login failed:', error);
      throw error;
    } finally {
      setIsAuthLoading(false);
    }
  };

  const signupWithEmail = async (email: string, password: string, username: string) => {
    setIsAuthLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username
          }
        }
      });

      if (error) throw error;
      if (!data.user) throw new Error('No user data');

      dispatch(
        startSession({
          userId: data.user.id,
          authMethod: 'email',
          walletAddress: null
        })
      );

      await supabase
        .from('user_profiles')
        .insert([
          {
            id: data.user.id,
            user_name: username,
            total_earnings: 0,
            total_tasks_completed: 0,
            reputation_score: 0
          }
        ]);

      dispatch(logActivity({
        type: 'email_signup',
        details: { email, username }
      }));

    } catch (error) {
      console.error('Email signup failed:', error);
      throw error;
    } finally {
      setIsAuthLoading(false);
    }
  };

  useEffect(() => {
    if (!session.sessionId) {
      const savedSession = localStorage.getItem("swarm-session");

      if (savedSession) {
        try {
          const parsed = JSON.parse(savedSession);

          dispatch(startSession({
            userId: parsed.userId,
            authMethod: parsed.authMethod,
            walletAddress: parsed.walletAddress
          }));

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
          dispatch(startSession({ userId: "guest", authMethod: null }));
        }
      } else {
        console.log("Starting new guest session");
        dispatch(startSession({ userId: "guest", authMethod: null }));
      }
    }
  }, [dispatch, session.sessionId]);

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

  const connectWallet = async () => {
    if (walletConnected) {
      logout();
      return;
    }

    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

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

        dispatch(
          startSession({
            userId: walletAddress,
            authMethod: "wallet",
            walletAddress
          })
        );

        dispatch(fetchOrCreateUserProfile(walletAddress));

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

  const logUserActivity = (type: string, details: Record<string, unknown>) => {
    dispatch(logActivity({ type, details }));
  };

  const logout = () => {
    console.log("Logging out user...");

    dispatch(endSession());
    localStorage.removeItem("swarm-session");
    console.log("Session data cleared from localStorage");

    setWalletConnected(false);
    setUserPublicKey(null);

    console.log("Starting new guest session");
    dispatch(startSession({ userId: "guest", authMethod: null }));
  };

  // ✅ Tier logic
  const subscriptionTier = session.userProfile?.subscription_tier || "Basic";
  const maxUptime = getMaxUptimeByTier(subscriptionTier);

  return {
    session,
    walletConnected,
    userPublicKey,
    connectWallet,
    logUserActivity,
    logout,
    isLoading: session.loading,
    error: session.error,
    userProfile: session.userProfile,
    loginWithEmail,
    signupWithEmail,
    subscriptionTier,
    maxUptime, // ✅ Export max uptime in seconds based on tier
  };
};
