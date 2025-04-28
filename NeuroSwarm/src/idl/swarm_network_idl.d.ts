import { Idl } from '@project-serum/anchor';

// This declaration file provides proper TypeScript typing for the Solana IDL
declare const IDL: Idl;

// Export the IDL as the default export
export default IDL;

// Also export individual parts of the IDL for direct access
export declare const name: string;
export declare const version: string;
export declare const instructions: any[];
export declare const accounts: any[];
export declare const errors: any[];
