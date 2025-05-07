import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  LayoutDashboard,
  LineChart,
  Users,
  Globe,
  Settings,
  HelpCircle,
  Edit2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAppDispatch, useAppSelector } from "@/store";
import { updateUsername } from "@/store/slices/sessionSlice";
import { UsernameDialog } from "./UsernameDialog";

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
  const dispatch = useAppDispatch();
  const { userProfile } = useAppSelector((state) => state.session);
  const [isUsernameDialogOpen, setIsUsernameDialogOpen] = useState(false);

  const handleSaveUsername = (username: string) => {
    if (userProfile?.id) {
      dispatch(updateUsername({ userId: userProfile?.id, username }));
    }
  };

  // Get display name - either username or truncated wallet address
  const getDisplayName = () => {
    if (userProfile?.user_name) {
      return userProfile.user_name;
    }

    if (userProfile?.wallet_address) {
      const addr = userProfile.wallet_address;
      return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
    }

    return "Guest User";
  };

  return (
    <>
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
                <AvatarFallback>
                  {userProfile?.user_name
                    ? userProfile.user_name.substring(0, 2).toUpperCase()
                    : "GU"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center ">
                  <h2 className="text-sm font-medium text-white truncate mr-2">
                    {getDisplayName()}
                  </h2>
                  {userProfile?.wallet_address && (
                    <button
                      onClick={() => setIsUsernameDialogOpen(true)}
                      className="text-gray-400  hover:text-blue-400 transition-colors"
                      title="Edit username"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {/* <p className="text-xs text-gray-400">
                  {userProfile ? "Level 2 Node" : "Not Connected"}
                </p> */}
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

      {/* Username dialog */}
      <UsernameDialog
        isOpen={isUsernameDialogOpen}
        onClose={() => setIsUsernameDialogOpen(false)}
        onSave={handleSaveUsername}
        initialUsername={userProfile?.user_name}
      />
    </>
  );
}
