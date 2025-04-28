import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { SwarmNetwork } from "../target/types/swarm_network";

describe("swarm-network", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SwarmNetwork as Program<SwarmNetwork>;

  const state = anchor.web3.Keypair.generate();
  const device = anchor.web3.Keypair.generate();
  const task = anchor.web3.Keypair.generate();
  const rewardPool = anchor.web3.Keypair.generate();
  const deviceOwner = anchor.web3.Keypair.generate();

  it("Initialize program", async () => {
    await program.methods
      .initialize()
      .accounts({
        state,
        authority: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([state])
      .rpc();
  });

  it("Register device", async () => {
    const gpuModel = new Uint8Array(32).fill(0);
    // Fill with "RTX4090" (16 bytes)
    const gpuName = "RTX4090";
    for (let i = 0; i < gpuName.length; i++) {
      gpuModel[i] = gpuName.charCodeAt(i);
    }

    await program.methods
      .registerDevice(gpuModel, 24, 10000)
      .accounts({
        device,
        owner: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([device])
      .rpc();
  });

  it("Create task", async () => {
    const requirements = {
      minVram: 8,
      minHashRate: 5000,
      priority: 1,
    };

    const taskId = new Uint8Array(32).fill(0);
    // Fill with "task1" (6 bytes)
    const taskName = "task1";
    for (let i = 0; i < taskName.length; i++) {
      taskId[i] = taskName.charCodeAt(i);
    }

    await program.methods
      .createTask(taskId, requirements)
      .accounts({
        task,
        owner: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([task])
      .rpc();
  });

  it("Assign task", async () => {
    await program.methods
      .assignTask()
      .accounts({
        task,
        device,
      })
      .rpc();
  });

  it("Complete task", async () => {
    const result = {
      computeTime: 100,
      hashRate: 9000,
      success: true,
    };

    await program.methods
      .completeTask(result)
      .accounts({
        task,
      })
      .rpc();
  });

  it("Distribute reward", async () => {
    await program.methods
      .distributeReward(1000000)
      .accounts({
        authority: provider.wallet.publicKey,
        rewardPool,
        deviceOwner,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      })
      .rpc();
  });
});
