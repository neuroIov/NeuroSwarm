import { Connection, Keypair } from '@solana/web3.js';
import { ContractService } from '../services/ContractService';
import NodeWallet from '@project-serum/anchor/dist/cjs/nodewallet';

async function main() {
    // Connect to devnet
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    
    // Load wallet from file
    const wallet = new NodeWallet(Keypair.generate()); // For testing, we'll use a new wallet
    
    // Get some SOL for testing
    const airdropSignature = await connection.requestAirdrop(wallet.publicKey, 2000000000); // 2 SOL
    await connection.confirmTransaction(airdropSignature, 'confirmed');
    
    // Wait for a bit to ensure the airdrop is fully confirmed
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log('Using wallet:', wallet.publicKey.toBase58());
    
    // Initialize contract service
    const contractService = new ContractService(connection, wallet);
    
    try {
        // Initialize the program
        await contractService.initialize();
        console.log('Program initialized successfully');
        
        // Get state to verify
        const state = await contractService.getState();
        console.log('Program state:', state);
        
    } catch (error) {
        console.error('Error:', error);
    }
}

main().catch(console.error);
