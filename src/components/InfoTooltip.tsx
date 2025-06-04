import React, { ReactNode } from "react";
import { HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface InfoTooltipProps {
  content: string | ReactNode;
  side?: "top" | "right" | "bottom" | "left";
}

export const InfoTooltip = ({ content, side = "top" }: InfoTooltipProps) => {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <HelpCircle className="w-4 h-4 text-blue-400 hover:text-blue-300 transition-colors" />
        </TooltipTrigger>
        <TooltipContent
          side={side}
          className="max-w-xs bg-[#161628] border border-blue-500/30 text-white"
        >
          {typeof content === "string" ? <p>{content}</p> : content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
