import { useDispatch, useSelector } from "react-redux";
import { useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { RootState } from "@/store";
import { startSession, logActivity } from "@/store/slices/sessionSlice";

export const useSession = () => {
  const dispatch = useDispatch();
  const session = useSelector((state: RootState) => state.session);

  const [walletConnected, setWalletConnected] = useState(false);
  const [userPublicKey, setUserPublicKey] = useState<PublicKey | null>(null);

  // Start guest session on mount
  useEffect(() => {
    if (!session.sessionId) {
      const savedSession = localStorage.getItem("swarm-session");
  
      if (savedSession) {
        try {
          const parsed = JSON.parse(savedSession);
          dispatch(startSession(parsed));  // Restore session from localStorage
        } catch (e) {
          console.error("Failed to parse saved session:", e);
          dispatch(startSession({ userId: "guest", authMethod: "gmail" }));
        }
      } else {
        dispatch(startSession({ userId: "guest", authMethod: "gmail" }));
      }
    }
  }, [dispatch, session.sessionId]);

  useEffect(() => {
    if (session.sessionId) {
      localStorage.setItem("swarm-session", JSON.stringify(session));
    }
  }, [session]);

  // Function to connect wallet
  const connectWallet = async () => {
    if ("solana" in window && window.solana?.isPhantom) {
      try {
        const resp = await window.solana.connect();
        const publicKey = new PublicKey(resp.publicKey.toString());

        setUserPublicKey(publicKey);
        setWalletConnected(true);

        dispatch(
          startSession({
            userId: publicKey.toString(),
            authMethod: "wallet",
          })
        );
      } catch (err) {
        console.error("Wallet connection failed:", err);
        alert("Phantom Wallet connection failed.");
      }
    } else {
      alert("Phantom Wallet not detected.");
    }
  };

  // Function to log user activity
  const logUserActivity = (type: string, details: Record<string, any>) => {
    dispatch(logActivity({ type, details }));
  };

  // Function to logout
  const logout = () => {
    // Clear the session from Redux and localStorage
    dispatch(startSession({ userId: "guest", authMethod: "gmail" }));
    localStorage.removeItem("swarm-session");

    // Reset wallet connection state
    setWalletConnected(false);
    setUserPublicKey(null);
  };

  return {
    session,
    walletConnected,
    userPublicKey,
    connectWallet,
    logUserActivity,
    logout,  // Return the logout function
  };
};
