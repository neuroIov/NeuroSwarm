import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { useSession } from "./hooks/useSession";

const queryClient = new QueryClient();

const App = () => {
  const {
    session,
    walletConnected,
    userPublicKey,
    connectWallet,
    logUserActivity,
    logout, // Use the logout function here
  } = useSession();

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>

        {/* Wallet UI */}
        <div style={{ padding: "1rem", borderTop: "1px solid #eee", marginTop: "1rem" }}>
          {!walletConnected ? (
            <button onClick={connectWallet} style={{ padding: "0.5rem 1rem" }}>
              Connect Phantom Wallet
            </button>
          ) : (
            <p>✅ Wallet connected: {userPublicKey?.toString()}</p>
          )}

          <div className="session-info" style={{ marginTop: "1rem" }}>
            <h2>Session Info</h2>
            <p>Session ID: {session.sessionId}</p>
            <p>User ID: {session.userId}</p>
            <p>Auth Method: {session.authMethod}</p>

            <button
              onClick={() =>
                logUserActivity("task_created", { taskId: 123, status: "pending" })
              }
              style={{ marginTop: "0.5rem" }}
            >
              Log Activity
            </button>

            <h3>Activity Log</h3>
            <ul>
              {session.activities.map((activity, index) => (
                <li key={index}>
                  {activity.type} - {activity.timestamp}
                </li>
              ))}
            </ul>
          </div>

          {/* Logout Button */}
          <div style={{ marginTop: "20px" }}>
            <button
              onClick={logout}
              style={{
                padding: "0.5rem 1rem",
                backgroundColor: "#FF4D4F", // Optional: Customize the color
                color: "white",
                border: "none",
                cursor: "pointer",
              }}
            >
              Logout
            </button>
          </div>
        </div>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
