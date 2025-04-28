const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.testnet' });

const PROGRAMS = ['device', 'task', 'reward', 'staking', 'gpu'];
const CONFIG_PATH = path.join(__dirname, '../config/deployment.json');

async function main() {
    console.log('Starting testnet deployment...');

    // Load deployment config
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    const testnetConfig = config.testnet;

    // Deploy each program
    for (const program of PROGRAMS) {
        console.log(`\nDeploying ${program} program...`);
        try {
            const output = execSync(
                `solana program deploy target/deploy/${program}.so --url ${testnetConfig.cluster}`,
                { stdio: 'inherit' }
            );

            // Update program ID in config
            const programId = output.toString().match(/Program Id: (.+)/)[1];
            testnetConfig.programs[program].programId = programId;
            
            console.log(`✓ ${program} program deployed successfully`);
            console.log(`Program ID: ${programId}`);
        } catch (error) {
            console.error(`Error deploying ${program} program:`, error);
            process.exit(1);
        }
    }

    // Save updated config
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 4));
    console.log('\nDeployment configuration updated successfully');

    // Deploy frontend
    console.log('\nDeploying frontend...');
    try {
        execSync('npm run build', { stdio: 'inherit' });
        console.log('✓ Frontend built successfully');
    } catch (error) {
        console.error('Error building frontend:', error);
        process.exit(1);
    }

    console.log('\nTestnet deployment completed successfully! 🚀');
    console.log('\nNext steps:');
    console.log('1. Run npm run init:testnet to initialize program state');
    console.log('2. Run npm run verify:testnet to verify the deployment');
}

main().catch(console.error);
