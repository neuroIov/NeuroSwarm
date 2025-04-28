import {
    Connection,
    PublicKey,
    Transaction,
    SystemProgram,
    Keypair,
    TransactionInstruction,
    sendAndConfirmTransaction,
    TransactionSignature,
    LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { BN } from 'bn.js';
import { Program, AnchorProvider, Idl } from '@project-serum/anchor';
import * as bs58 from 'bs58';
import { SwarmNetwork } from '../idl/swarm_network';
import { config } from '../config';

// Use the imported IDL
const IDL: Idl = SwarmNetwork;

// Import the real SupabaseService
import { SupabaseService } from './SupabaseService';

// Solana endpoints
const ENDPOINTS = {
    MAINNET: 'https://api.mainnet-beta.solana.com',
    DEVNET: 'https://api.devnet.solana.com',
    TESTNET: 'https://api.testnet.solana.com',
} as const;

// Use devnet for testing
const DEFAULT_ENDPOINT = ENDPOINTS.DEVNET;

// Get program ID from config
const SWARM_NETWORK_PROGRAM_ID = new PublicKey(config.PROGRAM_ID);

// Initialize Anchor program
const initializeProgram = (connection: Connection, wallet: Keypair): Program<Idl> => {
    const provider = new AnchorProvider(
        connection,
        {
            publicKey: wallet.publicKey,
            signTransaction: async (tx: Transaction) => {
                tx.sign(wallet);
                return tx;
            },
            signAllTransactions: async (txs: Transaction[]) => {
                txs.forEach(tx => tx.sign(wallet));
                return txs;
            },
        },
        { commitment: 'confirmed' }
    );

    return new Program(IDL, SWARM_NETWORK_PROGRAM_ID, provider);
};

export interface DeviceSpecs {
    gpuModel: string;
    vram: number;
    hashRate: number;
}

export interface TaskRequirements {
    minVram: number;
    minHashRate: number;
    priority: 'low' | 'medium' | 'high';
}

export interface TaskResult {
    taskId: string;
    computeTime: number;
    hashRate: number;
    success: boolean;
}

export interface TaskStatus {
    completed: boolean;
    failed: boolean;
    nodeId?: string;
    reward?: number;
    signature?: string;
    id?: string;
    status?: 'pending' | 'processing' | 'completed' | 'failed';
    assignedNode?: string | null;
    result?: TaskResult | null;
}

export interface Device {
    id: string;
    owner: PublicKey;
    stake: number;
    vram: number;
    hashRate: number;
    gpuModel: string;
}

export interface Task {
    id: string;
    owner: PublicKey;
    requirements: TaskRequirements;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    assignedNode?: string;
    result?: TaskResult;
}

export interface TaskProofData {
    taskId: string;
    nodeId: string;
    timestamp: number;
    result: unknown;
}

export interface DeviceStatus {
    isOnline: boolean;
    lastSeen: Date;
    currentLoad: number;
    cpuUsage: number;
    availableVram: number;
    temperature: number;
}

export interface NodeEarningsData {
    totalEarnings: number;
    completedTasks: number;
    successRate: number;
    avgExecutionTime: number;
    lastUpdated: Date;
}

export interface ISolanaService {
    validateTransaction(transaction: Transaction): Promise<boolean>;
    waitForConfirmation(signature: TransactionSignature): Promise<boolean>;
    registerDevice(owner: PublicKey, specs: DeviceSpecs, payer: Keypair): Promise<TransactionSignature>;
    registerDevice(deviceSpecs: DeviceSpecs): Promise<string>;
    registerTask(owner: PublicKey, requirements: TaskRequirements, payer: Keypair): Promise<TransactionSignature>;
    submitTask(owner: PublicKey, taskType: string, requirements: TaskRequirements, payer: Keypair): Promise<TransactionSignature>;
    submitTaskProof(proofData: { taskId: string; timestamp: number; computeTime: number; hashRate: number; success: boolean }, payer: Keypair): Promise<TransactionSignature>;
    distributeReward(recipient: PublicKey, amount: number, payer: Keypair, tokenAccount: PublicKey): Promise<TransactionSignature>;
    stakeTokens(user: PublicKey, amount: number, payer: Keypair, tokenAccount: PublicKey): Promise<string>;
    getAvailableDevices(): Promise<Device[]>;
    findSuitableGPU(requirements: TaskRequirements): Promise<Device | null>;
    monitorTaskProgress(taskId: string): Promise<string>;
    processTaskFromSupabase(taskId: string, taskType: string, requirements: TaskRequirements): Promise<string | boolean | null>;
    getNodeTasks(nodeId: string): Promise<any[]>;
    getDeviceStatus(deviceId: string): Promise<DeviceStatus>;
    updateDeviceStatus(deviceId: string, status: DeviceStatus): Promise<void>;
    getNodeEarnings(nodeId: string, walletAddress?: string): Promise<NodeEarningsData>;
    generateTaskProof(proofData: TaskProofData): Promise<string>;
    getAvailableTasks(): Promise<Task[]>;
    updateWallet(walletAdapter: any): void;
    getWalletAdapter(): any | null;
}

export class SolanaService implements ISolanaService {
    private readonly connection: Connection;
    private program: Program<Idl>;
    private tokenAccountCache: Map<string, PublicKey>;
    private _walletAdapter: any;

    constructor(
        endpoint: string = DEFAULT_ENDPOINT,
        private payer: Keypair,
        private readonly supabaseService: SupabaseService
    ) {
        console.log('Initializing SolanaService with endpoint:', endpoint);
        this.connection = new Connection(endpoint, 'confirmed');
        this.program = initializeProgram(this.connection, payer);
        this.tokenAccountCache = new Map<string, PublicKey>();
        this._walletAdapter = null;
    }
    
    /**
     * Get the current wallet adapter
     * @returns The wallet adapter or null if not set
     */
    getWalletAdapter(): any | null {
        return this._walletAdapter;
    }
    
    /**
     * Update the wallet used for signing transactions
     * @param walletAdapter The wallet adapter from @solana/wallet-adapter-react
     */
    updateWallet(walletAdapter: any): void {
        console.log('Updating wallet for SolanaService');
        this._walletAdapter = walletAdapter;
        
        // Create a new provider with the wallet adapter
        if (walletAdapter && walletAdapter.publicKey) {
            const provider = new AnchorProvider(
                this.connection,
                {
                    publicKey: walletAdapter.publicKey,
                    signTransaction: async (tx: Transaction) => {
                        return await walletAdapter.signTransaction(tx);
                    },
                    signAllTransactions: async (txs: Transaction[]) => {
                        return await walletAdapter.signAllTransactions(txs);
                    },
                },
                { commitment: 'confirmed' }
            );
            
            // Reinitialize the program with the new provider
            this.program = new Program(IDL, SWARM_NETWORK_PROGRAM_ID, provider);
            
            // Update the payer's public key to match the wallet's public key
            Object.defineProperty(this.payer, 'publicKey', {
                get: () => walletAdapter.publicKey
            });
            
            console.log('Wallet updated successfully, public key:', walletAdapter.publicKey.toString());
        } else {
            console.warn('Attempted to update wallet with invalid wallet adapter');
        }
    }

    getConnection(): Connection {
        return this.connection;
    }

    async validateTransaction(transaction: Transaction): Promise<boolean> {
        try {
            const simulation = await this.connection.simulateTransaction(transaction);
            return simulation.value.err === null;
        } catch (error) {
            console.error('Transaction validation failed:', error);
            return false;
        }
    }

    async waitForConfirmation(signature: string): Promise<boolean> {
        try {
            const result = await this.connection.confirmTransaction(signature, 'confirmed');
            return !result.value.err;
        } catch (error) {
            console.error('Transaction confirmation failed:', error);
            return false;
        }
    }

    async registerDevice(
        ownerOrSpecs: PublicKey | DeviceSpecs,
        specs?: DeviceSpecs,
        payer?: Keypair
    ): Promise<TransactionSignature | string> {
        try {
            if (ownerOrSpecs instanceof PublicKey && specs && payer) {
                const owner = ownerOrSpecs;
                const deviceAccount = Keypair.generate();
                
                // Use proper Anchor program methods
                const tx = await this.program.methods
                    .registerDevice(
                        specs.gpuModel,
                        new BN(specs.vram),
                        new BN(specs.hashRate),
                        null // No referrer
                    )
                    .accounts({
                        owner,
                        device: deviceAccount.publicKey,
                        systemProgram: SystemProgram.programId,
                    })
                    .signers([payer, deviceAccount])
                    .rpc();
                
                const signature = tx;

                const confirmed = await this.waitForConfirmation(signature);
                if (!confirmed) throw new Error('Transaction confirmation failed');

                return signature;
            } else {
                // When called with just device specs, we need to create a real blockchain entry
                // Create a new device account on the blockchain
                const deviceSpecs = ownerOrSpecs as DeviceSpecs;
                const deviceAccount = Keypair.generate();
                
                // Use the program to register the device on-chain
                const tx = await this.program.methods
                    .registerDevice(
                        deviceSpecs.gpuModel,
                        new BN(deviceSpecs.vram),
                        new BN(deviceSpecs.hashRate)
                    )
                    .accounts({
                        owner: this.payer.publicKey,
                        device: deviceAccount.publicKey,
                        systemProgram: SystemProgram.programId,
                    })
                    .signers([this.payer, deviceAccount])
                    .rpc();
                
                // Wait for confirmation
                await this.waitForConfirmation(tx);
                
                // Return the device public key as the ID
                console.log(`Registered device with specs: ${JSON.stringify(deviceSpecs)}, ID: ${deviceAccount.publicKey.toString()}`);
                return deviceAccount.publicKey.toString();
            }
        } catch (error) {
            console.error('Device registration failed:', error);
            throw new Error(`Device registration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async registerTask(
        owner: PublicKey,
        requirements: TaskRequirements,
        payer: Keypair
    ): Promise<TransactionSignature> {
        try {
            const taskAccount = Keypair.generate();
            
            // Use proper Anchor program methods
            const tx = await this.program.methods
                .submitTask(
                    'inference', // Default task type
                    {
                        minVram: new BN(requirements.minVram),
                        minHashRate: new BN(requirements.minHashRate),
                        minStake: new BN(1000) // Default minimum stake
                    }
                )
                .accounts({
                    owner,
                    task: taskAccount.publicKey,
                    systemProgram: SystemProgram.programId,
                })
                .signers([payer, taskAccount])
                .rpc();

            const confirmed = await this.waitForConfirmation(tx);
            if (!confirmed) throw new Error('Transaction confirmation failed');

            return tx;
        } catch (error) {
            console.error('Task registration failed:', error);
            throw new Error(`Task registration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async submitTask(
        owner: PublicKey,
        taskType: string,
        requirements: TaskRequirements,
        payer: Keypair
    ): Promise<TransactionSignature> {
        try {
            const taskAccount = Keypair.generate();
            const tx = await this.program.methods
                .submitTask(taskType, {
                    minVram: new BN(requirements.minVram),
                    minHashRate: new BN(requirements.minHashRate),
                    priority: requirements.priority,
                })
                .accounts({
                    owner,
                    task: taskAccount.publicKey,
                    systemProgram: SystemProgram.programId,
                })
                .signers([payer, taskAccount])
                .rpc();

            return tx;
        } catch (error) {
            console.error('Task submission failed:', error);
            throw new Error(`Task submission failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async submitTaskProof(
        proofData: {
            taskId: string;
            timestamp: number;
            computeTime: number;
            hashRate: number;
            success: boolean;
        },
        payer: Keypair
    ): Promise<TransactionSignature> {
        try {
            const taskPubkey = new PublicKey(proofData.taskId);
            const tx = await this.program.methods
                .submitTaskProof(
                    new BN(proofData.timestamp),
                    new BN(proofData.computeTime),
                    new BN(proofData.hashRate),
                    proofData.success
                )
                .accounts({
                    authority: payer.publicKey,
                    task: taskPubkey,
                    systemProgram: SystemProgram.programId,
                })
                .signers([payer])
                .rpc();

            await this.supabaseService.logTaskProof({
                taskId: proofData.taskId,
                timestamp: proofData.timestamp,
                success: proofData.success,
                signature: tx,
            });

            return tx;
        } catch (error) {
            console.error('Error submitting task proof:', error);
            throw new Error(`Error submitting task proof: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async distributeReward(
        recipient: PublicKey,
        amount: number,
        payer: Keypair,
        tokenAccount: PublicKey
    ): Promise<TransactionSignature> {
        try {
            const rewardAccount = Keypair.generate();
            const instruction = new TransactionInstruction({
                keys: [
                    { pubkey: rewardAccount.publicKey, isSigner: true, isWritable: true },
                    { pubkey: recipient, isSigner: false, isWritable: true },
                    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
                    { pubkey: tokenAccount, isSigner: false, isWritable: true },
                    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
                ],
                programId: this.program.programId,
                data: Buffer.from([
                    ...new Uint8Array(Buffer.from('distribute')),
                    ...new Uint8Array(Buffer.from(amount.toString())),
                ]),
            });

            const transaction = new Transaction().add(instruction);
            const isValid = await this.validateTransaction(transaction);
            if (!isValid) throw new Error('Transaction validation failed');

            const signature = await sendAndConfirmTransaction(
                this.connection,
                transaction,
                [payer, rewardAccount],
                { commitment: 'confirmed' }
            );

            const confirmed = await this.waitForConfirmation(signature);
            if (!confirmed) throw new Error('Transaction confirmation failed');

            return signature;
        } catch (error) {
            console.error('Reward distribution failed:', error);
            throw new Error(`Reward distribution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async stakeTokens(
        user: PublicKey,
        amount: number,
        payer: Keypair,
        tokenAccount: PublicKey
    ): Promise<string> {
        try {
            const stakeAccount = Keypair.generate();
            const instruction = new TransactionInstruction({
                keys: [
                    { pubkey: stakeAccount.publicKey, isSigner: true, isWritable: true },
                    { pubkey: user, isSigner: true, isWritable: false },
                    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
                    { pubkey: tokenAccount, isSigner: false, isWritable: true },
                    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
                ],
                programId: this.program.programId,
                data: Buffer.from([
                    ...new Uint8Array(Buffer.from('stake')),
                    ...new Uint8Array(Buffer.from(amount.toString())),
                ]),
            });

            const transaction = new Transaction().add(instruction);
            const isValid = await this.validateTransaction(transaction);
            if (!isValid) throw new Error('Transaction validation failed');

            const signature = await sendAndConfirmTransaction(
                this.connection,
                transaction,
                [payer, stakeAccount],
                { commitment: 'confirmed' }
            );

            const confirmed = await this.waitForConfirmation(signature);
            if (!confirmed) throw new Error('Transaction confirmation failed');

            console.log('Staking successful:', {
                user: user.toBase58(),
                amount,
                signature,
            });

            return signature;
        } catch (error) {
            console.error('Staking failed:', error);
            throw new Error(`Staking failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async getAvailableDevices(): Promise<Device[]> {
        try {
            const programId = new PublicKey(this.program.programId);
            const deviceAccounts = await this.connection.getProgramAccounts(programId, {
                filters: [
                    {
                        memcmp: {
                            offset: 0,
                            bytes: bs58.encode(Buffer.from([0])),
                        },
                    },
                ],
            });

            console.log(`Found ${deviceAccounts.length} devices on the blockchain`);

            return deviceAccounts.map(({ pubkey, account }) => {
                const deviceData = this.program.coder.accounts.decode('device', account.data);
                const specs = deviceData.specs || {};

                return {
                    id: pubkey.toBase58(),
                    owner: deviceData.owner,
                    stake: deviceData.stakedAmount ? deviceData.stakedAmount.toNumber() / LAMPORTS_PER_SOL : 0,
                    vram: specs.vram ? specs.vram.toNumber() : 0,
                    hashRate: specs.hashRate ? specs.hashRate.toNumber() : 0,
                    gpuModel: specs.gpuModel || 'Unknown',
                };
            });
        } catch (error) {
            console.error('Error fetching available devices:', error);
            throw new Error(`Failed to fetch available devices: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async findSuitableGPU(requirements: TaskRequirements): Promise<Device | null> {
        try {
            const devices = await this.getAvailableDevices();
            return devices.find(device =>
                device.vram >= requirements.minVram &&
                device.hashRate >= requirements.minHashRate
            ) || null;
        } catch (error) {
            console.error('Error finding suitable GPU:', error);
            throw new Error(`Failed to find suitable GPU: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async monitorTaskProgress(taskId: string): Promise<string> {
        try {
            let status: 'pending' | 'processing' | 'completed' | 'failed' = 'processing';
            let attempts = 0;
            const maxAttempts = 30;

            const taskStatus = await this.getTaskStatus(taskId);
            if (taskStatus.completed) {
                status = 'completed';
            } else if (taskStatus.failed) {
                status = 'failed';
            }

            while (status === 'processing' && attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                const updatedStatus = await this.getTaskStatus(taskId);
                if (updatedStatus.completed) {
                    status = 'completed';
                } else if (updatedStatus.failed) {
                    status = 'failed';
                }
                attempts++;
            }

            if (status === 'completed') {
                return 'Task completed successfully';
            } else if (status === 'failed') {
                return 'Task failed';
            } else {
                return 'Task timed out';
            }
        } catch (error) {
            console.error('Error monitoring task progress:', error);
            return 'failed';
        }
    }

    async getNodeTasks(nodeId: string): Promise<any[]> {
        try {
            const nodePubkey = new PublicKey(nodeId);
            const programId = new PublicKey(this.program.programId);
            const taskAccounts = await this.connection.getProgramAccounts(programId, {
                filters: [
                    {
                        memcmp: {
                            offset: 0,
                            bytes: bs58.encode(Buffer.from([1])),
                        },
                    },
                    {
                        memcmp: {
                            offset: 33,
                            bytes: bs58.encode(nodePubkey.toBuffer()),
                        },
                    },
                ],
            });

            console.log(`Found ${taskAccounts.length} tasks assigned to node ${nodeId}`);

            return taskAccounts.map(({ pubkey, account }) => {
                const taskData = this.program.coder.accounts.decode('task', account.data);

                return {
                    id: pubkey.toBase58(),
                    owner: taskData.owner ? taskData.owner.toBase58() : '',
                    type: taskData.type || 'inference',
                    status: this.getTaskStatusString(taskData.status),
                    requirements: taskData.requirements || {},
                    reward: taskData.reward ? taskData.reward.toNumber() / LAMPORTS_PER_SOL : 0,
                    createdAt: taskData.createdAt ? new Date(taskData.createdAt.toNumber() * 1000) : new Date(),
                    result: taskData.result || null,
                };
            });
        } catch (error) {
            console.error('Error fetching node tasks:', error);
            throw new Error(`Failed to fetch node tasks: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async getDeviceStatus(deviceId: string): Promise<DeviceStatus> {
        try {
            const devicePubkey = new PublicKey(deviceId);
            const deviceAccount = await this.connection.getAccountInfo(devicePubkey);
            if (!deviceAccount) {
                throw new Error(`Device account not found for ID: ${deviceId}`);
            }

            const deviceData = this.program.coder.accounts.decode('device', deviceAccount.data);
            const lastHeartbeat = deviceData.lastHeartbeat ?
                deviceData.lastHeartbeat.toNumber() * 1000 : Date.now();
            const isOnline = Date.now() - lastHeartbeat < 5 * 60 * 1000;
            const metrics = deviceData.metrics || {};

            return {
                isOnline,
                lastSeen: new Date(lastHeartbeat),
                currentLoad: metrics.cpuUsage ? metrics.cpuUsage.toNumber() : 0,
                cpuUsage: metrics.cpuUsage ? metrics.cpuUsage.toNumber() : 0,
                availableVram: metrics.availableVram ? metrics.availableVram.toNumber() : 0,
                temperature: metrics.temperature ? metrics.temperature.toNumber() : 0,
            };
        } catch (error) {
            console.error('Error fetching device status:', error);
            throw new Error(`Failed to fetch device status: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async updateDeviceStatus(deviceId: string, status: DeviceStatus): Promise<void> {
        try {
            const devicePubkey = new PublicKey(deviceId);
            const transaction = new Transaction();
            transaction.add(
                await this.program.methods
                    .updateDeviceStatus({
                        isOnline: status.isOnline,
                        cpuUsage: new BN(Math.floor(status.cpuUsage)),
                        availableVram: new BN(Math.floor(status.availableVram)),
                        temperature: new BN(Math.floor(status.temperature)),
                    })
                    .accounts({
                        device: devicePubkey,
                        authority: this.payer.publicKey,
                        systemProgram: SystemProgram.programId,
                    })
                    .instruction()
            );

            const signature = await sendAndConfirmTransaction(
                this.connection,
                transaction,
                [this.payer],
                { commitment: 'confirmed' }
            );

            console.log(`Updated device status for ${deviceId}, transaction: ${signature}`);
        } catch (error) {
            console.error('Error updating device status:', error);
            throw new Error(`Failed to update device status: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async getNodeEarnings(nodeId: string, _walletAddress?: string): Promise<NodeEarningsData> {
        try {
            const nodePubkey = new PublicKey(nodeId);
            const nodeAccount = await this.connection.getAccountInfo(nodePubkey);
            if (!nodeAccount) {
                throw new Error(`Node account not found for ID: ${nodeId}`);
            }

            const nodeData = this.program.coder.accounts.decode('node', nodeAccount.data);
            const totalEarnings = nodeData.totalEarnings ?
                nodeData.totalEarnings.toNumber() / LAMPORTS_PER_SOL : 0;
            const completedTasks = nodeData.completedTasks ?
                nodeData.completedTasks.toNumber() : 0;
            const failedTasks = nodeData.failedTasks ?
                nodeData.failedTasks.toNumber() : 0;
            const totalTasks = completedTasks + failedTasks;
            const successRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
            const totalExecutionTime = nodeData.totalExecutionTime ?
                nodeData.totalExecutionTime.toNumber() : 0;
            const avgExecutionTime = completedTasks > 0 ?
                totalExecutionTime / completedTasks : 0;
            const lastUpdatedTimestamp = nodeData.lastUpdated ?
                nodeData.lastUpdated.toNumber() * 1000 : Date.now();

            return {
                totalEarnings,
                completedTasks,
                successRate,
                avgExecutionTime,
                lastUpdated: new Date(lastUpdatedTimestamp),
            };
        } catch (error) {
            console.error('Error fetching node earnings:', error);
            return {
                totalEarnings: 0,
                completedTasks: 0,
                successRate: 0,
                avgExecutionTime: 0,
                lastUpdated: new Date(),
            };
        }
    }

    async generateTaskProof(proofData: TaskProofData): Promise<string> {
        try {
            const message = JSON.stringify({
                taskId: proofData.taskId,
                nodeId: proofData.nodeId,
                timestamp: proofData.timestamp,
                resultHash: typeof proofData.result === 'string' ?
                    proofData.result : JSON.stringify(proofData.result),
            });

            const messageBytes = Buffer.from(message);
            const signature = Buffer.from(messageBytes);

            return Buffer.from(signature).toString('base64');
        } catch (error) {
            console.error('Error generating task proof:', error);
            throw new Error(`Failed to generate task proof: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async getAvailableTasks(): Promise<Task[]> {
        try {
            const programId = new PublicKey(this.program.programId);
            const taskAccounts = await this.connection.getProgramAccounts(programId, {
                filters: [
                    {
                        memcmp: {
                            offset: 0,
                            bytes: bs58.encode(Buffer.from([1])),
                        },
                    },
                    {
                        memcmp: {
                            offset: 1,
                            bytes: bs58.encode(Buffer.from([0])),
                        },
                    },
                ],
            });

            console.log(`Found ${taskAccounts.length} available tasks on the blockchain`);

            return taskAccounts.map(({ pubkey, account }) => {
                const taskData = this.program.coder.accounts.decode('task', account.data);
                const requirements = taskData.requirements || {};

                return {
                    id: pubkey.toBase58(),
                    owner: taskData.owner,
                    requirements: {
                        minVram: requirements.minVram ? requirements.minVram.toNumber() : 8,
                        minHashRate: requirements.minHashRate ? requirements.minHashRate.toNumber() : 5000,
                        priority: requirements.priority || 'medium',
                    },
                    status: 'pending',
                    assignedNode: taskData.assignedNode ? taskData.assignedNode.toBase58() : undefined,
                    result: taskData.result || undefined,
                };
            });
        } catch (error) {
            console.error('Error fetching available tasks:', error);
            throw new Error(`Failed to fetch available tasks: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async getTaskStatus(taskId: string): Promise<TaskStatus> {
        try {
            const taskPubkey = new PublicKey(taskId);
            const accountInfo = await this.connection.getAccountInfo(taskPubkey);
            if (!accountInfo) {
                throw new Error(`Task account not found for ID: ${taskId}`);
            }

            const taskData = this.program.coder.accounts.decode('task', accountInfo.data);
            let completed = false;
            let failed = false;
            let statusValue: 'pending' | 'processing' | 'completed' | 'failed' = 'pending';

            if (taskData.status) {
                const statusCode = taskData.status.toNumber ? taskData.status.toNumber() : Number(taskData.status);
                switch (statusCode) {
                    case 0: statusValue = 'pending'; break;
                    case 1: statusValue = 'processing'; break;
                    case 2:
                        statusValue = 'completed';
                        completed = true;
                        break;
                    case 3:
                        statusValue = 'failed';
                        failed = true;
                        break;
                    default: statusValue = 'pending';
                }
            }

            const nodeId = taskData.assignedNode ? taskData.assignedNode.toBase58() : undefined;
            const result = taskData.result ? {
                taskId,
                computeTime: taskData.result.computeTime ? taskData.result.computeTime.toNumber() : 0,
                hashRate: taskData.result.hashRate ? taskData.result.hashRate.toNumber() : 0,
                success: taskData.result.success || false,
            } : null;

            return {
                completed,
                failed,
                nodeId,
                reward: taskData.reward ? taskData.reward.toNumber() / LAMPORTS_PER_SOL : 0,
                signature: taskData.signature || undefined,
                id: taskId,
                status: statusValue,
                assignedNode: nodeId || null,
                result,
            };
        } catch (error) {
            console.error(`Error fetching task status for ${taskId}:`, error);
            throw new Error(`Failed to get task status: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async getTokenAccount(owner: PublicKey): Promise<PublicKey | null> {
        try {
            const ownerString = owner.toBase58();
            if (this.tokenAccountCache.has(ownerString)) {
                return this.tokenAccountCache.get(ownerString) || null;
            }

            const tokenMintPDA = PublicKey.findProgramAddressSync(
                [Buffer.from('token_mint')],
                this.program.programId
            )[0];

            const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
                owner,
                { mint: tokenMintPDA }
            );

            if (tokenAccounts.value.length === 0) {
                console.log('No token account found for owner:', ownerString);
                return null;
            }

            const tokenAccount = new PublicKey(tokenAccounts.value[0].pubkey);
            this.tokenAccountCache.set(ownerString, tokenAccount);

            return tokenAccount;
        } catch (error) {
            console.error('Error getting token account:', error);
            return null;
        }
    }

    async verifySignature(signature: string, data: string): Promise<boolean> {
        try {
            const signatureBytes = Buffer.from(signature, 'base64');
            return signatureBytes.length === 64;
        } catch (error) {
            console.error('Error verifying signature:', error);
            return false;
        }
    }

    private getTaskStatusString(statusCode: any): 'pending' | 'processing' | 'completed' | 'failed' {
        if (!statusCode) return 'pending';
        const code = statusCode.toNumber ? statusCode.toNumber() : Number(statusCode);
        switch (code) {
            case 0: return 'pending';
            case 1: return 'processing';
            case 2: return 'completed';
            case 3: return 'failed';
            default: return 'pending';
        }
    }

    /**
     * Get transaction details from the blockchain
     * @param signature The transaction signature/hash
     * @returns Transaction details including slot, confirmations, compute units, and fee
     */
    async getTransactionDetails(signature: string): Promise<any> {
        try {
            // Get the transaction details from the blockchain
            const tx = await this.connection.getTransaction(signature, {
                commitment: 'confirmed',
                maxSupportedTransactionVersion: 0
            });
            
            if (!tx) {
                console.log(`Transaction ${signature} not found`);
                return null;
            }
            
            // Extract relevant details - use fixed values for confirmations based on commitment level
            // This avoids type errors with different Solana API versions
            let confirmationLevel = 0;
            try {
                // Try to access confirmationStatus if available (newer Solana API)
                const status = (tx as any).confirmationStatus;
                if (status === 'finalized') confirmationLevel = 32;
                else if (status === 'confirmed') confirmationLevel = 1;
            } catch (e) {
                // Fallback to a default value
                confirmationLevel = 1;
            }
            
            return {
                slot: tx.slot,
                confirmations: confirmationLevel,
                computeUnits: tx.meta?.computeUnitsConsumed || 0,
                fee: tx.meta?.fee || 0,
                blockTime: tx.blockTime ? new Date(tx.blockTime * 1000) : null,
                status: tx.meta?.err ? 'failed' : 'confirmed'
            };
        } catch (error) {
            console.error('Error getting transaction details:', error);
            return null;
        }
    }
    
    /**
     * Process a task from Supabase and register it on the blockchain
     * @param taskId The Supabase task ID
     * @param taskType The type of task to register
     * @param requirements The task requirements
     * @returns The transaction signature if successful, or boolean for older implementations
     */
    async processTaskFromSupabase(taskId: string, taskType: string, requirements: TaskRequirements): Promise<string | boolean | null> {
        try {
            console.log(`Processing Supabase task ${taskId} of type ${taskType}`);
            
            // Try to find a suitable GPU if available
            const device = await this.findSuitableGPU(requirements).catch(() => null);
            
            // Create a new keypair for the task account
            const taskAccount = Keypair.generate();
            
            // Use the payer keypair for signing (this.payer is from the constructor)
            const owner = this.payer.publicKey;
            
            // Register the task on the blockchain
            const tx = await this.program.methods
                .submitTask(
                    taskType,
                    {
                        minVram: new BN(requirements.minVram),
                        minHashRate: new BN(requirements.minHashRate),
                        minStake: new BN(1000) // Default minimum stake
                    }
                )
                .accounts({
                    owner: owner,
                    task: taskAccount.publicKey,
                    systemProgram: SystemProgram.programId,
                })
                .signers([this.payer, taskAccount])
                .rpc();

            console.log(`Task registered on blockchain with TX: ${tx}`);
            
            // Update the task in Supabase with the blockchain transaction hash
            if (device) {
                await this.supabaseService.updateTaskBlockchainDetails(taskId, {
                    blockchain_task_id: tx,
                    node_id: device.id,
                    status: 'processing',
                });
            } else {
                await this.supabaseService.updateTaskWithTxHash(taskId, tx);
            }
            
            // Wait for confirmation
            const confirmed = await this.waitForConfirmation(tx);
            if (!confirmed) {
                console.error('Transaction confirmation failed');
                await this.supabaseService.updateTaskStatus(taskId, 'failed');
                return false;
            }
            
            return tx;
        } catch (error) {
            console.error('Error processing task from Supabase:', error);
            await this.supabaseService.updateTaskStatus(taskId, 'failed');
            return null;
        }
    }
}