import React, { useState, useEffect } from "react";
import {
  Settings as SettingsIcon,
  Globe,
  DollarSign,
  Key,
  Trash2,
  AlertCircle,
  RefreshCw,
  ChevronDown,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "@/store/store";
import { toast } from "sonner";
import { getSwarmSupabase, deleteUserByEmail } from "@/lib/supabase-client";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { endSession } from "@/store/slices/sessionSlice";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Component for the settings card
const SettingsCard = ({
  title,
  icon,
  children,
  className = "",
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) => (
  <div className={`bg-[#161628] rounded-2xl p-6 ${className}`}>
    <div className="flex items-center gap-3 mb-5">
      <div className="bg-[#0A1A2F] p-3 rounded-lg">{icon}</div>
      <h3 className="text-white font-medium">{title}</h3>
    </div>
    {children}
  </div>
);

// Delete Confirmation Modal
const DeleteConfirmModal = ({
  isOpen,
  onClose,
  onConfirm,
  isLoading,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
}) => {
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  // Reset text when modal closes
  useEffect(() => {
    if (!isOpen) setDeleteConfirmText("");
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-[#161628] border border-[#112544] text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-red-400 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            Confirm Account Deletion
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-red-900/20 p-3 rounded-lg border border-red-500/20">
            <p className="text-sm text-red-300">
              This action is permanent and cannot be undone. All your data,
              including profile, earnings, and referrals will be permanently
              deleted.
            </p>
          </div>

          <div className="bg-red-950/30 p-3 rounded-lg border border-red-500/30">
            <p className="text-sm text-red-200">
              To confirm deletion, please type{" "}
              <span className="font-bold">"Delete Account"</span> in the field
              below:
            </p>
          </div>

          <Input
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            placeholder='Type "Delete Account"'
            className="bg-[#0A1A2F] border-red-500/30 text-white"
            autoFocus
          />

          <div className="flex flex-col gap-2">
            <Button
              onClick={onConfirm}
              className="bg-red-600 hover:bg-red-700 text-white w-full"
              disabled={isLoading || deleteConfirmText !== "Delete Account"}
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Deleting Account...
                </>
              ) : (
                "Permanently Delete Account"
              )}
            </Button>

            <Button
              onClick={onClose}
              variant="outline"
              className="text-gray-400 hover:text-gray-300 border-gray-600 w-full"
              disabled={isLoading}
            >
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const Settings: React.FC = () => {
  // State
  const [language, setLanguage] = useState("en");
  const [currency, setCurrency] = useState("usd");
  const [email, setEmail] = useState("");
  const [isResetPasswordLoading, setIsResetPasswordLoading] = useState(false);
  const [isDeleteAccountLoading, setIsDeleteAccountLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Get user profile from Redux store
  const { userProfile } = useSelector((state: RootState) => state.session);
  const { email: userEmail } = useSelector((state: RootState) => state.session);
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();

  // Set user email from profile when available
  useEffect(() => {
    if (userEmail) {
      setEmail(userEmail);
    }
  }, [userEmail]);

  // Language options
  const languages = [
    { code: "en", name: "English" },
    { code: "es", name: "Spanish" },
    { code: "fr", name: "French" },
    { code: "de", name: "German" },
    { code: "zh", name: "Chinese" },
  ];

  // Currency options (for future use)
  const currencies = [
    { code: "usd", name: "USD ($)" },
    { code: "eur", name: "EUR (€)" },
    { code: "gbp", name: "GBP (£)" },
    { code: "jpy", name: "JPY (¥)" },
  ];

  // Handle language change
  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setLanguage(e.target.value);
    toast.success(
      `Language changed to ${e.target.options[e.target.selectedIndex].text}`
    );
    // In a real app, you would dispatch an action to update the language in the store
  };

  // Handle currency change
  const handleCurrencyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setCurrency(e.target.value);
    toast.success(
      `Currency changed to ${e.target.options[e.target.selectedIndex].text}`
    );
    // In a real app, you would dispatch an action to update the currency in the store
  };

  // Handle reset password
  const handleResetPassword = async () => {
    if (!email.trim()) {
      toast.error("Please enter your email address");
      return;
    }

    try {
      setIsResetPasswordLoading(true);
      const supabase = getSwarmSupabase();

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        throw error;
      }

      toast.success("Password reset link sent to your email");
      setEmail("");
    } catch (error) {
      console.error("Password reset error:", error);
      toast.error("Failed to send password reset email");
    } finally {
      setIsResetPasswordLoading(false);
    }
  };

  const deleteUSerFromTable = async () => {
    try {
      const supabase = getSwarmSupabase();
      const { error: profileDeleteError } = await supabase
        .from("user_profiles")
        .delete()
        .eq("id", userProfile?.id);

      if (profileDeleteError) {
        throw profileDeleteError;
      }
    } catch (error) {
      console.error("Profile delete error:", error);
      toast.error("Failed to delete profile");
    }
  };

  const handleClearLocalStorage = () => {
    localStorage.clear();
  };

  // Handle delete account
  const handleDeleteAccount = async () => {
    if (!userEmail) {
      toast.error("User email not found");
      return;
    }

    try {
      setIsDeleteAccountLoading(true);

      // Use the deleteUserByEmail function from supabase-client
      const result = await deleteUserByEmail(userEmail);

      if (!result.success) {
        throw new Error(result.message);
      }

      await deleteUSerFromTable();

      toast.success("Account deleted successfully");

      localStorage.clear();

      // Dispatch end session action to clear Redux state
      dispatch(endSession());

      // Navigate to home page
      navigate("/");
    } catch (error: any) {
      console.error("Delete account error:", error);
      toast.error(`Failed to delete account: ${error.message}`);
    } finally {
      setIsDeleteAccountLoading(false);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <div className="space-y-6 p-6 rounded-3xl max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <SettingsIcon className="w-6 h-6 text-blue-400" />
        <h2 className="text-2xl font-bold">Settings</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Language Settings */}
        <SettingsCard
          title="Language"
          icon={<Globe className="w-5 h-5 text-blue-400" />}
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-400">
              Select your preferred language for the application interface.
            </p>
            <div className="flex flex-col space-y-2">
              <label htmlFor="language" className="text-sm text-white">
                Interface Language
              </label>
              <div className="relative">
                <select
                  id="language"
                  value={language}
                  onChange={handleLanguageChange}
                  className="bg-[#0A1A2F] border border-[#112544] text-white rounded-md p-2 pr-10 w-full appearance-none focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {languages.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.name}
                    </option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                </div>
              </div>
            </div>
          </div>
        </SettingsCard>

        {/* Currency Settings */}
        <SettingsCard
          title="Currency (Coming Soon)"
          icon={<DollarSign className="w-5 h-5 text-green-400" />}
        >
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <p className="text-sm text-gray-400">
                Select your preferred currency for displaying values.
              </p>
              <div className="bg-blue-500/20 text-blue-400 text-xs px-2 py-1 rounded-full">
                Coming Soon
              </div>
            </div>
            <div className="flex flex-col space-y-2">
              <label htmlFor="currency" className="text-sm text-white">
                Display Currency
              </label>
              <div className="relative">
                <select
                  id="currency"
                  value={currency}
                  onChange={handleCurrencyChange}
                  className="bg-[#0A1A2F] border border-[#112544] text-white rounded-md p-2 pr-10 w-full appearance-none focus:outline-none focus:ring-1 focus:ring-blue-500"
                  disabled
                >
                  {currencies.map((curr) => (
                    <option key={curr.code} value={curr.code}>
                      {curr.name}
                    </option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                </div>
              </div>
            </div>
          </div>
        </SettingsCard>

        {/* Reset Password */}
        <SettingsCard
          title="Reset Password"
          icon={<Key className="w-5 h-5 text-yellow-400" />}
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-400">
              Request a password reset link to be sent to your email.
            </p>
            <div className="flex flex-col space-y-2">
              <label htmlFor="reset-email" className="text-sm text-white">
                Your Email Address
              </label>
              <div className="flex gap-2">
                <Input
                  id="reset-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email address"
                  className="bg-[#0A1A2F] border-[#112544] text-white flex-1"
                />
                <Button
                  onClick={handleResetPassword}
                  className="bg-yellow-600 hover:bg-yellow-700 text-white whitespace-nowrap"
                  disabled={isResetPasswordLoading}
                >
                  {isResetPasswordLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    "Send Link"
                  )}
                </Button>
              </div>
            </div>
          </div>
        </SettingsCard>

        {/* Delete Account */}
        <SettingsCard
          title="Delete Account"
          icon={<Trash2 className="w-5 h-5 text-red-400" />}
          className="border border-red-500/20"
        >
          <div className="space-y-4">
            <div className="bg-red-900/20 p-3 rounded-lg border border-red-500/20">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-300">
                  This action is permanent and cannot be undone. All your data,
                  including profile, earnings, and referrals will be permanently
                  deleted.
                </p>
              </div>
            </div>

            <Button
              onClick={() => setShowDeleteConfirm(true)}
              className="bg-red-600 hover:bg-red-700 text-white"
              variant="destructive"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete My Account
            </Button>

            {/* Delete Confirmation Modal */}
            <DeleteConfirmModal
              isOpen={showDeleteConfirm}
              onClose={() => setShowDeleteConfirm(false)}
              onConfirm={handleDeleteAccount}
              isLoading={isDeleteAccountLoading}
            />
          </div>
        </SettingsCard>
      </div>
    </div>
  );
};

export default Settings;
