import { useState, useEffect } from "react";
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
import {
  updateUsername,
  generateReferralCode,
  verifyReferralCode,
  createReferralRelationship,
} from "@/store/slices/sessionSlice";
import {
  User,
  Link,
  Mail,
  Wallet,
  Calendar,
  CheckCircle,
  AlertCircle,
  Copy,
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
  const [activeTab, setActiveTab] = useState("profile");
  const [username, setUsername] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [referralError, setReferralError] = useState("");
  const [copySuccess, setCopySuccess] = useState(false);
  const [copyRefSuccess, setCopyRefSuccess] = useState(false);
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);

  const dispatch = useAppDispatch();
  const { userProfile, loading } = useAppSelector((state) => state.session);

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
  }, [session]);

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

  const handleGenerateReferralCode = async () => {
    if (!session.userId) {
      toast.error("User ID not found");
      return;
    }

    if (!session.walletAddress) {
      toast.error(
        "You need to connect a wallet first to generate a referral code"
      );
      return;
    }

    setIsGeneratingCode(true);
    try {
      await dispatch(generateReferralCode(session.userId));
      toast.success("Referral code generated successfully");
    } catch (error) {
      toast.error("Failed to generate referral code");
    } finally {
      setIsGeneratingCode(false);
    }
  };

  const handleVerifyReferralCode = async () => {
    if (!referralCode.trim()) {
      setReferralError("Please enter a referral code");
      return;
    }

    setIsVerifying(true);

    try {
      const resultAction = await dispatch(verifyReferralCode(referralCode));

      if (verifyReferralCode.fulfilled.match(resultAction)) {
        const { isValid, referrerId } = resultAction.payload as {
          isValid: boolean;
          referrerId: string;
        };

        if (isValid) {
          // Check if the referrer is the current user (can't refer yourself)
          if (referrerId === session.userId) {
            setReferralError("You cannot use your own referral code");
            setIsVerified(false);
          } else {
            setIsVerified(true);
            toast.success("Referral code verified successfully");
          }
        } else {
          setReferralError("Invalid referral code");
        }
      } else {
        setReferralError("Failed to verify referral code");
      }
    } catch (error) {
      setReferralError("Error verifying referral code");
      console.error("Error verifying referral code:", error);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSubmitReferral = async () => {
    if (!isVerified || !referralCode || !session.userId) {
      setReferralError("Please verify a valid referral code first");
      return;
    }

    try {
      const resultAction = await dispatch(
        createReferralRelationship({
          referrerCode: referralCode,
          referredId: session.userId,
        })
      );

      if (createReferralRelationship.fulfilled.match(resultAction)) {
        toast.success("Successfully joined referral program!");
        setReferralCode("");
        setIsVerified(false);
      } else {
        setReferralError("Failed to join referral program");
      }
    } catch (error) {
      setReferralError("Error joining referral program");
      console.error("Error submitting referral:", error);
    }
  };

  const copyToClipboard = (text: string, type: "wallet" | "referral") => {
    navigator.clipboard.writeText(text);
    if (type === "wallet") {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } else {
      setCopyRefSuccess(true);
      setTimeout(() => setCopyRefSuccess(false), 2000);
    }
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

  // Generate user's referral link
  const userReferralLink = `${window.location.origin}/dashboard?ref=${
    session.referralCode || "yourcode"
  }`;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-[#0F0F0F] border border-[#1F2937] text-white max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            Profile Settings
          </DialogTitle>
        </DialogHeader>

        <Tabs
          defaultValue="profile"
          value={activeTab}
          onValueChange={setActiveTab}
          className="w-full"
        >
          <TabsList className="grid grid-cols-2 bg-[#1A1A1A] mb-6">
            <TabsTrigger
              value="profile"
              className="data-[state=active]:bg-[#064C94] data-[state=active]:text-white"
            >
              Profile
            </TabsTrigger>
            <TabsTrigger
              value="referral"
              className="data-[state=active]:bg-[#064C94] data-[state=active]:text-white"
            >
              Referral Program
            </TabsTrigger>
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile" className="space-y-6">
            <div className="space-y-4">
              {/* User Info Section */}
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
                    <span>{session.email || "Not set"}</span>
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
              </div>

              {/* Wallet Section */}
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
                          onClick={() =>
                            copyToClipboard(session.walletAddress, "wallet")
                          }
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
                  <div className="text-center py-4">
                    <p className="text-gray-400 mb-3">No wallet connected</p>
                    <Button className="bg-[#0066FF] hover:bg-[#0052CC] text-white">
                      Connect Wallet
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* Referral Tab */}
          <TabsContent value="referral" className="space-y-6">
            {/* Your Referral Code */}
            <div className="border border-gray-800 rounded-md p-4 bg-gray-900/30">
              <div className="flex items-center gap-2 mb-4">
                <Link className="h-5 w-5 text-green-400" />
                <h3 className="text-sm font-medium">Your Referral Code</h3>
              </div>

              {userProfile?.referral_code || session.referralCode ? (
                <>
                  <p className="text-sm text-gray-400 mb-2">
                    Share your referral code with friends to earn rewards!
                  </p>

                  <div className="mb-4">
                    <Label className="text-sm text-gray-400 mb-1 block">
                      Your Referral Code
                    </Label>
                    <div className="flex items-center justify-between bg-[#1A1A1A] p-2 rounded border border-[#333] text-gray-300">
                      <span className="text-sm font-mono">
                        {userProfile?.referral_code || session.referralCode}
                      </span>
                      <button
                        onClick={() =>
                          copyToClipboard(
                            userProfile?.referral_code ||
                              session.referralCode ||
                              "",
                            "referral"
                          )
                        }
                        className="text-gray-400 hover:text-white"
                      >
                        {copyRefSuccess ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm text-gray-400 mb-1 block">
                      Referral Link
                    </Label>
                    <div className="flex items-center justify-between bg-[#1A1A1A] p-2 rounded border border-[#333] text-gray-300 overflow-hidden">
                      <span className="text-sm truncate">
                        {userReferralLink}
                      </span>
                      <button
                        onClick={() =>
                          copyToClipboard(userReferralLink, "referral")
                        }
                        className="text-gray-400 hover:text-white flex-shrink-0"
                      >
                        {copyRefSuccess ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="mt-4">
                    <p className="text-sm text-gray-400">
                      <span className="text-green-400 font-medium">
                        {session.referralCount || 0} users
                      </span>{" "}
                      have used your referral code
                    </p>
                  </div>
                </>
              ) : (
                <div className="text-center py-4">
                  <p className="text-gray-400 mb-3">
                    You don't have a referral code yet
                  </p>
                  <Button
                    onClick={() => (window.location.href = "/referral")}
                    disabled={isGeneratingCode || !session.walletAddress}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    Generate Referral Code
                  </Button>
                  {!session.walletAddress && (
                    <p className="text-xs text-amber-500 mt-2">
                      You need to connect a wallet first
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Enter Referral Code */}
            <div className="border border-gray-800 rounded-md p-4 bg-gray-900/30">
              <div className="flex items-center gap-2 mb-4">
                <Link className="h-5 w-5 text-blue-400" />
                <h3 className="text-sm font-medium">Enter a Referral Code</h3>
              </div>

              <p className="text-sm text-gray-400 mb-3">
                Have a referral code? Enter it below to join their program and
                get rewards!
              </p>

              <div className="space-y-4">
                <div>
                  <Label
                    htmlFor="referralCode"
                    className="text-sm text-gray-400 mb-1 block"
                  >
                    Referral Code
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="referralCode"
                      value={referralCode}
                      onChange={(e) => {
                        setReferralCode(e.target.value);
                        setReferralError("");
                        setIsVerified(false);
                      }}
                      className="bg-[#1A1A1A] border-[#333] focus:border-blue-600 text-white"
                      placeholder="Enter referral code"
                    />
                    <Button
                      onClick={handleVerifyReferralCode}
                      className="bg-green-600 hover:bg-green-700"
                      disabled={isVerifying || !referralCode.trim()}
                    >
                      {isVerifying ? "Verifying..." : "Verify"}
                    </Button>
                  </div>
                  {referralError && (
                    <p className="text-red-500 text-sm mt-1">{referralError}</p>
                  )}
                </div>

                {isVerified && (
                  <div className="mt-3">
                    <div className="flex items-center text-green-500 text-sm mb-2">
                      <CheckCircle className="h-4 w-4 mr-1" />
                      <span>
                        Referral code verified! Click below to join the referral
                        program.
                      </span>
                    </div>
                    <Button
                      onClick={handleSubmitReferral}
                      className="bg-green-600 hover:bg-green-700"
                      disabled={loading}
                    >
                      {loading ? "Joining..." : "Join Referral Program"}
                    </Button>
                  </div>
                )}
              </div>
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
