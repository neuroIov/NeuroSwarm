
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

export interface GlobalTask {
  id: string;
  type: 'gpt-4';
  subtype: 'text';
  prompt: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  timestamp: Date;
}

export interface Task {
  id: string;
  type: 'gpt-4' | 'compute' | 'storage';
  subtype: 'text' | 'image' | 'video' | 'data';
  prompt: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  timeRemaining?: number;
  timestamp: Date;
}
