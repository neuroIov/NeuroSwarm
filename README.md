# neuroSwarm

A decentralized AI compute network on Solana blockchain.

## Overview

neuroSwarm is a "connect-to-earn" platform that enables users to contribute their computational resources to a decentralized network and earn rewards. The platform leverages Solana blockchain for fast and low-cost transactions, ensuring efficient reward distribution and transparent operations.

## Features

- **Dashboard**: Interactive dashboard to monitor network statistics, tasks, devices, and earnings
- **Wallet Integration**: Connect your Solana wallet to participate in the network
- **Device Management**: Register and manage your compute devices
- **Task Scheduling**: Accept and complete AI compute tasks to earn rewards
- **Earnings Tracking**: Monitor your earnings and view historical data

## Project Structure

```
.
├── FAQ.md                 # Frequently asked questions
├── YELLOW_PAPER.md        # Technical overview and protocol design
├── NeuroSwarm/            # Web app (front-end & back-end)
│   ├── src/               # React components, core logic & config
│   │   ├── core/          # Node stores & ComputeNode class
│   │   ├── components/    # UI components (EarningsPanel, etc.)
│   │   ├── services/      # Solana & Supabase integration services
│   │   ├── hooks/         # Custom React hooks (e.g. useReferralCode)
│   │   ├── providers/     # Context providers (NetworkProvider)
│   │   ├── utils/         # Utility modules (logger)
│   │   └── config/        # Environment & app configuration
│   ├── public/            # Static assets (images, icons, etc.)
│   ├── server/            # Server code & database connection (db.ts)
│   ├── index.html         # HTML entry point for the app
│   ├── package.json       # App dependencies & scripts
│   └── tsconfig.json      # TypeScript config for the app
├── swarm_network/         # On-chain Anchor smart contract project
│   ├── programs/          # Rust programs for Solana
│   ├── migrations/        # Anchor migrations
│   ├── idl.json           # Program IDL (JSON)
│   ├── tests/             # Smart contract tests
│   └── package.json       # Anchor project config
└── README.md              # This README file
```

## Getting Started

### Prerequisites

- Node.js (for development)
- Python 3.x (for the server)

### Installation

1. Clone the repository:

   ```
   git clone https://github.com/yourusername/neuroSwarm.git
   cd neuroSwarm
   ```

2. Install dependencies:

   ```
   npm install
   ```

3. Set up environment variables in a `.env` file:
   ```
   VITE_NETWORK=testnet
   VITE_PROGRAM_ID=ComputeNtwrk11111111111111111111111111111
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_KEY=your_supabase_key
   PORT=5173
   ```

### Running the Application

#### Local Development

1. Start the development server:
   ```bash
   npm run dev
   ```

#### Testnet Deployment

1. Configure your Solana wallet:

   ```bash
   solana config set --url https://api.testnet.solana.com
   solana config set --keypair path/to/your/keypair.json
   ```

2. Set up environment variables:

   ```bash
   cp .env.testnet .env
   # Edit .env with your specific configuration
   ```

3. Build and deploy programs:

   ```bash
   # Build programs
   cd programs
   cargo build-bpf

   # Deploy programs
   solana program deploy target/deploy/device.so
   solana program deploy target/deploy/task.so
   solana program deploy target/deploy/reward.so
   solana program deploy target/deploy/staking.so
   solana program deploy target/deploy/gpu.so
   ```

4. Update program IDs:

   - Copy the program IDs from the deployment output
   - Update them in `.env` and `config/deployment.json`

5. Deploy frontend:

   ```bash
   npm run build
   npm run deploy:testnet
   ```

6. Initialize program state:

   ```bash
   npm run init:testnet
   ```

7. Verify deployment:

   ```bash
   npm run verify:testnet
   ```

8. Open your browser and navigate to:
   ```
   http://localhost:5173
   ```

## Development

### Building for Production

```
npm run build
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.

# NeuroSwarm Task Optimization

This project has been optimized to reduce API calls and prevent unnecessary re-rendering.

## Key Improvements

1. **Task Caching System**

   - Implemented a local storage-based task cache to store and retrieve tasks
   - Cache prevents redundant API calls by storing tasks locally
   - Tasks are only fetched from the server when the cache is stale

2. **Timestamp-Based Task Fetching**

   - Only fetch new tasks since the last fetch time
   - Drastically reduces the number of tasks processed during each cycle
   - Avoids duplicate task creation by checking timestamps

3. **Task Polling Service**

   - Centralized polling mechanism that checks for new tasks every 20 seconds
   - Polling is handled by a background service instead of UI components
   - Prevents multiple components from making redundant API calls

4. **Optimized Task Duplication Prevention**

   - Better prompt checking to avoid creating duplicate tasks
   - Normalized prompts for more accurate duplicate detection
   - Batch processing to reduce the number of database queries

5. **Redux Integration**
   - The task cache is integrated with Redux for centralized state management
   - Components receive updates through Redux instead of making their own API calls
   - TaskSlice is optimized to use the cache when appropriate

## Getting Started

1. The caching system is automatically initialized when the application starts
2. No configuration is needed - the system uses sensible defaults
3. Tasks are automatically refreshed in the background without causing UI stuttering

## Configuration

Timing parameters can be adjusted in `src/services/config.ts`:

- `POLLING_INTERVAL`: How often to check for new tasks (default: 20 seconds)
- `CACHE_TTL`: How long to consider the cache valid (default: 30 seconds)
- `DISTRIBUTION`: The ratio of image vs text tasks (default: 40% images, 60% text)

## Architecture

- `taskCacheService.ts`: Manages local storage of tasks
- `taskPollingService.ts`: Background service for task polling
- `startupService.ts`: Initializes all services on application startup
- Modified `swarmTaskService.ts`: Uses cache and timestamp-based fetching
- Modified `taskSlice.ts`: Integrates with cache for Redux state management
