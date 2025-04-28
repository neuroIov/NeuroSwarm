import { Idl } from '@project-serum/anchor';

/**
 * Safely parses an IDL object and validates its structure
 * @param idlData The raw IDL data to parse
 * @returns A properly typed Idl object
 */
export function parseIdl(idlData: any): Idl {
  try {
    // Validate the IDL has required fields
    if (!idlData.version || !idlData.name || !Array.isArray(idlData.instructions)) {
      throw new Error('Invalid IDL format: missing required fields');
    }

    // Additional validation can be added here
    
    return idlData as Idl;
  } catch (error) {
    console.error('IDL parsing error:', error);
    throw new Error(`Failed to parse IDL: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
