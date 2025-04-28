import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { Program } from '@project-serum/anchor';

export const submitTaskTransaction = async (
  taskData: any,
  wallet: any
) => {
  const connection = new Connection(process.env.SOLANA_RPC!);
  const programId = new PublicKey(process.env.PROGRAM_ID!);
  
  const program = new Program(IDL, programId, { connection });

  const transaction = new Transaction().add(
    await program.methods
      .createTask(taskData)
      .accounts({ 
        signer: wallet.publicKey,
        systemProgram: SystemProgram.programId
      })
      .instruction()
  );

  return await wallet.sendTransaction(transaction, connection);
};
