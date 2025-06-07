import React from "react";
import { ExternalLink, Cpu } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
      <DialogContent className="bg-[#0F0F0F] border border-[#1F2937] text-white max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-center mb-4">
            <Cpu className="h-12 w-12 text-[#0066FF]" />
          </div>
          <DialogTitle className="text-xl font-bold text-center">
            Connect to Neurolov App
          </DialogTitle>
          <DialogDescription className="text-gray-400 text-center">
            Unlock exclusive features and premium subscription plans
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div className="bg-[#1A1A1A] p-4 rounded-lg border border-[#333] mb-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400">Current Status</span>
              <span className="font-medium text-amber-400">Not Connected</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Access Level</span>
              <span className="font-medium text-white">Limited</span>
            </div>
          </div>

          <p className="text-sm text-gray-300">
            Connect your NeuroSwarm account to Neurolov App to access premium features,
            advanced settings, and maximize your earnings.
          </p>
        </div>

        <DialogFooter className="flex flex-col sm:flex-row sm:justify-center gap-2">
          <Button
            onClick={handleConnectApp}
            className="w-full bg-[#0066FF] hover:bg-[#0052CC] text-white flex items-center justify-center gap-2"
          >
            <ExternalLink className="h-4 w-4" />
            Connect to Neurolov App
          </Button>
          
          <Button
            onClick={onClose}
            className="w-full bg-transparent border border-gray-700 hover:bg-gray-800 text-gray-300"
            variant="outline"
          >
            Skip for Now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
