/**
 * Hardware detection utility
 * Uses browser APIs to detect device capabilities
 */

type DeviceGroup = 'desktop_laptop' | 'mobile_tablet';

interface DeviceBrand {
  name: string;
  models: string[];
}

type DeviceCategory = {
  type: 'desktop' | 'laptop' | 'tablet' | 'mobile';
  brands: DeviceBrand[];
  requiresSpecs?: boolean;
};

const deviceCategories: Record<DeviceGroup, Record<string, DeviceCategory>> = {
  desktop_laptop: {
    desktop: {
      type: 'desktop',
      requiresSpecs: true,
      brands: [
        {
          name: 'HP',
          models: ['Pavilion', 'OMEN', 'EliteDesk', 'ProDesk', 'Other']
        },
        {
          name: 'Dell',
          models: ['XPS Desktop', 'Alienware', 'OptiPlex', 'Precision', 'Other']
        },
        {
          name: 'Lenovo',
          models: ['ThinkCentre', 'Legion Tower', 'IdeaCentre', 'Other']
        },
        {
          name: 'Apple',
          models: ['Mac Studio', 'Mac Pro', 'iMac', 'Mac Mini', 'Other']
        },
        {
          name: 'Custom Build',
          models: ['Gaming PC', 'Workstation', 'Home Desktop', 'Other']
        }
      ]
    },
    laptop: {
      type: 'laptop',
      brands: [
        {
          name: 'HP',
          models: ['Pavilion', 'OMEN', 'Envy', 'EliteBook', 'ProBook', 'Other']
        },
        {
          name: 'Dell',
          models: ['XPS', 'Alienware', 'Latitude', 'Precision', 'Inspiron', 'Other']
        },
        {
          name: 'Lenovo',
          models: ['ThinkPad', 'Legion', 'IdeaPad', 'Yoga', 'Other']
        },
        {
          name: 'Apple',
          models: ['MacBook Pro', 'MacBook Air', 'Other']
        },
        {
          name: 'Acer',
          models: ['Predator', 'Nitro', 'Swift', 'Aspire', 'Other']
        },
        {
          name: 'ASUS',
          models: ['ROG', 'TUF', 'ZenBook', 'VivoBook', 'Other']
        },
        {
          name: 'MSI',
          models: ['Titan', 'Raider', 'Stealth', 'Katana', 'Other']
        }
      ]
    }
  },
  mobile_tablet: {
    tablet: {
      type: 'tablet',
      brands: [
        {
          name: 'Apple',
          models: ['iPad Pro', 'iPad Air', 'iPad Mini', 'iPad', 'Other']
        },
        {
          name: 'Samsung',
          models: ['Galaxy Tab S', 'Galaxy Tab A', 'Other']
        },
        {
          name: 'Microsoft',
          models: ['Surface Pro', 'Surface Go', 'Other']
        },
        {
          name: 'Lenovo',
          models: ['Tab P', 'Tab M', 'Other']
        }
      ]
    },
    mobile: {
      type: 'mobile',
      brands: [
        {
          name: 'Apple',
          models: ['iPhone 15', 'iPhone 14', 'iPhone 13', 'iPhone 12', 'Other']
        },
        {
          name: 'Samsung',
          models: ['Galaxy S24', 'Galaxy S23', 'Galaxy A', 'Galaxy M', 'Other']
        },
        {
          name: 'Google',
          models: ['Pixel 8', 'Pixel 7', 'Pixel 6', 'Other']
        },
        {
          name: 'OnePlus',
          models: ['12', '11', 'Nord', 'Other']
        }
      ]
    }
  }
};

interface HardwareInfo {
  cpuCores: number;
  deviceMemory: number | string;
  gpuInfo: string;
  deviceGroup: DeviceGroup;
  deviceType?: 'desktop' | 'laptop' | 'tablet' | 'mobile';
  deviceBrand?: string;
  deviceModel?: string;
  customSpecs?: {
    cpu?: string;
    gpu?: string;
  };
  rewardTier: 'webgpu' | 'wasm' | 'webgl' | 'cpu';
}

// Check if the device supports WebGPU
const hasWebGPU = async (): Promise<boolean> => {
  if ('gpu' in navigator) {
    try {
      const adapter = await (navigator as any).gpu.requestAdapter();
      return !!adapter;
    } catch (e) {
      console.error('WebGPU check failed:', e);
      return false;
    }
  }
  return false;
};

// Detect WebGL support and capabilities
const detectWebGLCapabilities = (): { supported: boolean, version: number } => {
  try {
    const canvas = document.createElement('canvas');
    // Try WebGL 2 first
    let gl = canvas.getContext('webgl2') as WebGLRenderingContext;
    if (gl) {
      return { supported: true, version: 2 };
    }
    
    // Fall back to WebGL 1
    gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl') as WebGLRenderingContext;
    return { supported: !!gl, version: gl ? 1 : 0 };
  } catch (e) {
    console.error('WebGL detection error:', e);
    return { supported: false, version: 0 };
  }
};

