import { useDispatch, useSelector } from "react-redux";
import { useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";

import { RootState } from "@/store";
import {
  startSession,
  logActivity,
  endSession,
  fetchOrCreateUserProfile,
  connectWalletToAccount,
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

  // Update local state when session changes
  useEffect(() => {
    // Update wallet connected state based on session
    if (session.walletAddress) {
      setWalletConnected(true);
      try {
        setUserPublicKey(new PublicKey(session.walletAddress));
      } catch (e) {
        console.error("Invalid wallet address in session:", e);
      }
    } else {
      setWalletConnected(false);
      setUserPublicKey(null);
    }

    // Update wallet type if available
    if (session.walletType) {
      setWalletType(session.walletType);
    }
  }, [session.walletAddress, session.walletType]);

  const loginWithEmail = async (email: string, password: string) => {
    setIsAuthLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      if (!data.user) throw new Error("No user data");

      // Start session with email auth method
      dispatch(
        startSession({
          userId: data.user.id,
          authMethod: "email",
          email: email,
          walletAddress: null,
        })
      );

      // Fetch user profile which may include a wallet address
      const result = await dispatch(fetchOrCreateUserProfile({ email })).unwrap();

      // If the user has a connected wallet, update the wallet state
      if (result.wallet_address) {
        setWalletConnected(true);
        try {
          setUserPublicKey(new PublicKey(result.wallet_address));
        } catch (e) {
          console.error("Invalid wallet address in user profile:", e);
        }
      }

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

      // Start session with email auth method
      dispatch(
        startSession({
          userId: data.user.id,
          authMethod: "email",
          email: email,
          walletAddress: null,
        })
      );

      // Create new user profile
      await dispatch(
        fetchOrCreateUserProfile({
          email,
          walletAddress: null,
          username,
        })
      );

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
              email: parsed.email,
              walletAddress: parsed.walletAddress,
              walletType: parsed.walletType || "phantom",
            })
          );

          if (parsed.email) {
            // If email is present, fetch user profile by email
            dispatch(fetchOrCreateUserProfile({ email: parsed.email }));

            // If wallet is also connected, update wallet state
            if (parsed.walletAddress) {
              setWalletConnected(true);
              try {
                setUserPublicKey(new PublicKey(parsed.walletAddress));
                setWalletType(parsed.walletType || "phantom");
              } catch (e) {
                console.error("Invalid wallet address in saved session:", e);
              }
            }
          } else if (parsed.walletAddress) {
            // Legacy support for wallet-only authentication
            dispatch(fetchOrCreateUserProfile({
              email: '',  // Pass empty string for email
              walletAddress: parsed.walletAddress
            }));
            setWalletConnected(true);
            try {
              setUserPublicKey(new PublicKey(parsed.walletAddress));
              setWalletType(parsed.walletType || "phantom");
            } catch (e) {
              console.error("Invalid wallet address in saved session:", e);
            }
          } else {
            console.log("Restored guest session (no authentication)");
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

  // Update session state when userProfile changes
  useEffect(() => {
    if (session.userId && session.userId !== 'guest' && session.userProfile) {
      // If we have a user profile but no email in the session, update the session with the email from the profile
      if (!session.email && session.userProfile && 'email' in session.userProfile) {
        const profileEmail = String(session.userProfile.email);
        console.log('Updating session with email from user profile:', profileEmail);
        dispatch(
          startSession({
            userId: session.userId,
            authMethod: session.authMethod || 'email',
            email: profileEmail,
            walletAddress: session.walletAddress,
            walletType: session.walletType,
          })
        );
      }
    }
  }, [dispatch, session.userId, session.email, session.userProfile]);

  useEffect(() => {
    if (session.sessionId) {
      localStorage.setItem(
        "swarm-session",
        JSON.stringify({
          userId: session.userId,
          authMethod: session.authMethod,
          email: session.email,
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
    session.email,
    session.walletAddress,
    session.walletType,
    walletType,
  ]);

  const connectWallet = async (type: WalletType = "phantom", force: boolean = false) => {
    // If no active session or guest session, do nothing
    if (!session.userId || session.userId === "guest") {
      console.error("You must be logged in with email before connecting a wallet");
      throw new Error("You must be logged in with email first");
    }

    // Update wallet type in local state
    setWalletType(type);

    // Log the wallet type being connected
    console.log(`Attempting to connect ${type} wallet...`);

    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    if (type === "phantom") {
      await connectPhantomWallet(isMobile, force);
    } else if (type === "metamask") {
      await connectMetaMaskWallet(force);
    }
  };

  const disconnectWallet = async () => {
    try {
      console.log("Disconnecting wallet...");

      // Update the session state
      if (session.userId && session.userId !== "guest" && session.email) {
        // Update the user profile in the database to remove the wallet address
        const supabase = getSwarmSupabase();

        if (session.userProfile?.id) {
          const { error } = await supabase
            .from('user_profiles')
            .update({ wallet_address: null })
            .eq('id', session.userProfile.id);

          if (error) {
            console.error("Failed to update user profile:", error);
            throw new Error("Failed to disconnect wallet from your account");
          }
        }

        // Update the session state to reflect the disconnected wallet
        dispatch(
          startSession({
            userId: session.userId,
            authMethod: "email", // Keep as email auth
            email: session.email,
            walletAddress: null, // Clear wallet
            walletType: null,
          })
        );

        // Reset wallet state in the UI
        setWalletConnected(false);
        setUserPublicKey(null);

        // Refresh user profile
        await dispatch(fetchOrCreateUserProfile({ email: session.email }));

        dispatch(
          logActivity({
            type: "wallet_disconnected",
            details: { previousWallet: session.walletAddress },
          })
        );

        console.log("Wallet disconnected successfully");
      } else {
        // If no email, fallback to complete logout
        logout();
      }
    } catch (error) {
      console.error("Failed to disconnect wallet:", error);
      throw new Error(error instanceof Error ? error.message : "Failed to disconnect wallet");
    }
  };

  const connectPhantomWallet = async (isMobile: boolean, force: boolean = false) => {
    interface PhantomWindow extends Window {
      phantom?: {
        solana?: {
          isPhantom?: boolean;
          connect(): Promise<{ publicKey: { toString(): string } }>;
        };
      };
    }

    const getProvider = () => {
      // First check if phantom object exists in window
      if ("phantom" in window) {
        console.log("Phantom detected in window.phantom");
        const provider = (window as PhantomWindow).phantom?.solana;
        if (provider?.isPhantom) return provider;
      }

      // Then check if solana object exists directly in window (older integration)
      if ("solana" in window && window.solana?.isPhantom) {
        console.log("Phantom detected in window.solana");
        return window.solana;
      }

      console.log("No Phantom provider found");
      return null;
    };

    const provider = getProvider();

    if (provider) {
      try {
        console.log("Connecting to Phantom wallet...");
        const resp = await provider.connect();
        console.log("Phantom connection response:", resp);

        const publicKey = new PublicKey(resp.publicKey.toString());
        const walletAddress = publicKey.toString();

        // Connect wallet to existing account
        if (session.userId && session.userId !== "guest" && session.email) {
          console.log("Dispatching connectWalletToAccount with:", {
            userId: session.userId,
            email: session.email,
            walletAddress,
            walletType: "phantom",
            force
          });

          await dispatch(connectWalletToAccount({
            userId: session.userId,
            email: session.email,
            walletAddress,
            walletType: "phantom",
            force
          }));

          // Update local state after successful connection
          setUserPublicKey(publicKey);
          setWalletConnected(true);
        }

        dispatch(
          logActivity({
            type: "wallet_connected",
            details: { walletAddress, walletType: "phantom" },
          })
        );
      } catch (err) {
        console.error("Phantom wallet connection failed:", err);
        throw new Error(err instanceof Error ? err.message : "Failed to connect Phantom wallet");
      }
    } else {
      console.log("No Phantom provider found, redirecting to installation page");
      if (isMobile) {
        window.open("https://phantom.app/download", "_blank");
      } else {
        window.open("https://phantom.app/", "_blank");
      }
      throw new Error("Phantom wallet not installed");
    }
  };

  const connectMetaMaskWallet = async (force: boolean = false) => {
    if (typeof window.ethereum !== "undefined") {
      try {
        console.log("Connecting to MetaMask wallet...");
        await window.ethereum.request({ method: "eth_requestAccounts" });
        const accounts = await window.ethereum.request({
          method: "eth_accounts",
        });

        if (!accounts || accounts.length === 0) {
          throw new Error("No accounts found in MetaMask");
        }

        const walletAddress = accounts[0];
        console.log(`MetaMask account found: ${walletAddress}`);

        // Connect wallet to existing account
        if (session.userId && session.userId !== "guest" && session.email) {
          console.log("Dispatching connectWalletToAccount with:", {
            userId: session.userId,
            email: session.email,
            walletAddress,
            walletType: "metamask",
            force
          });

          await dispatch(connectWalletToAccount({
            userId: session.userId,
            email: session.email,
            walletAddress,
            walletType: "metamask",
            force
          }));

          // Update local state after successful connection
          setWalletConnected(true);
        }

        dispatch(
          logActivity({
            type: "wallet_connected",
            details: { walletAddress, walletType: "metamask" },
          })
        );
      } catch (err) {
        console.error("MetaMask wallet connection failed:", err);
        throw new Error(err instanceof Error ? err.message : "Failed to connect MetaMask wallet");
      }
    } else {
      console.log("MetaMask not installed, redirecting to installation page");
      window.open("https://metamask.io/download/", "_blank");
      throw new Error("MetaMask not installed");
    }
  };

  const logUserActivity = (
    type: string,
    details: Record<string, unknown>
  ) => {
    dispatch(logActivity({ type, details }));
  };

  const logout = () => {
    dispatch(endSession());
    setWalletConnected(false);
    setUserPublicKey(null);
    localStorage.removeItem("swarm-session");
    supabase.auth.signOut();
  };

  // ✅ Tier logic
  const subscriptionTier = session.userProfile?.subscription_tier || "Basic";
  const maxUptime = getMaxUptimeByTier(subscriptionTier);

  return {
    session,
    walletConnected,
    userPublicKey,
    isAuthLoading,
    loginWithEmail,
    signupWithEmail,
    connectWallet,
    disconnectWallet,
    logUserActivity,
    logout,
    subscriptionTier,
    maxUptime,
    walletType: session.walletType || walletType,
  };
};
