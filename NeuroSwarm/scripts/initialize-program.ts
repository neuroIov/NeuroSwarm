import { Connection, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { ContractService } from '../src/services/ContractService';
import { Wallet } from '@project-serum/anchor';

async function main() {
    // Connect to devnet
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    
    // Load the wallet keypair and create AnchorWallet
    const walletKeypairData = require('../wallet-keypair.json');
    const keypair = Keypair.fromSecretKey(Uint8Array.from(walletKeypairData));
    // Create a Wallet instance
    const wallet: Wallet = {
        publicKey: keypair.publicKey,
        payer: keypair,
        signTransaction: async (tx) => {
            tx.partialSign(keypair);
            return tx;
        },
        signAllTransactions: async (txs) => {
            txs.forEach(tx => tx.partialSign(keypair));
            return txs;
        }
    };
    
    // Check balance first
    let balance = await connection.getBalance(wallet.publicKey);
    console.log('Current balance:', balance / LAMPORTS_PER_SOL, 'SOL');
    
    if (balance < LAMPORTS_PER_SOL) {
        console.log('Balance too low, attempting to airdrop...');
        try {
            const airdropSignature = await connection.requestAirdrop(
                wallet.publicKey,
                1_000_000_000 // 1 SOL
            );
            await connection.confirmTransaction(airdropSignature, 'confirmed');
            balance = await connection.getBalance(wallet.publicKey);
            console.log('New balance:', balance / LAMPORTS_PER_SOL, 'SOL');
        } catch (error) {
            console.error('Failed to airdrop SOL:', error);
            console.log('Please fund this address manually:', wallet.publicKey.toString());
            process.exit(1);
        }
    }
    
    // Initialize contract service with program ID
    const PROGRAM_ID = 'Cxkf3LNezaq4NiHMaXom1KiKDUPky1o8xL2WXgfHWxWN';
    console.log('Using program ID:', PROGRAM_ID);

    const contractService = new ContractService(
        connection,
        {
            publicKey: wallet.publicKey,
            signTransaction: async (tx) => {
                tx.partialSign(wallet.payer);
                return tx;
            },
            signAllTransactions: async (txs) => {
                txs.forEach(tx => tx.partialSign(wallet.payer));
                return txs;
            },
            payer: wallet.payer
        },
        PROGRAM_ID
    );

    try {
        // Initialize program state
        console.log('Initializing program state...');
        const state = await contractService.initialize();
        console.log('Program state:', state);

        // Try to register a test device
        try {
            console.log('Registering test device...');
            await contractService.registerDevice(
                'NVIDIA RTX 4090',
                24, // 24GB VRAM
                450 // 450 MH/s hashrate
            );
            console.log('Test device registered successfully');
        } catch (deviceError: any) {
            if (deviceError?.message?.includes('already exists')) {
                console.log('Test device already registered');
            } else {
                console.error('Error registering device:', deviceError);
            }
        }
    } catch (error) {
        console.error('Error during initialization:', error);
        // Log detailed error information
        if (error instanceof Error) {
            console.error('Error details:', {
                name: error.name,
                message: error.message,
                stack: error.stack
            });
        }
        process.exit(1);
    }
    console.log('Initialization complete!');
    process.exit(0);
}

main().catch(console.error);
