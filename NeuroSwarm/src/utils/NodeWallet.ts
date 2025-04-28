import { Keypair, Transaction, PublicKey } from '@solana/web3.js';
import { AnchorWallet } from '@solana/wallet-adapter-react';

export class NodeWallet implements AnchorWallet {
    constructor(readonly payer: Keypair) {}

    async signTransaction(tx: Transaction): Promise<Transaction> {
        tx.partialSign(this.payer);
        return tx;
    }

    async signAllTransactions(txs: Transaction[]): Promise<Transaction[]> {
        return txs.map((tx) => {
            tx.partialSign(this.payer);
            return tx;
        });
    }

    get publicKey(): PublicKey {
        return this.payer.publicKey;
    }
}
