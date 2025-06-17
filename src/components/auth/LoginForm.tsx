import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useSession } from "@/hooks/useSession";
import { WalletConnectionModal } from "./WalletConnectionModal";
import { toast } from "sonner";
import { getSwarmSupabase } from "@/lib/supabase-client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Key, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";

// Password Reset Modal with OTP verification
const PasswordResetModal = ({
  isOpen,
  onClose,
  email,
  isLoading,
  onSubmit,
}: {
  isOpen: boolean;
  onClose: () => void;
  email: string;
  isLoading: boolean;
  onSubmit: (otp: string, newPassword: string) => void;
}) => {
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const { t } = useTranslation();

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setOtp("");
      setNewPassword("");
      setConfirmPassword("");
      setError("");
    }
  }, [isOpen]);

  const handleSubmit = () => {
    // Validate inputs
    if (!otp.trim()) {
      setError("Please enter the OTP sent to your email");
      return;
    }
    
    if (!newPassword.trim()) {
      setError("Please enter a new password");
      return;
    }
    
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    
    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    
    // Clear any errors and submit
    setError("");
    onSubmit(otp, newPassword);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-[#161628] border border-[#112544] text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-blue-400 flex items-center gap-2">
            <Key className="w-5 h-5" />
            {t("reset_password")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-blue-900/20 p-3 rounded-lg border border-blue-500/20">
            <p className="text-sm text-blue-300">
              {t("otp_sent_to")} <span className="font-medium">{email}</span>
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label htmlFor="otp" className="text-sm text-gray-400 block mb-1">
                {t("enter_otp")}
              </label>
              <Input
                id="otp"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="Enter OTP from email"
                className="bg-[#0A1A2F] border-[#112544] text-white"
                autoFocus
              />
            </div>

            <div>
              <label htmlFor="new-password" className="text-sm text-gray-400 block mb-1">
                {t("new_password")}
              </label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                className="bg-[#0A1A2F] border-[#112544] text-white"
              />
            </div>

            <div>
              <label htmlFor="confirm-password" className="text-sm text-gray-400 block mb-1">
                {t("confirm_password")}
              </label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                className="bg-[#0A1A2F] border-[#112544] text-white"
              />
            </div>

            {error && (
              <div className="bg-red-900/20 p-2 rounded-lg border border-red-500/20">
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Button
              onClick={handleSubmit}
              className="bg-blue-600 hover:bg-blue-700 text-white w-full"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  {t("resetting_password")}
                </>
              ) : (
                t("reset_password")
              )}
            </Button>

            <Button
              onClick={onClose}
              variant="outline"
              className="text-gray-400 hover:text-gray-300 border-gray-600 w-full"
              disabled={isLoading}
            >
              {t("cancel")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Forgot Password Modal
const ForgotPasswordModal = ({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) => {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [isResetPasswordLoading, setIsResetPasswordLoading] = useState(false);
  const { t } = useTranslation();

  // Handle reset password request
  const handleResetPassword = async () => {
    if (!email.trim()) {
      toast.error("Please enter your email address");
      return;
    }

    try {
      setIsLoading(true);
      const supabase = getSwarmSupabase();

      const { error } = await supabase.auth.resetPasswordForEmail(email);

      if (error) {
        throw error;
      }

      // Show the OTP modal
      setShowOtpModal(true);
      toast.success("OTP sent to your email");
    } catch (error) {
      console.error("Password reset error:", error);
      toast.error("Failed to send OTP email");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle OTP verification and password reset
  const handleVerifyOtpAndResetPassword = async (otp: string, newPassword: string) => {
    if (!email.trim() || !otp.trim() || !newPassword.trim()) {
      toast.error("Please fill all required fields");
      return;
    }

    try {
      setIsResetPasswordLoading(true);
      const supabase = getSwarmSupabase();

      // Step 1: Verify the OTP
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token: otp,
        type: 'recovery'
      });

      if (error) {
        throw error;
      }

      // Step 2: Update the password (user is now authenticated)
      const { data: updateData, error: updateError } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (updateError) {
        throw updateError;
      }

      toast.success("Password reset successfully");
      setShowOtpModal(false);
      onClose(); // Close the forgot password modal
    } catch (error) {
      console.error("OTP verification or password update error:", error);
      toast.error("Failed to verify OTP or reset password");
    } finally {
      setIsResetPasswordLoading(false);
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="bg-[#161628] border border-[#112544] text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-blue-400 flex items-center gap-2">
              <Key className="w-5 h-5" />
              {t("forgot_password")}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-blue-900/20 p-3 rounded-lg border border-blue-500/20">
              <p className="text-sm text-blue-300">
                {t("forgot_password_description")}
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label htmlFor="email" className="text-sm text-gray-400 block mb-1">
                  {t("your_email_address")}
                </label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("enter_email")}
                  className="bg-[#0A1A2F] border-[#112544] text-white"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Button
                onClick={handleResetPassword}
                className="bg-blue-600 hover:bg-blue-700 text-white w-full"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    {t("sending")}
                  </>
                ) : (
                  t("send_otp")
                )}
              </Button>

              <Button
                onClick={onClose}
                variant="outline"
                className="text-gray-400 hover:text-gray-300 border-gray-600 w-full"
                disabled={isLoading}
              >
                {t("cancel")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Password Reset Modal with OTP */}
      <PasswordResetModal
        isOpen={showOtpModal}
        onClose={() => setShowOtpModal(false)}
        email={email}
        isLoading={isResetPasswordLoading}
        onSubmit={handleVerifyOtpAndResetPassword}
      />
    </>
  );
};

const formSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

interface LoginFormProps {
  onSuccess: () => void;
}

export function LoginForm({ onSuccess }: LoginFormProps) {
  const { loginWithEmail, session } = useSession();
  const [isLoading, setIsLoading] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    try {
      await loginWithEmail(values.email, values.password);

      // If login successful and user doesn't have a wallet connected yet, show wallet modal
      if (!session.walletAddress) {
        setShowWalletModal(true);
      } else {
        onSuccess();
      }
    } catch (error) {
      console.error("Login failed:", error);
      form.setError("root", {
        message: "Invalid email or password",
      });
    } finally {
      setIsLoading(false);
    }
  }

  const handleWalletModalClose = () => {
    setShowWalletModal(false);
    onSuccess(); // Close the auth modal when wallet modal is closed
  };

  return (
    <>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-white">Email</FormLabel>
                <FormControl>
                  <Input
                    placeholder="you@example.com"
                    {...field}
                    className="bg-[#0A1A2F] border-[#112544] text-white"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-white">Password</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    placeholder="••••••••"
                    {...field}
                    className="bg-[#0A1A2F] border-[#112544] text-white"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setShowForgotPasswordModal(true)}
              className="text-blue-400 hover:text-blue-300 text-sm"
            >
              Forgot password?
            </button>
          </div>
          {form.formState.errors.root && (
            <div className="text-sm text-red-500">
              {form.formState.errors.root.message}
            </div>
          )}
          <Button
            type="submit"
            className="w-full bg-[#0066FF] hover:bg-[#0052CC] text-white"
            disabled={isLoading}
          >
            {isLoading ? "Logging in..." : "Login"}
          </Button>
        </form>
      </Form>

      <WalletConnectionModal
        isOpen={showWalletModal}
        onClose={handleWalletModalClose}
      />
      
      <ForgotPasswordModal 
        isOpen={showForgotPasswordModal}
        onClose={() => setShowForgotPasswordModal(false)}
      />
    </>
  );
}
