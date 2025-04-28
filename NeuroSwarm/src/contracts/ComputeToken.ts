import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, createMint, mintTo, getOrCreateAssociatedTokenAccount } from '@solana/spl-token';

interface ProofResult {
    operations?: number;
    iterations?: number;
    dataSize?: number;
}

interface ProofData {
    signature: string;
    timestamp: number;
    nodeKey: string;
    taskId: string;
    result: ProofResult;
    nonce?: string;
    taskType?: string;
}

interface TokenEvent {
    type: 'mint' | 'stake' | 'unstake' | 'slash' | 'pause' | 'resume';
    timestamp: number;
    data: any;
}

interface NodeReputation {
    score: number;
    taskCount: number;
    successCount: number;
    failureCount: number;
    lastActive: number;
    consecutiveFailures: number;
    isBanned: boolean;
    banExpiry?: number;
    lastReputationUpdate: number;
    lastPenaltyTime?: number;
}

interface VestingSchedule {
    recipient: PublicKey;
    amount: number;
    startTime: number;
    cliffPeriod: number;
    vestingPeriod: number;
    released: number;
}

export class ComputeToken {
    private connection: Connection;
    private authority: Keypair;
    private mint!: PublicKey;
    private lastMintTime: Map<string, number> = new Map();
    private isPaused: boolean = false;
    private pauseGuardian: PublicKey;
    private multisigAuthorities: PublicKey[] = [];
    private requiredSignatures: number = 2;
    private usedNonces: Set<string> = new Set();
    private eventHistory: TokenEvent[] = [];
    private slashingHistory: any[] = [];
    private mintLimits = {
        perTransaction: 100,
        hourly: 1000,
        daily: 10000,
        minStake: 1000,
        maxStake: 100000,
        slashingPenalty: 0.1,
        cooldownPeriod: 24 * 60 * 60 * 1000,
        minProofAge: 60000,
        maxProofAge: 3600000
    };

    private nodeReputation: Map<string, NodeReputation> = new Map();
    private tasks: Array<{
        id: string;
        status: 'pending' | 'completed' | 'failed';
        complexity: number;
        timestamp: number;
        nodeKey: string;
        proof?: Buffer;
    }> = [];
    private stakeBalances: Map<string, number> = new Map();
    private vestingSchedules: Map<string, VestingSchedule> = new Map();

    constructor(
        connection: Connection,
        authority: Keypair,
        pauseGuardian?: PublicKey,
        multisigAuthorities?: PublicKey[],
        requiredSignatures?: number
    ) {
        this.connection = connection;
        this.authority = authority;
        this.pauseGuardian = pauseGuardian || authority.publicKey;

        if (multisigAuthorities) {
            this.multisigAuthorities = multisigAuthorities;
            this.requiredSignatures = requiredSignatures || 2;
            if (this.requiredSignatures > this.multisigAuthorities.length) {
                throw new Error('Required signatures cannot exceed number of authorities');
            }
        }
    }

    private validateTaskComplexity(result: ProofResult): number {
        if (!result) return 0;

        const { operations = 0, iterations = 0, dataSize = 0 } = result;

        if (operations < 0 || iterations < 0 || dataSize < 0) return 0;

        const operationsScore = Math.min(100, operations / 1000);
        const iterationsScore = Math.min(100, iterations / 100);
        const dataSizeScore = Math.min(100, dataSize / 1024);

        const weightedScore = (operationsScore * 0.5) + (iterationsScore * 0.3) + (dataSizeScore * 0.2);
        return Math.max(1, Math.min(100, Math.round(weightedScore)));
    }

    private async verifyCustomSignature(signature: string, message: Buffer, publicKey: PublicKey): Promise<boolean> {
        try {
            const signatureBuffer = Buffer.from(signature, 'base64');
            return signatureBuffer.length === 64 && message.length > 0; // Simplified verification
        } catch (error) {
            console.error('Error verifying signature:', error);
            return false;
        }
    }

    private isProofData(data: unknown): data is ProofData {
        if (typeof data !== 'object' || data === null) return false;
        const d = data as Partial<ProofData>;
        return typeof d.signature === 'string' &&
            typeof d.timestamp === 'number' &&
            typeof d.nodeKey === 'string' &&
            typeof d.taskId === 'string' &&
            d.result !== undefined &&
            (d.nonce === undefined || typeof d.nonce === 'string') &&
            (d.taskType === undefined || typeof d.taskType === 'string');
    }

