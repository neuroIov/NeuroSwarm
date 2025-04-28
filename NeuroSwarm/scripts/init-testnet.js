const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { Program } = require('@project-serum/anchor');
require('dotenv').config({ path: '.env.testnet' });

async function main() {
    console.log('Initializing testnet state...');

    const connection = new Connection(process.env.SOLANA_RPC_ENDPOINT);
    const wallet = Keypair.fromSecretKey(
        Buffer.from(JSON.parse(process.env.WALLET_PRIVATE_KEY))
    );

    // Initialize each program's state
    const programs = ['device', 'task', 'reward', 'staking', 'gpu'];
    
    for (const programName of programs) {
        console.log(`\nInitializing ${programName} program...`);
        try {
            const programId = new PublicKey(process.env[`PROGRAM_ID_${programName.toUpperCase()}`]);
            const program = new Program(
                require(`../target/idl/${programName}.json`),
                programId,
                { connection, wallet }
            );

            // Initialize program state with default values
            await program.methods
                .initialize()
                .accounts({
                    authority: wallet.publicKey,
                })
                .rpc();

            console.log(`✓ ${programName} program initialized successfully`);
        } catch (error) {
            console.error(`Error initializing ${programName} program:`, error);
            process.exit(1);
        }
    }

    console.log('\nProgram state initialization completed successfully! 🎉');
    console.log('\nNext step: Run npm run verify:testnet to verify the initialization');
}

main().catch(console.error);