// Get available device types for a device group
export const getDeviceTypesForGroup = (group: DeviceGroup): string[] => {
  return Object.keys(deviceCategories[group]);
};

// Get available brands for a device type
export const getDeviceBrands = (group: DeviceGroup, type: 'desktop' | 'laptop' | 'tablet' | 'mobile'): string[] => {
  return deviceCategories[group][type]?.brands.map(b => b.name) || [];
};

// Get available models for a device brand
export const getDeviceModels = (
  group: DeviceGroup,
  type: 'desktop' | 'laptop' | 'tablet' | 'mobile',
  brand: string
): string[] => {
  const category = deviceCategories[group][type];
  const brandInfo = category?.brands.find(b => b.name === brand);
  return brandInfo?.models || [];
};

// Check if device type requires custom specs
export const requiresCustomSpecs = (
  group: DeviceGroup,
  type: 'desktop' | 'laptop' | 'tablet' | 'mobile'
): boolean => {
  return deviceCategories[group][type]?.requiresSpecs || false;
};

// Get available device series for a device type
export const getDeviceSeries = (group: DeviceGroup, type: 'desktop' | 'laptop' | 'tablet' | 'mobile'): string[] => {
  return [];
};

// Basic device group detection based on screen and OS
const detectDeviceGroup = (): DeviceGroup => {
  const ua = navigator.userAgent.toLowerCase();
  const width = window.innerWidth;
  
  // Check for mobile/tablet indicators
  if (width <= 1024 || 
      /mobile|android|iphone|ipad|ipod|windows phone/i.test(ua)) {
    return 'mobile_tablet';
  }
  
  // Otherwise assume desktop/laptop
  return 'desktop_laptop';
};

// Get approximate memory
const getDeviceMemory = (): number | string => {
  if ('deviceMemory' in navigator) {
    return (navigator as any).deviceMemory || 'Unknown';
  }
  return 'Unknown';
};

// Get CPU cores
const getCPUCores = (): number => {
  return navigator.hardwareConcurrency || 1;
};

// Detect GPU information
const getGPUInfo = async (): Promise<string> => {
  // Try WebGL renderer info
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl') as WebGLRenderingContext;
    
    if (gl) {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
        const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
        return `${vendor} ${renderer}`;
      }
    }
  } catch (e) {
    console.error('Error getting GPU info:', e);
  }
  
  // Fallback - make an educated guess based on device type
  const deviceGroup = detectDeviceGroup();
  if (deviceGroup === 'desktop_laptop') return 'Desktop/Laptop GPU';
  return 'Mobile/Tablet GPU';
};

// Determines reward tier based on device capabilities
const determineRewardTier = async (
  webgpuSupport: boolean,
  webglCapabilities: { supported: boolean, version: number },
): Promise<'webgpu' | 'wasm' | 'webgl' | 'cpu'> => {
  // WebGPU is the highest tier
  if (webgpuSupport) return 'webgpu';
  
  // Next, check for high-performance system that can do WASM well
  const deviceMemory = getDeviceMemory();
  const isHighPerformance = 
    getCPUCores() >= 4 && 
    (typeof deviceMemory === 'number' && deviceMemory >= 4);
  
  if (isHighPerformance) {
    return 'wasm';
  }
  
  // Check WebGL support
  if (webglCapabilities.supported) {
    return 'webgl';
  }
  
  // Fallback to CPU
  return 'cpu';
};

// Main function to detect hardware capabilities
export const detectHardware = async (): Promise<HardwareInfo> => {
  console.log('Starting real hardware detection...');
  
  try {
    console.log('Detecting device hardware...');
    
    // Run all detection in parallel
    const [webgpuSupport, webglCapabilities, gpuInfo] = await Promise.all([
      hasWebGPU(),
      detectWebGLCapabilities(),
      getGPUInfo(),
    ]);
    
    // First just detect the device group
    const deviceGroup = detectDeviceGroup();
    
    const rewardTier = await determineRewardTier(webgpuSupport, webglCapabilities);
    
    const hardwareInfo: HardwareInfo = {
      cpuCores: getCPUCores(),
      deviceMemory: getDeviceMemory(),
      gpuInfo,
      deviceGroup,
      rewardTier,
    };
    
    console.log('Hardware detection complete:', hardwareInfo);
    return hardwareInfo;
  } catch (e) {
    console.error('Hardware detection error:', e);
    const deviceGroup = detectDeviceGroup();
    const fallbackInfo: HardwareInfo = {
      cpuCores: 1,
      deviceMemory: 'Unknown',
      gpuInfo: 'Basic GPU',
      deviceGroup,
      rewardTier: 'cpu'
    };
    return fallbackInfo;
  }
};