    private async verifyComputeProof(proof: Buffer): Promise<boolean> {
        let currentProofData: ProofData | null = null;

        try {
            if (!proof || proof.length === 0 || proof.length > 1024 * 1024) {
                throw new Error('Invalid proof: empty or too large');
            }

            let parsedData: unknown;
            parsedData = JSON.parse(proof.toString());
            if (!this.isProofData(parsedData)) {
                throw new Error('Invalid proof format');
            }
            currentProofData = parsedData;

            // Check nonce for replay attack prevention
            if (!currentProofData.nonce || this.usedNonces.has(currentProofData.nonce)) {
                throw new Error('Invalid or reused nonce');
            }

            const now = Date.now();
            if (currentProofData.timestamp > now || currentProofData.timestamp < now - this.mintLimits.maxProofAge) {
                throw new Error('Invalid proof: timestamp out of range');
            }

            const nodeRep = this.nodeReputation.get(currentProofData.nodeKey);
            if (!nodeRep || nodeRep.isBanned) {
                throw new Error('Invalid proof: node not authorized or banned');
            }

            const message = Buffer.from(`${currentProofData.taskId}:${JSON.stringify(currentProofData.result)}:${currentProofData.timestamp}:${currentProofData.nonce}`);
            if (!await this.verifyCustomSignature(currentProofData.signature, message, new PublicKey(currentProofData.nodeKey))) {
                throw new Error('Invalid proof: signature verification failed');
            }

            const taskComplexity = this.validateTaskComplexity(currentProofData.result);
            if (taskComplexity === 0) {
                throw new Error('Invalid proof: task complexity validation failed');
            }

            const signatureStatus = await this.connection.getSignatureStatus(Buffer.from(currentProofData.signature, 'base64').toString('base64'));
            if (!signatureStatus?.value?.confirmationStatus || signatureStatus.value.confirmationStatus !== 'finalized') {
                return false;
            }

            // Store used nonce
            this.usedNonces.add(currentProofData.nonce!);

            await this.validateAndUpdateReputation(currentProofData.nodeKey, true, taskComplexity);
            return true;

        } catch (error) {
            console.error('Proof verification failed:', error);
            if (currentProofData?.nodeKey) {
                await this.validateAndUpdateReputation(currentProofData.nodeKey, false, 0);
            }
            return false;
        }
    }

    private async validateAndUpdateReputation(nodeKey: string, taskSuccess: boolean, taskComplexity: number): Promise<void> {
        let nodeRep = this.nodeReputation.get(nodeKey) || {
            score: 50,
            taskCount: 0,
            successCount: 0,
            failureCount: 0,
            lastActive: Date.now(),
            consecutiveFailures: 0,
            isBanned: false,
            banExpiry: 0,
            lastReputationUpdate: Date.now()
        };

        nodeRep.taskCount++;
        nodeRep.lastActive = Date.now();
        nodeRep.lastReputationUpdate = Date.now();

        if (taskSuccess) {
            nodeRep.successCount++;
            nodeRep.consecutiveFailures = 0;
            const complexityBonus = Math.min(taskComplexity / 100, 5);
            nodeRep.score = Math.min(100, nodeRep.score + complexityBonus);

            if (nodeRep.isBanned && nodeRep.banExpiry && Date.now() > nodeRep.banExpiry) {
                nodeRep.isBanned = false;
                nodeRep.banExpiry = 0;
                nodeRep.score = 50;
            }
        } else {
            nodeRep.failureCount++;
            nodeRep.consecutiveFailures++;

            const penalty = (taskComplexity / 50) * (1 + nodeRep.consecutiveFailures * 0.5);
            nodeRep.score = Math.max(0, nodeRep.score - penalty);

            if (nodeRep.score < 20) {
                await this.penalizeNode(nodeKey);
            }

            if (nodeRep.consecutiveFailures >= 5 || nodeRep.score < 10) {
                nodeRep.isBanned = true;
                nodeRep.banExpiry = Date.now() + (24 * 60 * 60 * 1000);
            }
        }

        this.nodeReputation.set(nodeKey, nodeRep);
    }

    private recordEvent(type: TokenEvent['type'], data: unknown) {
        this.eventHistory.push({ type, timestamp: Date.now(), data });
    }

