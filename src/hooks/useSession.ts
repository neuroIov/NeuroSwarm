import { useDispatch, useSelector } from "react-redux";
import { useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";

import { RootState } from "@/store";
import {
  startSession,
  logActivity,
  endSession,
  fetchOrCreateUserProfile,
} from "@/store/slices/sessionSlice";
import { AppDispatch } from "@/store";
import { getSwarmSupabase } from "@/lib/supabase-client";
import { getMaxUptimeByTier } from "@/lib/subscriptionTiers"; // ✅ NEW

export type WalletType = "phantom" | "metamask";

export const useSession = () => {
  const dispatch = useDispatch<AppDispatch>();
  const session = useSelector((state: RootState) => state.session);
  const supabase = getSwarmSupabase();

  const [walletConnected, setWalletConnected] = useState(false);
  const [userPublicKey, setUserPublicKey] = useState<PublicKey | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [walletType, setWalletType] = useState<WalletType>("phantom");

  const loginWithEmail = async (email: string, password: string) => {
    setIsAuthLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      if (!data.user) throw new Error("No user data");

      dispatch(
        startSession({
          userId: data.user.id,
          authMethod: "email",
          walletAddress: null,
        })
      );

      dispatch(fetchOrCreateUserProfile(data.user.id));

      dispatch(
        logActivity({
          type: "email_login",
          details: { email },
        })
      );
    } catch (error) {
      console.error("Email login failed:", error);
      throw error;
    } finally {
      setIsAuthLoading(false);
    }
  };

  const signupWithEmail = async (
    email: string,
    password: string,
    username: string
  ) => {
    setIsAuthLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username,
          },
        },
      });

      if (error) throw error;
      if (!data.user) throw new Error("No user data");

      dispatch(
        startSession({
          userId: data.user.id,
          authMethod: "email",
          walletAddress: null,
        })
      );

      await supabase.from("user_profiles").insert([
        {
          id: data.user.id,
          user_name: username,
          total_earnings: 0,
          total_tasks_completed: 0,
          reputation_score: 0,
        },
      ]);

      dispatch(
        logActivity({
          type: "email_signup",
          details: { email, username },
        })
      );
    } catch (error) {
      console.error("Email signup failed:", error);
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

          dispatch(
            startSession({
              userId: parsed.userId,
              authMethod: parsed.authMethod,
              walletAddress: parsed.walletAddress,
              walletType: parsed.walletType || "phantom",
            })
          );

          if (parsed.walletAddress) {
            dispatch(fetchOrCreateUserProfile(parsed.walletAddress));
            setWalletConnected(true);
            try {
              setUserPublicKey(new PublicKey(parsed.walletAddress));
              setWalletType(parsed.walletType || "phantom");
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
      localStorage.setItem(
        "swarm-session",
        JSON.stringify({
          userId: session.userId,
          authMethod: session.authMethod,
          walletAddress: session.walletAddress,
          walletType: session.walletType || walletType,
        })
      );
      console.log("Session saved to localStorage");
    }
  }, [
    session.sessionId,
    session.userId,
    session.authMethod,
    session.walletAddress,
    session.walletType,
    walletType,
  ]);

  const connectWallet = async (type: WalletType = "phantom") => {
    if (walletConnected) {
      logout();
      return;
    }

    setWalletType(type);
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    if (type === "phantom") {
      await connectPhantomWallet(isMobile);
    } else if (type === "metamask") {
      await connectMetaMaskWallet();
    }
  };

  const connectPhantomWallet = async (isMobile: boolean) => {
    interface PhantomWindow extends Window {
      phantom?: {
        solana?: {
          isPhantom?: boolean;
          connect(): Promise<{ publicKey: { toString(): string } }>;
        };
      };
    }

    const getProvider = () => {
      if ("phantom" in window) {
        const provider = (window as PhantomWindow).phantom?.solana;
        if (provider?.isPhantom) return provider;
      }

      if ("solana" in window && window.solana?.isPhantom) {
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
        console.log(`Connected to Phantom wallet: ${walletAddress}`);

        dispatch(
          startSession({
            userId: walletAddress,
            authMethod: "wallet",
            walletAddress,
            walletType: "phantom",
          })
        );

        dispatch(fetchOrCreateUserProfile(walletAddress));

        dispatch(
          logActivity({
            type: "wallet_connected",
            details: { walletAddress, walletType: "phantom" },
          })
        );
      } catch (err) {
        console.error("Phantom wallet connection failed:", err);
        alert("Phantom Wallet connection failed.");
      }
    } else {
      console.log("Phantom wallet not detected");
      const phantomAppUrl = isMobile
        ? "https://phantom.app/download"
        : "https://phantom.app/";

      if (
        confirm("Phantom wallet is required. Would you like to install it?")
      ) {
        window.open(phantomAppUrl, "_blank");
      }
    }
  };

  const connectMetaMaskWallet = async () => {
    if (typeof (window as any).ethereum === 'undefined') {
      console.log("MetaMask not detected");
      if (
        confirm("MetaMask is required. Would you like to install it?")
      ) {
        window.open("https://metamask.io/download/", "_blank");
      }
      return;
    }

    try {
      console.log("Connecting to MetaMask wallet...");
      const ethereum = (window as any).ethereum;
      const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
      const walletAddress = accounts[0];

      if (!walletAddress) {
        throw new Error("No wallet address received from MetaMask");
      }

      // We can't use PublicKey from Solana for MetaMask addresses
      // Create a string version only for display
      setUserPublicKey({
        toString: () => walletAddress,
      } as unknown as PublicKey);

      setWalletConnected(true);
      console.log(`Connected to MetaMask wallet: ${walletAddress}`);

      dispatch(
        startSession({
          userId: walletAddress,
          authMethod: "wallet",
          walletAddress,
          walletType: "metamask",
        })
      );

      dispatch(fetchOrCreateUserProfile(walletAddress));

      dispatch(
        logActivity({
          type: "wallet_connected",
          details: { walletAddress, walletType: "metamask" },
        })
      );
    } catch (err) {
      console.error("MetaMask wallet connection failed:", err);
      alert("MetaMask Wallet connection failed.");
    }
  };

  const logUserActivity = (
    type: string,
    details: Record<string, unknown>
  ) => {
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
    walletType, // Export wallet type
  };
};
