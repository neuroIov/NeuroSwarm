import { useState, useEffect, useRef } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { clsx } from 'clsx';
import { 
    Monitor, 
    Laptop, 
    Smartphone, 
    Server,
    Plus,
    Trash2,
    Edit,
    Check,
    X
} from 'lucide-react';
import { Device, DeviceDetector, useDeviceStore } from '../core/DeviceManager';
import { useNodeStore } from '../core/ComputeNode';

const DeviceIcon = ({ type, className }: { type: Device['type']; className?: string }) => {
    switch (type) {
        case 'desktop':
            return <Monitor className={className} />;
        case 'laptop':
            return <Laptop className={className} />;
        case 'mobile':
            return <Smartphone className={className} />;
        case 'server':
            return <Server className={className} />;
    }
};

const DeviceStatus = ({ status }: { status: Device['status'] }) => {
    const colors = {
        online: 'bg-green-500',
        offline: 'bg-gray-500',
        busy: 'bg-yellow-500'
    };

    return (
        <div className="flex items-center gap-2">
            <div className={clsx('w-2 h-2 rounded-full', colors[status])} />
            <span className="capitalize">{status}</span>
        </div>
    );
};

export function DevicePanel() {
    const { wallet } = useWallet();
    const { devices, addDevice, removeDevice, updateDeviceStatus, updateDevicePerformance, getDevicesByOwner, init, syncWithNodeStore } = useDeviceStore();
    const nodeStore = useNodeStore();
    const [isAddingDevice, setIsAddingDevice] = useState(false);
    const [newDeviceName, setNewDeviceName] = useState('');
    const [editingDevice, setEditingDevice] = useState<string | null>(null);
    const syncIntervalRef = useRef<number | null>(null);

    // Initialize device store from session storage
    useEffect(() => {
        init();
        
        // Set up interval to sync with node store
        syncIntervalRef.current = window.setInterval(() => {
            syncWithNodeStore();
        }, 5000) as unknown as number;
        
        return () => {
            if (syncIntervalRef.current) {
                clearInterval(syncIntervalRef.current);
            }
        };
    }, [init, syncWithNodeStore]);

    const userDevices = wallet?.adapter.publicKey 
        ? getDevicesByOwner(wallet.adapter.publicKey.toBase58())
        : [];

    const addNewDevice = async () => {
        if (!wallet?.adapter.publicKey || !newDeviceName.trim()) return;

        const specs = await DeviceDetector.detectSpecs();
        const deviceType = DeviceDetector.detectDeviceType();
        const deviceId = DeviceDetector.generateDeviceId(
            wallet.adapter.publicKey.toBase58(),
            specs
        );

        const newDevice: Device = {
            id: deviceId,
            name: newDeviceName.trim(),
            type: deviceType,
            ownerPublicKey: wallet.adapter.publicKey.toBase58(),
            specs,
            status: 'offline',
            lastSeen: Date.now(),
            totalEarnings: 0,
            performance: {
                avgCpuUsage: 0,
                avgMemoryUsage: 0,
                taskSuccessRate: 100,
                totalTasksCompleted: 0
            }
        };

        addDevice(newDevice);
        setNewDeviceName('');
        setIsAddingDevice(false);
    };

    const handleRemoveDevice = (deviceId: string) => {
        if (confirm('Are you sure you want to remove this device?')) {
            removeDevice(deviceId);
        }
    };

    const updateDeviceName = (deviceId: string, newName: string) => {
        const device = Array.from(devices.values()).find(d => d.id === deviceId);
        if (device && newName.trim()) {
            addDevice({ ...device, name: newName.trim() });
            setEditingDevice(null);
        }
    };

    // Keep device status updated and sync with node store
    useEffect(() => {
        const interval = setInterval(() => {
            // Update device status based on last seen time
            userDevices.forEach(device => {
                const timeSinceLastSeen = Date.now() - device.lastSeen;
                if (timeSinceLastSeen > 30000 && device.status !== 'offline') { // 30 seconds
                    updateDeviceStatus(device.id, 'offline');
                }
                
                // Update device performance with real metrics if this is the active node
                if (device.id === nodeStore.nodeId && nodeStore.isRunning) {
                    updateDevicePerformance(device.id, {
                        avgCpuUsage: nodeStore.cpuUsage,
                        avgMemoryUsage: nodeStore.memoryUsage,
                        taskSuccessRate: nodeStore.successRate,
                        totalTasksCompleted: nodeStore.completedTasks
                    });
                }
            });
        }, 3000);

        return () => clearInterval(interval);
    }, [userDevices, nodeStore.nodeId, nodeStore.isRunning, nodeStore.cpuUsage, nodeStore.memoryUsage, nodeStore.successRate, nodeStore.completedTasks]);

    if (!wallet?.adapter.publicKey) {
        return (
            <div className="p-6 rounded-lg bg-gray-800/50 border border-gray-700">
                <div className="text-center text-gray-400">
                    Connect your wallet to manage devices
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 rounded-lg bg-gray-800/50 border border-gray-700">
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-semibold">Your Devices</h3>
                <button
                    onClick={() => setIsAddingDevice(true)}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 flex items-center gap-2"
                >
                    <Plus className="w-4 h-4" />
                    Add Device
                </button>
            </div>

            {isAddingDevice && (
                <div className="mb-6 p-4 rounded-lg bg-gray-900/50 border border-gray-700">
                    <h4 className="font-semibold mb-3">Add New Device</h4>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={newDeviceName}
                            onChange={(e) => setNewDeviceName(e.target.value)}
                            placeholder="Device Name"
                            className="flex-1 px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 focus:outline-none focus:border-blue-500"
                        />
                        <button
                            onClick={addNewDevice}
                            disabled={!newDeviceName.trim()}
                            className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50"
                        >
                            <Check className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => {
                                setIsAddingDevice(false);
                                setNewDeviceName('');
                            }}
                            className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            <div className="space-y-4">
                {userDevices.length === 0 ? (
                    <div className="text-center text-gray-400 py-8">
                        No devices added yet. Click "Add Device" to get started.
                    </div>
                ) : (
                    userDevices.map(device => (
                        <div
                            key={device.id}
                            className="p-4 rounded-lg bg-gray-900/50 border border-gray-700"
                        >
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <DeviceIcon type={device.type} className="w-5 h-5 text-blue-500" />
                                    {editingDevice === device.id ? (
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                defaultValue={device.name}
                                                className="px-2 py-1 rounded bg-gray-800 border border-gray-700 focus:outline-none focus:border-blue-500"
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        updateDeviceName(device.id, e.currentTarget.value);
                                                    }
                                                }}
                                            />
                                            <button
                                                onClick={() => setEditingDevice(null)}
                                                className="text-gray-400 hover:text-gray-300"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ) : (
                                        <>
                                            <span className="font-semibold">{device.name}</span>
                                            <button
                                                onClick={() => setEditingDevice(device.id)}
                                                className="text-gray-400 hover:text-gray-300"
                                            >
                                                <Edit className="w-4 h-4" />
                                            </button>
                                        </>
                                    )}
                                </div>
                                <div className="flex items-center gap-4">
                                    <DeviceStatus status={device.status} />
                                    <button
                                        onClick={() => handleRemoveDevice(device.id)}
                                        className="text-red-500 hover:text-red-400"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="p-3 rounded bg-gray-800/50">
                                    <div className="text-sm text-gray-400 mb-1">CPU</div>
                                    <div className="font-semibold">
                                        {device.performance.avgCpuUsage.toFixed(1)}%
                                    </div>
                                </div>
                                <div className="p-3 rounded bg-gray-800/50">
                                    <div className="text-sm text-gray-400 mb-1">Memory</div>
                                    <div className="font-semibold">
                                        {device.performance.avgMemoryUsage.toFixed(1)}%
                                    </div>
                                </div>
                                <div className="p-3 rounded bg-gray-800/50">
                                    <div className="text-sm text-gray-400 mb-1">Tasks</div>
                                    <div className="font-semibold">
                                        {device.performance.totalTasksCompleted}
                                    </div>
                                </div>
                                <div className="p-3 rounded bg-gray-800/50">
                                    <div className="text-sm text-gray-400 mb-1">Success Rate</div>
                                    <div className="font-semibold">
                                        {device.performance.taskSuccessRate.toFixed(1)}%
                                    </div>
                                </div>
                            </div>

                            <div className="mt-4 text-sm text-gray-400">
                                <div>CPU: {device.specs.cpuModel} ({device.specs.cpuCores} cores)</div>
                                <div>Memory: {(device.specs.memoryTotal / 1024).toFixed(1)} GB</div>
                                {device.specs.gpuModel && (
                                    <div>GPU: {device.specs.gpuModel}</div>
                                )}
                                <div>OS: {device.specs.osType} {device.specs.osVersion}</div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
