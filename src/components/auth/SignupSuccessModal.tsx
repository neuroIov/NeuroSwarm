import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ExternalLink, Cpu, Check } from "lucide-react";

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
            <div className="h-16 w-16 rounded-full bg-green-600/20 flex items-center justify-center">
              <Check className="h-8 w-8 text-green-500" />
            </div>
          </div>
          <DialogTitle className="text-xl font-bold text-center">
            Account Created Successfully
          </DialogTitle>
          <DialogDescription className="text-gray-300 text-center">
            Welcome to NeuroSwarm
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <p className="text-white text-center">
            Your account has been successfully created. You're now ready to start using NeuroSwarm.
          </p>

          <div className="bg-[#1A1A1A] p-4 rounded-lg border border-[#333]">
            <h3 className="font-medium mb-2 text-[#0066FF]">
              Next Step: Connect Your Account
            </h3>
            <p className="text-sm text-gray-300">
              To maximize your earnings and access exclusive features, 
              you'll need to connect your NeuroSwarm account with Neurolov App.
            </p>
          </div>
        </div>

        <DialogFooter className="flex flex-col sm:flex-row sm:justify-center gap-2">
          <Button
            onClick={onContinue}
            className="w-full bg-[#0066FF] hover:bg-[#0052CC] text-white"
          >
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
