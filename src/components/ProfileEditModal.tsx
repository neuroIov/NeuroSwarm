import { useState, useEffect } from "react";
import { useDispatch } from "react-redux";
import { connectWalletToAccount } from "@/store/slices/sessionSlice";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useAppDispatch, useAppSelector } from "@/store";
import { updateUsername } from "@/store/slices/sessionSlice";
import {
  User,
  Mail,
  Wallet,
  Calendar,
  CheckCircle,
  Copy,
  CreditCard,
} from "lucide-react";
import { Badge } from "./ui/badge";

// Define extended session type with additional properties
interface ExtendedSession {
  userId: string | null;
  email?: string;
  username?: string;
  walletAddress?: string;
  walletType?: string;
  createdAt?: string;
  referralCode?: string;
  referralCount?: number;
  plan?: string;
}

interface ProfileEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: ExtendedSession;
}

export function ProfileEditModal({
  isOpen,
  onClose,
  session,
}: ProfileEditModalProps) {
  const [username, setUsername] = useState("");
  const [copySuccess, setCopySuccess] = useState(false);
  const [manualWalletAddress, setManualWalletAddress] = useState("");
  const [isSavingWallet, setIsSavingWallet] = useState(false);

  const dispatch = useAppDispatch();
  const { userProfile, loading, plan } = useAppSelector(
    (state) => state.session
  );

  // Get the email from either the session prop or the userProfile
  const userEmail =
    session.email ||
    (userProfile && "email" in userProfile
      ? String(userProfile.email)
      : null) ||
    "Not set";

  // Get the plan from session or use default "free"
  const userPlan = session.plan || plan || "free";

  // Helper function to clean username by removing wallet type metadata
  const cleanUsername = (username: string | null): string | null => {
    if (!username) return null;
    return username
      .replace(/\s*\[wallet_type:(phantom|metamask)\]\s*/, "")
      .trim();
  };

  // Helper function to extract wallet type from username
  const extractWalletType = (username: string | null): string | null => {
    if (!username) return null;
    const match = username.match(/\[wallet_type:(phantom|metamask)\]/);
    if (match && match[1]) {
      return match[1];
    }
    return null;
  };

  // Update username state when session changes
  useEffect(() => {
    if (session.username) {
      // Clean the username to remove wallet type metadata
      const cleanedUsername = cleanUsername(session.username);
      setUsername(cleanedUsername || "");
    }
  }, [session.username]);

  // Debug log
  useEffect(() => {
    console.log("ProfileEditModal session:", session);
    console.log("ProfileEditModal userProfile:", userProfile);
    console.log("ProfileEditModal plan:", userPlan);
  }, [session, userProfile, userPlan]);

  const handleSaveUsername = async () => {
    if (!username.trim() || username.length < 3) {
      toast.error("Username must be at least 3 characters");
      return;
    }

    if (!session.userId) {
      toast.error("User ID not found");
      return;
    }

    try {
      // Preserve wallet type info if it exists
      let finalUsername = username;

      if (session.username) {
        const walletType = extractWalletType(session.username);
        if (walletType) {
          finalUsername = `${username} [wallet_type:${walletType}]`;
        }
      } else if (session.walletType) {
        finalUsername = `${username} [wallet_type:${session.walletType}]`;
      }

      await dispatch(
        updateUsername({
          userId: session.userId,
          username: finalUsername,
        })
      );
      toast.success("Username updated successfully");
    } catch (error) {
      toast.error("Failed to update username");
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  // Helper function to get wallet type display name
  const getWalletType = (): string => {
    if (!session.walletAddress) return "Not Connected";

    // First try to get wallet type from session
    if (session.walletType) {
      return (
        session.walletType.charAt(0).toUpperCase() + session.walletType.slice(1)
      );
    }

    // If not available, try to extract from username
    if (session.username) {
      const extractedType = extractWalletType(session.username);
      if (extractedType) {
        return extractedType.charAt(0).toUpperCase() + extractedType.slice(1);
      }
    }

    return "Connected"; // Default if we can't determine the type
  };

  // Helper function to shorten wallet address
  const shortenWalletAddress = (address: string | null | undefined): string => {
    if (!address) return "";
    return `${address.substring(0, 6)}...${address.substring(
      address.length - 4
    )}`;
  };

  // Helper function to format subscription plan name
  const formatPlanName = (plan: string): string => {
    if (!plan) return "Free";
    return plan.charAt(0).toUpperCase() + plan.slice(1);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-[#0F0F0F] border border-[#1F2937] text-white max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            Profile Settings
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="user" className="space-y-4">
          <TabsList className="grid grid-cols-2 bg-gray-800/30">
            <TabsTrigger value="user" className="data-[state=active]:bg-gray-700/30">
              <span className="flex items-center gap-2">
                <User className="h-4 w-4" /> User Info
              </span>
            </TabsTrigger>
            <TabsTrigger value="wallet" className="data-[state=active]:bg-gray-700/30">
              <span className="flex items-center gap-2">
                <Wallet className="h-4 w-4" /> Wallet
              </span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="user" className="space-y-4 mt-4">
            <div className="border border-gray-800 rounded-md p-4 bg-gray-900/30">
              <div className="flex items-center gap-2 mb-4">
                <User className="h-5 w-5 text-blue-400" />
                <h3 className="text-sm font-medium">User Information</h3>
              </div>

            {/* Email */}
            <div className="mb-4">
              <Label
                htmlFor="email"
                className="text-sm text-gray-400 mb-1 block"
              >
                Email
              </Label>
              <div className="flex items-center gap-2 bg-[#1A1A1A] p-2 rounded border border-[#333] text-gray-300">
                <Mail className="h-4 w-4 text-blue-400" />
                <span>{userEmail}</span>
              </div>
            </div>

            {/* Username */}
            <div className="mb-4">
              <Label
                htmlFor="username"
                className="text-sm text-gray-400 mb-1 block"
              >
                Username
              </Label>
              <div className="flex gap-2">
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="bg-[#1A1A1A] border-[#333] focus:border-blue-600 text-white"
                  placeholder="Enter username"
                />
                <Button
                  onClick={handleSaveUsername}
                  className="bg-blue-600 hover:bg-blue-700"
                  disabled={loading}
                >
                  {loading ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>

            {/* Member Since */}
            <div className="mb-4">
              <Label
                htmlFor="memberSince"
                className="text-sm text-gray-400 mb-1 block"
              >
                Member Since
              </Label>
              <div className="flex items-center gap-2 bg-[#1A1A1A] p-2 rounded border border-[#333] text-gray-300">
                <Calendar className="h-4 w-4 text-blue-400" />
                <span>
                  {session.createdAt
                    ? new Date(session.createdAt).toLocaleDateString()
                    : "N/A"}
                </span>
              </div>
            </div>

            {/* Subscription Plan */}
            <div className="mb-4">
              <Label
                htmlFor="subscriptionPlan"
                className="text-sm text-gray-400 mb-1 block"
              >
                Subscription Plan
              </Label>
              <div className="flex items-center gap-2 bg-[#1A1A1A] p-2 rounded border border-[#333] text-gray-300">
                <CreditCard className="h-4 w-4 text-blue-400" />
                <span>{formatPlanName(userPlan)}</span>
                {userPlan !== "free" && (
                  <Badge className="ml-2 bg-green-800 text-green-200">
                    Premium
                  </Badge>
                )}
              </div>
              {userPlan === "free" && (
                <div className="mt-2">
                  <Button
                    onClick={() =>
                      window.open("https://app.neurolov.ai/", "_blank")
                    }
                    size="sm"
                    className="w-full mt-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                  >
                    Upgrade Plan
                    <span className="text-xs font-thin text-white/70">
                      connect to our app
                    </span>
                  </Button>
                </div>
              )}
            </div>
          </div>
          </TabsContent>

          <TabsContent value="wallet" className="space-y-4 mt-4">
            <div className="border border-gray-800 rounded-md p-4 bg-gray-900/30">
              <div className="flex items-center gap-2 mb-4">
                <Wallet className="h-5 w-5 text-blue-400" />
                <h3 className="text-sm font-medium">Wallet Information</h3>
              </div>

            {session.walletAddress ? (
              <>
                <div className="mb-4">
                  <Label className="text-sm text-gray-400 mb-1 block">
                    Wallet Type
                  </Label>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className="bg-blue-900/20 text-blue-400 border-blue-800"
                    >
                      {getWalletType()}
                    </Badge>
                  </div>
                </div>

                <div>
                  <Label className="text-sm text-gray-400 mb-1 block">
                    Wallet Address
                  </Label>
                  <div className="flex items-center justify-between bg-[#1A1A1A] p-2 rounded border border-[#333] text-gray-300">
                    <span className="text-sm">
                      {shortenWalletAddress(session.walletAddress)}
                    </span>
                    <button
                      onClick={() => copyToClipboard(session.walletAddress)}
                      className="text-gray-400 hover:text-white"
                    >
                      {copySuccess ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-4 py-4">
                <p className="text-gray-400 text-center">No wallet connected</p>
                
                <div className="space-y-2">
                  <Label htmlFor="manualWalletAddress">Enter Wallet Address</Label>
                  <Input
                    id="manualWalletAddress"
                    placeholder="0x..."
                    className="bg-[#1A1A1A] border-[#333]"
                    value={manualWalletAddress}
                    onChange={(e) => setManualWalletAddress(e.target.value)}
                  />
                  <Button
                    variant="outline"
                    className="w-full bg-[#1A1A1A] border-[#333] hover:bg-[#252525]"
                    onClick={async () => {
                      if (!manualWalletAddress.trim()) {
                        toast.error("Please enter a wallet address");
                        return;
                      }
                      if (!session.userId) {
                        toast.error("User ID not found");
                        return;
                      }

                      setIsSavingWallet(true);
                      try {
                        // Use Redux action to connect wallet
                        await dispatch(connectWalletToAccount({
                          userId: session.userId,
                          email: session.email || "",
                          walletAddress: manualWalletAddress,
                          walletType: "manual",
                          force: true // Force connect since it's manual entry
                        })).unwrap();

                        toast.success("Wallet address saved successfully");
                        // Refresh the page to update the UI
                        window.location.reload();
                      } catch (error) {
                        console.error("Error saving wallet address:", error);
                        toast.error(typeof error === 'string' ? error : "Failed to save wallet address");
                      } finally {
                        setIsSavingWallet(false);
                      }
                    }}
                    disabled={isSavingWallet}
                  >
                    {isSavingWallet ? "Saving..." : "Save Address"}
                  </Button>
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-gray-700" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-gray-900 px-2 text-gray-400">Or</span>
                  </div>
                </div>

                <Button
                  onClick={() =>
                    (window.location.href = "/dashboard?connect=wallet")
                  }
                  className="w-full bg-[#0066FF] hover:bg-[#0052CC] text-white"
                >
                  Connect Wallet
                </Button>
              </div>
            )}
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end mt-4">
          <Button onClick={onClose} className="bg-blue-600 hover:bg-blue-700">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
