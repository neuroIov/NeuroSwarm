const { Connection, PublicKey } = require('@solana/web3.js');
require('dotenv').config({ path: '.env.testnet' });

async function main() {
    console.log('Starting testnet monitoring...');

    const connection = new Connection(process.env.SOLANA_RPC_ENDPOINT);
    const programs = ['device', 'task', 'reward', 'staking', 'gpu'];

    // Monitor program activity
    for (const programName of programs) {
        const programId = new PublicKey(process.env[`PROGRAM_ID_${programName.toUpperCase()}`]);
        
        console.log(`\nMonitoring ${programName} program (${programId})...`);

        // Subscribe to program account changes
        connection.onProgramAccountChange(
            programId,
            (accountInfo, context) => {
                console.log(`\n[${new Date().toISOString()}] ${programName} program activity detected:`);
                console.log('Account:', accountInfo.accountId.toBase58());
                console.log('Updated data:', accountInfo.accountInfo.data);
                console.log('Slot:', context.slot);
            },
            'confirmed'
        );
    }

    // Keep the process running
    console.log('\nMonitoring active. Press Ctrl+C to stop.');
    process.stdin.resume();
}

main().catch(console.error);
