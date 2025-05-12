import { toast } from "sonner";
import { getTierByName } from "@/lib/subscriptionTiers";

export function checkCreditUsage({
  tierName,
  toolKey,
  used,
}: {
  tierName: string;
  toolKey: keyof ReturnType<typeof getTierByName>["aiCredits"];
  used: number;
}) {
  const tier = getTierByName(tierName);
  const limit = tier.aiCredits[toolKey];

  if (limit === "unlimited" || typeof limit !== "number") return;

  const percentUsed = (used / limit) * 100;

  if (percentUsed >= 100) {
    toast.error(`🚫 You’ve exhausted your ${toolKey} credits.`);
  } else if (percentUsed >= 80) {
    toast.warning(`⚠️ You’ve used ${Math.floor(percentUsed)}% of your ${toolKey} credits.`);
  }
}
