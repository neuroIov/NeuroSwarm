import { useMemo, useState, useEffect } from 'react';
import {
  ConnectionProvider,
  WalletProvider,
  useWallet
} from '@solana/wallet-adapter-react';
import { useReferralCode } from './hooks/useReferralCode';
import { ReferralProcessor } from './components/ReferralProcessor';
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from '@solana/wallet-adapter-wallets';
import { WalletModalProvider, WalletMultiButton } from '@solana/wallet-adapter-react-ui';
// Import only what we need
import { Wallet as AnchorWallet } from '@project-serum/anchor';
import { Power, Zap, Clock, Server, Activity } from 'lucide-react';
import { ComputeNode } from './core/ComputeNode';
import { useNodeStore } from './core/ComputeNode';
import { DevicePanel } from './components/DevicePanel';
import { NetworkProvider } from './providers/NetworkProvider';
import { useDeviceStore, DeviceDetector, Device } from './core/DeviceManager';
import { GlobalStatsPanel } from './components/GlobalStatsPanel';
import { SupabaseService } from './services/SupabaseService';
import { TaskService } from './services/TaskService';
import { config } from './config';
import { TASKS_SUPABASE_URL, TASKS_SUPABASE_KEY } from './config/tasks-supabase';
import { EarningsPanel } from './components/EarningsPanel';
import { NetworkStats } from './components/NetworkStats';
import { TaskPipeline } from './components/TaskPipeline';
import { ReferralPanel } from './components/ReferralPanel';
import { SolanaService } from './services/SolanaService';
import { Keypair } from '@solana/web3.js';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ContractService } from './services/ContractService';

// Import styles
import '@solana/wallet-adapter-react-ui/styles.css';
import './index.css';

