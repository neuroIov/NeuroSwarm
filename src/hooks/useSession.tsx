import React, { useState, useEffect, createContext, useContext } from "react";
import { getSwarmSupabase } from "../lib/supabase-client";
import { logger } from "../utils/logger";

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  wallet_address?: string;
  created_at: string;
  updated_at: string;
  avatar_url?: string;
  is_active: boolean;
}

interface SessionContextType {
  isAuthenticated: boolean;
  userProfile: UserProfile | null;
  loading: boolean;
  error: string | null;
  login: (
    email: string,
    password: string
  ) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

// Create context with default values
const SessionContext = createContext<SessionContextType>({
  isAuthenticated: false,
  userProfile: null,
  loading: true,
  error: null,
  login: async () => ({ success: false }),
  logout: async () => {},
  refreshSession: async () => {},
});

/**
 * Provider component that wraps app and provides session context
 */
export const SessionProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch user profile data from Supabase
   */
  const fetchUserProfile = async (userId: string) => {
    try {
      const client = getSwarmSupabase();
      if (!client) {
        throw new Error("Supabase client not initialized");
      }

      const { data, error } = await client
        .from("user_profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (error) {
        throw new Error(`Error fetching user profile: ${error.message}`);
      }

      return data as UserProfile;
    } catch (err) {
      logger.error("Failed to fetch user profile:", err);
      return null;
    }
  };

  /**
   * Check active session and set authentication state
   */
  const refreshSession = async () => {
    try {
      setLoading(true);
      setError(null);

      const client = getSwarmSupabase();
      if (!client) {
        throw new Error("Supabase client not initialized");
      }

      const { data: sessionData, error: sessionError } =
        await client.auth.getSession();

      if (sessionError) {
        throw new Error(`Session error: ${sessionError.message}`);
      }

      const session = sessionData?.session;

      if (session) {
        // User is authenticated
        const profile = await fetchUserProfile(session.user.id);

        if (profile) {
          setUserProfile(profile);
          setIsAuthenticated(true);
        } else {
          // No profile found
          setIsAuthenticated(false);
          setUserProfile(null);
        }
      } else {
        // No active session
        setIsAuthenticated(false);
        setUserProfile(null);
      }
    } catch (err) {
      logger.error("Session refresh error:", err);
      setError("Failed to authenticate session");
      setIsAuthenticated(false);
      setUserProfile(null);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handle user login
   */
  const login = async (email: string, password: string) => {
    try {
      setLoading(true);
      setError(null);

      const client = getSwarmSupabase();
      if (!client) {
        throw new Error("Supabase client not initialized");
      }

      const { data, error } = await client.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError(`Login failed: ${error.message}`);
        return { success: false, message: error.message };
      }

      if (data?.user) {
        const profile = await fetchUserProfile(data.user.id);

        if (profile) {
          setUserProfile(profile);
          setIsAuthenticated(true);
          return { success: true };
        } else {
          setError("User profile not found");
          return { success: false, message: "User profile not found" };
        }
      }

      return { success: false, message: "Login failed" };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(`Login error: ${message}`);
      logger.error("Login error:", err);
      return { success: false, message };
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handle user logout
   */
  const logout = async () => {
    try {
      setLoading(true);

      const client = getSwarmSupabase();
      if (!client) {
        throw new Error("Supabase client not initialized");
      }

      await client.auth.signOut();
      setIsAuthenticated(false);
      setUserProfile(null);
    } catch (err) {
      logger.error("Logout error:", err);
    } finally {
      setLoading(false);
    }
  };

  // Check for session on initial load
  useEffect(() => {
    refreshSession();
  }, []);

  // Set up auth state change listener
  useEffect(() => {
    const client = getSwarmSupabase();
    if (!client) return;

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" && session) {
        const profile = await fetchUserProfile(session.user.id);
        if (profile) {
          setUserProfile(profile);
          setIsAuthenticated(true);
        }
      } else if (event === "SIGNED_OUT") {
        setIsAuthenticated(false);
        setUserProfile(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return (
    <SessionContext.Provider
      value={{
        isAuthenticated,
        userProfile,
        loading,
        error,
        login,
        logout,
        refreshSession,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
};

/**
 * Hook to use the session context
 */
export function useSession() {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return context;
}

// Demo/testing data for development without backend
export const createMockSession = () => {
  const mockProfile: UserProfile = {
    id: "mock-user-id",
    username: "test_user",
    email: "test@example.com",
    wallet_address: "Sol1234567890abcdefghijklmnopqrstuvwxyz",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    avatar_url: "https://via.placeholder.com/150",
    is_active: true,
  };

  return {
    isAuthenticated: true,
    userProfile: mockProfile,
    loading: false,
    error: null,
    login: async () => ({ success: true }),
    logout: async () => {},
    refreshSession: async () => {},
  };
};
