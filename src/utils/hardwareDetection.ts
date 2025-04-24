
interface DeviceCapabilities {
  webgpu: boolean;
  webgl2: boolean;
  webgl: boolean;
  wasm: boolean;
  cpu: { cores: number };
  gpu: {
    vendor: string;
    renderer: string;
  } | null;
  userAgent: string;
  platform: string;
  memory: number | null;
}

export type RewardTier = 'webgpu' | 'wasm' | 'webgl' | 'cpu';

export interface DeviceInfo {
  name: string;
  rewardTier: RewardTier;
  capabilities: DeviceCapabilities;
  permissionGranted: boolean;
}

// Function to request device information permission
export const requestDevicePermission = async (): Promise<boolean> => {
  // We'll simulate permission request for device information
  try {
    // Request permission for sensors (this is a proxy for device permission)
    if ('DeviceOrientationEvent' in window && typeof DeviceOrientationEvent.requestPermission === 'function') {
      const permissionState = await DeviceOrientationEvent.requestPermission();
      return permissionState === 'granted';
    }
    
    // For browsers that don't support the above API, we'll use a dialog
    return new Promise(resolve => {
      setTimeout(() => resolve(true), 1500); // Simulate permission dialog
    });
  } catch (error) {
    console.error('Error requesting permission:', error);
    return false;
  }
};

export const detectHardware = async (permissionGranted: boolean): Promise<DeviceInfo> => {
  const capabilities: DeviceCapabilities = {
    webgpu: false,
    webgl2: false,
    webgl: false,
    wasm: typeof WebAssembly !== 'undefined',
    cpu: { cores: navigator.hardwareConcurrency || 1 },
    gpu: null,
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    memory: navigator.deviceMemory as number || null
  };
  
  if (!permissionGranted) {
    return {
      name: "Unknown Device (Permission Required)",
      rewardTier: 'cpu',
      capabilities,
      permissionGranted: false
    };
  }
  
  // Check WebGPU support
  capabilities.webgpu = 'gpu' in navigator;
  
  // Check WebGL support and get GPU info
  try {
    const canvas = document.createElement('canvas');
    const gl2 = canvas.getContext('webgl2');
    capabilities.webgl2 = !!gl2;
    
    const gl = gl2 || canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    capabilities.webgl = !!gl;
    
    if (gl) {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        capabilities.gpu = {
          vendor: gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || 'Unknown',
          renderer: gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || 'Unknown'
        };
      }
    }
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
  
  // Generate detailed device name
  let deviceName = '';
  
  if (capabilities.gpu && capabilities.gpu.renderer) {
    // Extract meaningful GPU name
    const gpuName = capabilities.gpu.renderer
      .replace(/ANGLE \(|\) /g, '')
      .replace(/Direct3D.+/g, '')
      .replace(/OpenGL.+/g, '')
      .replace(/Metal.+/g, '')
      .trim();
    
    deviceName = `${gpuName} (${capabilities.cpu.cores} cores)`;
  } else {
    // Fallback device naming
    const platform = capabilities.platform || 'Unknown Platform';
    deviceName = `${platform} Device (${capabilities.cpu.cores} cores)`;
  }
  
  const deviceType = capabilities.webgpu ? 'GPU Accelerated' : 
                   capabilities.wasm && capabilities.webgl2 ? 'WASM Compatible' :
                   capabilities.webgl ? 'WebGL Compatible' : 'CPU Only';
                   
  return {
    name: `${deviceType}: ${deviceName}`,
    rewardTier,
    capabilities,
    permissionGranted: true
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
