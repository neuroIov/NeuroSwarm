import React from "react";
import { Button } from "@/components/ui/button";
import { Wallet, CheckCircle, Loader2, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useSession, WalletType } from "@/hooks/useSession";

// Base64 encoded wallet icons
const PHANTOM_ICON =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCIgdmlld0JveD0iMCAwIDEyOCAxMjgiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMjgiIGhlaWdodD0iMTI4IiByeD0iNjQiIGZpbGw9IiM4QTQ1RkYiLz4KPHBhdGggZD0iTTkzLjgxNDkgNTIuMjgwMUw2OS4zNjggOTcuMDQ0MUg1OC4zNzgyTDQwLjEyMTEgNjIuMzkwNUg1My41NzA3TDYyLjk1MTIgODIuMzg1M0w3Ny44MDY3IDUyLjI4MDFIOTMuODE0OVoiIGZpbGw9IndoaXRlIi8+Cjwvc3ZnPgo=";
const METAMASK_ICON =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzMiIGhlaWdodD0iMzAiIHZpZXdCb3g9IjAgMCAzMyAzMCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTMxLjMzNDQgMUwxOC41NTI3IDkuNzczMDVMMjAuODE2MiA0LjYzNzIzTDMxLjMzNDQgMVoiIGZpbGw9IiNFMTc3MjYiIHN0cm9rZT0iI0UxNzcyNiIgc3Ryb2tlLXdpZHRoPSIwLjI1IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz4KPHBhdGggZD0iTTEuNjY2OTkgMUwxNC4zNDA3IDkuODc0MjJMMTIuMTgzOCA0LjYzNzIyTDEuNjY2OTkgMVoiIGZpbGw9IiNFMjc2MjUiIHN0cm9rZT0iI0UyNzYyNSIgc3Ryb2tlLXdpZHRoPSIwLjI1IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz4KPHBhdGggZD0iTTI2Ljg0OSAxOS44NTcxTDIzLjU3ODEgMjQuMzE2NUwzMC42NTE0IDI2LjAyNzFMMzIuNzAwNSAxOS45NTgyTDI2Ljg0OSAxOS44NTcxWiIgZmlsbD0iI0UyNzYyNSIgc3Ryb2tlPSIjRTI3NjI1IiBzdHJva2Utd2lkdGg9IjAuMjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPgo8cGF0aCBkPSJNMC4zMTU0MyAxOS45NTgyTDIuMzU0MTYgMjYuMDI3MUw5LjQyNzQ0IDI0LjMxNjVMNi4xNTY1NSAxOS44NTcxTDAuMzE1NDMgMTkuOTU4MloiIGZpbGw9IiNFMjc2MjUiIHN0cm9rZT0iI0UyNzYyNSIgc3Ryb2tlLXdpZHRoPSIwLjI1IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz4KPHBhdGggZD0iTTkuMDcxMyAxMi4yNjU0TDcuMTAzMDMgMTQuOTAyNEwxNC4xMjUxIDE1LjEwNDZMMTMuODg2OSA3LjU2MzQ4TDkuMDcxMyAxMi4yNjU0WiIgZmlsbD0iI0UyNzYyNSIgc3Ryb2tlPSIjRTI3NjI1IiBzdHJva2Utd2lkdGg9IjAuMjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPgo8cGF0aCBkPSJNMjMuOTI5MiAxMi4yNjU0TDE4Ljk5OTIgNy40NjIzMUwxOC44ODUyIDE1LjEwNDZMMjUuODk3NCAxNC45MDI0TDIzLjkyOTIgMTIuMjY1NFoiIGZpbGw9IiNFMjc2MjUiIHN0cm9rZT0iI0UyNzYyNSIgc3Ryb2tlLXdpZHRoPSIwLjI1IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz4KPHBhdGggZD0iTTkuNDI3MjkgMjQuMzE2NUwxMy43MTkzIDIyLjU5ODJMMTAuMDUxMSAxOS45OTk2TDkuNDI3MjkgMjQuMzE2NVoiIGZpbGw9IiNFMjc2MjUiIHN0cm9rZT0iI0UyNzYyNSIgc3Ryb2tlLXdpZHRoPSIwLjI1IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz4KPHBhdGggZD0iTTE5LjI4MTIgMjIuNTk4MkwyMy41NzgxIDI0LjMxNjVMMjIuOTQ5NSAxOS45OTk2TDE5LjI4MTIgMjIuNTk4MloiIGZpbGw9IiNFMjc2MjUiIHN0cm9rZT0iI0UyNzYyNSIgc3Ryb2tlLXdpZHRoPSIwLjI1IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz4KPHBhdGggZD0iTTIzLjU3ODEgMjQuMzE2NUwxOS4yODEyIDIyLjU5ODJMMTkuNjE4MiAyOC4wNDI0TDE5LjU3ODggMjUuOTI4M0wyMy41NzgxIDI0LjMxNjVaIiBmaWxsPSIjRDVDRkIzIiBzdHJva2U9IiNENUNGQjMiIHN0cm9rZS13aWR0aD0iMC4yNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+CjxwYXRoIGQ9Ik05LjQyNzI5IDI0LjMxNjVMMTMuNDIxNSAyNS45MjgzTDEzLjM5NyAyOC4wNDI0TDEzLjcxOTMgMjIuNTk4Mkw5LjQyNzI5IDI0LjMxNjVaIiBmaWxsPSIjRDVDRkIzIiBzdHJva2U9IiNENUNGQjMiIHN0cm9rZS13aWR0aD0iMC4yNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+CjxwYXRoIGQ9Ik0xMy44MDI0IDE4LjM0OTRMMTAuMjU1OSAxNy40NDc0TDEyLjc4MSAxNi40MTkxTDEzLjgwMjQgMTguMzQ5NFoiIGZpbGw9IiMyMzM0NDciIHN0cm9rZT0iIzIzMzQ0NyIgc3Ryb2tlLXdpZHRoPSIwLjI1IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz4KPHBhdGggZD0iTTE5LjE5ODEgMTguMzQ5NEwyMC4yMTk0IDE2LjQxOTFMMjIuNzU0OCAxNy40NDc0TDE5LjE5ODEgMTguMzQ5NFoiIGZpbGw9IiMyMzM0NDciIHN0cm9rZT0iIzIzMzQ0NyIgc3Ryb2tlLXdpZHRoPSIwLjI1IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz4KPHBhdGggZD0iTTkuNDI3NDQgMjQuMzE2NUwxMC4wNzU4IDE5Ljg1NzFMNi4xNTY1NSAyMC4wNTkzTDkuNDI3NDQgMjQuMzE2NVoiIGZpbGw9IiNFQjhGMzUiIHN0cm9rZT0iI0VCOEY1MSIgc3Ryb2tlLXdpZHRoPSIwLjI1IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz4KPHBhdGggZD0iTTIyLjkyNDcgMTkuODU3MUwyMy41NzMxIDI0LjMxNjVMMjYuODQ0IDE5Ljg1NzFMMjIuOTI0NyAxOS44NTcxWiIgZmlsbD0iI0VCOEY1MSIgc3Ryb2tlPSIjRUI4RjUxIiBzdHJva2Utd2lkdGg9IjAuMjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPgo8cGF0aCBkPSJNMjUuODk3NCAxNC45MDI0TDE4Ljg4NTIgMTUuMTA0NkwxOS4xOTgxIDE4LjM0OTRMMjAuMjE5MyAxNi40MTkxTDIyLjc1NDggMTcuNDQ3NEwyNS44OTc0IDE0LjkwMjRaIiBmaWxsPSIjRUI4RjM1IiBzdHJva2U9IiNFQjhGMzUiIHN0cm9rZS13aWR0aD0iMC4yNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+CjxwYXRoIGQ9Ik0xMC4yNTU5IDE3LjQ0NzRMNi43MjA2NyAxNC45MDI0TDEzLjcxOTMgMTUuMTA0NkwxMy44MDI0IDE4LjM0OTRMMTAuMjU1OSAxNy40NDc0WiIgZmlsbD0iI0VCOEY1MSIgc3Ryb2tlPSIjRUI4RjUxIiBzdHJva2Utd2lkdGg9IjAuMjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPgo8cGF0aCBkPSJNMTMuNzE5MyAxNS4xMDQ2TDEzLjgwMjQgMTguMzQ5NEwxOS4xOTgxIDE4LjM0OTRMMTU0Nkw1Ljg5NzQgMTQuOTAyNEwxOC44ODUyIDE1LjEwNDZMMTkuMTk4MSAxOC4zNDk0TDIwLjIxOTMgMTYuNDE5MUwyMi43NTQ4IDE3LjQ0NzRMMTguODg1MiAxNS4xMDQ2WiIgZmlsbD0iI0VCOEY1MSIgc3Ryb2tlPSIjRUI4RjUxIiBzdHJva2Utd2lkdGg9IjAuMjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPgo8cGF0aCBkPSJNMTMuODAyNCAxOC4zNDk0TDEzLjcxOTMgMTUuMTA0NkwxMC4yNTU5IDE3LjQ0NzRMMTMuODAyNCAxOC4zNDk0WiIgZmlsbD0iI0VCOEY1MSIgc3Ryb2tlPSIjRUI4RjUxIiBzdHJva2Utd2lkdGg9IjAuMjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPgo8cGF0aCBkPSJNMTkuMTk4MSAxOC4zNDk0TDE4Ljg4NTIgMTUuMTA0NkwyMi43NTQ4IDE3LjQ0NzRMMTkuMTk4MSAxOC4zNDk0WiIgZmlsbD0iI0VCOEY1MSIgc3Ryb2tlPSIjRUI4RjUxIiBzdHJva2Utd2lkdGg9IjAuMjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPgo8cGF0aCBkPSJNMTMuNzE5MyAxNS4xMDQ2TDEzLjgwMjQgMTguMzQ5NEwxOS4xOTgxIDE4LjM0OTRMMTguODg1MiAxNS4xMDQ2TDEzLjcxOTMgMTUuMTA0NloiIGZpbGw9IiNFNDc2MUMiIHN0cm9rZT0iI0U0NzYxQyIgc3Ryb2tlLXdpZHRoPSIwLjI1IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz4KPHBhdGggZD0iTTEwLjI1NTkgMTcuNDQ3NEwxMC4wNTExIDE5Ljk5OTZMMTMuNzE5MyAyMi41OTgyTDEzLjgwMjQgMTguMzQ5NEwxMC4yNTU5IDE3LjQ0NzRaIiBmaWxsPSIjRjZFNUQxIiBzdHJva2U9IiNGNkU1RDEiIHN0cm9rZS13aWR0aD0iMC4yNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+CjxwYXRoIGQ9Ik0yMi43NTQ4IDE3LjQ0NzRMMTkuMjgxMiAyMi41OTgyTDE5LjE5ODEgMTguMzQ5NEwyMi43NTQ4IDE3LjQ0NzRaIiBmaWxsPSIjRjZFNUQxIiBzdHJva2U9IiNGNkU1RDEiIHN0cm9rZS13aWR0aD0iMC4yNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+CjxwYXRoIGQ9Ik0xOS4xOTgxIDE4LjM0OTRMMTkuMjgxMiAyMi41OTgyTDIyLjk0OTUgMTkuOTk5NkwyMi43NTQ4IDE3LjQ0NzRMMTkuMTk4MSAxOC4zNDk0WiIgZmlsbD0iI0Y2RThENCIgc3Ryb2tlPSIjRjZFOEQ0IiBzdHJva2Utd2lkdGg9IjAuMjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPgo8cGF0aCBkPSJNMTMuODAyNCAxOC4zNDk0TDEzLjcxOTMgMjIuNTk4MkwxOS4yODEyIDIyLjU5ODJMMTkuMTk4MSAxOC4zNDk0TDEzLjgwMjQgMTguMzQ5NFoiIGZpbGw9IiNFNUQzQTgiIHN0cm9rZT0iI0U1RDNBOCI+PC9wYXRoPgo8cGF0aCBkPSJNMTAuMDUxMSAyMC4wMDI4TDEzLjcxOTMgMjIuNTk4MkwxMy44MDI0IDE4LjM0OTRMMTAuMDUxMSAyMC4wMDI4WiIgZmlsbD0iI0Y2RThENSIgc3Ryb2tlPSIjRjZFOEQ1IiBzdHJva2Utd2lkdGg9IjAuMjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPgo8cGF0aCBkPSJNNy4wOTg1OCAxNC45MDI0TDEwLjA1MTEgMTkuOTk5NkwxMC4yNDgzIDE3LjQ0NzRMNy4wOTg1OCAxNC45MDI0WiIgZmlsbD0iI0U4NzYyOSIgc3Ryb2tlPSIjRTg3NjI5IiBzdHJva2Utd2lkdGg9IjAuMjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPgo8cGF0aCBkPSJNMjIuNzU0OCAxNy40NDc0TDIyLjk0OTUgMTkuOTk5NkwyNS45MDIgMTQuOTAyNEwyMi43NTQ4IDE3LjQ0NzRaIiBmaWxsPSIjRTg3NjI5IiBzdHJva2U9IiNFODc2MjkiIHN0cm9rZS13aWR0aD0iMC4yNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+CjxwYXRoIGQ9Ik0xMy43MTkzIDIyLjU5ODJMMTMuMzk2OSAyOC4wNDI0TDE5LjYxODIgMjguMDQyNEwxOS4yODEyIDIyLjU5ODJMMTMuNzE5MyAyMi41OTgyWiIgZmlsbD0iI0M1NzgzNyIgc3Ryb2tlPSIjQzU3ODM3IiBzdHJva2Utd2lkdGg9IjAuMjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPgo8cGF0aCBkPSJNMTMuNzE5MyAyMi41OTgyTDEzLjM5NjkgMjguMDQyNEwxOS42MTgyIDI4LjA0MjRMMTkuMjgxMiAyMi41OTgyTDEzLjcxOTMgMjIuNTk4MloiIGZpbGw9IiNENzM2MzciIHN0cm9rZT0iI0Q3MzYzNyIgc3Ryb2tlLXdpZHRoPSIwLjI1IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz4KPHBhdGggZD0iTTEzLjcxOTMgMjIuNTk4MkwxMC4wNTExIDE5Ljk5OTZMMTAuMDc1OCAyMC4wNTkzTDEzLjcxOTMgMjIuNTk4MloiIGZpbGw9IiNFQjg5NTMiIHN0cm9rZT0iI0VCOEI1NiIgc3Ryb2tlLXdpZHRoPSIwLjI1IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz4KPHBhdGggZD0iTTE5LjI4MTIgMjIuNTk4MkwyMi45NDk1IDE5Ljk5OTZMMjIuOTI0NyAxOS44NTcxTDE5LjI4MTIgMjIuNTk4MloiIGZpbGw9IiNFQjg5NTMiIHN0cm9rZT0iI0VCOEI1NiIgc3Ryb2tlLXdpZHRoPSIwLjI1IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz4KPC9zdmc+Cg==";

