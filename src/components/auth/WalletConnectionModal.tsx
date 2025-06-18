import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Wallet, ExternalLink, AlertTriangle, LogOut } from "lucide-react";
import { useSession, WalletType } from "@/hooks/useSession";
import { WalletSelector } from "@/components/WalletSelector";
import { toast } from "sonner";
import { useDispatch } from "react-redux";
import { connectWalletToAccount } from "@/store/slices/sessionSlice";
import { AppDispatch } from "@/store";

interface WalletConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WalletConnectionModal({
  isOpen,
  onClose,
}: WalletConnectionModalProps) {
  const { connectWallet, disconnectWallet, session } = useSession();
  const dispatch = useDispatch<AppDispatch>();
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [pendingWalletType, setPendingWalletType] = useState<WalletType | null>(
    null
  );
  const [existingWallet, setExistingWallet] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setShowConfirmDialog(false);
      setShowTransferDialog(false);
      setPendingWalletType(null);
      setExistingWallet(null);
      setErrorMessage(null);
      setIsConnecting(false);
      setIsDisconnecting(false);
    }
  }, [isOpen]);

  // Debug log to check session state in modal
  useEffect(() => {
    if (isOpen) {
      console.log("WalletConnectionModal - Current session state:", {
        userId: session.userId,
        email: session.email,
        walletAddress: session.walletAddress,
        walletType: session.walletType,
      });
    }
  }, [isOpen, session]);

  const handleWalletConnect = async (type: WalletType) => {
    // Check if user is logged in with email
    if (!session.email) {
      toast.error("You must be logged in with an email account first");
      return;
    }

    // Check if user already has a wallet connected
    if (session.walletAddress) {
      setExistingWallet(session.walletAddress);
      setPendingWalletType(type);
      setShowConfirmDialog(true);
      return;
    }

    // If no wallet is connected, proceed with connection
    setIsConnecting(true);
    try {
      console.log(`Attempting to connect ${type} wallet from modal...`);
      await connectWallet(type, false); // false means don't force transfer
      // If successful, the wallet address will be in the session
      if (session.walletAddress) {
        toast.success(`Successfully connected ${type} wallet`);
        onClose();
      }
    } catch (error) {
      console.error("Failed to connect wallet:", error);

      // Check if the error is about wallet already connected to another account
      const errorMsg =
        error instanceof Error ? error.message : "Failed to connect wallet";
      if (errorMsg.includes("already connected to another account")) {
        setErrorMessage(errorMsg);
        setPendingWalletType(type);
        setShowTransferDialog(true);
      } else {
        toast.error(errorMsg);
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnectWallet = async () => {
    setIsDisconnecting(true);
    try {
      await disconnectWallet();
      toast.success("Wallet disconnected successfully");
      onClose();
    } catch (error) {
      console.error("Failed to disconnect wallet:", error);
      toast.error("Failed to disconnect wallet");
    } finally {
      setIsDisconnecting(false);
    }
  };

  const confirmWalletChange = async () => {
    if (!pendingWalletType) return;

    setIsConnecting(true);
    try {
      console.log(`Confirming change to ${pendingWalletType} wallet...`);
      await connectWallet(pendingWalletType, true); // Pass true to force the wallet change
      setShowConfirmDialog(false);
      // If successful, close the modal
      if (session.walletAddress) {
        toast.success(`Successfully connected ${pendingWalletType} wallet`);
        onClose();
      }
    } catch (error) {
      console.error("Failed to change wallet:", error);

      // Check if the error is about wallet already connected to another account
      const errorMsg =
        error instanceof Error ? error.message : "Failed to connect wallet";
      if (errorMsg.includes("already connected to another account")) {
        setErrorMessage(errorMsg);
        setShowConfirmDialog(false);
        setShowTransferDialog(true);
      } else {
        toast.error(errorMsg);
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const confirmWalletTransfer = async () => {
    if (!pendingWalletType || !session.userId || !session.email) return;

    setIsConnecting(true);
    try {
      // Get the wallet address from the current connection attempt
      // We need to reconnect to the wallet to get its address
      console.log(
        `Reconnecting to ${pendingWalletType} wallet to get address...`
      );

      // For Phantom wallet
      let walletAddress = "";
      if (pendingWalletType === "phantom") {
        if ("phantom" in window && window.phantom?.solana?.isPhantom) {
          const resp = await window.phantom.solana.connect();
          walletAddress = resp.publicKey.toString();
        } else if ("solana" in window && window.solana?.isPhantom) {
          const resp = await window.solana.connect();
          walletAddress = resp.publicKey.toString();
        }
      }
      // For MetaMask wallet
      else if (pendingWalletType === "metamask") {
        if (typeof window.ethereum !== "undefined") {
          await window.ethereum.request({ method: "eth_requestAccounts" });
          const accounts = await window.ethereum.request({
            method: "eth_accounts",
          });
          if (accounts && accounts.length > 0) {
            walletAddress = accounts[0];
          }
        }
      }

      if (!walletAddress) {
        throw new Error(
          `Failed to get wallet address from ${pendingWalletType}`
        );
      }

      console.log(`Forcing wallet transfer with address: ${walletAddress}`);

      // Call the connectWalletToAccount with force=true
      await dispatch(
        connectWalletToAccount({
          userId: session.userId,
          email: session.email,
          walletAddress,
          walletType: pendingWalletType,
          force: true, // Force the transfer
        })
      );

      setShowTransferDialog(false);
      toast.success(`Successfully transferred wallet to your account`);
      onClose();
    } catch (error) {
      console.error("Failed to transfer wallet:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to transfer wallet"
      );
    } finally {
      setIsConnecting(false);
    }
  };

  // Get wallet name for display
  const getWalletName = (type: WalletType | null) => {
    if (type === "phantom") return "Phantom";
    if (type === "metamask") return "MetaMask";
    return "Wallet";
  };

  // Format wallet address for display
  const formatWalletAddress = (address: string | null) => {
    if (!address) return "";
    return `${address.substring(0, 6)}...${address.substring(
      address.length - 4
    )}`;
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="bg-[#0F0F0F] border border-[#1F2937] text-white">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              {session.walletAddress ? "Wallet Connected" : "Connect Wallet"}
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              {session.walletAddress
                ? "Your wallet is connected to your account"
                : "Connect your wallet to access additional features and earn rewards"}
            </DialogDescription>
          </DialogHeader>

          {session.walletAddress ? (
            // Show connected wallet info
            <div className="py-6">
              <div className="bg-[#1A1A1A] p-4 rounded-lg border border-[#333] mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-400">Wallet Type</span>
                  <span className="font-medium text-white">
                    {getWalletName(session.walletType)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Address</span>
                  <span className="font-mono text-blue-300">
                    {formatWalletAddress(session.walletAddress)}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <Button
                  onClick={handleDisconnectWallet}
                  variant="destructive"
                  className="w-full flex items-center justify-center gap-2"
                  disabled={isDisconnecting}
                >
                  <LogOut className="h-4 w-4" />
                  {isDisconnecting ? "Disconnecting..." : "Disconnect Wallet"}
                </Button>

                <div className="text-center text-xs text-gray-500">
                  Disconnect your current wallet to connect a different one
                </div>
              </div>
            </div>
          ) : (
            // Show wallet connection options
            <div className="grid grid-cols-2 gap-4 py-4">
              <Button
                onClick={() => handleWalletConnect("phantom")}
                className="flex flex-col items-center justify-center gap-2 h-auto py-6 bg-[#1A1A1A] hover:bg-[#2A2A2A] border border-[#333] rounded-lg"
                disabled={isConnecting}
              >
                <img
                  src="/images/phantom.jpg"
                  alt="Phantom"
                  className="w-12 h-12 mb-2 rounded-full object-cover border-2 border-purple-500"
                />
                <span className="text-white font-medium">Phantom</span>
                <span className="text-xs text-gray-400">Solana Wallet</span>
              </Button>

              <Button
                onClick={() => handleWalletConnect("metamask")}
                className="flex flex-col items-center justify-center gap-2 h-auto py-6 bg-[#1A1A1A] hover:bg-[#2A2A2A] border border-[#333] rounded-lg"
                disabled={isConnecting}
              >
                <img
                  src="/images/metamask.jpg"
                  alt="MetaMask"
                  className="w-12 h-12 mb-2 rounded-full object-cover border-2 border-orange-500"
                />
                <span className="text-white font-medium">MetaMask</span>
                <span className="text-xs text-gray-400">Ethereum Wallet</span>
              </Button>

              {isConnecting && (
                <div className="col-span-2 text-center text-amber-400 mt-2">
                  Connecting wallet... Please check your wallet extension for
                  any popups.
                </div>
              )}
            </div>
          )}

          {!session.walletAddress && (
            <>
              <Button
                variant="outline"
                className="w-full mt-4 border-dashed border-gray-600 text-gray-400 hover:text-white"
                onClick={() => {
                  onClose();
                  // Navigate to profile settings
                  window.location.href = "/dashboard?settings=profile";
                }}
              >
                Enter wallet address later
              </Button>
              
              <div className="text-center text-sm text-gray-500 mt-4">
                Don't have a wallet?{" "}
                <a
                  href="https://phantom.app/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-500 inline-flex items-center"
                >
                  Get one here
                  <ExternalLink className="h-3 w-3 ml-1" />
                </a>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent className="bg-[#112544] text-white border-[#064C94]">
          <AlertDialogHeader>
            <AlertDialogTitle>Change Connected Wallet?</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-300">
              This account already has a {getWalletName(session.walletType)}{" "}
              wallet connected:
              <span className="font-mono bg-[#0A1A2F] px-2 py-0.5 rounded ml-1 text-blue-300">
                {existingWallet &&
                  `${existingWallet.substring(
                    0,
                    6
                  )}...${existingWallet.substring(existingWallet.length - 4)}`}
              </span>
              <br />
              <br />
              Are you sure you want to replace it with a{" "}
              {getWalletName(pendingWalletType)} wallet connection?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-gray-600 text-gray-300 hover:bg-[#0A1A2F] hover:text-white">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmWalletChange}
              className="bg-[#0066FF] hover:bg-[#0052CC] text-white"
              disabled={isConnecting}
            >
              {isConnecting ? "Connecting..." : "Yes, Change Wallet"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={showTransferDialog}
        onOpenChange={setShowTransferDialog}
      >
        <AlertDialogContent className="bg-[#331C1C] text-white border-[#943131]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Wallet Already Connected
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-300">
              {errorMessage}
              <br />
              <br />
              <div className="bg-[#1F1414] p-3 rounded-md border border-[#612929] text-amber-200">
                <p className="font-medium">Warning:</p>
                <p className="text-sm mt-1">
                  Transferring this wallet will remove it from the other account
                  and connect it to your account instead. This action cannot be
                  undone.
                </p>
              </div>
              <br />
              Do you want to transfer this wallet to your account?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-gray-600 text-gray-300 hover:bg-[#1F1414] hover:text-white">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmWalletTransfer}
              className="bg-amber-600 hover:bg-amber-700 text-white"
              disabled={isConnecting}
            >
              {isConnecting ? "Transferring..." : "Yes, Transfer Wallet"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
