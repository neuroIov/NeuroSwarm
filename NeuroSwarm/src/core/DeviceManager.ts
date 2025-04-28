import { create } from 'zustand';
import { useNodeStore } from './ComputeNode';
import { logger } from '../utils/logger';

export interface DeviceSpecs {
    cpuModel: string;
    cpuCores: number;
    cpuThreads: number;
    memoryTotal: number;
    gpuModel?: string;
    gpuMemory?: number;
    osType: string;
    osVersion: string;
    browserType: string;
    browserVersion: string;
}

export interface Device {
    id: string;
    name: string;
    type: 'desktop' | 'laptop' | 'mobile' | 'server';
    ownerPublicKey: string;
    specs: DeviceSpecs;
    status: 'online' | 'offline' | 'busy';
    lastSeen: number;
    totalEarnings: number;
    performance: {
        avgCpuUsage: number;
        avgMemoryUsage: number;
        avgGpuUsage?: number;
        taskSuccessRate: number;
        totalTasksCompleted: number;
    };
}

interface DeviceState {
    devices: Map<string, Device>;
    activeDevice: string | null;
    addDevice: (device: Device) => void;
    removeDevice: (deviceId: string) => void;
    updateDeviceStatus: (deviceId: string, status: Device['status']) => void;
    updateDevicePerformance: (deviceId: string, performance: Partial<Device['performance']>) => void;
    setActiveDevice: (deviceId: string | null) => void;
    getDevicesByOwner: (ownerPublicKey: string) => Device[];
    init: () => void;
    syncWithNodeStore: () => void;
}

