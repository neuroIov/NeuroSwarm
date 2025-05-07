import React from "react";
import { Link } from "react-router-dom";
import {
  LayoutDashboard,
  LineChart,
  Users,
  Globe,
  Settings,
  HelpCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface SidebarProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
  className?: string;
}

const sidebarItems = [
  {
    id: "dashboard",
    title: "Dashboard",
    icon: LayoutDashboard,
    path: "/dashboard",
  },
  {
    id: "earnings",
    title: "Earning",
    icon: LineChart,
    path: "/earnings",
  },
  {
    id: "referral",
    title: "Referral",
    icon: Users,
    path: "/referral",
  },
  {
    id: "global-stats",
    title: "Global Statistics",
    icon: Globe,
    path: "/global-stats",
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
        "fixed left-0 top-0 z-40 h-screen md:w-60 lg:w-[266px] px-4 py-6 border-r border-[#1F2937]",
        className
      )}
      style={{
        background: "#0A0A0A",
        boxShadow: "0 0 20px rgba(0, 0, 0, 0.4)",
      }}
    >
      <div className="flex h-full flex-col">
        {/* User profile */}
        <div className="mb-8">
          <div className="flex items-center gap-3 bg-[#1E1E1E] p-3 rounded-full">
            <Avatar className="h-10 w-10 border-2 border-blue-600/30">
              <AvatarImage src="/avatar-placeholder.png" alt="User" />
              <AvatarFallback>AG</AvatarFallback>
            </Avatar>
            <div>
              <h2 className="text-sm font-medium text-white">Alex Goldburg</h2>
              <p className="text-xs text-gray-400">Level 2 Node</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-2 ">
          {sidebarItems.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <Link
                key={item.id}
                to={item.path}
                className={`flex w-full items-center rounded-full px-4 py-3 text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? "bg-[#1E1E1E] text-white"
                    : "text-gray-400 hover:bg-[#1A1A1A]/70 hover:text-gray-200"
                }`}
              >
                <item.icon
                  className={`mr-3 h-5 w-5 transition-colors ${
                    isActive ? "text-white" : "text-gray-500"
                  }`}
                />
                {item.title}
              </Link>
            );
          })}
        </nav>

        {/* Footer buttons */}
        <div className="mt-auto space-y-2">
          <button className="flex w-full items-center rounded-full px-4 py-3 text-sm font-medium text-gray-400 hover:bg-[#1A1A1A]/70 hover:text-gray-200 transition-colors">
            <Settings className="mr-3 h-5 w-5 text-gray-500" />
            Settings
          </button>
          <button className="flex w-full items-center rounded-full px-4 py-3 text-sm font-medium text-gray-400 hover:bg-[#1A1A1A]/70 hover:text-gray-200 transition-colors">
            <HelpCircle className="mr-3 h-5 w-5 text-gray-500" />
            Help Center
          </button>
        </div>
      </div>
    </aside>
  );
}
