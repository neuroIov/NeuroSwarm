import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

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
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Referral Code Detected</DialogTitle>
          <DialogDescription>
            You've joined NeuroSwarm using a referral code.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col space-y-4 py-4">
          <div className="flex items-center space-x-2">
            <div className="grid flex-1 gap-2">
              <p className="text-sm font-medium leading-none">
                You're using the referral code:
              </p>
              <p className="text-sm font-bold text-blue-500">{referralCode}</p>
            </div>
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