export const useDeviceStore = create<DeviceState>((set, get) => ({
    devices: new Map(),
    activeDevice: null,
    
    // Initialize from session storage
    init: () => {
        try {
            // Load devices from session storage if available
            const savedDevices = sessionStorage.getItem('devices');
            if (savedDevices) {
                const parsedDevices = JSON.parse(savedDevices);
                const devicesMap = new Map();
                parsedDevices.forEach((device: Device) => {
                    devicesMap.set(device.id, device);
                });
                set({ devices: devicesMap });
                logger.log('Loaded devices from session storage');
            }
            
            // Sync with node store
            const nodeStore = useNodeStore.getState();
            if (nodeStore.nodeId) {
                const activeDevice = Array.from(get().devices.values())
                    .find(d => d.ownerPublicKey === nodeStore.publicKey);
                    
                if (activeDevice) {
                    set({ activeDevice: activeDevice.id });
                    
                    // Update device with node stats
                    const performance = {
                        avgCpuUsage: nodeStore.cpuUsage,
                        avgMemoryUsage: nodeStore.memoryUsage,
                        taskSuccessRate: nodeStore.successRate,
                        totalTasksCompleted: nodeStore.completedTasks
                    };
                    
                    get().updateDevicePerformance(activeDevice.id, performance);
                    get().updateDeviceStatus(activeDevice.id, nodeStore.isRunning ? 'online' : 'offline');
                    logger.log('Synced device with node store');
                }
            }
        } catch (error) {
            logger.error('Error initializing device store');
        }
    },

    addDevice: (device) => {
        const devices = new Map(get().devices);
        devices.set(device.id, device);
        set({ devices });
        
        // Save to session storage
        try {
            const devicesArray = Array.from(devices.values());
            sessionStorage.setItem('devices', JSON.stringify(devicesArray));
            logger.log('Saved devices to session storage');
        } catch (error) {
            logger.error('Error saving devices to session storage');
        }
        
        // Sync with node store if this is the active device
        const nodeStore = useNodeStore.getState();
        if (nodeStore.publicKey && device.ownerPublicKey === nodeStore.publicKey) {
            nodeStore.setNodeId(device.id);
            logger.log('Synced new device with node store');
        }
    },

    removeDevice: (deviceId) => {
        const devices = new Map(get().devices);
        devices.delete(deviceId);
        set({ devices });
        
        // Update session storage
        try {
            const devicesArray = Array.from(devices.values());
            sessionStorage.setItem('devices', JSON.stringify(devicesArray));
            logger.log('Updated devices in session storage after removal');
        } catch (error) {
            logger.error('Error updating devices in session storage');
        }
        
        // If this was the active device, update node store
        if (get().activeDevice === deviceId) {
            set({ activeDevice: null });
            const nodeStore = useNodeStore.getState();
            if (nodeStore.isRunning) {
                nodeStore.stopNode();
                logger.log('Stopped node after device removal');
            }
        }
    },

    updateDeviceStatus: (deviceId, status) => {
        const devices = new Map(get().devices);
        const device = devices.get(deviceId);
        if (device) {
            const updatedDevice = {
                ...device,
                status,
                lastSeen: Date.now()
            };
            devices.set(deviceId, updatedDevice);
            set({ devices });
            
            // Save to session storage
            try {
                const devicesArray = Array.from(devices.values());
                sessionStorage.setItem('devices', JSON.stringify(devicesArray));
            } catch (error) {
                logger.error('Error saving device status to session storage');
            }
            
            // Sync with node store if this is the active device
            if (get().activeDevice === deviceId) {
                const nodeStore = useNodeStore.getState();
                if (status === 'online' && !nodeStore.isRunning) {
                    // Don't automatically start the node, just log the inconsistency
                    logger.log('Device status inconsistent with node status');
                } else if (status === 'offline' && nodeStore.isRunning) {
                    nodeStore.stopNode();
                    logger.log('Stopped node to match device status');
                }
            }
        }
    },

    updateDevicePerformance: (deviceId, performance) => {
        const devices = new Map(get().devices);
        const device = devices.get(deviceId);
        if (device) {
            const updatedDevice = {
                ...device,
                performance: {
                    ...device.performance,
                    ...performance
                }
            };
            devices.set(deviceId, updatedDevice);
            set({ devices });
            
            // Save to session storage
            try {
                const devicesArray = Array.from(devices.values());
                sessionStorage.setItem('devices', JSON.stringify(devicesArray));
            } catch (error) {
                logger.error('Error saving device performance to session storage');
            }
            
            // Sync with node store if this is the active device
            if (get().activeDevice === deviceId) {
                const nodeStore = useNodeStore.getState();
                // Only update node store if the values are significantly different
                if (performance.avgCpuUsage && Math.abs(performance.avgCpuUsage - nodeStore.cpuUsage) > 5) {
                    nodeStore.setCpuUsage(performance.avgCpuUsage);
                }
                if (performance.avgMemoryUsage && Math.abs(performance.avgMemoryUsage - nodeStore.memoryUsage) > 5) {
                    nodeStore.setMemoryUsage(performance.avgMemoryUsage);
                }
                if (performance.totalTasksCompleted && performance.totalTasksCompleted !== nodeStore.completedTasks) {
                    nodeStore.setCompletedTasks(performance.totalTasksCompleted);
                }
                if (performance.taskSuccessRate && Math.abs(performance.taskSuccessRate - nodeStore.successRate) > 2) {
                    nodeStore.setSuccessRate(performance.taskSuccessRate);
                }
                logger.log('Synced device performance with node store');
            }
        }
    },

    setActiveDevice: (deviceId) => {
        set({ activeDevice: deviceId });
        
        // Save to session storage
        try {
            sessionStorage.setItem('activeDevice', deviceId || '');
        } catch (error) {
            logger.error('Error saving active device to session storage');
        }
        
        // Sync with node store
        if (deviceId) {
            const device = get().devices.get(deviceId);
            if (device) {
                const nodeStore = useNodeStore.getState();
                nodeStore.setNodeId(deviceId);
                
                // Sync performance metrics
                nodeStore.setCpuUsage(device.performance.avgCpuUsage);
                nodeStore.setMemoryUsage(device.performance.avgMemoryUsage);
                nodeStore.setSuccessRate(device.performance.taskSuccessRate);
                nodeStore.setCompletedTasks(device.performance.totalTasksCompleted);
                
                logger.log('Set active device and synced with node store');
            }
        }
    },

    getDevicesByOwner: (ownerPublicKey) => {
        const { devices } = get();
        return Array.from(devices.values())
            .filter(device => device.ownerPublicKey === ownerPublicKey)
            .sort((a, b) => b.lastSeen - a.lastSeen);
    },
    
    // Sync with node store
    syncWithNodeStore: () => {
        const nodeStore = useNodeStore.getState();
        if (!nodeStore.nodeId || !nodeStore.publicKey) return;
        
        // Find the device that matches the node
        const device = Array.from(get().devices.values())
            .find(d => d.id === nodeStore.nodeId);
            
        if (device) {
            // Update device with node stats
            const performance = {
                avgCpuUsage: nodeStore.cpuUsage,
                avgMemoryUsage: nodeStore.memoryUsage,
                taskSuccessRate: nodeStore.successRate,
                totalTasksCompleted: nodeStore.completedTasks
            };
            
            get().updateDevicePerformance(device.id, performance);
            get().updateDeviceStatus(device.id, nodeStore.isRunning ? 'online' : 'offline');
            
            // Set as active device if not already
            if (get().activeDevice !== device.id) {
                set({ activeDevice: device.id });
            }
            
            logger.log('Synced device with node store');
        } else if (nodeStore.isRunning) {
            // Create a new device for this node if it doesn't exist
            logger.log('Creating new device for active node');
            DeviceDetector.detectSpecs().then(specs => {
                const deviceId = nodeStore.nodeId || DeviceDetector.generateDeviceId(nodeStore.publicKey || '', specs);
                const newDevice: Device = {
                    id: deviceId,
                    name: `Node ${deviceId.substring(0, 6)}`,
                    type: DeviceDetector.detectDeviceType(),
                    ownerPublicKey: nodeStore.publicKey || '',
                    specs,
                    status: 'online',
                    lastSeen: Date.now(),
                    totalEarnings: nodeStore.totalEarnings,
                    performance: {
                        avgCpuUsage: nodeStore.cpuUsage,
                        avgMemoryUsage: nodeStore.memoryUsage,
                        taskSuccessRate: nodeStore.successRate,
                        totalTasksCompleted: nodeStore.completedTasks
                    }
                };
                
                get().addDevice(newDevice);
                set({ activeDevice: deviceId });
                logger.log('Created new device from node store');
            });
        }
    }
}));

