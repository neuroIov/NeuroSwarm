import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LoginForm } from "./LoginForm";
import { SignupForm } from "./SignupForm";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const [activeTab, setActiveTab] = useState<"login" | "signup">("login");

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] bg-[#112544] text-white border-[#0A1A2F]">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            Welcome to NeuroSwarm
          </DialogTitle>
          <DialogDescription className="text-gray-300">
            Join the swarm and start earning rewards
          </DialogDescription>
        </DialogHeader>

        <div className="mb-4 p-3 bg-[#0A1A2F] rounded-md text-sm text-blue-200 border border-[#064C94]">
          <p>
            First, create an account or log in with your email. After
            authenticating, you'll be able to connect your wallet to earn
            rewards!
          </p>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as "login" | "signup")}
        >
          <TabsList className="grid w-full grid-cols-2 bg-[#0A1A2F]">
            <TabsTrigger
              value="login"
              className="data-[state=active]:bg-[#0066FF] data-[state=active]:text-white"
            >
              Login
            </TabsTrigger>
            <TabsTrigger
              value="signup"
              className="data-[state=active]:bg-[#0066FF] data-[state=active]:text-white"
            >
              Sign Up
            </TabsTrigger>
          </TabsList>
          <TabsContent value="login">
            <LoginForm onSuccess={onClose} />
          </TabsContent>
          <TabsContent value="signup">
            <SignupForm onSuccess={onClose} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
