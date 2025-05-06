import React from "react";
import { Cpu, Zap, BarChart, Users, X, PanelRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";

interface HowItWorksStepProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const HowItWorksStep = ({ icon, title, description }: HowItWorksStepProps) => {
  return (
    <div className="flex gap-3 mb-6">
      <div className="shrink-0 p-2 bg-swarm-accent-purple/20 rounded-lg h-fit">
        {icon}
      </div>
      <div>
        <h3 className="text-lg font-semibold mb-1">{title}</h3>
        <p className="text-slate-300">{description}</p>
      </div>
    </div>
  );
};

export const HowItWorks = () => {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <div className="bg-[#040404] rounded-full p-1 fixed bottom-6 right-6 z-50">
          <Button
            variant="outline"
            className="
              flex items-center gap-2 font-medium rounded-full 
              bg-gradient-to-r from-[#0361DA] to-[#20A5EF] text-white
              border-1 border-[#20A5EF] hover:opacity-90 transition-opacity
              px-6 py-3 h-auto
            "
          >
            <PanelRight className="w-5 h-5" />
            How It Works
          </Button>
        </div>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="text-2xl flex items-center">
            <span className="nlov-gradient">Swarm</span>&nbsp;Network Explained
          </DialogTitle>
          <DialogDescription>
            Learn how to earn NLOV tokens by contributing your computing
            resources.
          </DialogDescription>
        </DialogHeader>

        <Separator className="my-4" />

        <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2">
          <HowItWorksStep
            icon={<Cpu className="w-5 h-5 text-purple-400" />}
            title="Connect Your Devices"
            description="Sign in with your crypto wallet to register your devices (desktop, laptop, mobile) as nodes in the Swarm Network. Our system will scan and categorize each device based on its capabilities."
          />

          <HowItWorksStep
            icon={<Zap className="w-5 h-5 text-amber-400" />}
            title="Start Your Nodes"
            description="Activate your device nodes to start receiving and processing tasks. The reward tier is determined by your hardware capabilities: WebGPU (highest rewards), WASM, WebGL, and CPU (basic rewards)."
          />

          <HowItWorksStep
            icon={<BarChart className="w-5 h-5 text-blue-400" />}
            title="Earn NLOV Tokens"
            description="As your nodes complete tasks, you'll earn NLOV tokens. Your earnings are tracked in real-time and are displayed on your dashboard. Payouts occur monthly with a minimum threshold of 10 NLOV."
          />

          <HowItWorksStep
            icon={<Users className="w-5 h-5 text-green-400" />}
            title="Grow Through Referrals"
            description="Increase your earnings by inviting others to join the Swarm Network. You'll receive 5% of your direct referrals' earnings and 2% from their referrals, creating a passive income stream."
          />

          <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
            <h3 className="text-lg font-semibold mb-2">Reward Tiers</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>WebGPU (Desktop with GPU)</span>
                <span className="font-medium text-green-400">
                  Maximum Rewards
                </span>
              </div>
              <div className="flex justify-between">
                <span>WASM (Laptop with GPU)</span>
                <span className="font-medium text-blue-400">High Rewards</span>
              </div>
              <div className="flex justify-between">
                <span>WebGL (Integrated Graphics)</span>
                <span className="font-medium text-yellow-400">
                  Medium Rewards
                </span>
              </div>
              <div className="flex justify-between">
                <span>CPU (Mobile / Basic)</span>
                <span className="font-medium text-slate-400">
                  Basic Rewards
                </span>
              </div>
            </div>
          </div>

          <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
            <h3 className="text-lg font-semibold mb-2">Task Processing</h3>
            <p className="text-slate-300 mb-3">
              Tasks are automatically assigned to your active nodes based on
              their capabilities. Once a node starts a task, it is locked for
              the duration required to complete the task. Successfully completed
              tasks are removed from your pipeline and rewards are added to your
              earnings.
            </p>
            <p className="text-slate-300">
              The global task pool contains tasks submitted by network users and
              applications. The Swarm Network distributes these tasks
              efficiently across all active nodes to maximize throughput and
              minimize processing time.
            </p>
          </div>
        </div>

        <DialogClose asChild>
          <div className="bg-[#040404] rounded-full p-1 mt-4 w-full">
            <Button
              className="
              w-full rounded-full 
              bg-gradient-to-r from-[#0361DA] to-[#20A5EF] text-white
              border-1 border-[#20A5EF] hover:opacity-90 transition-opacity
              px-6 py-3 h-auto
            "
            >
              Got it, let's earn some NLOV!
            </Button>
          </div>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
};
