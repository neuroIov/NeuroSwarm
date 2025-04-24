
import React, { useState } from 'react';
import { 
  Cpu, 
  HardDrive, 
  Activity, 
  Clock, 
  Loader2,
  Power,
  ScanLine,
  Laptop,
  ServerCrash,
  AlertTriangle,
  Check
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InfoTooltip } from './InfoTooltip';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from 'sonner';
import { detectHardware, RewardTier, getRewardMultiplier, requestDevicePermission, DeviceInfo } from '@/utils/hardwareDetection';
import { useNodes } from '@/contexts/NodeContext';
import { Progress } from '@/components/ui/progress';

// Node type definition compatible with NodeContext
interface NodeInfo {
  id: string;
  name: string;
  rewardTier: RewardTier;
  status: 'idle' | 'running' | 'offline';
  multiplier: number;
}

export const NodeControlPanel = () => {
  // Use the NodeContext
  const { nodes, addNode, updateNodeStatus } = useNodes();
  
  // Local state
  const [selectedNodeId, setSelectedNodeId] = useState<string>("");
  const [isScanning, setIsScanning] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanPhase, setScanPhase] = useState("");
  const [showPermissionDialog, setShowPermissionDialog] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  
  // Stats state
  const [cpuUsage, setCpuUsage] = useState(0);
  const [memoryUsage, setMemoryUsage] = useState(0);
  const [networkUsage, setNetworkUsage] = useState(0);
  
  const selectedNode = nodes.find(n => n.id === selectedNodeId);

  // Handle scanning process and device detection
  const performScan = async () => {
    setIsScanning(true);
    setScanProgress(0);
    setScanPhase("Requesting device permission...");
    
    try {
      // Request permission first
      const permissionGranted = await requestDevicePermission();
      
      if (!permissionGranted) {
        toast.error("Permission denied. Cannot scan device without access.");
        setIsScanning(false);
        return;
      }
      
      // Simulate scanning phases with real detection
      const scanSteps = [
        { phase: "Checking CPU capabilities...", progress: 20 },
        { phase: "Detecting GPU architecture...", progress: 40 },
        { phase: "Testing WebGPU support...", progress: 60 },
        { phase: "Checking WebGL compatibility...", progress: 75 },
        { phase: "Evaluating WASM performance...", progress: 90 },
        { phase: "Finalizing device profile...", progress: 95 }
      ];
      
      // Run through scanning phases
      for (const step of scanSteps) {
        setScanPhase(step.phase);
        setScanProgress(step.progress);
        await new Promise(r => setTimeout(r, 500)); // Simulate processing time
      }
      
      // Get actual device info
      const deviceDetails = await detectHardware(true);
      setDeviceInfo(deviceDetails);
      
      // Complete scan
      setScanProgress(100);
      setScanPhase("Scan complete!");
      
      // Create new node from detected hardware
      const newNode = {
        id: `node-${Date.now()}`,
        name: deviceDetails.name,
        rewardTier: deviceDetails.rewardTier,
        status: 'idle' as const,
        multiplier: getRewardMultiplier(deviceDetails.rewardTier)
      };
      
      // Add to nodes collection
      addNode(newNode);
      setSelectedNodeId(newNode.id);
      
      toast.success(
        `Device added: ${newNode.name}\n` +
        `Reward Tier: ${newNode.rewardTier.toUpperCase()} (${newNode.multiplier}x rewards)`
      );
      
    } catch (error) {
      console.error('Scan error:', error);
      toast.error('Failed to scan device. Please try again.');
    } finally {
      setTimeout(() => {
        setIsScanning(false);
        setScanProgress(0);
      }, 1000);
    }
  };
  
  // Start scan flow with permission request
  const scanForNewDevice = () => {
    setShowPermissionDialog(true);
  };
  
  const handleNodeSelect = (value: string) => {
    setSelectedNodeId(value);
    // Reset usage stats when switching nodes
    setCpuUsage(0);
    setMemoryUsage(0);
    setNetworkUsage(0);
  };
  
  const toggleNodeStatus = () => {
    if (!selectedNode) return;
    
    if (selectedNode.status === 'running') {
      updateNodeStatus(selectedNodeId, 'idle');
      
      // Reset statistics
      setCpuUsage(0);
      setMemoryUsage(0);
      setNetworkUsage(0);
      
      toast.info(`Node "${selectedNode.name}" stopped`);
      
    } else {
      setIsStarting(true);
      
      // Simulate starting delay
      setTimeout(() => {
        updateNodeStatus(selectedNodeId, 'running');
        
        // Simulate some initial usage
        setCpuUsage(Math.random() * 30 + 10);
        setMemoryUsage(Math.random() * 20 + 5);
        setNetworkUsage(Math.random() * 5 + 0.5);
        
        setIsStarting(false);
        toast.success(`Node "${selectedNode.name}" started and ready for tasks`);
      }, 2000);
    }
  };
  
  // Start usage simulation for running nodes
  React.useEffect(() => {
    if (selectedNode?.status === 'running') {
      const interval = setInterval(() => {
        // Simulate fluctuating resource usage
        setCpuUsage(prev => {
          const delta = (Math.random() * 10) - 5; // -5 to +5
          return Math.max(5, Math.min(95, prev + delta));
        });
        
        setMemoryUsage(prev => {
          const delta = (Math.random() * 8) - 4; // -4 to +4
          return Math.max(5, Math.min(90, prev + delta));
        });
        
        setNetworkUsage(prev => {
          const delta = (Math.random() * 2) - 0.5; // -0.5 to +1.5
          return Math.max(0.1, Math.min(20, prev + delta));
        });
      }, 3000);
      
      return () => clearInterval(interval);
    }
  }, [selectedNode]);
  
  return (
    <div className="stat-card">
      <div className="flex flex-col space-y-4">
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold">Node Control Panel</h2>
            <InfoTooltip content="Manage your computing nodes, start or stop them, and view performance metrics" />
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={scanForNewDevice}
            disabled={isScanning}
            className="text-swarm-accent-purple border-swarm-accent-purple/50 hover:border-swarm-accent-purple/80 hover:bg-swarm-accent-purple/20"
          >
            {isScanning ? (
              <>
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <ScanLine className="w-4 h-4 mr-1" />
                Scan Device
              </>
            )}
          </Button>
        </div>
        
        {nodes.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-slate-400 mb-4">No devices added yet</p>
            <p className="text-sm text-slate-500">
              Click "Scan Device" to add your first device to the Swarm Network
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-col sm:flex-row gap-4 sm:items-center mb-2">
              <div className="flex-1">
                <Select value={selectedNodeId} onValueChange={handleNodeSelect}>
                  <SelectTrigger className="w-full bg-slate-800/50">
                    <SelectValue placeholder="Select a node" />
                  </SelectTrigger>
                  <SelectContent>
                    {nodes.map(node => (
                      <SelectItem key={node.id} value={node.id}>
                        {node.name} ({node.rewardTier.toUpperCase()} - {node.multiplier}x rewards)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {selectedNode && (
                <Button 
                  variant={selectedNode.status === 'running' ? "destructive" : "default"}
                  disabled={isStarting}
                  onClick={toggleNodeStatus}
                  className={selectedNode.status !== 'running' ? "bg-green-600 hover:bg-green-700" : ""}
                >
                  {isStarting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Starting...
                    </>
                  ) : (
                    <>
                      <Power className="w-4 h-4 mr-2" />
                      {selectedNode.status === 'running' ? 'Stop Node' : 'Start Node'}
                    </>
                  )}
                </Button>
              )}
            </div>
            
            {selectedNode && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                  <div className="flex flex-col p-3 bg-slate-800/30 rounded-lg">
                    <div className="flex items-center text-slate-400 mb-1">
                      <Cpu className="w-4 h-4 mr-2" /> CPU Usage
                    </div>
                    <div className="text-2xl font-bold">{cpuUsage.toFixed(1)}%</div>
                  </div>
                  
                  <div className="flex flex-col p-3 bg-slate-800/30 rounded-lg">
                    <div className="flex items-center text-slate-400 mb-1">
                      <HardDrive className="w-4 h-4 mr-2" /> Memory
                    </div>
                    <div className="text-2xl font-bold">{memoryUsage.toFixed(1)}%</div>
                  </div>
                  
                  <div className="flex flex-col p-3 bg-slate-800/30 rounded-lg">
                    <div className="flex items-center text-slate-400 mb-1">
                      <Activity className="w-4 h-4 mr-2" /> Network
                    </div>
                    <div className="text-2xl font-bold">{networkUsage.toFixed(1)} MB/s</div>
                  </div>
                </div>
                
                <div className="p-4 bg-slate-800/30 rounded-lg mt-4">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Reward Tier</span>
                    <span className="text-xs bg-purple-900/50 text-purple-300 py-1 px-2 rounded-full">
                      {selectedNode.rewardTier.toUpperCase()} ({selectedNode.multiplier}x)
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-300">
                    {selectedNode.rewardTier === 'webgpu' && "This device supports WebGPU acceleration, earning maximum NLOV token rewards."}
                    {selectedNode.rewardTier === 'wasm' && "This device uses WASM processing, earning high NLOV token rewards."}
                    {selectedNode.rewardTier === 'webgl' && "This device uses WebGL processing, earning medium NLOV token rewards."}
                    {selectedNode.rewardTier === 'cpu' && "This device uses CPU processing, earning basic NLOV token rewards."}
                  </p>
                </div>
              </>
            )}
          </>
        )}
      </div>
      
      {/* Permission Request Dialog */}
      <Dialog open={showPermissionDialog} onOpenChange={setShowPermissionDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Device Scan Permission</DialogTitle>
            <DialogDescription>
              Swarm Network needs to access your device hardware information to determine its capabilities and assign the appropriate reward tier.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <div className="flex flex-col space-y-4">
              <div className="flex items-center space-x-2">
                <Cpu className="w-5 h-5 text-blue-400" />
                <span>CPU information</span>
              </div>
              <div className="flex items-center space-x-2">
                <Laptop className="w-5 h-5 text-green-400" />
                <span>GPU capabilities</span>
              </div>
              <div className="flex items-center space-x-2">
                <HardDrive className="w-5 h-5 text-amber-400" />
                <span>Memory capacity</span>
              </div>
            </div>
          </div>
          
          <DialogFooter className="flex justify-between sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowPermissionDialog(false);
                toast.error("Permission denied. Device cannot be added.");
              }}
            >
              Deny
            </Button>
            <Button
              type="button"
              onClick={() => {
                setShowPermissionDialog(false);
                performScan();
              }}
            >
              Allow & Scan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Scanning Dialog */}
      <Dialog open={isScanning && !showPermissionDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Device Scanning in Progress</DialogTitle>
            <DialogDescription>
              {scanPhase}
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <Progress value={scanProgress} max={100} className="h-2" />
            <div className="flex justify-between mt-1 text-xs text-slate-500">
              <span>Scanning...</span>
              <span>{scanProgress}%</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
