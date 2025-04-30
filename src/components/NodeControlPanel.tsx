import React, { useState } from 'react';
import { 
  Cpu, 
  HardDrive, 
  Activity, 
  Clock, 
  PlusCircle,
  Power,
  Loader2,
  Scan,
  Laptop,
  Monitor,
  Tablet,
  Smartphone
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
  DialogFooter,
} from "@/components/ui/dialog";
import { 
  detectHardware, 
  getDeviceTypesForGroup, 
  getDeviceBrands,
  getDeviceModels,
  requiresCustomSpecs
} from '@/utils/hardwareDetection';
import { Input } from "@/components/ui/input";

type DeviceGroup = 'desktop_laptop' | 'mobile_tablet';

interface NodeInfo {
  id: string;
  name: string;
  type: 'desktop' | 'laptop' | 'tablet' | 'mobile';
  brand?: string;
  model?: string;
  customSpecs?: {
    cpu?: string;
    gpu?: string;
  };
  rewardTier: 'webgpu' | 'wasm' | 'webgl' | 'cpu';
  status: 'idle' | 'running' | 'offline';
  cpuCores?: number;
  memory?: number | string;
  gpuInfo?: string;
}

export const NodeControlPanel = () => {
  const [nodes, setNodes] = useState<NodeInfo[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string>('');
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
  
  // Device selection state
  const [showDeviceTypeDialog, setShowDeviceTypeDialog] = useState(false);
  const [detectedHardware, setDetectedHardware] = useState<any>(null);
  const [deviceGroup, setDeviceGroup] = useState<DeviceGroup>('desktop_laptop');
  const [selectedDeviceType, setSelectedDeviceType] = useState<'desktop' | 'laptop' | 'tablet' | 'mobile'>('desktop');
  const [selectedBrand, setSelectedBrand] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [customSpecs, setCustomSpecs] = useState<{ cpu?: string; gpu?: string }>({});
  
  const selectedNode = nodes.find(n => n.id === selectedNodeId);
  
  const handleNodeSelect = (value: string) => {
    setSelectedNodeId(value);
    setCpuUsage(0);
    setMemoryUsage(0);
    setNetworkUsage(0);
  };

  const getDeviceIcon = (type: 'desktop' | 'laptop' | 'tablet' | 'mobile') => {
    switch (type) {
      case 'desktop': return <Monitor className="w-6 h-6" />;
      case 'laptop': return <Laptop className="w-6 h-6" />;
      case 'tablet': return <Tablet className="w-6 h-6" />;
      case 'mobile': return <Smartphone className="w-6 h-6" />;
    }
  };
  
  const startScan = () => {
    setShowScanDialog(true);
    setIsScanning(true);
    setScanProgress(0);
    setScanStage('Detecting device type...');
    
    setTimeout(() => {
      setScanProgress(10);
      performHardwareScan();
    }, 1000);
  };
  
  const performHardwareScan = async () => {
    try {
      const updateProgress = (progress: number, stage: string) => {
        setScanProgress(progress);
        setScanStage(stage);
      };
      
      updateProgress(20, 'Analyzing system capabilities...');
      await new Promise(resolve => setTimeout(resolve, 800));
      
      updateProgress(40, 'Checking hardware specs...');
      await new Promise(resolve => setTimeout(resolve, 800));
      
      updateProgress(60, 'Determining device category...');
      const hardwareInfo = await detectHardware();
      setDetectedHardware(hardwareInfo);
      setDeviceGroup(hardwareInfo.deviceGroup);
      
      updateProgress(100, 'Initial scan complete!');
      setIsScanning(false);
      
      // Close scan dialog and open device selection
      setTimeout(() => {
        setShowScanDialog(false);
        setShowDeviceTypeDialog(true);
        // Reset selection state
        setSelectedDeviceType('desktop');
        setSelectedBrand('');
        setSelectedModel('');
        setCustomSpecs({});
      }, 1000);
      
    } catch (error) {
      console.error('Hardware scan error:', error);
      toast.error('Failed to scan hardware. Please try again.');
      setShowScanDialog(false);
      setIsScanning(false);
    }
  };
  
  const confirmDeviceType = () => {
    if (!detectedHardware || !selectedDeviceType || !selectedBrand || !selectedModel) return;
    
    const newNode: NodeInfo = {
      id: `node-${nodes.length + 1}`,
      name: `${selectedBrand} ${selectedModel}`,
      type: selectedDeviceType,
      brand: selectedBrand,
      model: selectedModel,
      customSpecs: requiresCustomSpecs(deviceGroup, selectedDeviceType) ? customSpecs : undefined,
      rewardTier: detectedHardware.rewardTier,
      status: 'idle',
      cpuCores: detectedHardware.cpuCores,
      memory: detectedHardware.deviceMemory,
      gpuInfo: detectedHardware.gpuInfo
    };
    
    setNodes([...nodes, newNode]);
    setSelectedNodeId(newNode.id);
    setShowDeviceTypeDialog(false);
    toast.success('Device added successfully!');
  };

  const toggleNodeStatus = () => {
    if (selectedNode && selectedNode.status === 'running') {
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
      
    } else if (selectedNode) {
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
            variant={selectedNode && selectedNode.status === 'running' ? "destructive" : "default"}
            disabled={isStarting}
            onClick={toggleNodeStatus}
            className={selectedNode && selectedNode.status !== 'running' ? "bg-green-600 hover:bg-green-700" : ""}
          >
            {isStarting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Starting...
              </>
            ) : (
              <>
                <Power className="w-4 h-4 mr-2" />
                {selectedNode && selectedNode.status === 'running' ? 'Stop Node' : 'Start Node'}
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
                {selectedNode && selectedNode.rewardTier.toUpperCase()}
              </div>
            </div>
            <div className="mt-1 text-slate-300 text-sm">
              {selectedNode && selectedNode.rewardTier === 'webgpu' && "This device supports WebGPU acceleration, earning maximum NLOV token rewards."}
              {selectedNode && selectedNode.rewardTier === 'wasm' && "This device uses WASM processing, earning high NLOV token rewards."}
              {selectedNode && selectedNode.rewardTier === 'webgl' && "This device uses WebGL processing, earning medium NLOV token rewards."}
              {selectedNode && selectedNode.rewardTier === 'cpu' && "This device uses CPU processing, earning basic NLOV token rewards."}
            </div>
            
            {selectedNode && selectedNode.cpuCores && (
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
      
      <Dialog open={showDeviceTypeDialog} onOpenChange={setShowDeviceTypeDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {deviceGroup === 'desktop_laptop' ? 'Desktop & Laptop Setup' : 'Mobile & Tablet Setup'}
            </DialogTitle>
            <DialogDescription>
              {deviceGroup === 'desktop_laptop' 
                ? "We detected a desktop or laptop device. Please specify your exact device type."
                : "We detected a mobile or tablet device. Please specify your exact device type."
              }
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <div className="space-y-4">
              <Select
                value={selectedDeviceType}
                onValueChange={(value: 'desktop' | 'laptop' | 'tablet' | 'mobile') => {
                  setSelectedDeviceType(value);
                  setSelectedBrand('');
                  setSelectedModel('');
                  setCustomSpecs({});
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select device type" />
                </SelectTrigger>
                <SelectContent>
                  {getDeviceTypesForGroup(deviceGroup).map((type) => (
                    <SelectItem key={type} value={type}>
                      <div className="flex items-center">
                        {getDeviceIcon(type as any)}
                        <span className="ml-2">
                          {type.charAt(0).toUpperCase() + type.slice(1)}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              {selectedDeviceType && (
                <Select
                  value={selectedBrand}
                  onValueChange={(value: string) => {
                    setSelectedBrand(value);
                    setSelectedModel('');
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select brand" />
                  </SelectTrigger>
                  <SelectContent>
                    {getDeviceBrands(deviceGroup, selectedDeviceType).map((brand) => (
                      <SelectItem key={brand} value={brand}>
                        {brand}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              
              {selectedBrand && (
                <Select
                  value={selectedModel}
                  onValueChange={setSelectedModel}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select model" />
                  </SelectTrigger>
                  <SelectContent>
                    {getDeviceModels(deviceGroup, selectedDeviceType, selectedBrand).map((model) => (
                      <SelectItem key={model} value={model}>
                        {model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              
              {requiresCustomSpecs(deviceGroup, selectedDeviceType) && selectedModel && (
                <div className="space-y-4">
                  <div>
                    <label htmlFor="cpu" className="block text-sm font-medium mb-1">
                      CPU Model
                    </label>
                    <Input
                      id="cpu"
                      placeholder="e.g. Intel Core i7-12700K"
                      value={customSpecs.cpu || ''}
                      onChange={(e) => setCustomSpecs(prev => ({ ...prev, cpu: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label htmlFor="gpu" className="block text-sm font-medium mb-1">
                      GPU Model
                    </label>
                    <Input
                      id="gpu"
                      placeholder="e.g. NVIDIA RTX 4070"
                      value={customSpecs.gpu || ''}
                      onChange={(e) => setCustomSpecs(prev => ({ ...prev, gpu: e.target.value }))}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
          
          <DialogFooter>
            <Button
              onClick={confirmDeviceType}
              disabled={!selectedDeviceType || !selectedBrand || !selectedModel || 
                (requiresCustomSpecs(deviceGroup, selectedDeviceType) && (!customSpecs.cpu || !customSpecs.gpu))}
            >
              Confirm Device
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