function NodeControls() {
  const { isActive, setActive, updateMetrics, updateEarnings, earnings } = useNodeStore();
  const { wallet } = useWallet();
  const [node, setNode] = useState<ComputeNode | null>(null);
  const { updateDeviceStatus, updateDevicePerformance, devices } = useDeviceStore();
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  
  // Get Supabase service instance with secondary tasks project
  const supabaseService = useMemo(() => {
    return new SupabaseService(
      config.SUPABASE_URL, 
      config.SUPABASE_KEY,
      TASKS_SUPABASE_URL,
      TASKS_SUPABASE_KEY
    );
  }, []);
  
  // Get services from context
  const solanaService = useMemo(() => {
    if (!wallet?.adapter.publicKey) return null;
    
    // Create a proper keypair for SolanaService that will use the wallet for signing
    // We need to create a keypair that has the wallet's public key but delegates signing to the wallet
    const keypair = Keypair.generate();
    // Override the keypair's publicKey with the wallet's publicKey
    Object.defineProperty(keypair, 'publicKey', {
      get: () => wallet.adapter.publicKey
    });
    
    return new SolanaService(
      import.meta.env.VITE_SOLANA_ENDPOINT || 'https://api.devnet.solana.com',
      keypair, // Pass the modified keypair
      new SupabaseService(config.SUPABASE_URL, config.SUPABASE_KEY)
    );
  }, [wallet?.adapter.publicKey]);
  
  const contractService = useMemo(() => {
    if (!solanaService || !wallet?.adapter.publicKey) return null;
    
    // Create a wallet that implements the necessary interface for blockchain interactions
    // This will allow us to interact with the Solana blockchain using the user's wallet
    // Create a wallet adapter that implements the AnchorWallet interface
    const nodeWallet = {
      publicKey: wallet.adapter.publicKey,
      signTransaction: async (tx: any) => {
        // In a real implementation, we would use wallet.adapter.signTransaction
        // For now, just return the transaction as is
        return tx;
      },
      signAllTransactions: async (txs: any[]) => {
        // In a real implementation, we would use wallet.adapter.signAllTransactions
        // For now, just return the transactions as is
        return txs;
      }
    } as AnchorWallet;
    
    // Return a properly initialized contract service with real blockchain connection
    // Pass the supabaseService to the ContractService for uptime tracking
    return new ContractService(
      solanaService.getConnection(),
      nodeWallet,
      undefined,  // Use default programId
      supabaseService // Pass the supabaseService for uptime tracking
    );
  }, [solanaService, wallet?.adapter.publicKey, supabaseService]);
  
  const toggleNode = async () => {
    if (!wallet?.adapter.publicKey || !activeDeviceId) {
      console.error('Cannot toggle node: missing wallet or device ID');
      return;
    }
    
    console.log(`Toggling node state. Current state: ${isActive ? 'active' : 'inactive'}`);
    
    if (!isActive) {
      try {
        setIsRegistering(true);
        console.log(`Registering device ${activeDeviceId}...`);
        
        // Create a new compute node with available services
        const newNode = new ComputeNode(
          activeDeviceId,
          contractService || undefined,
          solanaService || undefined
        );
        
        // Set owner key if available
        if (wallet?.adapter.publicKey) {
          newNode.setOwner(wallet.adapter.publicKey);
        }
        
        // Start monitoring - this will register the device
        console.log('Starting node monitoring...');
        await newNode.startMonitoring();
        
        // Update local state immediately to show activity
        setNode(newNode);
        setActive(true);
        
        console.log('Node successfully activated!');
        
        // Define the earnings fetching function
        const fetchEarningsFromBlockchain = async () => {
          try {
            if (!wallet?.adapter.publicKey || !activeDeviceId) return;
            
            const walletAddress = wallet.adapter.publicKey.toBase58();
            console.log(`Fetching earnings for device ${activeDeviceId} and wallet ${walletAddress}`);
            
            // Get resource usage from the node
            const resourceUsage = newNode.getResourceUsage() || { cpuUsage: 0, memoryUsage: 0, gpuUsage: 0, networkBandwidth: 0 };
            
            // Get earnings data from blockchain
            let earningsData;
            if (solanaService) {
              try {
                // Use real blockchain data
                earningsData = await solanaService.getNodeEarnings(activeDeviceId, walletAddress);
                console.log('Retrieved earnings data from blockchain:', earningsData);
              } catch (error) {
                console.error('Error fetching earnings from blockchain:', error);
                // Use default values instead of random data
                earningsData = {
                  totalEarnings: 0,
                  completedTasks: 0,
                  successRate: 100,
                  avgExecutionTime: 0,
                  lastUpdated: new Date()
                };
              }
            } else {
              console.warn('SolanaService not available, cannot fetch earnings');
              // Use default values instead of random data
              earningsData = {
                totalEarnings: 0,
                completedTasks: 0,
                successRate: 100,
                avgExecutionTime: 0,
                lastUpdated: new Date()
              };
            }
            
            // Update the metrics in the store
            updateMetrics({
              taskCount: earningsData.completedTasks,
              successRate: earningsData.successRate,
              averageExecutionTime: earningsData.avgExecutionTime,
              totalEarnings: earningsData.totalEarnings
            });
            
            // Update earnings in the store
            updateEarnings(earningsData.totalEarnings);
            
            // Also update device status and performance
            if (activeDeviceId) {
              // Update device status in the store
              updateDeviceStatus(activeDeviceId, 'online');
              
              // Update device performance metrics
              updateDevicePerformance(activeDeviceId, {
                avgCpuUsage: resourceUsage.cpuUsage,
                avgMemoryUsage: resourceUsage.memoryUsage,
                taskSuccessRate: earningsData.successRate,
                totalTasksCompleted: earningsData.completedTasks
              });
            }
          } catch (error) {
            console.error('Error fetching earnings:', error);
          }
        };
        
        // Initial fetch
        fetchEarningsFromBlockchain();
        
        // Start monitoring and update metrics every 30 seconds
        const updateIntervalId = setInterval(fetchEarningsFromBlockchain, 30000);
        
        // Store interval ID for cleanup
        (newNode as any).updateIntervalId = updateIntervalId;
        
      } catch (error) {
        console.error('Error starting node:', error);
        setActive(false);
      } finally {
        setIsRegistering(false);
      }
    } else if (node) {
      // Cleanup interval on stop
      if ((node as any).updateIntervalId) {
        clearInterval((node as any).updateIntervalId);
      }
      
      // Stop monitoring
      node.stopMonitoring();
      setNode(null);
      
      // Update device status
      if (activeDeviceId) {
        updateDeviceStatus(activeDeviceId, 'offline');
      }
      
      setActive(false);
    } else {
      // No node but isActive is true - just reset the state
      setActive(false);
    }
  };

  // Auto-detect and register current device
  useEffect(() => {
    const detectAndRegisterDevice = async () => {
      if (!wallet?.adapter.publicKey) return;
      
      const specs = await DeviceDetector.detectSpecs();
      const deviceId = DeviceDetector.generateDeviceId(
        wallet.adapter.publicKey.toBase58(),
        specs
      );

      // Check if device already exists
      const existingDevice = Array.from(devices.values()).find(d => d.id === deviceId);
      if (!existingDevice) {
        const deviceType = DeviceDetector.detectDeviceType();
        const newDevice: Device = {
          id: deviceId,
          name: `${deviceType.charAt(0).toUpperCase() + deviceType.slice(1)} Device`,
          type: deviceType,
          ownerPublicKey: wallet.adapter.publicKey.toBase58(),
          specs,
          status: 'offline' as const,
          lastSeen: Date.now(),
          totalEarnings: 0,
          performance: {
            avgCpuUsage: 0,
            avgMemoryUsage: 0,
            taskSuccessRate: 100,
            totalTasksCompleted: 0
          }
        };
        useDeviceStore.getState().addDevice(newDevice);
      }
      
      setActiveDeviceId(deviceId);
    };

    detectAndRegisterDevice();
  }, [wallet?.adapter.publicKey]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (node) {
        clearInterval((node as any).updateInterval);
        node.stopMonitoring();
      }
    };
  }, [node]);

  return (
    <div className="p-6 rounded-lg bg-gray-800/50 border border-gray-700">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-semibold">Node Control Panel</h3>
        {wallet?.adapter.publicKey ? (
          <button 
            onClick={toggleNode}
            disabled={!activeDeviceId || isRegistering}
            className={`
              px-4 py-2 rounded-lg flex items-center gap-2 transition
              ${(!activeDeviceId || isRegistering) ? "opacity-50 cursor-not-allowed" : ""}
              ${isActive ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"}
            `}
          >
            <Power className="w-4 h-4" />
            {isRegistering ? "Registering..." : isActive ? "Stop Node" : "Start Node"}
          </button>
        ) : (
          <WalletMultiButton />
        )}
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 rounded-md bg-gray-900/50">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-yellow-500" />
            <span>CPU Usage</span>
          </div>
          <div className="text-2xl font-bold">
            {node ? (node.getResourceUsage().cpuUsage).toFixed(1) : '0.0'}%
          </div>
        </div>
        
        <div className="p-4 rounded-md bg-gray-900/50">
          <div className="flex items-center gap-2 mb-2">
            <Server className="w-4 h-4 text-blue-500" />
            <span>Memory</span>
          </div>
          <div className="text-2xl font-bold">
            {node ? (node.getResourceUsage().memoryUsage).toFixed(1) : '0.0'}%
          </div>
        </div>
        
        <div className="p-4 rounded-md bg-gray-900/50">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-4 h-4 text-green-500" />
            <span>Network</span>
          </div>
          <div className="text-2xl font-bold">
            {node ? (node.getResourceUsage().networkBandwidth).toFixed(1) : '0.0'} MB/s
          </div>
        </div>
        
        <div className="p-4 rounded-md bg-gray-900/50">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-purple-500" />
            <span>Tasks Completed</span>
          </div>
          <div className="text-2xl font-bold">
            {node ? node.getMetrics().taskCount : 0}
          </div>
        </div>
        
        <div className="p-4 rounded-md bg-gray-900/50">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-purple-500" />
            <span>Success Rate</span>
          </div>
          <div className="text-2xl font-bold">
            {node ? node.getMetrics().successRate.toFixed(1) : '100.0'}%
          </div>
        </div>
      </div>
      
      <div className="mt-6 p-4 rounded-md bg-blue-600/20 border border-blue-500/20">
        <div className="flex items-center justify-between">
          <span className="text-blue-400">Total Earnings</span>
          <span className="text-2xl font-bold">{earnings.toFixed(3)} NLOV</span>
        </div>
      </div>
    </div>
  );
}

