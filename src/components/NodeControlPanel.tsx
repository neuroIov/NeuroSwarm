
import React, { useState } from 'react';
import { 
  Cpu, 
  HardDrive, 
  Activity, 
  Clock, 
  PlusCircle,
  Power,
  Loader2
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

// Node type definition
interface NodeInfo {
  id: string;
  name: string;
  type: 'desktop-gpu' | 'laptop-gpu' | 'laptop-integrated' | 'mobile';
  rewardTier: 'webgpu' | 'wasm' | 'webgl' | 'cpu';
  status: 'idle' | 'running' | 'offline';
}

export const NodeControlPanel = () => {
  const [nodes, setNodes] = useState<NodeInfo[]>([
    {
      id: 'node-1',
      name: 'Desktop Workstation',
      type: 'desktop-gpu',
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

  const selectedNode = nodes.find(n => n.id === selectedNodeId) || nodes[0];
  
  const handleNodeSelect = (value: string) => {
    setSelectedNodeId(value);
    // Reset usage stats when switching nodes
    setCpuUsage(0);
    setMemoryUsage(0);
    setNetworkUsage(0);
  };
  
  const addNewNode = () => {
    setIsScanning(true);
    
    // Simulate hardware scanning
    setTimeout(() => {
      const nodeTypes = ['desktop-gpu', 'laptop-gpu', 'laptop-integrated', 'mobile'];
      const rewardTiers = ['webgpu', 'wasm', 'webgl', 'cpu'];
      
      const randomType = nodeTypes[Math.floor(Math.random() * nodeTypes.length)] as NodeInfo['type'];
      
      // Assign reward tier based on device type
      let rewardTier: NodeInfo['rewardTier'];
      switch (randomType) {
        case 'desktop-gpu':
          rewardTier = 'webgpu';
          break;
        case 'laptop-gpu':
          rewardTier = 'wasm';
          break;
        case 'laptop-integrated':
          rewardTier = 'webgl';
          break;
        case 'mobile':
          rewardTier = 'cpu';
          break;
        default:
          rewardTier = 'cpu';
      }
      
      const newNode: NodeInfo = {
        id: `node-${nodes.length + 1}`,
        name: `${randomType.charAt(0).toUpperCase() + randomType.slice(1).replace('-', ' ')} ${nodes.length + 1}`,
        type: randomType,
        rewardTier: rewardTier,
        status: 'idle'
      };
      
      const updatedNodes = [...nodes, newNode];
      setNodes(updatedNodes);
      setSelectedNodeId(newNode.id);
      setIsScanning(false);
      
      toast.success(`New node detected: ${newNode.name} (${rewardTier.toUpperCase()} rewards tier)`);
    }, 2500);
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
              onClick={addNewNode}
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
                  <PlusCircle className="w-4 h-4 mr-1" />
                  Add Node
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
          </div>
        </div>
      </div>
    </div>
  );
};
