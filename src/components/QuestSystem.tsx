import React, { useState } from "react";
import { Button } from "./ui/button";
import { Twitter, Instagram, MessageCircle } from "lucide-react";
import { toast } from "sonner";

interface Quest {
  id: string;
  platform: string;
  icon: React.ReactNode;
  reward: number;
  completed: boolean;
  url: string;
}

export const QuestSystem = () => {
  const [quests, setQuests] = useState<Quest[]>([
    {
      id: "twitter",
      platform: "X (Twitter)",
      icon: <Twitter className="h-5 w-5" />,
      reward: 100,
      completed: false,
      url: "https://twitter.com/",
    },
    {
      id: "instagram",
      platform: "Instagram",
      icon: <Instagram className="h-5 w-5" />,
      reward: 100,
      completed: false,
      url: "https://instagram.com/",
    },
    {
      id: "discord",
      platform: "Discord",
      icon: <MessageCircle className="h-5 w-5" />,
      reward: 100,
      completed: false,
      url: "https://discord.gg/",
    },
  ]);

  const handleQuestComplete = (questId: string) => {
    setQuests((prevQuests) =>
      prevQuests.map((quest) =>
        quest.id === questId ? { ...quest, completed: true } : quest
      )
    );
    toast.success(
      `Earned ${
        quests.find((q) => q.id === questId)?.reward
      } SP for completing ${questId} quest!`
    );
  };

  return (
    <div className="mt-8 p-6 bg-card rounded-lg border border-border">
      <h2 className="text-2xl font-bold mb-4">Social Quests</h2>
      <div className="space-y-4">
        {quests.map((quest) => (
          <div
            key={quest.id}
            className="flex items-center justify-between p-4 bg-background rounded-md border border-border"
          >
            <div className="flex items-center space-x-4">
              {quest.icon}
              <div>
                <h3 className="font-semibold">{quest.platform}</h3>
                <p className="text-sm text-muted-foreground">
                  Join our {quest.platform} community
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm font-medium">{quest.reward} SP</span>
              <Button
                variant={quest.completed ? "secondary" : "default"}
                disabled={quest.completed}
                onClick={() => {
                  window.open(quest.url, "_blank");
                  handleQuestComplete(quest.id);
                }}
              >
                {quest.completed ? "Completed" : "Join Now"}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
