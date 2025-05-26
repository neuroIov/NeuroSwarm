import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ExternalLink, Cpu } from "lucide-react";

interface SignupSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  onContinue: () => void;
}

export function SignupSuccessModal({
  isOpen,
  onClose,
  onContinue,
}: SignupSuccessModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-[#0F0F0F] border border-[#1F2937] text-white max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-center mb-4">
            <Cpu className="h-12 w-12 text-[#0066FF]" />
          </div>
          <DialogTitle className="text-xl font-bold text-center">
            Welcome to NeuroSwarm
          </DialogTitle>
          <DialogDescription className="text-gray-300 text-center">
            Your account has been successfully created
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <p className="text-white">
            Make resources from your GPU power with NeuroSwarm and earn rewards
            while contributing to the network.
          </p>

          <div className="bg-[#1A1A1A] p-4 rounded-lg border border-[#333]">
            <h3 className="font-medium mb-2 text-[#0066FF]">
              Exclusive Features
            </h3>
            <p className="text-sm text-gray-300">
              To access our exclusive features and maximize your earnings,
              connect NeuroSwarm with Neurolov.app
            </p>
            <a
              href="https://neurolov.app"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center mt-2 text-sm text-[#0066FF] hover:underline"
            >
              Visit Neurolov.app <ExternalLink className="h-3 w-3 ml-1" />
            </a>
          </div>
        </div>

        <DialogFooter className="flex flex-col sm:flex-row sm:justify-center gap-2">
          <Button
            onClick={onContinue}
            className="w-full bg-[#0066FF] hover:bg-[#0052CC] text-white"
          >
            I Understand
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
