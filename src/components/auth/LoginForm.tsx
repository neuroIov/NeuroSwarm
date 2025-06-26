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

interface LoginFormProps {
  onSuccess: () => void;
}

export function LoginForm({ onSuccess }: LoginFormProps) {
  const { loginWithEmail, loginWithGoogle, isAuthLoading } = useSession();
  const { t } = useTranslation();
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);

  const formSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    try {
      await loginWithEmail(values.email, values.password);
      toast.success("Successfully logged in!");
      onSuccess();
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Login failed";
      toast.error(errorMessage);
      console.error("Login error:", error);
    }
  }

  const handleGoogleLogin = async () => {
    try {
      toast.info(t('auth.oauth_redirect'));
      await loginWithGoogle();
      // Success is handled by the auth state listener
    } catch (error) {
      console.error("Google login error:", error);
      toast.error(t('auth.google_auth_error'));
    }
  };

  const handleWalletModalClose = () => {
    setShowWalletModal(false);
  };

  return (
    <>
      <div className="space-y-6">
       

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm text-gray-400">Email</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Enter your email"
                      {...field}
                      className="bg-[#0A1A2F] border-[#112544] text-white"
                    />
                  </FormControl>
                  <FormMessage className="text-red-500" />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <div className="flex justify-between">
                    <FormLabel className="text-sm text-gray-400">Password</FormLabel>
                    <span 
                      className="text-sm text-blue-500 hover:text-blue-400 cursor-pointer"
                      onClick={() => setShowForgotPasswordModal(true)}
                    >
                      {t("forgot_password")}
                    </span>
                  </div>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="Enter your password"
                      {...field}
                      className="bg-[#0A1A2F] border-[#112544] text-white"
                    />
                  </FormControl>
                  <FormMessage className="text-red-500" />
                </FormItem>
              )}
            />
            <Button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              disabled={isAuthLoading}
            >
              {isAuthLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Loading...
                </>
              ) : (
                "Sign In"
              )}
            </Button>
          </form>
        </Form>

        {/* Divider */}
        <div className="relative flex items-center justify-center my-4">
          <hr className="w-full border-t border-gray-700" />
          <span className="px-3 text-sm text-gray-500 bg-transparent">or</span>
          <hr className="w-full border-t border-gray-700" />
        </div>

        {/* Google Sign-In Button - Now at the bottom */}
        <Button 
           type="submit"
           variant="outline"
          className="w-full bg-blue-600 hover:bg-blue-700 text-white"
          onClick={handleGoogleLogin}
          disabled={isAuthLoading}
        >
          {isAuthLoading ? (
            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <svg className="h-5 w-5 mr-3" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
          )}
          {t("auth.continue_with_google")}
        </Button>
      </div>

      {/* Wallet connection modal */}
      <WalletConnectionModal
        isOpen={showWalletModal}
        onClose={handleWalletModalClose}
      />

      {/* Forgot password modal */}
      <ForgotPasswordModal
        isOpen={showForgotPasswordModal}
        onClose={() => setShowForgotPasswordModal(false)}
      />
    </>
  );
}
