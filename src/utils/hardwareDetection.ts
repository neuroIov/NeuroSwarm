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
  console.log('Starting hardware tier detection...');

  try {
    // Get WebGL info first to identify the actual GPU
    const gl = document.createElement('canvas').getContext('webgl2');
    const debugInfo = gl?.getExtension('WEBGL_debug_renderer_info');
    const gpuRenderer = debugInfo ? gl?.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'Unknown';
    const gpuVendor = debugInfo ? gl?.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : 'Unknown';

    console.log('Detected GPU:', { renderer: gpuRenderer, vendor: gpuVendor });

    // Check if this is a mobile device
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMobile) {
      console.log('Mobile device detected - CPU tier');
      // Determine if it's a tablet or mobile phone
      const isTablet = /iPad|Android(?!.*Mobile)/i.test(navigator.userAgent);
      return {
        rewardTier: 'cpu',
        deviceGroup: 'mobile_tablet',
        deviceType: isTablet ? 'tablet' : 'mobile',  // Explicitly set device type for icon display
        cpuCores: getCPUCores(),
        deviceMemory: getDeviceMemory(),
        gpuInfo: gpuRenderer || 'Mobile GPU'
      };
    }

    // Check for integrated GPUs
    const isIntegrated = 
      (gpuRenderer?.toLowerCase().includes('intel') && !gpuRenderer?.toLowerCase().includes('arc')) ||
      gpuRenderer?.toLowerCase().includes('hd graphics') ||
      gpuRenderer?.toLowerCase().includes('uhd graphics') ||
      gpuRenderer?.toLowerCase().includes('iris') ||
      gpuVendor?.toLowerCase().includes('intel');
      
    // Determine if device is likely a laptop vs desktop (heuristic-based)
    const isLaptop = 
      /MacBook|Laptop|Notebook|ThinkPad|ZenBook|XPS|Spectre|EliteBook|Inspiron/i.test(navigator.userAgent) ||
      // Check if any battery API is available (will likely be a laptop)
      ('getBattery' in navigator || 'battery' in navigator || typeof (navigator as any).getBattery === 'function');

    // For integrated GPUs, go straight to CPU tier
    if (isIntegrated) {
      console.log('Integrated GPU detected - CPU tier');
      return {
        rewardTier: 'cpu',
        deviceGroup: 'desktop_laptop',
        deviceType: isLaptop ? 'laptop' : 'desktop', // Set device type for icon display
        cpuCores: getCPUCores(),
        deviceMemory: getDeviceMemory(),
        gpuInfo: gpuRenderer || 'Integrated GPU'
      };
    }

    // For dedicated GPUs, check if it's a high-end one
    const isHighEndGPU = 
      gpuRenderer?.toLowerCase().includes('rtx') ||
      gpuRenderer?.toLowerCase().includes('rx 6') ||
      gpuRenderer?.toLowerCase().includes('quadro') ||
      gpuRenderer?.toLowerCase().includes('radeon pro');

    // Check for mid-range GPUs (WASM tier)
    const isMidRangeGPU =
      gpuRenderer?.toLowerCase().includes('gtx') ||
      gpuRenderer?.toLowerCase().includes('rx 5') ||
      gpuRenderer?.toLowerCase().includes('rx 4') ||
      gpuRenderer?.toLowerCase().includes('vega');

    if (isHighEndGPU) {
      console.log('High-end GPU detected - WebGPU tier');
      return {
        rewardTier: 'webgpu',
        deviceGroup: 'desktop_laptop',
        deviceType: isLaptop ? 'laptop' : 'desktop', // Set device type for icon display
        cpuCores: getCPUCores(),
        deviceMemory: getDeviceMemory(),
        gpuInfo: gpuRenderer || 'High-end GPU'
      };
    }

    // WASM tier for mid-range GPUs
    if (isMidRangeGPU) {
      console.log('Mid-range GPU detected - WASM tier');
      return {
        rewardTier: 'wasm',
        deviceGroup: 'desktop_laptop',
        deviceType: isLaptop ? 'laptop' : 'desktop', // Set device type for icon display
        cpuCores: getCPUCores(),
        deviceMemory: getDeviceMemory(),
        gpuInfo: gpuRenderer || 'Mid-range GPU'
      };
    }

    // For other dedicated GPUs, use WebGL tier
    console.log('Standard dedicated GPU detected - WebGL tier');
    return {
      rewardTier: 'webgl',
      deviceGroup: 'desktop_laptop',
      deviceType: isLaptop ? 'laptop' : 'desktop', // Set device type for icon display
      cpuCores: getCPUCores(),
      deviceMemory: getDeviceMemory(),
      gpuInfo: gpuRenderer || 'Standard GPU'
    };

  } catch (e) {
    console.error('Hardware detection error:', e);
    return {
      rewardTier: 'cpu',
      deviceGroup: 'desktop_laptop',
      deviceType: 'desktop', // Default to desktop for fallback case
      cpuCores: 1,
      deviceMemory: 'Unknown',
      gpuInfo: 'Basic GPU'
    };
  }
};
