"use client"

import React from "react"
import { Toaster } from "@/components/ui/toaster"
import { Toaster as Sonner } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { RefreshCw, FileCode } from "lucide-react"
import Index from "./pages/Index"
import NotFound from "./pages/NotFound"
import { useSession } from "./hooks/useSession"
import { Sidebar } from "@/components/Sidebar"
import { Header } from "@/components/Header"
import { InfoTooltip } from "@/components/InfoTooltip"

const queryClient = new QueryClient()

// Layout component to include the Sidebar and main content
const Layout = () => {
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false)

  return (
    <div className="min-h-screen bg-[#0A0C1B] text-white flex">
      {/* Sidebar */}
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* <Header toggleSidebar={() => setIsSidebarOpen(true)} /> */}

        <main className="flex-1 p-4">
          <Outlet /> {/* Renders the child route elements */}
        </main>
      </div>
    </div>
  )
}

// Component for blank pages (Earnings, Referral, Global Statistics)
const BlankPage = ({ pageTitle }: { pageTitle: string }) => {
  const { walletConnected } = useSession()
  const [timeRange, setTimeRange] = React.useState("daily")
  const [totalEarnings, setTotalEarnings] = React.useState(1677.8) // Updated from Figma
  const [projectedEarnings, setProjectedEarnings] = React.useState(52465.48) // Updated from Figma
  const [dailyAverage, setDailyAverage] = React.useState(72.25) // Updated from Figma
  const [totalTasks, setTotalTasks] = React.useState(772) // Updated from Figma
  const [autoRefresh, setAutoRefresh] = React.useState(false)
  const [isRefreshing, setIsRefreshing] = React.useState(false)
  const [stats, setStats] = React.useState({ networkLoad: 0 })
  const [displayTasks, setDisplayTasks] = React.useState<any[]>([])

  // Sample data for Earnings History (past 7 days)
  const earningsHistory = [
    { date: "15 Apr", earnings: 20, label: "15 Apr" },
    { date: "14 Apr", earnings: 30, label: "14 Apr" },
    { date: "13 Apr", earnings: 20, label: "13 Apr" },
    { date: "12 Apr", earnings: 58, label: "12 Apr" }, // Peak value from Figma
    { date: "11 Apr", earnings: 30, label: "11 Apr" },
    { date: "10 Apr", earnings: 35, label: "10 Apr" },
    { date: "09 Apr", earnings: 35, label: "09 Apr" },
    { date: "08 Apr", earnings: 40, label: "08 Apr" },
  ]

  // Sample data for Recent Transactions
  const recentTransactions = [
    { date: "27/03/2025", tasks: 42, total: 5417.8, earned: 43.0 },
    { date: "26/03/2025", tasks: 52, total: 5417.8, earned: 58.49 },
    { date: "25/03/2025", tasks: 78, total: 5417.8, earned: 64.0 },
    { date: "24/03/2025", tasks: 35, total: 5417.8, earned: 43.0 },
    { date: "23/03/2025", tasks: 45, total: 5417.8, earned: 76.0 },
  ]

  const handleTimeRangeChange = (value: string) => {
    setTimeRange(value)
    // Simulate updating earnings based on time range
    if (value === "daily") {
      setTotalEarnings(1677.8)
      setProjectedEarnings(52465.48)
      setDailyAverage(72.25)
      setTotalTasks(772)
    } else if (value === "weekly") {
      setTotalEarnings(11744.6)
      setProjectedEarnings(36718.36)
      setDailyAverage(505.75)
      setTotalTasks(5404)
    } else if (value === "monthly") {
      setTotalEarnings(50334.0)
      setProjectedEarnings(157364.4)
      setDailyAverage(2167.5)
      setTotalTasks(23160)
    } else {
      setTotalEarnings(150102.0)
      setProjectedEarnings(469093.2)
      setDailyAverage(6457.5)
      setTotalTasks(69048)
    }
  }

  const handleWithdraw = () => {
    alert("Withdraw feature coming soon!")
  }

  const toggleAutoRefresh = () => setAutoRefresh(!autoRefresh)

  const handleRefresh = () => {
    setIsRefreshing(true)
    // Simulate refresh
    setTimeout(() => setIsRefreshing(false), 1000)
  }

  const getTaskTypeColorClass = (type: string) => {
    switch (type.toLowerCase()) {
      case 'image':
        return 'text-purple-400'
      case 'text':
        return 'text-blue-400'
      case 'video':
        return 'text-red-400'
      default:
        return 'text-gray-400'
    }
  }

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString()
  }

  // Calculate max earnings for scaling the bar chart
  const maxEarnings = Math.max(...earningsHistory.map((item) => item.earnings))

  return (
    <div className="flex-1 h-full" style={{ backgroundColor: "#0A0C1B" }}>
      {pageTitle === "Earnings Dashboard" ? (
        <div className="rounded-3xl p-6" style={{ backgroundColor: "#0A0C1B" }}>
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold">{pageTitle}</h2>
              {pageTitle === "Earnings Dashboard" && (
                <InfoTooltip content="Track your NLOV token earnings from completed tasks" />
              )}
            </div>
            {pageTitle === "Earnings Dashboard" && (
              <Select value={timeRange} onValueChange={handleTimeRangeChange}>
                <SelectTrigger className="w-[120px] bg-slate-800/50 rounded-full">
                  <SelectValue placeholder="Time Range" />
                </SelectTrigger>
                <SelectContent style={{ backgroundColor: "rgba(9, 12, 24, 1)", borderColor: "rgba(255, 255, 255, 0.1)" }}>
                  <SelectItem value="daily" style={{ backgroundColor: "rgba(9, 12, 24, 1)" }}>
                    Daily
                  </SelectItem>
                  <SelectItem value="weekly" style={{ backgroundColor: "rgba(9, 12, 24, 1)" }}>
                    Weekly
                  </SelectItem>
                  <SelectItem value="monthly" style={{ backgroundColor: "rgba(9, 12, 24, 1)" }}>
                    Monthly
                  </SelectItem>
                  <SelectItem value="all-time" style={{ backgroundColor: "rgba(9, 12, 24, 1)" }}>
                    All Time
                  </SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="flex flex-col p-4 bg-gradient-to-br from-[#0a2e73] to-[#0e58c3] rounded-lg">
              <div className="flex items-center text-slate-400 mb-1 text-sm">
                <div className="w-8 h-8 mr-2 rounded-full bg-[#0a2e73] flex items-center justify-center">
                  <img src="PNG 1 (1).png" alt="Coin" className="w-5 h-5" />
                </div>
                Total Earning
              </div>
              <div className="text-2xl font-bold">{totalEarnings.toFixed(2)} NLOV</div>
            </div>

            <div className="flex flex-col p-4 bg-gradient-to-br from-[#0a2e73] to-[#0e58c3] rounded-lg">
              <div className="flex items-center text-slate-400 mb-1 text-sm">
                <div className="w-8 h-8 mr-2 rounded-full bg-[#0a2e73] flex items-center justify-center">
                  <img src="Group (1).png" alt="Projected" className="w-5 h-5" />
                </div>
                Projected Monthly
              </div>
              <div className="text-2xl font-bold">{projectedEarnings.toFixed(2)} NLOV</div>
            </div>

            <div className="flex flex-col p-4 bg-gradient-to-br from-[#0a2e73] to-[#0e58c3] rounded-lg">
              <div className="flex items-center text-slate-400 mb-1 text-sm">
                <div className="w-8 h-8 mr-2 rounded-full bg-[#0a2e73] flex items-center justify-center">
                  <img src="Vector (8).png" alt="Tasks" className="w-5 h-5" />
                </div>
                Total Tasks
              </div>
              <div className="text-2xl font-bold">{totalTasks}</div>
            </div>

            <div className="flex flex-col p-4 bg-gradient-to-br from-[#0a2e73] to-[#0e58c3] rounded-lg">
              <div className="flex items-center text-slate-400 mb-1 text-sm">
                <div className="w-8 h-8 mr-2 rounded-full bg-[#0a2e73] flex items-center justify-center">
                  <img src="Group (2).png" alt="Average" className="w-5 h-5" />
                </div>
                Daily Average
              </div>
              <div className="text-2xl font-bold">{dailyAverage.toFixed(2)} NLOV</div>
            </div>
          </div>

          {/* Earnings History and Payout Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-gradient-to-br from-[#071a3e] to-[#0c2c5d] rounded-lg flex flex-col min-h-[320px]">
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-2">
                  <img src="Group (3).png" alt="History" className="w-5 h-5" />
                  <h3 className="text-lg font-medium">Earning History</h3>
                </div>
                <Select value={timeRange} onValueChange={handleTimeRangeChange}>
                  <SelectTrigger className="w-[120px] bg-slate-800/50 rounded-full">
                    <SelectValue placeholder="Time Range" />
                  </SelectTrigger>
                  <SelectContent
                    style={{ backgroundColor: "rgba(9, 12, 24, 1)", borderColor: "rgba(255, 255, 255, 0.1)" }}
                  >
                    <SelectItem value="daily" style={{ backgroundColor: "rgba(9, 12, 24, 1)" }}>
                      Daily
                    </SelectItem>
                    <SelectItem value="weekly" style={{ backgroundColor: "rgba(9, 12, 24, 1)" }}>
                      Weekly
                    </SelectItem>
                    <SelectItem value="monthly" style={{ backgroundColor: "rgba(9, 12, 24, 1)" }}>
                      Monthly
                    </SelectItem>
                    <SelectItem value="all-time" style={{ backgroundColor: "rgba(9, 12, 24, 1)" }}>
                      All Time
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 relative">
                {/* Y-Axis Labels */}
                <div className="absolute top-0 left-0 h-full flex flex-col justify-between text-slate-400 text-xs">
                  <span>50</span>
                  <span>40</span>
                  <span>30</span>
                  <span>20</span>
                  <span>10</span>
                  <span>0</span>
                </div>

                {/* Horizontal grid lines */}
                <div className="ml-8 h-full flex flex-col justify-between">
                  {[50, 40, 30, 20, 10, 0].map((value) => (
                    <div key={value} className="border-t border-slate-700 w-full h-0"></div>
                  ))}
                </div>

                {/* Bars */}
                <div className="absolute bottom-0 left-10 right-4 h-[200px] flex items-end gap-2">
                  {earningsHistory.map((item, index) => (
                    <div key={index} className="flex-1 flex flex-col items-center">
                      {/* Bar */}
                      <div
                        className={`w-full ${item.date === "12 Apr" ? "bg-[#1e90ff]" : "bg-[#0a2e73]"} relative`}
                        style={{
                          height: `${(item.earnings / 60) * 100}%`,
                          backgroundImage:
                            "repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.1) 5px, transparent 5px, transparent 10px)",
                        }}
                      >
                        {/* Tooltip for peak value */}
                        {item.date === "12 Apr" && (
                          <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-green-600 text-white text-xs px-2 py-1 rounded">
                            +10.76%
                          </div>
                        )}
                      </div>

                      {/* Earnings Label */}
                      <div className="absolute -top-6 text-white text-xs">
                        {item.date === "12 Apr" && `58.9 NLOV`}
                      </div>

                      {/* Date Label */}
                      <div className="text-slate-400 text-xs mt-2">{item.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 bg-[#0c1a2e] rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <img src="Payout.png" alt="Payout" className="w-5 h-5" />
                <h3 className="text-lg font-medium">Payout Details</h3>
              </div>
              <div className="space-y-4">
                <div>
                  <div className="text-sm text-slate-400 mb-1">Wallet Address</div>
                  <div className="font-medium">7B5d9x**************B694</div>
                </div>

                <div>
                  <div className="text-sm text-slate-400 mb-1">Network</div>
                  <div className="font-medium">SOLANA</div>
                </div>

                <div>
                  <div className="text-sm text-slate-400 mb-1">Minimum Payout</div>
                  <div className="font-medium">100 NLOV</div>
                </div>

                <div>
                  <div className="text-sm text-slate-400 mb-1">Next Payout Date</div>
                  <div className="font-medium">30/04/2025</div>
                </div>

                <Button
                  className="w-full bg-blue-600 hover:bg-blue-700 mt-2 rounded-full flex items-center justify-center gap-2"
                  onClick={handleWithdraw}
                >
                  <img src="Icon.png" alt="Withdraw" className="w-5 h-5" />
                  Withdraw Earnings
                </Button>
              </div>
            </div>
            {/* <div className="bg-[#141427] rounded-[20px] p-6 w-full max-w-4xl mx-auto">
              <div className="flex items-center gap-2 mb-6">
                <div className="flex items-center gap-2">
                  <img src="Group (5).png" alt="Icon" className="w-4 h-4" />
                  <span className="text-white/80 text-sm">Recent Transactions</span>
                </div>
              </div>

              <div className="space-y-4 text-sm text-white/80">
                {[
                  { date: "27/03/2025", tasks: 42, mov: "+439.0 NLOV", usd: "$41.78" },
                  { date: "26/03/2025", tasks: 52, mov: "+892.42 NLOV", usd: "$85.49" },
                  { date: "25/03/2025", tasks: 78, mov: "+904.3 NLOV", usd: "$91.75" },
                  { date: "24/03/2025", tasks: 36, mov: "+389.9 NLOV", usd: "$38.93" },
                  { date: "23/03/2025", tasks: 45, mov: "+756.4 NLOV", usd: "$69.56" },
                ].map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center border-t border-white/10 pt-4">
                    <div>
                      <div className="font-semibold text-white">{item.date}</div>
                      <div className="text-xs text-white/60">{item.tasks} Tasks Completed</div>
                    </div>
                    <div className="text-right">
                      <div className="text-green-400 text-sm font-medium bg-green-900/30 px-3 py-1 rounded-full inline-block">
                        {item.mov}
                      </div>
                      <div className="text-white/60 text-xs">{item.usd}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div> */}

          </div>
          <div className="bg-[#141427] rounded-[20px] p-6 w-full max-w-full mx-auto mt-6">
            <div className="flex items-center gap-2 mb-6">
              <div className="flex items-center gap-2">
                <img src="Group (5).png" alt="Icon" className="w-4 h-4" />
                <span className="text-white/80 text-sm">Recent Transactions</span>
              </div>
            </div>

            <div className="space-y-4 text-sm text-white/80">
              {[
                { date: "27/03/2025", tasks: 42, mov: "+439.0 NLOV", usd: "$41.78" },
                { date: "26/03/2025", tasks: 52, mov: "+892.42 NLOV", usd: "$85.49" },
                { date: "25/03/2025", tasks: 78, mov: "+904.3 NLOV", usd: "$91.75" },
                { date: "24/03/2025", tasks: 36, mov: "+389.9 NLOV", usd: "$38.93" },
                { date: "23/03/2025", tasks: 45, mov: "+756.4 NLOV", usd: "$69.56" },
              ].map((item, idx) => (
                <div key={idx} className="flex justify-between items-center border-t border-white/10 pt-4">
                  <div>
                    <div className="font-semibold text-white">{item.date}</div>
                    <div className="text-xs text-white/60">{item.tasks} Tasks Completed</div>
                  </div>
                  <div className="text-right">
                    <div className="text-green-400 text-sm font-medium bg-green-900/30 px-3 py-1 rounded-full inline-block">
                      {item.mov}
                    </div>
                    <div className="text-white/60 text-xs">{item.usd}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : pageTitle === "Global Statistics" ? (
        <div className="rounded-3xl p-6 bg-[#0A0C1B]">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold">Global Statistics</h2>
              <InfoTooltip content="Overview of the entire Swarm Network activity" />
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-400">Auto-Refresh</span>
                <Switch checked={autoRefresh} onCheckedChange={toggleAutoRefresh} />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="bg-blue-950/50 border-blue-900 text-blue-400 hover:bg-blue-900/50 hover:text-blue-300"
              >
                <RefreshCw className={`w-4 h-4 mr-1 ${isRefreshing ? "animate-spin" : ""} `} />
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </Button>
            </div>
          </div>

          {/* World Map Visualization */}
          <div className="relative w-full h-[300px] bg-blue-950 rounded-xl mb-6 overflow-hidden">
            <img src="Map.png" alt="" />
            {/* <div className="absolute inset-0 bg-[url('Map.png')] bg-no-repeat bg-center bg-contain opacity-80"></div> */}
            {/* Glowing dots could be added here with absolute positioning */}
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="flex items-center p-4 bg-blue-950/80 rounded-lg">
              <div className="w-10 h-10 mr-3 rounded-full bg-blue-800 flex items-center justify-center">
                <img src="Group 10.png" alt="Nodes" className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm text-slate-400">Total Tasks</div>
                <div className="text-xl font-bold">74</div>
              </div>
            </div>

            <div className="flex items-center p-4 bg-blue-950/80 rounded-lg">
              <div className="w-10 h-10 mr-3 rounded-full bg-blue-800 flex items-center justify-center">
                <img src="Vector (9).png" alt="Response Time" className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm text-slate-400">Avg. Computing Time</div>
                <div className="text-xl font-bold">2.89s</div>
              </div>
            </div>

            <div className="flex items-center p-4 bg-blue-950/80 rounded-lg">
              <div className="w-10 h-10 mr-3 rounded-full bg-blue-800 flex items-center justify-center">
                <img src="Group 11.png" alt="Active Tasks" className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm text-slate-400">Total Users</div>
                <div className="text-xl font-bold">24</div>
              </div>
            </div>

            <div className="flex items-center p-4 bg-blue-950/80 rounded-lg">
              <div className="w-10 h-10 mr-3 rounded-full bg-blue-800 flex items-center justify-center">
                <img src="Group (4).png" alt="Active Models" className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm text-slate-400">Active Nodes</div>
                <div className="text-xl font-bold">16</div>
              </div>
            </div>
          </div>

          {/* Recent Global Tasks */}
          <div>
            <h3 className="text-lg font-medium mb-4">Recent Global Tasks</h3>

            <div className="space-y-3">
              {displayTasks.length > 0 ? (
                displayTasks.map((task, index) => (
                  <div key={`${task.id}-${index}`} className="bg-blue-950/50 rounded-lg p-3">
                    <div className="flex">
                      <div className="mr-3 p-2 bg-blue-900/30 rounded-lg">
                        <div className="w-8 h-8 flex items-center justify-center">
                          <FileCode className={`w-5 h-5 ${getTaskTypeColorClass(task.type)}`} />
                        </div>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-blue-400">{task.model || "GPT-4"}</span>
                          <span className="text-xs bg-blue-900/30 px-2 py-0.5 rounded">{task.type || "Text"}</span>
                          <span className="text-xs px-2 py-0.5 rounded ml-auto bg-amber-900/50 text-amber-300">
                            Pending
                          </span>
                        </div>
                        <p className="text-sm mb-1">Prompt: Write a short story about a robot learning emotions</p>
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <span>Awaiting instruction</span>
                          <span className="ml-auto">02:30:54 PM</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-slate-400 bg-blue-950/30 rounded-lg">
                  {/* <FileCode className="w-10 h-10 mb-2 text-blue-800" /> */}
                  {/* <p>No tasks available. Refresh to load tasks.</p> */}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        // <div className="rounded-3xl p-6 bg-[#0A0C1B] flex items-center justify-center h-64">
        //   <p className="text-slate-400">{pageTitle || "Referral"} page coming soon!</p>
        // </div>
        <h1></h1>
      )}
    </div>
  )
}

const App = () => {
  const { session, logUserActivity, userProfile, walletConnected } = useSession()

  // Log when user profile changes
  React.useEffect(() => {
    if (userProfile) {
      console.log("User profile in App:", userProfile)
    }
  }, [userProfile])

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
              <Route path="/earnings" element={<BlankPage pageTitle="Earnings Dashboard" />} />
              <Route path="/referral" element={<BlankPage pageTitle="Referral Program" />} />
              <Route path="/global-statistics" element={<BlankPage pageTitle="Global Statistics" />} />
            </Route>
            {/* Not Found route */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  )
}

export default App