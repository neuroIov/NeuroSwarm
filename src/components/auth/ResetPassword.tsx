import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { getSwarmSupabase } from "@/lib/supabase-client";
import { Eye, EyeOff, Lock, RefreshCw } from "lucide-react";
import { motion } from "framer-motion";

const ResetPassword: React.FC = () => {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isValidSession, setIsValidSession] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const supabase = getSwarmSupabase();

  // Check if user has valid session from password reset link
  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error("Session error:", error);
          toast.error("Invalid or expired reset link");
          navigate("/login");
          return;
        }

        if (session) {
          setIsValidSession(true);
        } else {
          toast.error("Invalid or expired reset link. Please request a new password reset.");
          navigate("/login");
        }
      } catch (error) {
        console.error("Error checking session:", error);
        toast.error("Something went wrong. Please try again.");
        navigate("/login");
      } finally {
        setIsCheckingSession(false);
      }
    };

    checkSession();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === "PASSWORD_RECOVERY") {
          setIsValidSession(true);
          setIsCheckingSession(false);
        } else if (event === "SIGNED_OUT") {
          navigate("/login");
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [navigate, supabase.auth]);

  const validatePassword = (password: string): boolean => {
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters long");
      return false;
    }
    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
      toast.error("Password must contain at least one uppercase letter, one lowercase letter, and one number");
      return false;
    }
    return true;
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newPassword || !confirmPassword) {
      toast.error("Please fill in all fields");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    if (!validatePassword(newPassword)) {
      return;
    }

    try {
      setIsLoading(true);

      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        throw error;
      }

      toast.success("Password updated successfully! You can now log in with your new password.");
      
      // Sign out the user so they can log in with new password
      await supabase.auth.signOut();
      
      // Redirect to login page
      navigate("/login");
    } catch (error: any) {
      console.error("Password update error:", error);
      toast.error(error.message || "Failed to update password. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (isCheckingSession) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0A0A0F] via-[#1A1A2E] to-[#16213E] flex items-center justify-center">
        <div className="bg-[#161628] p-8 rounded-2xl shadow-2xl w-full max-w-md">
          <div className="flex items-center justify-center">
            <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
            <span className="ml-2 text-white">Verifying reset link...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!isValidSession) {
    return null; // Will redirect to login
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0A0A0F] via-[#1A1A2E] to-[#16213E] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="bg-[#161628] p-8 rounded-2xl shadow-2xl w-full max-w-md border border-[#112544]"
      >
        <div className="text-center mb-8">
          <div className="bg-[#0A1A2F] p-4 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
            <Lock className="w-8 h-8 text-blue-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Reset Your Password</h1>
          <p className="text-gray-400">Enter your new password below</p>
        </div>

        <form onSubmit={handleResetPassword} className="space-y-6">
          <div className="space-y-2">
            <label htmlFor="newPassword" className="text-sm font-medium text-white">
              New Password
            </label>
            <div className="relative">
              <Input
                id="newPassword"
                type={showPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter your new password"
                className="bg-[#0A1A2F] border-[#112544] text-white pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-white"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="confirmPassword" className="text-sm font-medium text-white">
              Confirm New Password
            </label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your new password"
                className="bg-[#0A1A2F] border-[#112544] text-white pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-white"
              >
                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="bg-blue-900/20 p-3 rounded-lg border border-blue-500/20">
            <p className="text-xs text-blue-300">
              Password must be at least 8 characters long and contain uppercase, lowercase, and numeric characters.
            </p>
          </div>

          <Button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Updating Password...
              </>
            ) : (
              "Update Password"
            )}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => navigate("/login")}
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            Back to Login
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default ResetPassword;