interface WalletSelectorProps {
  onClose?: () => void;
}

export const WalletSelector = ({ onClose }: WalletSelectorProps) => {
  const {
    walletConnected,
    userPublicKey,
    connectWallet,
    isLoading,
    error,
    userProfile,
    session,
    walletType,
  } = useSession();

  // Display error toast if there's an error
  React.useEffect(() => {
    if (error) {
      toast.error(`Session error: ${error}`);
    }
  }, [error]);

  // Display success toast when user profile is loaded
  React.useEffect(() => {
    if (userProfile && walletConnected) {
      toast.success(
        `Welcome back! Reputation: ${userProfile.reputation_score}/100`
      );
      console.log("User profile loaded:", userProfile);
    }
  }, [userProfile, walletConnected]);

  const handleWalletConnect = async (type: WalletType) => {
    try {
      await connectWallet(type);
      toast.success(`Connecting to ${type} wallet...`);
      if (onClose) onClose();
    } catch (err) {
      console.error(`${type} wallet connection failed:`, err);
      toast.error(`Failed to connect to ${type} wallet`);
    }
  };

  const displayAddress = userPublicKey
    ? `${userPublicKey.toString().slice(0, 6)}...${userPublicKey
        .toString()
        .slice(-4)}`
    : "Connected";

  return (
    <div className="bg-[#040404] rounded-full p-1.5">
      {walletConnected ? (
        <Button
          variant="outline"
          onClick={() => connectWallet(walletType as WalletType)}
          disabled={isLoading}
          className={`
            flex items-center gap-2 font-medium rounded-full 
            bg-gradient-to-r from-[#0361DA] to-[#20A5EF] text-white
            border-1 border-[#20A5EF] hover:opacity-90 transition-opacity
            px-6 py-3 h-auto
          `}
          title={
            userProfile
              ? `Reputation: ${userProfile.reputation_score}/100 | Tasks: ${userProfile.total_tasks_completed} | Earnings: ${userProfile.total_earnings}`
              : "Disconnect wallet"
          }
        >
          {isLoading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Loading...</span>
            </>
          ) : (
            <>
              <CheckCircle className="w-5 h-5" />
              <span>
                {walletType === "phantom" ? "Phantom" : "MetaMask"}:{" "}
                {displayAddress}
              </span>
            </>
          )}
        </Button>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              disabled={isLoading}
              className={`
                flex items-center gap-2 font-medium rounded-full 
                bg-gradient-to-r from-[#0361DA] to-[#20A5EF] text-white
                border-1 border-[#20A5EF] hover:opacity-90 transition-opacity
                px-6 py-3 h-auto
              `}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Loading...</span>
                </>
              ) : (
                <>
                  <Wallet className="w-5 h-5" />
                  <span>Connect Wallet</span>
                  <ChevronDown className="w-4 h-4 ml-1" />
                </>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="bg-[#0A1A2F] border border-[#20A5EF]/20"
          >
            <DropdownMenuItem
              onClick={() => handleWalletConnect("phantom")}
              className="cursor-pointer flex items-center gap-2 text-white hover:bg-[#112544]"
            >
              <img src={PHANTOM_ICON} alt="Phantom" className="w-5 h-5" />
              <span>Phantom</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleWalletConnect("metamask")}
              className="cursor-pointer flex items-center gap-2 text-white hover:bg-[#112544]"
            >
              <img src={METAMASK_ICON} alt="MetaMask" className="w-5 h-5" />
              <span>MetaMask</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
};
