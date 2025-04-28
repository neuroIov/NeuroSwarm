const { Connection, PublicKey } = require('@solana/web3.js');
const { Program } = require('@project-serum/anchor');
require('dotenv').config({ path: '.env.testnet' });

async function main() {
    console.log('Verifying testnet deployment...');

    const connection = new Connection(process.env.SOLANA_RPC_ENDPOINT);

    // Verify each program
    const programs = ['device', 'task', 'reward', 'staking', 'gpu'];
    let allValid = true;

    for (const programName of programs) {
        console.log(`\nVerifying ${programName} program...`);
        try {
            const programId = new PublicKey(process.env[`PROGRAM_ID_${programName.toUpperCase()}`]);
            
            // Check if program exists
            const programInfo = await connection.getAccountInfo(programId);
            if (!programInfo) {
                throw new Error(`Program not found at ${programId}`);
            }

            // Check if program is executable
            if (!programInfo.executable) {
                throw new Error(`Program at ${programId} is not executable`);
            }

            // Load program and check if it's accessible
            const program = new Program(
                require(`../target/idl/${programName}.json`),
                programId,
                { connection }
            );

            // Try to fetch program state
            const state = await program.account.state.fetch(
                (await PublicKey.findProgramAddress(
                    [Buffer.from('state')],
                    programId
                ))[0]
            );

            console.log(`✓ ${programName} program verified successfully`);
            console.log('Program state:', state);
        } catch (error) {
            console.error(`✗ Error verifying ${programName} program:`, error);
            allValid = false;
        }
    }

    if (allValid) {
        console.log('\nAll programs verified successfully! 🎉');
        console.log('\nYour deployment is ready for testing.');
        console.log('Run npm run test:testnet to execute the test suite');
    } else {
        console.error('\n❌ Some programs failed verification');
        console.log('Please check the errors above and fix any issues');
        process.exit(1);
    }
}

main().catch(console.error);
