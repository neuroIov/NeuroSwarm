import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { useSession } from "./hooks/useSession";
import { Sidebar } from "@/components/Sidebar"; // Assuming Sidebar.tsx is in the same directory

const queryClient = new QueryClient();

// Layout component to include the Sidebar and main content
const Layout = () => {
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);

  return (
    <div className="min-h-screen bg-gray-900 text-white flex">
      {/* Sidebar */}
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-h-screen">
        <header className=" flex justify-between items-center">
          <button
            className="md:hidden text-white"
            onClick={() => setIsSidebarOpen(true)}
          >
            ☰
          </button>
        </header>

        <main className="flex-1 p-4">
          <Outlet /> {/* Renders the child route elements */}
        </main>
      </div>
    </div>
  );
};

// Component for blank pages (Earnings, Referral, Global Statistics)
const BlankPage = () => {
  return (
    <div
      className="flex-1 h-full"
      style={{ backgroundColor: '#0A0C1B' }} // Dark navy blue color from the uploaded image
    >
      {/* Blank content */}

    </div>
  );
};

const App = () => {
  const { session, logUserActivity, userProfile, walletConnected } = useSession();

  // Log when user profile changes
  React.useEffect(() => {
    if (userProfile) {
      console.log("User profile in App:", userProfile);
    }
  }, [userProfile]);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            {/* Nested routes under Layout to include Sidebar */}
            <Route element={<Layout />}>
              <Route path="/" element={<Index />} />
              <Route path="/earnings" element={<BlankPage />} />
              <Route path="/referral" element={<BlankPage />} />
              <Route path="/global-statistics" element={<BlankPage />} />
            </Route>
            {/* Not Found route */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;