    private async validateMultisig(signatures: Buffer[]): Promise<boolean> {
        if (!this.multisigAuthorities.length) return true;
        if (signatures.length < this.requiredSignatures) return false;

        let validCount = 0;
        const message = Buffer.from('authorize_action');

        for (const signature of signatures) {
            for (const authority of this.multisigAuthorities) {
                const isValid = await this.verifyCustomSignature(
                    signature.toString('base64'),
                    message,
                    authority
                );
                if (isValid) {
                    validCount++;
                    break;
                }
            }
        }

        return validCount >= this.requiredSignatures;
    }

    private async penalizeNode(nodeKey: string): Promise<void> {
        const stake = this.stakeBalances.get(nodeKey) ?? 0;
        if (stake > 0) {
            const penaltyConfig = {
                basePenalty: this.mintLimits.slashingPenalty,
                maxPenalty: 0.5, // Max 50% penalty
                cooldown: 24 * 60 * 60 * 1000, // 24 hours
                minPenalty: 0.05 // Minimum 5% penalty
            };

            let effectivePenalty = penaltyConfig.basePenalty;
            const lastPenalty = this.nodeReputation.get(nodeKey)?.lastPenaltyTime;
            if (lastPenalty && (Date.now() - lastPenalty) < penaltyConfig.cooldown) {
                effectivePenalty = Math.min(effectivePenalty * 1.5, penaltyConfig.maxPenalty);
            }

            effectivePenalty = Math.max(effectivePenalty, penaltyConfig.minPenalty);
            const penaltyAmount = Math.min(stake, stake * effectivePenalty);

            this.stakeBalances.set(nodeKey, stake - penaltyAmount);

            this.slashingHistory.push({
                nodeKey,
                amount: penaltyAmount,
                timestamp: Date.now(),
                remainingStake: stake - penaltyAmount,
                penaltyPercentage: effectivePenalty
            });

            const nodeRep = this.nodeReputation.get(nodeKey);
            if (nodeRep) {
                nodeRep.lastPenaltyTime = Date.now();
                this.nodeReputation.set(nodeKey, nodeRep);
            }

            const data = Buffer.from([3, ...new Uint8Array(new Float64Array([penaltyAmount]).buffer)]); // 3 = slash
            await this.connection.sendTransaction(
                new Transaction().add(new TransactionInstruction({
                    keys: [
                        { pubkey: new PublicKey(nodeKey), isSigner: false, isWritable: true },
                        { pubkey: this.mint, isSigner: false, isWritable: true }
                    ],
                    programId: TOKEN_PROGRAM_ID,
                    data
                })),
                [this.authority]
            );
        }
    }

    async emergencyPause(caller: Keypair, signatures: Buffer[]): Promise<void> {
        if (!caller.publicKey.equals(this.pauseGuardian)) {
            throw new Error('Only pause guardian can initiate pause');
        }

        if (!await this.validateMultisig(signatures)) {
            throw new Error('Insufficient multisig signatures');
        }

        this.isPaused = true;

        await this.connection.sendTransaction(
            new Transaction().add(new TransactionInstruction({
                keys: [{ pubkey: this.mint, isSigner: false, isWritable: true }],
                programId: TOKEN_PROGRAM_ID,
                data: Buffer.from([0]) // 0 = pause
            })),
            [caller]
        );

        this.recordEvent('pause', { initiator: caller.publicKey.toBase58(), signaturesCount: signatures.length });
    }

    async emergencyResume(caller: Keypair, signatures: Buffer[]): Promise<void> {
        if (!caller.publicKey.equals(this.pauseGuardian)) {
            throw new Error('Only pause guardian can initiate resume');
        }

        if (!await this.validateMultisig(signatures)) {
            throw new Error('Insufficient multisig signatures');
        }

        this.isPaused = false;

        await this.connection.sendTransaction(
            new Transaction().add(new TransactionInstruction({
                keys: [{ pubkey: this.mint, isSigner: false, isWritable: true }],
                programId: TOKEN_PROGRAM_ID,
                data: Buffer.from([1]) // 1 = resume
            })),
            [caller]
        );

        this.recordEvent('resume', { initiator: caller.publicKey.toBase58(), signaturesCount: signatures.length });
    }

    async initialize(): Promise<void> {
        this.mint = await createMint(
            this.connection,
            this.authority,
            this.authority.publicKey,
            this.authority.publicKey,
            9,
            undefined,
            { commitment: 'finalized', preflightCommitment: 'finalized' },
            TOKEN_PROGRAM_ID
        );

        this.recordEvent('mint', {
            action: 'initialize',
            mint: this.mint.toBase58(),
            authority: this.authority.publicKey.toBase58(),
            multisigEnabled: this.multisigAuthorities.length > 0
        });
    }