export class DeviceDetector {
    static async detectSpecs(): Promise<DeviceSpecs> {
        const ua = navigator.userAgent;
        const browserInfo = this.detectBrowser(ua);
        
        return {
            cpuModel: await this.getCpuModel(),
            cpuCores: navigator.hardwareConcurrency || 1,
            cpuThreads: navigator.hardwareConcurrency || 1,
            memoryTotal: this.getMemorySize(),
            gpuModel: await this.getGpuInfo(),
            osType: this.detectOS(ua),
            osVersion: this.detectOSVersion(ua),
            browserType: browserInfo.type,
            browserVersion: browserInfo.version
        };
    }

    private static async getCpuModel(): Promise<string> {
        try {
            // Use available APIs to detect CPU
            if ('deviceMemory' in navigator) {
                return `${navigator.hardwareConcurrency}-Core Processor`;
            }
            return 'Generic CPU';
        } catch {
            return 'Unknown CPU';
        }
    }

    private static getMemorySize(): number {
        try {
            // @ts-ignore: deviceMemory is not in the navigator type yet
            return navigator.deviceMemory ? navigator.deviceMemory * 1024 : 4096;
        } catch {
            return 4096; // Default to 4GB
        }
    }

    private static async getGpuInfo(): Promise<string | undefined> {
        try {
            const gl = document.createElement('canvas').getContext('webgl');
            if (!gl) return undefined;

            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            if (!debugInfo) return undefined;

            return gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
        } catch {
            return undefined;
        }
    }

    private static detectOS(ua: string): string {
        if (ua.includes('Windows')) return 'Windows';
        if (ua.includes('Mac OS')) return 'MacOS';
        if (ua.includes('Linux')) return 'Linux';
        if (ua.includes('Android')) return 'Android';
        if (ua.includes('iOS')) return 'iOS';
        return 'Unknown';
    }

    private static detectOSVersion(ua: string): string {
        const matches = ua.match(/(Windows NT|Mac OS X|Android|iOS) ([0-9._]+)/);
        return matches ? matches[2] : 'Unknown';
    }

    private static detectBrowser(ua: string): { type: string; version: string } {
        if (ua.includes('Chrome')) return { type: 'Chrome', version: this.extractVersion(ua, 'Chrome') };
        if (ua.includes('Firefox')) return { type: 'Firefox', version: this.extractVersion(ua, 'Firefox') };
        if (ua.includes('Safari')) return { type: 'Safari', version: this.extractVersion(ua, 'Safari') };
        if (ua.includes('Edge')) return { type: 'Edge', version: this.extractVersion(ua, 'Edge') };
        return { type: 'Unknown', version: '0.0' };
    }

    private static extractVersion(ua: string, browser: string): string {
        const matches = ua.match(new RegExp(`${browser}\\/([0-9.]+)`));
        return matches ? matches[1] : '0.0';
    }

    static detectDeviceType(): Device['type'] {
        const ua = navigator.userAgent.toLowerCase();
        
        if (ua.includes('mobile')) return 'mobile';
        if (ua.includes('laptop') || ua.includes('macbook')) return 'laptop';
        if (ua.includes('server') || ua.includes('linux')) return 'server';
        return 'desktop';
    }

    static generateDeviceId(ownerPublicKey: string, specs: DeviceSpecs): string {
        const deviceData = `${ownerPublicKey}:${specs.cpuModel}:${specs.memoryTotal}:${specs.browserType}`;
        return btoa(deviceData).slice(0, 32);
    }
}
