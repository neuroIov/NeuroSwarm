
/**
 * Hardware detection utility
 * Uses browser APIs to detect device capabilities
 */

type HardwareInfo = {
  cpuCores: number;
  deviceMemory: number | string;
  gpuInfo: string;
  deviceType: 'desktop' | 'laptop' | 'tablet' | 'mobile';
  rewardTier: 'webgpu' | 'wasm' | 'webgl' | 'cpu';
};

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

// Check if device orientation is available (for mobile detection)
const checkDeviceOrientation = async (): Promise<boolean> => {
  return new Promise((resolve) => {
    const handleOrientation = (event: DeviceOrientationEvent) => {
      window.removeEventListener('deviceorientation', handleOrientation);
      resolve(event && (event.alpha !== null || event.beta !== null || event.gamma !== null));
    };
    
    window.addEventListener('deviceorientation', handleOrientation, { once: true });
    
    // Timeout after 1 second if no orientation events
    setTimeout(() => {
      window.removeEventListener('deviceorientation', handleOrientation);
      resolve(false);
    }, 1000);
  });
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

// Determine device type based on screen size and user agent
const detectDeviceType = (): 'desktop' | 'laptop' | 'tablet' | 'mobile' => {
  const ua = navigator.userAgent;
  const width = window.innerWidth;
  
  // Check for mobile devices
  if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
    if (width > 768) {
      return 'tablet';
    }
    return 'mobile';
  }
  
  // Check for laptop vs desktop (rough estimation)
  if (/Macintosh|MacIntel|MacPPC|Mac68K|Windows NT/i.test(ua)) {
    // Laptops typically have smaller screens
    if (window.screen.width <= 1440) {
      return 'laptop';
    }
  }
  
  return 'desktop';
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
  const deviceType = detectDeviceType();
  if (deviceType === 'desktop') return 'Desktop GPU';
  if (deviceType === 'laptop') return 'Laptop GPU';
  if (deviceType === 'tablet') return 'Tablet GPU';
  return 'Mobile GPU';
};

// Determines reward tier based on device capabilities
const determineRewardTier = async (
  webgpuSupport: boolean,
  webglCapabilities: { supported: boolean, version: number },
  deviceType: 'desktop' | 'laptop' | 'tablet' | 'mobile',
): Promise<'webgpu' | 'wasm' | 'webgl' | 'cpu'> => {
  // WebGPU is the highest tier
  if (webgpuSupport) return 'webgpu';
  
  // Next, check for high-performance system that can do WASM well
  const cpuCores = getCPUCores();
  const deviceMemory = getDeviceMemory();
  
  // Check if we have at least 4 cores and enough memory
  const isHighPerformance = 
    cpuCores >= 4 && 
    (typeof deviceMemory === 'number' && deviceMemory >= 4);
  
  if (isHighPerformance && (deviceType === 'desktop' || deviceType === 'laptop')) {
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
  
  // Request permission to access hardware info
  const permissionRequest = async (): Promise<boolean> => {
    try {
      // Try to request microphone access as a way to trigger permission dialog
      const permissionStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      return permissionStatus.state === 'granted';
    } catch (e) {
      console.log('Permission API not supported, proceeding without explicit permission');
      return true;
    }
  };
  
  // Wait for permission
  const hasPermission = await permissionRequest();
  if (!hasPermission) {
    console.log('Hardware detection permission denied');
    throw new Error('Permission to access device information was denied');
  }
  
  console.log('Detecting device hardware...');
  
  // Run all detection in parallel
  const [webgpuSupport, webglCapabilities, gpuInfo] = await Promise.all([
    hasWebGPU(),
    detectWebGLCapabilities(),
    getGPUInfo(),
  ]);
  
  const deviceType = detectDeviceType();
  const isMobile = await checkDeviceOrientation();
  
  // Override device type if orientation sensor is detected
  const finalDeviceType = isMobile && deviceType === 'desktop' ? 'mobile' : deviceType;
  
  const rewardTier = await determineRewardTier(webgpuSupport, webglCapabilities, finalDeviceType);
  
  const hardwareInfo: HardwareInfo = {
    cpuCores: getCPUCores(),
    deviceMemory: getDeviceMemory(),
    gpuInfo,
    deviceType: finalDeviceType,
    rewardTier,
  };
  
  console.log('Hardware detection complete:', hardwareInfo);
  return hardwareInfo;
};