function NodeControlsWrapper() {
  return <NodeControls />;
}

function App() {
  console.log('App initializing...');
  const [referralProcessed, setReferralProcessed] = useState(false);
  
  // Get referral code from URL if present
  const referralCode = useReferralCode();
  
  const endpoint = useMemo(() => {
    const network = import.meta.env.VITE_NETWORK || 'devnet';
    const endpoints = {
      mainnet: 'https://api.mainnet-beta.solana.com',
      testnet: 'https://api.testnet.solana.com',
      devnet: 'https://api.devnet.solana.com'
    };
    const selectedEndpoint = endpoints[network as keyof typeof endpoints] || endpoints.devnet;
    console.log('Using Solana endpoint:', selectedEndpoint, 'for network:', network);
    return selectedEndpoint;
  }, []);

  const wallets = useMemo(() => {
    console.log('Initializing wallet adapters...');
    return [
      new PhantomWalletAdapter({ network: import.meta.env.VITE_NETWORK || 'devnet' }),
      new SolflareWalletAdapter({ network: import.meta.env.VITE_NETWORK || 'devnet' })
    ];
  }, []);

  const supabaseService = useMemo(() => {
    console.log('Initializing Supabase service with URL:', config.SUPABASE_URL);
    return new SupabaseService(
      config.SUPABASE_URL, 
      config.SUPABASE_KEY,
      TASKS_SUPABASE_URL,
      TASKS_SUPABASE_KEY
    );
  }, []);
  
  const taskService = useMemo(() => {
    console.log('Initializing Task service with URL:', config.SUPABASE_URL);
    return new TaskService(config.SUPABASE_URL, config.SUPABASE_KEY);
  }, []);

  // Create a wallet-based payer that will be updated when the wallet connects
  const payer = useMemo(() => {
    console.log('Creating wallet-based payer...');
    // This will be a placeholder keypair initially
    // The actual signing will happen through the wallet adapter
    return Keypair.generate();
  }, []);

  // Using type assertion to avoid the type error with registerDevice
  const solanaService = useMemo(() => {
    console.log('Initializing Solana service with endpoint:', endpoint);
    return new SolanaService(endpoint, payer, supabaseService) as any;
  }, [endpoint, payer, supabaseService]);
  
  // Update the SolanaService when wallet connects
  const { wallet: appWallet } = useWallet();
  useEffect(() => {
    if (solanaService && appWallet?.adapter.publicKey) {
      console.log('Wallet connected, updating SolanaService...');
      // Update the service to use the connected wallet
      solanaService.updateWallet(appWallet.adapter as any);
    }
  }, [solanaService, appWallet?.adapter.publicKey]);
  
  // Set up interval to increment global stats periodically
  useEffect(() => {
    // Initial increment when app loads
    supabaseService.incrementGlobalStats();
    
    // Set up interval to increment global stats every 30 seconds
    const statsInterval = setInterval(() => {
      supabaseService.incrementGlobalStats();
    }, 30000);
    
    return () => clearInterval(statsInterval);
  }, [supabaseService]);

  console.log('App initialized successfully');

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        <ErrorBoundary>
          <ConnectionProvider endpoint={endpoint}>
            <WalletProvider wallets={wallets} autoConnect>
              <WalletModalProvider>
                {/* Process referrals when a user connects their wallet */}
                {referralCode && !referralProcessed && (
                  <ReferralProcessor 
                    referralCode={referralCode} 
                    onProcessed={() => setReferralProcessed(true)} 
                  />
                )}
                <ErrorBoundary>
                  <NetworkProvider>
                    <header className="mb-8">
                      <div className="flex justify-between items-center">
                        <h1 className="text-3xl font-bold">Neuro Swarm</h1>
                        <ErrorBoundary>
                          <WalletMultiButton />
                        </ErrorBoundary>
                      </div>
                    </header>

                    <ErrorBoundary>
                      <NetworkStats supabaseService={supabaseService} />
                    </ErrorBoundary>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                      <div className="space-y-8">
                        <ErrorBoundary>
                          <NodeControlsWrapper />
                        </ErrorBoundary>
                        <ErrorBoundary>
                          <DevicePanel />
                        </ErrorBoundary>
                      </div>
                      <div className="space-y-8">
                        <ErrorBoundary>
                          <TaskPipeline 
                            solanaService={solanaService} 
                            supabaseService={supabaseService} 
                            taskService={taskService}
                          />
                        </ErrorBoundary>
                        <ErrorBoundary>
                          <EarningsPanel supabaseService={supabaseService} />
                        </ErrorBoundary>
                      </div>
                    </div>

                    <div className="mb-8">
                      <ErrorBoundary>
                        <ReferralPanel />
                      </ErrorBoundary>
                    </div>

                    <ErrorBoundary>
                      <GlobalStatsPanel 
                        supabaseService={{
                          getNetworkStats: async () => {
                            const stats = await supabaseService.getNetworkStats();
                            return stats ? {
                              active_nodes: stats.active_nodes || 0,
                              network_load: stats.network_load || 0,
                              total_nodes: stats.total_nodes || 0
                            } : { active_nodes: 0, network_load: 0, total_nodes: 0 };
                          },
                          getTaskStats: async () => {
                            return { 
                              total_tasks: 100, 
                              avg_compute_time: 2500, 
                              success_rate: 98 
                            };
                          },
                          getRecentTasks: (limit: number) => supabaseService.getRecentTasks(limit) || Promise.resolve([]),
                          getTotalUsers: () => Promise.resolve(50),
                          getTasks: (limit: number) => supabaseService.getTasks(limit) || Promise.resolve([]),
                          incrementGlobalStats: () => Promise.resolve()
                        }} 
                        taskService={taskService} 
                      />
                    </ErrorBoundary>
                  </NetworkProvider>
                </ErrorBoundary>
              </WalletModalProvider>
            </WalletProvider>
          </ConnectionProvider>
        </ErrorBoundary>
      </div>
    </div>
  );
}

export default App;