    async mintTokens(recipient: PublicKey, amount: number, proof?: Buffer): Promise<string> {
        if (!recipient) throw new Error('Invalid recipient');
        if (!amount || amount <= 0 || amount > this.mintLimits.perTransaction) throw new Error(`Invalid amount`);
        if (!Number.isInteger(amount)) throw new Error('Amount must be an integer');
        if (this.isPaused) throw new Error('Contract is paused');
        if (!this.mint) throw new Error('Token not initialized');

        if (!proof) throw new Error('Compute proof required');
        if (!await this.verifyComputeProof(proof)) throw new Error('Invalid compute proof');

        const proofData = JSON.parse(proof.toString());
        const taskComplexity = this.validateTaskComplexity(proofData.result);
        if (amount > taskComplexity * 100) throw new Error(`Mint amount exceeds maximum allowed: ${taskComplexity * 100}`);

        const recipientStr = recipient.toBase58();
        const now = Date.now();
        if (now - (this.lastMintTime.get(recipientStr) || 0) < 60000) throw new Error('Rate limit exceeded');

        const hourlyTotal = await this.getHourlyMintTotal(recipientStr);
        if (hourlyTotal + amount > this.mintLimits.hourly) throw new Error('Hourly limit exceeded');

        const dailyTotal = await this.getDailyMintTotal(recipientStr);
        if (dailyTotal + amount > this.mintLimits.daily) throw new Error('Daily limit exceeded');

        // Check vesting schedule
        const vesting = this.vestingSchedules.get(recipientStr);
        if (vesting) {
            const elapsed = now - vesting.startTime;
            const totalVestingPeriod = vesting.vestingPeriod + vesting.cliffPeriod;
            const vestedAmount = Math.min(vesting.amount, vesting.amount * (elapsed / totalVestingPeriod));
            if (vestedAmount - vesting.released < amount) {
                throw new Error('Insufficient vested tokens');
            }
            vesting.released += amount;
            this.vestingSchedules.set(recipientStr, vesting);
        }

        const recipientAccount = await getOrCreateAssociatedTokenAccount(
            this.connection,
            this.authority,
            this.mint,
            recipient
        );

        const signature = await mintTo(
            this.connection,
            this.authority,
            this.mint,
            recipientAccount.address,
            this.authority,
            amount,
            [],
            undefined,
            TOKEN_PROGRAM_ID
        );

        this.stakeBalances.set(recipientStr, (this.stakeBalances.get(recipientStr) || 0) + amount);
        this.lastMintTime.set(recipientStr, now);

        return signature;
    }

    async createVestingSchedule(recipient: PublicKey, amount: number, cliffPeriod: number, vestingPeriod: number): Promise<void> {
        const recipientStr = recipient.toBase58();
        const startTime = Date.now();

        this.vestingSchedules.set(recipientStr, {
            recipient,
            amount,
            startTime,
            cliffPeriod,
            vestingPeriod,
            released: 0
        });

        this.recordEvent('stake', {
            action: 'createVesting',
            recipient: recipientStr,
            amount,
            cliffPeriod,
            vestingPeriod
        });
    }

    async getNodeReputationStats(): Promise<NodeReputation[]> {
        return Array.from(this.nodeReputation.values());
    }

    async getRecentTasks(limit: number = 100): Promise<{
        id: string;
        status: 'pending' | 'completed' | 'failed';
        complexity?: number;
        timestamp: number;
    }[]> {
        return this.tasks
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, limit)
            .map(({ nodeKey, ...task }) => task);
    }

    getMintAddress(): PublicKey {
        if (!this.mint) throw new Error('Token not initialized');
        return this.mint;
    }

    private async getHourlyMintTotal(userPubkey: string): Promise<number> {
        const hourAgo = Date.now() - 3600000;
        const signatures = await this.connection.getSignaturesForAddress(this.mint, { until: hourAgo.toString(), limit: 100 });
        return signatures.filter(sig => sig.memo?.includes(userPubkey)).length * 100;
    }

    private async getDailyMintTotal(userPubkey: string): Promise<number> {
        const dayAgo = Date.now() - 86400000;
        const signatures = await this.connection.getSignaturesForAddress(this.mint, { until: dayAgo.toString(), limit: 1000 });
        return signatures.filter(sig => sig.memo?.includes(userPubkey)).length * 100;
    }
}