import React from "react";
import { ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ConnectAppModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ConnectAppModal({ isOpen, onClose }: ConnectAppModalProps) {
  const handleConnectApp = () => {
    window.open("https://app.neurolov.ai/", "_blank");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-[#0F0F0F] border border-[#1F2937] text-white">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            Connection Required
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Connect your Swarm account to our Neurolov App to get exclusive
            access and subscription plans
          </DialogDescription>
        </DialogHeader>

        <div className="py-6">
          <div className="bg-[#1A1A1A] p-4 rounded-lg border border-[#333] mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400">Current Status</span>
              <span className="font-medium text-amber-400">Not Connected</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Access Level</span>
              <span className="font-medium text-white">Limited</span>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <Button
              onClick={handleConnectApp}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700"
            >
              <ExternalLink className="h-4 w-4" />
              Connect to Neurolov App
            </Button>

            <div className="text-center text-xs text-gray-500">
              Connect your account to unlock premium features and subscription
              plans
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
