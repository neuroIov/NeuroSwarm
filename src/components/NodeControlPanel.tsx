
import React, { useState } from 'react';
import { 
  Cpu, 
  HardDrive, 
  Activity, 
  Clock, 
  PlusCircle,
  Power,
  Loader2,
  Scan
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InfoTooltip } from './InfoTooltip';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { detectHardware } from '@/utils/hardwareDetection';

// Node type definition
interface NodeInfo {
  id: string;
  name: string;
  type: 'desktop' | 'laptop' | 'tablet' | 'mobile';
  rewardTier: 'webgpu' | 'wasm' | 'webgl' | 'cpu';
  status: 'idle' | 'running' | 'offline';
  cpuCores?: number;
  memory?: number | string;
  gpuInfo?: string;
}

export const NodeControlPanel = () => {
  const [nodes, setNodes] = useState<NodeInfo[]>([
    {
      id: 'node-1',
      name: 'Desktop Workstation',
      type: 'desktop',
      rewardTier: 'webgpu',
      status: 'idle'
    }
  ]);
  
  const [selectedNodeId, setSelectedNodeId] = useState<string>(nodes[0].id);
  const [cpuUsage, setCpuUsage] = useState(0);
  const [memoryUsage, setMemoryUsage] = useState(0);
  const [networkUsage, setNetworkUsage] = useState(0);
  const [tasksCompleted, setTasksCompleted] = useState(0);
  const [successRate, setSuccessRate] = useState(100);
  const [isStarting, setIsStarting] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [showScanDialog, setShowScanDialog] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanStage, setScanStage] = useState('');

  const selectedNode = nodes.find(n => n.id === selectedNodeId) || nodes[0];
  
  const handleNodeSelect = (value: string) => {
    setSelectedNodeId(value);
    // Reset usage stats when switching nodes
    setCpuUsage(0);
    setMemoryUsage(0);
    setNetworkUsage(0);
  };
  
  const startScan = () => {
    setShowScanDialog(true);
    setIsScanning(true);
    setScanProgress(0);
    setScanStage('Requesting device permission...');
    
    // Simulate permission request phase
    setTimeout(() => {
      setScanProgress(10);
      setScanStage('Analyzing CPU capabilities...');
      
      // Begin actual hardware scan
      performHardwareScan();
    }, 1000);
  };
  
  const performHardwareScan = async () => {
    try {
      // Update progress as we go
      const updateProgress = (progress: number, stage: string) => {
        setScanProgress(progress);
        setScanStage(stage);
      };
      
      // CPU detection
      updateProgress(20, 'Analyzing CPU capabilities...');
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // Memory detection  
      updateProgress(40, 'Checking available memory...');
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // GPU detection
      updateProgress(60, 'Detecting GPU capabilities...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // WebGPU support
      updateProgress(80, 'Testing WebGPU support...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Finalize scan
      updateProgress(90, 'Determining reward tier...');
      
      // Perform the actual hardware detection
      const hardwareInfo = await detectHardware();
      
      updateProgress(100, 'Scan complete!');
      
      // Create the new node
      const newNode: NodeInfo = {
        id: `node-${nodes.length + 1}`,
        name: `${hardwareInfo.deviceType.charAt(0).toUpperCase() + hardwareInfo.deviceType.slice(1)} Device ${nodes.length + 1}`,
        type: hardwareInfo.deviceType,
        rewardTier: hardwareInfo.rewardTier,
        status: 'idle',
        cpuCores: hardwareInfo.cpuCores,
        memory: hardwareInfo.deviceMemory,
        gpuInfo: hardwareInfo.gpuInfo
      };
      
      // Wait a moment to show 100% complete before closing
      setTimeout(() => {
        const updatedNodes = [...nodes, newNode];
        setNodes(updatedNodes);
        setSelectedNodeId(newNode.id);
        setIsScanning(false);
        setShowScanDialog(false);
        
        // Show appropriate message based on reward tier
        const rewardMessages = {
          'webgpu': 'Maximum rewards tier! This device supports advanced WebGPU acceleration.',
          'wasm': 'High rewards tier! This device has good processing capabilities.',
          'webgl': 'Medium rewards tier! This device supports WebGL acceleration.',
          'cpu': 'Basic rewards tier! This device will use CPU processing.'
        };
        
        toast.success(
          `New node added: ${newNode.name} (${newNode.rewardTier.toUpperCase()} rewards tier)`, 
          { description: rewardMessages[newNode.rewardTier] }
        );
      }, 1000);
      
    } catch (error) {
      console.error('Hardware scan error:', error);
      toast.error('Hardware scan failed', { 
        description: 'Unable to complete hardware detection. Please try again or check browser permissions.'
      });
      setIsScanning(false);
      setShowScanDialog(false);
    }
  };
  
  const toggleNodeStatus = () => {
    if (selectedNode.status === 'running') {
      // Stop the node
      setNodes(nodes.map(node => 
        node.id === selectedNodeId 
          ? { ...node, status: 'idle' } 
          : node
      ));
      
      // Reset statistics
      setCpuUsage(0);
      setMemoryUsage(0);
      setNetworkUsage(0);
      
      toast.info(`Node "${selectedNode.name}" stopped`);
      
    } else {
      // Start the node
      setIsStarting(true);
      
      // Simulate starting delay
      setTimeout(() => {
        setNodes(nodes.map(node => 
          node.id === selectedNodeId 
            ? { ...node, status: 'running' } 
            : node
        ));
        
        // Simulate some initial usage
        setCpuUsage(Math.random() * 30 + 10);
        setMemoryUsage(Math.random() * 20 + 5);
        setNetworkUsage(Math.random() * 5 + 0.5);
        
        setIsStarting(false);
        toast.success(`Node "${selectedNode.name}" started and ready for tasks`);
      }, 2000);
    }
  };
  
  const getRewardTierLabel = (tier: NodeInfo['rewardTier']) => {
    switch (tier) {
      case 'webgpu': return 'WebGPU (Maximum Rewards)';
      case 'wasm': return 'WASM (High Rewards)';
      case 'webgl': return 'WebGL (Medium Rewards)';
      case 'cpu': return 'CPU (Basic Rewards)';
      default: return tier.toUpperCase();
    }
  };
  
  return (
    <div className="stat-card">
      <div className="flex flex-col space-y-4">
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold">Node Control Panel</h2>
            <InfoTooltip content="Manage your computing nodes, start or stop them, and view performance metrics" />
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={startScan}
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
                  <Scan className="w-4 h-4 mr-1" />
                  Scan Device
                </>
              )}
            </Button>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-4 sm:items-center mb-2">
          <div className="flex-1">
            <Select value={selectedNodeId} onValueChange={handleNodeSelect}>
              <SelectTrigger className="w-full bg-slate-800/50">
                <SelectValue placeholder="Select a node" />
              </SelectTrigger>
              <SelectContent>
                {nodes.map(node => (
                  <SelectItem key={node.id} value={node.id}>
                    {node.name} ({getRewardTierLabel(node.rewardTier)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
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
        </div>
        
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
          
          <div className="flex flex-col p-3 bg-slate-800/30 rounded-lg">
            <div className="flex items-center text-slate-400 mb-1">
              <Clock className="w-4 h-4 mr-2" /> Tasks Completed
            </div>
            <div className="text-2xl font-bold">{tasksCompleted}</div>
          </div>
          
          <div className="flex flex-col p-3 bg-slate-800/30 rounded-lg col-span-1 sm:col-span-2 lg:col-span-1">
            <div className="flex items-center text-slate-400 mb-1">
              <Clock className="w-4 h-4 mr-2" /> Success Rate
            </div>
            <div className="text-2xl font-bold">{successRate.toFixed(1)}%</div>
          </div>
          
          <div className="col-span-1 sm:col-span-2 lg:col-span-3 p-3 bg-slate-800/30 rounded-lg">
            <div className="flex items-center text-slate-400 mb-1">
              <div className="flex-1">Reward Tier</div>
              <div className="flex items-center text-xs bg-purple-900/50 text-purple-300 py-1 px-2 rounded-full">
                {selectedNode.rewardTier.toUpperCase()}
              </div>
            </div>
            <div className="mt-1 text-slate-300 text-sm">
              {selectedNode.rewardTier === 'webgpu' && "This device supports WebGPU acceleration, earning maximum NLOV token rewards."}
              {selectedNode.rewardTier === 'wasm' && "This device uses WASM processing, earning high NLOV token rewards."}
              {selectedNode.rewardTier === 'webgl' && "This device uses WebGL processing, earning medium NLOV token rewards."}
              {selectedNode.rewardTier === 'cpu' && "This device uses CPU processing, earning basic NLOV token rewards."}
            </div>
            
            {selectedNode.cpuCores && (
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <div className="text-slate-400">CPU Cores: <span className="text-white">{selectedNode.cpuCores}</span></div>
                <div className="text-slate-400">Memory: <span className="text-white">{selectedNode.memory}</span> GB</div>
                {selectedNode.gpuInfo && (
                  <div className="col-span-2 text-slate-400">GPU: <span className="text-white">{selectedNode.gpuInfo}</span></div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      
      <Dialog open={showScanDialog} onOpenChange={setShowScanDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Scanning Device Hardware</DialogTitle>
            <DialogDescription>
              Analyzing your device capabilities to determine the optimal reward tier
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <div className="mb-2 text-sm font-medium">{scanStage}</div>
            <div className="w-full bg-slate-800 rounded-full h-2.5">
              <div 
                className="bg-gradient-to-r from-purple-500 to-blue-500 h-2.5 rounded-full transition-all duration-300 ease-in-out" 
                style={{ width: `${scanProgress}%` }}
              ></div>
            </div>
            <div className="mt-4 text-sm text-slate-400">
              {scanProgress < 100 ? 
                "Please wait while we analyze your device. Do not close this window." : 
                "Scan completed successfully!"
              }
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
