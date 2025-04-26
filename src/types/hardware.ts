
/**
 * Hardware detection related types
 */

export type DeviceType = 'desktop' | 'laptop' | 'tablet' | 'mobile';
export type RewardTier = 'webgpu' | 'wasm' | 'webgl' | 'cpu';
export type NodeStatus = 'idle' | 'running' | 'offline';

export interface HardwareInfo {
  cpuCores: number;
  deviceMemory: number | string;
  gpuInfo: string;
  deviceType: DeviceType;
  rewardTier: RewardTier;
}

export interface NodeInfo {
  id: string;
  name: string;
  type: DeviceType;
  rewardTier: RewardTier;
  status: NodeStatus;
  cpuCores?: number;
  memory?: number | string;
  gpuInfo?: string;
}
