import { useEffect } from "react";
import { useToast } from "@/components/ui/use-toast";
import { useSession } from "@/hooks/useSession";

export const SubscriptionNotice = () => {
  const { subscriptionTier } = useSession();
  const { toast } = useToast();

  useEffect(() => {
    if (!subscriptionTier) return;

    // toast({
    //   title: `🎉 Subscription: ${subscriptionTier}`,
    //   description: getDescription(subscriptionTier),
    //   duration: 6000,
    // });
  }, [subscriptionTier]);

  const getDescription = (tier: string) => {
    switch (tier) {
      case "Pro":
        return "Unlimited Freedom AI & 8hr Swarm Node boost";
      case "Elite":
        return "Full AI suite unlocked – enjoy your creative power!";
      case "Basic":
      default:
        return "10,000 credits & 6hr Swarm Node – upgrade anytime!";
    }
  };

  return null; // This component just triggers a toast
};
