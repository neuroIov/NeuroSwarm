import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, CheckCircle } from "lucide-react";
import { toast } from "sonner";

interface ReferralCodeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  referralCode: string;
}

export function ReferralCodeDialog({
  isOpen,
  onClose,
  referralCode,
}: ReferralCodeDialogProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyCode = async () => {
    if (referralCode) {
      try {
        await navigator.clipboard.writeText(referralCode);
        setCopied(true);
        toast.success("Referral code copied!");
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        toast.error("Failed to copy code");
        console.error("Failed to copy code:", err);
      }
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Referral Code Detected</DialogTitle>
          <DialogDescription>
            You've visited NeuroSwarm using a referral link.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col space-y-4 py-4">
          <p className="text-sm">
            To join the referral program and earn Swarm Points, please:
          </p>
          
          <ol className="list-decimal list-inside text-sm space-y-2 ml-2">
            <li>Copy this referral code</li>
            <li>Go to the "Referral" section from the sidebar</li>
            <li>Enter this code in the "Use Referral Code" section</li>
            <li>Click "Verify" and then "Join Referral Program"</li>
          </ol>
          
          <div className="flex items-center space-x-2 bg-blue-900/20 p-3 rounded-md border border-blue-500/20">
            <div className="grid flex-1 gap-2">
              <p className="text-sm font-medium leading-none">
                Your referral code:
              </p>
              <p className="text-sm font-bold text-blue-400">{referralCode}</p>
            </div>
            <Button 
              variant="outline" 
              size="icon"
              className="h-8 w-8"
              onClick={handleCopyCode}
            >
              {copied ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
        
        <DialogFooter>
          <Button onClick={onClose} className="w-full sm:w-auto">
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 