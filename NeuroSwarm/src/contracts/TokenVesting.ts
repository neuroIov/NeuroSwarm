import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, createMint, mintTo, getOrCreateAssociatedTokenAccount } from '@solana/spl-token';

export interface VestingSchedule {
    startTimestamp: number;  // Vesting start time
    cliffDuration: number;   // Cliff duration in seconds
    duration: number;        // Total vesting duration in seconds
    interval: number;        // Release interval in seconds
    amount: bigint;         // Total amount to vest
    released: bigint;       // Amount already released
}

export class TokenVesting {
    private connection: Connection;
    private authority: Keypair;
    private mint: PublicKey;
    private schedules: Map<string, VestingSchedule> = new Map();
    private emergencyPaused: boolean = false;
    
    constructor(connection: Connection, authority: Keypair, mint: PublicKey) {
        this.connection = connection;
        this.authority = authority;
        this.mint = mint;
    }

    async createVestingSchedule(
        beneficiary: PublicKey,
        startTimestamp: number,
        cliffDuration: number,
        duration: number,
        interval: number,
        amount: bigint
    ): Promise<boolean> {
        if (this.emergencyPaused) {
            throw new Error('Vesting is paused for emergency');
        }

        if (duration < cliffDuration) {
            throw new Error('Duration must be greater than cliff');
        }

        if (duration % interval !== 0) {
            throw new Error('Duration must be divisible by interval');
        }

        const schedule: VestingSchedule = {
            startTimestamp,
            cliffDuration,
            duration,
            interval,
            amount,
            released: BigInt(0)
        };

        this.schedules.set(beneficiary.toBase58(), schedule);
        return true;
    }

    async releaseTokens(beneficiary: PublicKey): Promise<bigint> {
        if (this.emergencyPaused) {
            throw new Error('Vesting is paused for emergency');
        }

        const schedule = this.schedules.get(beneficiary.toBase58());
        if (!schedule) {
            throw new Error('No vesting schedule found for beneficiary');
        }

        const releasable = await this.calculateReleasableAmount(schedule);
        if (releasable <= BigInt(0)) {
            return BigInt(0);
        }

        // Create or get beneficiary's token account
        const tokenAccount = await getOrCreateAssociatedTokenAccount(
            this.connection,
            this.authority,
            this.mint,
            beneficiary
        );

        // Create mint instruction
        const mintIx = mintTo(
            this.mint,
            tokenAccount.address,
            this.authority.publicKey,
            Number(releasable),
            [this.authority]
        );

        // Send transaction
        const tx = new Transaction().add(mintIx);
        await this.connection.sendTransaction(tx, [this.authority]);

        // Update released amount
        schedule.released += releasable;
        this.schedules.set(beneficiary.toBase58(), schedule);

        return releasable;
    }

    private async calculateReleasableAmount(schedule: VestingSchedule): Promise<bigint> {
        const currentTime = Math.floor(Date.now() / 1000);
        
        if (currentTime < schedule.startTimestamp + schedule.cliffDuration) {
            return BigInt(0);
        }

        if (currentTime >= schedule.startTimestamp + schedule.duration) {
            return schedule.amount - schedule.released;
        }

        const timeFromStart = currentTime - schedule.startTimestamp;
        const vestedIntervals = Math.floor(timeFromStart / schedule.interval);
        const vestedAmount = (schedule.amount * BigInt(vestedIntervals) * BigInt(schedule.interval)) / BigInt(schedule.duration);
        
        return vestedAmount - schedule.released;
    }

    async emergencyPause(): Promise<void> {
        this.emergencyPaused = true;
    }

    async emergencyUnpause(): Promise<void> {
        this.emergencyPaused = false;
    }

    async getVestingSchedule(beneficiary: PublicKey): Promise<VestingSchedule | null> {
        return this.schedules.get(beneficiary.toBase58()) || null;
    }

    async getTotalVestedAmount(beneficiary: PublicKey): Promise<bigint> {
        const schedule = this.schedules.get(beneficiary.toBase58());
        if (!schedule) {
            return BigInt(0);
        }
        return schedule.released;
    }
}
