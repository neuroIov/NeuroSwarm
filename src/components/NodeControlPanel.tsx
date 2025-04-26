import React, { useState, useEffect } from 'react';
import { Power, Server, AlertTriangle, Plus, Edit, Trash2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InfoTooltip } from './InfoTooltip';
import { useWallet } from '@/contexts/WalletContext';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog"
import { toast } from 'sonner';
import { registerNode, fetchUserNodes } from '@/lib/supabase';

type NodeStatus = 'online' | 'idle' | 'offline';

type Node = {
  id?: string;
  name: string;
  type: 'desktop' | 'laptop' | 'tablet' | 'mobile';
  rewardTier: 'webgpu' | 'wasm' | 'webgl' | 'cpu';
  status: NodeStatus;
  cpuCores: number;
  memory: string;
  gpuInfo: string;
};

export const NodeControlPanel = () => {
  const { walletAddress, isConnected } = useWallet();
  const [nodes, setNodes] = useState<Node[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditingNode, setIsEditingNode] = useState(false);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [nodeForm, setNodeForm] = useState<Node>({
    name: '',
    type: 'desktop',
    rewardTier: 'webgpu',
    status: 'offline',
    cpuCores: 4,
    memory: '8GB',
    gpuInfo: 'NVIDIA GeForce RTX 3070',
  });
  
  useEffect(() => {
    if (isConnected && walletAddress) {
      loadUserNodes();
    } else {
      setNodes([]);
    }
  }, [isConnected, walletAddress]);
  
  const loadUserNodes = async () => {
    if (!walletAddress) return;
    
    try {
      const userNodes = await fetchUserNodes(walletAddress);
      
      // Map the database data to the Node type
      const formattedNodes = userNodes.map(node => ({
        id: node.id,
        name: node.device_name,
        type: node.device_type,
        rewardTier: node.reward_tier,
        status: node.status as NodeStatus,
        cpuCores: node.cpu_cores,
        memory: node.memory,
        gpuInfo: node.gpu_info,
      }));
      
      setNodes(formattedNodes);
    } catch (error) {
      console.error("Error fetching user nodes:", error);
      toast.error("Failed to load your nodes.");
    }
  };
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setNodeForm(prev => ({ ...prev, [name]: value }));
  };
  
  const handleNodeSubmit = async () => {
    if (!walletAddress) {
      toast.error("Please connect your wallet first.");
      return;
    }
    
    try {
      const newNode = {
        device_name: nodeForm.name,
        device_type: nodeForm.type,
        reward_tier: nodeForm.rewardTier,
        status: nodeForm.status,
        cpu_cores: nodeForm.cpuCores,
        memory: nodeForm.memory,
        gpu_info: nodeForm.gpuInfo,
        device_id: `swarm-node-${Date.now()}` // Generate a unique device ID
      };
      
      const result = await registerNode(walletAddress, newNode);
      
      if (result.success) {
        toast.success("Node registered successfully!");
        setIsDialogOpen(false);
        loadUserNodes(); // Refresh node list
      } else {
        toast.error(`Failed to register node: ${result.error}`);
      }
    } catch (error) {
      console.error("Error registering node:", error);
      toast.error("Failed to register node. Please try again.");
    }
  };
  
  const handleEditNode = (node: Node) => {
    setIsEditingNode(true);
    setSelectedNode(node);
    setNodeForm({
      name: node.name,
      type: node.type,
      rewardTier: node.rewardTier,
      status: node.status,
      cpuCores: node.cpuCores,
      memory: node.memory,
      gpuInfo: node.gpuInfo,
    });
    setIsDialogOpen(true);
  };
  
  const handleDeleteNode = (nodeId: string) => {
    // Implement delete node logic here
    toast.info(`Node with ID ${nodeId} will be deleted (not implemented yet)`);
  };
  
  const handlePowerAction = (nodeId: string, action: 'start' | 'stop') => {
    // Implement start/stop node logic here
    toast.info(`Node with ID ${nodeId} will be ${action}ed (not implemented yet)`);
  };
  
  return (
    <div className="stat-card">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold">Node Control Panel</h2>
          <InfoTooltip content="Manage your Swarm Network nodes and their status" />
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" className="bg-slate-700/50 border-slate-600">
              <Plus className="w-4 h-4 mr-2" />
              Register Node
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px] bg-slate-900 border border-slate-800">
            <DialogHeader>
              <DialogTitle>{isEditingNode ? 'Edit Node' : 'Register New Node'}</DialogTitle>
              <DialogDescription>
                {isEditingNode
                  ? 'Update the settings for your selected node.'
                  : 'Fill in the details below to register a new node to the Swarm Network.'}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="name" className="text-right">
                  Node Name
                </Label>
                <Input
                  type="text"
                  id="name"
                  name="name"
                  value={nodeForm.name}
                  onChange={handleInputChange}
                  className="col-span-3 bg-slate-700 border-slate-600"
                />
              </div>
              
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="type" className="text-right">
                  Device Type
                </Label>
                <Select value={nodeForm.type} onValueChange={(value) => handleInputChange({ target: { name: 'type', value } } as any)}>
                  <SelectTrigger className="col-span-3 bg-slate-700 border-slate-600">
                    <SelectValue placeholder="Select device type" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border border-slate-700">
                    <SelectItem value="desktop">Desktop</SelectItem>
                    <SelectItem value="laptop">Laptop</SelectItem>
                    <SelectItem value="tablet">Tablet</SelectItem>
                    <SelectItem value="mobile">Mobile</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="rewardTier" className="text-right">
                  Reward Tier
                </Label>
                <Select value={nodeForm.rewardTier} onValueChange={(value) => handleInputChange({ target: { name: 'rewardTier', value } } as any)}>
                  <SelectTrigger className="col-span-3 bg-slate-700 border-slate-600">
                    <SelectValue placeholder="Select reward tier" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border border-slate-700">
                    <SelectItem value="webgpu">WebGPU</SelectItem>
                    <SelectItem value="wasm">WASM</SelectItem>
                    <SelectItem value="webgl">WebGL</SelectItem>
                    <SelectItem value="cpu">CPU</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="cpuCores" className="text-right">
                  CPU Cores
                </Label>
                <Input
                  type="number"
                  id="cpuCores"
                  name="cpuCores"
                  value={nodeForm.cpuCores}
                  onChange={handleInputChange}
                  className="col-span-3 bg-slate-700 border-slate-600"
                />
              </div>
              
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="memory" className="text-right">
                  Memory
                </Label>
                <Input
                  type="text"
                  id="memory"
                  name="memory"
                  value={nodeForm.memory}
                  onChange={handleInputChange}
                  className="col-span-3 bg-slate-700 border-slate-600"
                />
              </div>
              
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="gpuInfo" className="text-right">
                  GPU Info
                </Label>
                <Input
                  type="text"
                  id="gpuInfo"
                  name="gpuInfo"
                  value={nodeForm.gpuInfo}
                  onChange={handleInputChange}
                  className="col-span-3 bg-slate-700 border-slate-600"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" onClick={handleNodeSubmit}>
                {isEditingNode ? 'Update Node' : 'Register Node'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      
      {nodes.length > 0 ? (
        <div className="space-y-3">
          {nodes.map(node => (
            <div key={node.id} className="task-card">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <Server className="w-5 h-5 mr-3 text-slate-400" />
                  <div>
                    <h3 className="font-medium">{node.name}</h3>
                    <p className="text-sm text-slate-400">
                      {node.type} - {node.rewardTier}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handlePowerAction(node.id || '', 'start')}
                  >
                    <Power className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleEditNode(node)}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeleteNode(node.id || '')}
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                  <span className="text-sm text-slate-400">Status:</span>
                  <div className="relative">
                    <Switch id={`node-status-${node.id}`} defaultChecked={node.status === 'online'} />
                    <Label
                      htmlFor={`node-status-${node.id}`}
                      className="absolute left-0 top-0 w-full h-full rounded-md peer-checked:bg-green-500 peer-checked:text-green-900 text-transparent"
                    >
                      {node.status}
                    </Label>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-6 text-center border border-dashed border-slate-700 rounded-lg">
          <AlertTriangle className="w-12 h-12 text-slate-500 mx-auto mb-2" />
          <h3 className="text-lg font-medium mb-1">No Nodes Registered</h3>
          <p className="text-slate-400">
            Register your first node to start contributing to the Swarm Network.
          </p>
        </div>
      )}
    </div>
  );
};
