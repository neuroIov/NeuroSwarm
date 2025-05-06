import React from "react";
import { Home, LineChart, Users, Globe } from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
  className?: string;
}

const sidebarItems = [
  {
    id: "dashboard",
    title: "Dashboard",
    icon: Home,
  },
  {
    id: "earnings",
    title: "Earnings",
    icon: LineChart,
  },
  {
    id: "referral",
    title: "Referral",
    icon: Users,
  },
  {
    id: "global-stats",
    title: "Global Stats",
    icon: Globe,
  },
];

export function Sidebar({
  activeSection,
  onSectionChange,
  className,
}: SidebarProps) {
  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 h-screen w-64 bg-[#0A1A2F] border-r border-[#112544]",
        className
      )}
    >
      <div className="flex h-full flex-col px-3 py-4">
        <div className="mb-10 px-4">
          <h1 className="text-xl font-bold text-white">NeuroSwarm</h1>
        </div>

        <nav className="flex-1 space-y-2">
          {sidebarItems.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSectionChange(item.id)}
                className={`flex w-full items-center rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-[#112544] text-[#0066FF]"
                    : "text-gray-400 hover:bg-[#112544] hover:text-white"
                }`}
              >
                <item.icon className="mr-3 h-5 w-5" />
                {item.title}
              </button>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
