import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useAppDispatch, useAppSelector } from "@/store";
import {
  verifyReferralCode,
  createReferralRelationship,
  updateUsername,
} from "@/store/slices/sessionSlice";
import { CheckCircle, AlertCircle, User, Link } from "lucide-react";

interface UsernameDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (username: string) => void;
  initialUsername?: string | null;
}

// Function to extract referral code from URL or direct code
const extractReferralCode = (code: string): string => {
  // Check if it's a URL
  if (code.includes("ref=")) {
    try {
      const url = new URL(code);
      return url.searchParams.get("ref") || code;
    } catch (e) {
      // Try to extract from string if URL parsing fails
      const match = code.match(/ref=([a-zA-Z0-9]+)/);
      return match ? match[1] : code;
    }
  }

  // Return the code itself (assuming it's directly a referral code)
  return code;
};

export function UsernameDialog({
  isOpen,
  onClose,
  onSave,
  initialUsername,
}: UsernameDialogProps) {
  const [username, setUsername] = useState(initialUsername || "");
  const [referralCode, setReferralCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [verifiedReferrerId, setVerifiedReferrerId] = useState<string | null>(null);
  const [usernameError, setUsernameError] = useState("");
  const [referralError, setReferralError] = useState("");
  const [isReferralSubmitting, setIsReferralSubmitting] = useState(false);
  const [referralSuccess, setReferralSuccess] = useState(false);

  const dispatch = useAppDispatch();
  const { userProfile, loading } = useAppSelector((state) => state.session);

  const verifyReferralCodeHandler = async (code: string) => {
    if (!code) return;

    // Extract the code from URL or string if needed
    const extractedCode = extractReferralCode(code);
    setReferralCode(extractedCode);

    // Reset verification state
    setIsVerified(false);
    setVerifiedReferrerId(null);
    setReferralError("");

    // Verify with Redux thunk
    try {
      setIsVerifying(true);

      const resultAction = await dispatch(verifyReferralCode(extractedCode));

      if (verifyReferralCode.fulfilled.match(resultAction)) {
        const { isValid, referrerId } = resultAction.payload as {
          isValid: boolean;
          referrerId: string;
        };

        if (isValid) {
          // Check if the referrer is the current user (can't refer yourself)
          if (referrerId === userProfile?.id) {
            setReferralError("You cannot use your own referral code");
            setIsVerified(false);
          } else {
            setIsVerified(true);
            setVerifiedReferrerId(referrerId);
            toast.success("Referral code verified");
          }
        } else {
          setReferralError("Referral code not found");
        }
      } else {
        setReferralError("Invalid referral code");
      }
    } catch (err) {
      console.error("Error verifying referral code:", err);
      setReferralError("Error verifying code");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSubmitReferral = async () => {
    if (
      !isVerified ||
      !referralCode ||
      !userProfile?.id ||
      !verifiedReferrerId
    ) {
      setReferralError("Please verify a valid referral code first");
      return;
    }

    try {
      setIsReferralSubmitting(true);

      const resultAction = await dispatch(
        createReferralRelationship({
          referrerCode: referralCode,
          referredId: userProfile.id,
        })
      );

      if (createReferralRelationship.fulfilled.match(resultAction)) {
        setReferralSuccess(true);
        toast.success("Successfully joined referral program!");
      } else {
        const errorPayload = resultAction.payload as string;
        if (errorPayload && errorPayload.includes("already exists")) {
          setReferralError("You are already part of this referral program");
        } else {
          setReferralError("Failed to join referral program");
        }
      }
    } catch (err) {
      console.error("Error submitting referral:", err);
      setReferralError("Error joining referral program");
    } finally {
      setIsReferralSubmitting(false);
    }
  };

  const handleSaveUsername = async () => {
    // Validate username
    if (!username.trim()) {
      setUsernameError("Username cannot be empty");
      return;
    }

    if (username.length < 3) {
      setUsernameError("Username must be at least 3 characters");
      return;
    }

    if (!userProfile?.id) {
      setUsernameError("User profile not found");
      return;
    }

    try {
      const resultAction = await dispatch(
        updateUsername({
          userId: userProfile.id,
          username,
        })
      );

      if (updateUsername.fulfilled.match(resultAction)) {
        toast.success("Username saved successfully!");

        // Close dialog only if referral was already processed or not needed
        if (referralSuccess || !isVerified) {
          onSave(username);
          onClose();
        }
      } else {
        setUsernameError("Failed to save username");
      }
    } catch (err) {
      console.error("Error saving username:", err);
      setUsernameError("Error saving username");
    }
  };

  const handleVerifyClick = () => {
    verifyReferralCodeHandler(referralCode);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-[#0F0F0F] border border-[#1F2937] text-white">
        <DialogHeader>
          <DialogTitle>Setup Your Account</DialogTitle>
          <DialogDescription className="text-gray-400">
            Choose a username and optionally join a referral program for bonus
            rewards.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-6">
          {/* Username section */}
          <div className="border border-gray-800 rounded-md p-4 bg-gray-900/30">
            <div className="flex items-center gap-2 mb-3">
              <User className="h-5 w-5 text-blue-400" />
              <h3 className="text-sm font-medium">Set Your Username</h3>
            </div>

            <div>
              <Label
                htmlFor="username"
                className="block text-sm font-medium mb-2"
              >
                Username
              </Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setUsernameError("");
                }}
                className="bg-[#1A1A1A] border-[#333] focus:border-blue-600 text-white"
                placeholder="Enter your username"
                autoFocus
              />
              {usernameError && (
                <p className="text-red-500 text-sm mt-1">{usernameError}</p>
              )}
            </div>

            <div className="mt-3">
              <Button
                onClick={handleSaveUsername}
                className="bg-blue-600 hover:bg-blue-700"
                disabled={loading || !username}
              >
                {loading ? "Saving..." : "Save Username"}
              </Button>
            </div>
          </div>

          {/* Referral section */}
          <div className="border border-gray-800 rounded-md p-4 bg-gray-900/30">
            <div className="flex items-center gap-2 mb-3">
              <Link className="h-5 w-5 text-green-400" />
              <h3 className="text-sm font-medium">
                Join Referral Program (Optional)
              </h3>
            </div>

            {!referralSuccess && (
              <div>
                <Label
                  htmlFor="referral"
                  className="block text-sm font-medium mb-2"
                >
                  Referral Code
                </Label>
                <div className="flex space-x-2">
                  <Input
                    id="referral"
                    value={referralCode}
                    onChange={(e) => {
                      setReferralCode(e.target.value);
                      setReferralError("");
                      setIsVerified(false);
                      setReferralSuccess(false);
                    }}
                    className="bg-[#1A1A1A] border-[#333] focus:border-blue-600 text-white"
                    placeholder="Enter referral code or link"
                    disabled={loading || isVerifying || referralSuccess}
                  />
                  <Button
                    onClick={handleVerifyClick}
                    disabled={
                      isVerifying ||
                      !referralCode ||
                      referralCode.length < 4 ||
                      loading ||
                      referralSuccess
                    }
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {isVerifying ? "Verifying..." : "Verify"}
                  </Button>
                </div>

                {referralError && (
                  <div className="flex items-center text-red-500 text-sm mt-1">
                    <AlertCircle className="w-4 h-4 mr-1" />
                    <span>{referralError}</span>
                  </div>
                )}

                {isVerified && !referralSuccess && (
                  <div className="mt-3">
                    <div className="flex items-center text-green-500 text-sm mb-2">
                      <CheckCircle className="w-4 h-4 mr-1" />
                      <span>
                        Referral code verified! Click below to join the referral
                        program.
                      </span>
                    </div>
                    <Button
                      onClick={handleSubmitReferral}
                      className="bg-green-600 hover:bg-green-700"
                      disabled={isReferralSubmitting || loading}
                    >
                      {isReferralSubmitting
                        ? "Joining..."
                        : "Join Referral Program"}
                    </Button>
                  </div>
                )}

                <p className="text-gray-400 text-xs mt-2">
                  {`Paste a referral code or full URL (e.g.,
                  ${window.location.origin}/dashboard?ref=abcd1234)`}
                </p>
              </div>
            )}

            {referralSuccess && (
              <div className="flex items-center text-green-500 text-sm mt-2">
                <CheckCircle className="w-4 h-4 mr-1" />
                <span>Successfully joined the referral program!</span>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            className="border-[#333] text-gray-300 hover:bg-[#1A1A1A]"
          >
            Cancel
          </Button>
          <Button
            onClick={() => onClose()}
            className="bg-blue-600 hover:bg-blue-700"
            disabled={loading}
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
