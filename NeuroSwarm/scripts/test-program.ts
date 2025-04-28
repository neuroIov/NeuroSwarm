import { Connection, Keypair, PublicKey, Signer } from '@solana/web3.js';
import { ContractService } from '../src/services/ContractService';
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from '@solana/spl-token';

async function main() {
    // Connect to testnet
    const connection = new Connection('https://api.testnet.solana.com', 'confirmed');
    
    // Create test wallets
    const authority = Keypair.generate();
    const deviceOwner = Keypair.generate();
    const referrer = Keypair.generate();
    
    // Airdrop SOL to all wallets
    const wallets = [authority, deviceOwner, referrer];
    for (const wallet of wallets) {
        const airdropSignature = await connection.requestAirdrop(
            wallet.publicKey,
            1_000_000_000 // 1 SOL
        );
        await connection.confirmTransaction(airdropSignature, 'confirmed');
    }
    
    // Initialize contract services
    const authorityService = new ContractService(
        connection,
        {
            publicKey: authority.publicKey,
            signTransaction: async (tx) => {
                if ('partialSign' in tx) {
                    tx.partialSign(authority);
                } else {
                    tx.sign(authority);
                }
                return tx;
            },
            signAllTransactions: async (txs) => {
                txs.forEach(tx => {
                    if ('partialSign' in tx) {
                        tx.partialSign(authority);
                    } else {
                        tx.sign(authority);
                    }
                });
                return txs;
            }
        }
    );

    const deviceOwnerService = new ContractService(
        connection,
        {
            publicKey: deviceOwner.publicKey,
            signTransaction: async (tx) => {
                if ('partialSign' in tx) {
                    tx.partialSign(deviceOwner);
                } else {
                    tx.sign(deviceOwner);
                }
                return tx;
            },
            signAllTransactions: async (txs) => {
                txs.forEach(tx => {
                    if ('partialSign' in tx) {
                        tx.partialSign(deviceOwner);
                    } else {
                        tx.sign(deviceOwner);
                    }
                });
                return txs;
            }
        }
    );

    // Get program state
    console.log('Fetching program state...');
    const state: any = await authorityService.getState();
    console.log('Program state:', state);

    // Register a device
    console.log('\nRegistering device...');
    const devicePubkey = await deviceOwnerService.registerDevice(
        'NVIDIA RTX 4090',
        24576, // 24GB VRAM
        350, // 350 MH/s
        referrer.publicKey
    );
    console.log('Device registered:', devicePubkey.toBase58());

    // Create a task
    console.log('\nCreating task...');
    const taskPubkey = await authorityService.createTask(
        'test-task-1',
        {
            minVram: 16384, // 16GB
            minHashRate: 300,
            minStake: 1000
        }
    );
    console.log('Task created:', taskPubkey.toBase58());

    // Assign task to device
    console.log('\nAssigning task...');
    await authorityService.assignTask(taskPubkey, devicePubkey);
    console.log('Task assigned successfully');

    // Complete task
    console.log('\nCompleting task...');
    await authorityService.completeTask(taskPubkey, {
        success: true,
        data: 'Task completed successfully',
        error: undefined
    });
    console.log('Task completed');

    // Create token accounts for rewards
    console.log('\nCreating token accounts...');
    const deviceOwnerTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        deviceOwner,
        new PublicKey(state.tokenMint.toString()),
        deviceOwner.publicKey
    );
    const referrerTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        referrer,
        new PublicKey(state.tokenMint.toString()),
        referrer.publicKey
    );

    // Mint some tokens to reward pool for testing
    console.log('\nMinting tokens to reward pool...');
    await mintTo(
        connection,
        authority,
        new PublicKey(state.tokenMint.toString()),
        new PublicKey(state.rewardPool.toString()),
        authority,
        1_000_000_000_000 // 1000 tokens with 9 decimals
    );

    // Distribute rewards
    console.log('\nDistributing rewards...');
    await authorityService.distributeReward(
        devicePubkey,
        deviceOwnerTokenAccount.address,
        100_000_000_000, // 100 tokens
        referrerTokenAccount.address
    );
    console.log('Rewards distributed');

    // Update device status
    console.log('\nUpdating device status...');
    await deviceOwnerService.updateDeviceStatus(devicePubkey, false);
    console.log('Device status updated');

    // Stake tokens
    console.log('\nStaking tokens...');
    await deviceOwnerService.stakeTokens(
        devicePubkey,
        deviceOwnerTokenAccount.address,
        50_000_000_000 // 50 tokens
    );
    console.log('Tokens staked');

    // Claim referral rewards
    console.log('\nClaiming referral rewards...');
    await deviceOwnerService.claimReferralRewards(
        devicePubkey,
        deviceOwnerTokenAccount.address
    );
    console.log('Referral rewards claimed');

    // Final state check
    console.log('\nFinal program state:');
    const finalState = await authorityService.getState();
    console.log(finalState);

    const devices = await authorityService.getAllDevices();
    console.log('\nRegistered devices:', devices);
}

main().catch(console.error);
