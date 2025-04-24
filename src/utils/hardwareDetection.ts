
interface DeviceCapabilities {
  webgpu: boolean;
  webgl2: boolean;
  webgl: boolean;
  wasm: boolean;
  cpu: { cores: number };
}

export type RewardTier = 'webgpu' | 'wasm' | 'webgl' | 'cpu';

interface DeviceInfo {
  name: string;
  rewardTier: RewardTier;
  capabilities: DeviceCapabilities;
}

export const detectHardware = async (): Promise<DeviceInfo> => {
  const capabilities: DeviceCapabilities = {
    webgpu: false,
    webgl2: false,
    webgl: false,
    wasm: typeof WebAssembly !== 'undefined',
    cpu: { cores: navigator.hardwareConcurrency || 1 }
  };
  
  // Check WebGPU support
  capabilities.webgpu = 'gpu' in navigator;
  
  // Check WebGL support
  try {
    const canvas = document.createElement('canvas');
    capabilities.webgl2 = !!canvas.getContext('webgl2');
    capabilities.webgl = !!canvas.getContext('webgl') || !!canvas.getContext('experimental-webgl');
  } catch (e) {
    console.error('Error detecting WebGL support:', e);
  }
  
  // Determine reward tier based on capabilities
  let rewardTier: RewardTier;
  if (capabilities.webgpu) {
    rewardTier = 'webgpu';
  } else if (capabilities.wasm && capabilities.webgl2) {
    rewardTier = 'wasm';
  } else if (capabilities.webgl) {
    rewardTier = 'webgl';
  } else {
    rewardTier = 'cpu';
  }
  
  // Generate device name
  const deviceType = capabilities.webgpu ? 'GPU Workstation' : 
                    capabilities.wasm ? 'WASM Compatible Device' :
                    capabilities.webgl ? 'WebGL Device' : 'CPU Device';
                    
  return {
    name: `${deviceType} (${capabilities.cpu.cores} cores)`,
    rewardTier,
    capabilities
  };
};

export const getRewardMultiplier = (tier: RewardTier): number => {
  switch (tier) {
    case 'webgpu': return 4.0;  // Maximum rewards
    case 'wasm': return 2.0;    // High rewards
    case 'webgl': return 1.5;   // Medium rewards
    case 'cpu': return 1.0;     // Base rewards
    default: return 1.0;
  }
};
