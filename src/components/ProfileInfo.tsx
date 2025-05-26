import { useState } from "react";
import { useSession } from "@/hooks/useSession";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Mail,
  Wallet,
  Link2,
  Copy,
  CheckCircle,
  XCircle,
  Edit,
  Calendar,
} from "lucide-react";
import { WalletConnectionModal } from "./auth/WalletConnectionModal";
import { WalletSelector } from "./WalletSelector";
import { ProfileEditModal } from "./ProfileEditModal";

// Define extended session type with additional properties
interface ExtendedSession {
  userId: string | null;
  email?: string;
  username?: string;
  walletAddress?: string;
  createdAt?: string;
  referralCode?: string;
  referralCount?: number;
}

export function ProfileInfo() {
  const { session, logout } = useSession();
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);

  // Cast session to extended type
  const extendedSession = session as unknown as ExtendedSession;

  const isLoggedIn =
    extendedSession.userId !== "guest" && extendedSession.userId !== null;
  const hasWallet = !!extendedSession.walletAddress;

  const shortenWalletAddress = (address: string) => {
    if (!address) return "";
    return `${address.substring(0, 6)}...${address.substring(
      address.length - 4
    )}`;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  return (
    <Card className="bg-[#112544] text-white border-[#064C94]">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center">
          <CardTitle className="text-lg font-medium">Your Profile</CardTitle>
          {isLoggedIn && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowProfileModal(true)}
              className="h-8 w-8 text-blue-400 hover:text-white hover:bg-blue-900/30"
            >
              <Edit className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoggedIn ? (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-blue-400" />
                <span className="text-sm font-medium">Email:</span>
                <span className="text-sm text-gray-300">
                  {extendedSession.email}
                </span>
              </div>
              <Badge
                variant="outline"
                className="bg-green-900/30 text-green-400 border-green-800"
              >
                Connected
              </Badge>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-blue-400" />
                <span className="text-sm font-medium">Member since:</span>
                <span className="text-sm text-gray-300">
                  {extendedSession.createdAt
                    ? new Date(extendedSession.createdAt).toLocaleDateString()
                    : "N/A"}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-blue-400" />
                <span className="text-sm font-medium">Wallet:</span>
                {hasWallet ? (
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-gray-300">
                      {shortenWalletAddress(
                        extendedSession.walletAddress || ""
                      )}
                    </span>
                    <button
                      onClick={() =>
                        copyToClipboard(extendedSession.walletAddress || "")
                      }
                      className="text-gray-400 hover:text-white"
                    >
                      {copySuccess ? (
                        <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                ) : (
                  <span className="text-sm text-gray-400">Not connected</span>
                )}
              </div>

              {/* Wallet connection control */}
              <div className="scale-75 origin-right">
                {hasWallet ? (
                  <Badge
                    variant="outline"
                    className="bg-green-900/30 text-green-400 border-green-800"
                  >
                    Connected
                  </Badge>
                ) : (
                  <div onClick={() => setShowWalletModal(true)}>
                    <WalletSelector onClose={() => setShowWalletModal(false)} />
                  </div>
                )}
              </div>
            </div>

            <div className="pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={logout}
                className="w-full h-8 bg-red-900/10 hover:bg-red-900/30 border-red-900/50 text-red-400"
              >
                <XCircle className="h-4 w-4 mr-1" />
                Logout
              </Button>
            </div>
          </>
        ) : (
          <div className="text-center py-4">
            <p className="text-gray-400 mb-3">You are not logged in</p>
            <Button
              onClick={() => setShowWalletModal(true)}
              className="bg-[#0066FF] hover:bg-[#0052CC] text-white"
            >
              Login to continue
            </Button>
          </div>
        )}
      </CardContent>

      <WalletConnectionModal
        isOpen={showWalletModal}
        onClose={() => setShowWalletModal(false)}
      />

      {/* Profile Edit Modal */}
      {isLoggedIn && (
        <ProfileEditModal
          isOpen={showProfileModal}
          onClose={() => setShowProfileModal(false)}
          session={extendedSession}
        />
      )}
    </Card>
  );
}
