import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { getSwarmSupabase } from "@/lib/supabase-client";
import { useNavigate } from "react-router-dom";

interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ForgotPasswordModal({ isOpen, onClose }: ForgotPasswordModalProps) {
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  // Step 1: Send reset link (OTP)
  const handleSendResetLink = async () => {
    if (!email.trim()) {
      toast.error("Please enter your email address");
      return;
    }
    try {
      setIsLoading(true);
      const supabase = getSwarmSupabase();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success("If registered, you will receive a reset email with OTP.");
      setStep("otp");
    } catch (error) {
      toast.error("Failed to send password reset email");
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Reset password with OTP
  const handleResetPassword = async () => {
    if (!otp.trim() || !newPassword.trim() || !confirmPassword.trim()) {
      toast.error("Please enter OTP, new password, and confirm password");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    try {
      setIsLoading(true);
      const supabase = getSwarmSupabase();

      // First verify the OTP
      const { error: verifyError } = await supabase.auth.verifyOtp({
        type: "recovery",
        email,
        token: otp,
      });

      if (verifyError) throw verifyError;

      // Then update the password using the OTP as nonce
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
        nonce: otp,
      });

      if (updateError) throw updateError;

      toast.success("Password reset successful! Please login.");
      setEmail("");
      setOtp("");
      setNewPassword("");
      setConfirmPassword("");
      setStep("email");
      onClose();
      navigate("/login");
    } catch (error) {
      toast.error("Failed to reset password. Check OTP and try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70">
      <div className="bg-[#0A1A2F] p-6 rounded-lg w-full max-w-sm">
        {step === "email" ? (
          <>
            <h2 className="text-lg font-semibold text-white mb-4">Forgot Password</h2>
            <p className="text-xs text-gray-300 mb-4">
              Enter your registered email address to receive a password reset link with OTP.
            </p>
            <Input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="mb-6 bg-[#0A1A2F] border-[#112544] text-white"
            />
            <div className="flex justify-end gap-2">
              <Button
                onClick={onClose}
                variant="ghost"
                className="text-white"
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSendResetLink}
                className="bg-[#0066FF] hover:bg-[#0052CC] text-white"
                disabled={isLoading}
              >
                {isLoading ? "Sending..." : "Send Reset Link"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-white mb-4">Reset Password</h2>
            <p className="text-xs text-gray-300 mb-4">
              Enter the OTP sent to your email, then set a new password. Password must be at least 8 characters and include a mix of letters, numbers, and symbols.
            </p>
            <Input
              type="text"
              placeholder="Enter OTP from email"
              value={otp}
              onChange={e => setOtp(e.target.value)}
              className="mb-4 bg-[#0A1A2F] border-[#112544] text-white"
            />
            <Input
              type="password"
              placeholder="Enter new password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              className="mb-4 bg-[#0A1A2F] border-[#112544] text-white"
            />
            <Input
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              className="mb-6 bg-[#0A1A2F] border-[#112544] text-white"
            />
            <div className="flex justify-end gap-2">
              <Button
                onClick={() => setStep("email")}
                variant="ghost"
                className="text-white"
                disabled={isLoading}
              >
                Back
              </Button>
              <Button
                onClick={handleResetPassword}
                className="bg-[#0066FF] hover:bg-[#0052CC] text-white"
                disabled={isLoading}
              >
                {isLoading ? "Resetting..." : "Reset Password"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
