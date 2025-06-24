import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  LayoutDashboard,
  LineChart,
  Users,
  Globe,
  Settings,
  HelpCircle,
  Edit2,
  Send,
} from "lucide-react";
import { FaXTwitter } from "react-icons/fa6";
import "@/styles/SocialMedia.css";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAppDispatch, useAppSelector } from "@/store";
import { updateUsername } from "@/store/slices/sessionSlice";
import { ProfileEditModal } from "./ProfileEditModal";

// Define extended session type with additional properties
interface ExtendedSession {
  userId: string | null;
  email?: string;
  username?: string;
  walletAddress?: string;
  walletType?: string | null;
  createdAt?: string;
  referralCode?: string;
  referralCount?: number;
}

interface SidebarProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
  className?: string;
  isOpen?: boolean;
  onClose?: () => void;
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
  isOpen = false,
  onClose,
}: SidebarProps) {
  const dispatch = useAppDispatch();
  const { userProfile } = useAppSelector((state) => state.session);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  // Helper function to extract wallet type from username
  const extractWalletType = (username: string | null): string | null => {
    if (!username) return null;
    const match = username.match(/\[wallet_type:(phantom|metamask)\]/);
    if (match && match[1]) {
      return match[1];
    }
    return null;
  };

  // Create an extended session object from userProfile
  const extendedSession: ExtendedSession = {
    userId: userProfile?.id || null,
    // Use available properties from userProfile
    username: userProfile?.user_name,
    walletAddress: userProfile?.wallet_address,
    // Extract wallet type from username
    walletType: userProfile?.user_name
      ? extractWalletType(userProfile.user_name)
      : null,
    // Set defaults for missing properties
    email: "",
    createdAt: new Date().toISOString(),
    referralCode: userProfile?.referral_code,
    referralCount: 0,
  };

  // Log session data for debugging
  useEffect(() => {
    if (userProfile) {
      console.log("Sidebar userProfile:", userProfile);
    }
  }, [userProfile]);

  // Helper function to clean username by removing wallet type metadata
  const cleanUsername = (username: string | null): string | null => {
    if (!username) return null;
    return username
      .replace(/\s*\[wallet_type:(phantom|metamask)\]\s*/, "")
      .trim();
  };

  // Get display name - either username or truncated wallet address
  const getDisplayName = () => {
    if (userProfile?.user_name) {
      // Clean the username to remove any wallet type metadata
      return cleanUsername(userProfile.user_name) || userProfile.user_name;
    }

    if (userProfile?.wallet_address) {
      const addr = userProfile.wallet_address;
      return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
    }

    return "Guest User";
  };

  // Only show edit button if user is logged in
  const isLoggedIn = !!userProfile?.id;

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-30 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "fixed left-0 top-0 z-40 h-screen w-[80%] sm:w-[60%] md:w-60 lg:w-[266px] px-4 py-6 border-r border-[#1F2937]",
          className
        )}
        style={{
          background: "#0A0A0A",
          boxShadow: "0 0 20px rgba(0, 0, 0, 0.4)",
        }}
      >
        <div className="flex h-full flex-col">
          {/* Close button - mobile only */}
          {onClose && (
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-gray-400 hover:text-white md:hidden"
              aria-label="Close sidebar"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          )}

          {/* User profile */}
          <div className="mb-8 mt-6">
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
                  {isLoggedIn && (
                    <button
                      onClick={() => setIsProfileModalOpen(true)}
                      className="text-gray-400 hover:text-blue-400 transition-colors"
                      title="Edit profile"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-400">
                  {userProfile?.wallet_address
                    ? "Wallet Connected"
                    : "Not Connected"}
                </p>
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
                  onClick={() => {
                    if (onSectionChange) {
                      onSectionChange(item.id);
                    }
                  }}
                  className={`${item.id === "earnings" ? "sidebar-earnings" : 
                             item.id === "referral" ? "sidebar-referral" : 
                             item.id === "global-stats" ? "sidebar-global-stats" : ""} 
                           flex w-full items-center rounded-full px-4 py-3 text-sm font-medium transition-all duration-200 ${
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

            {/* Social Media Links */}
            <div className="social-links">
              <p className="social-text">For more updates follow us on Twitter and Telegram</p>
              <div className="social-icons">
                <a href="https://x.com/neurolov" target="_blank" rel="noopener noreferrer">
                  <FaXTwitter id="twitter" className="icons-social-media" />
                </a>
                <a href="https://t.me/neurolovcommunity" target="_blank" rel="noopener noreferrer">
                  <Send id="telegram" className="icons-social-media" />
                </a>
              </div>
            </div>
          </nav>

          {/* Footer buttons */}
          <div className="mt-auto space-y-2">
            <Link
              to="/settings"
              className="flex w-full items-center rounded-full px-4 py-3 text-sm font-medium text-gray-400 hover:bg-[#1A1A1A]/70 hover:text-gray-200 transition-colors"
            >
              <Settings className="mr-3 h-5 w-5 text-gray-500" />
              Settings
            </Link>
            <Link
              to="/help-center"
              className="flex w-full items-center rounded-full px-4 py-3 text-sm font-medium text-gray-400 hover:bg-[#1A1A1A]/70 hover:text-gray-200 transition-colors"
            >
              <HelpCircle className="mr-3 h-5 w-5 text-gray-500" />
              Help Center
            </Link>


          </div>
        </div>
      </aside>

      {/* Profile Edit Modal */}
      {userProfile && (
        <ProfileEditModal
          isOpen={isProfileModalOpen}
          onClose={() => setIsProfileModalOpen(false)}
          session={extendedSession}
        />
      )}
    </>
  );
}
