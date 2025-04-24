
import React, { useState } from 'react';
import { 
  Cpu, 
  HardDrive, 
  Activity, 
  Clock, 
  PlusCircle,
  Power,
  Loader2,
  ScanLine
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
import { detectHardware, RewardTier, getRewardMultiplier } from '@/utils/hardwareDetection';

// Node type definition
interface NodeInfo {
  id: string;
  name: string;
  rewardTier: RewardTier;
  status: 'idle' | 'running' | 'offline';
  multiplier: number;
}

export const NodeControlPanel = () => {
  const [nodes, setNodes] = useState<NodeInfo[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string>("");
  const [isScanning, setIsScanning] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  
  // Stats state
  const [cpuUsage, setCpuUsage] = useState(0);
  const [memoryUsage, setMemoryUsage] = useState(0);
  const [networkUsage, setNetworkUsage] = useState(0);
  
  const selectedNode = nodes.find(n => n.id === selectedNodeId);
  
  const scanForNewDevice = async () => {
    setIsScanning(true);
    try {
      const deviceInfo = await detectHardware();
      const newNode: NodeInfo = {
        id: `node-${Date.now()}`,
        name: deviceInfo.name,
        rewardTier: deviceInfo.rewardTier,
        status: 'idle',
        multiplier: getRewardMultiplier(deviceInfo.rewardTier)
      };
      
      setNodes(prev => [...prev, newNode]);
      setSelectedNodeId(newNode.id);
      
      toast.success(
        `New device detected: ${newNode.name}\n` +
        `Reward Tier: ${newNode.rewardTier.toUpperCase()} (${newNode.multiplier}x rewards)`
      );
      
    } catch (error) {
      toast.error('Failed to scan device');
      console.error('Scan error:', error);
    } finally {
      setIsScanning(false);
    }
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
    </div>
  );
};
