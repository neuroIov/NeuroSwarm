/**
 * Extracts a clean GPU model name from a longer GPU information string
 * @param gpuString The full GPU information string
 * @returns A cleaned, simplified GPU model name
 */
export function extractGPUModel(gpuString: string): string {
  if (!gpuString) return 'Unknown';

  // Normalize the input
  const input = gpuString.toLowerCase();

  // Common GPU patterns
  const patterns = [
    /rtx\s?\d{3,4}/i,                // e.g., RTX 5070
    /gtx\s?\d{3,4}/i,                // e.g., GTX 1660
    /rx\s?\d{3,4}/i,                 // e.g., RX 6700
    /intel\(r\)?\s+uhd\s+graphics/i, // e.g., Intel(R) UHD Graphics
    /uhd\s+graphics/i,               // fallback for just "UHD Graphics"
    /snapdragon\s?\d{3,4}/i,         // e.g., Snapdragon 888
    /apple\s+m\d/i                   // e.g., Apple M2
  ];

  for (const pattern of patterns) {
    const match = gpuString.match(pattern);
    if (match) {
      return match[0]
        .replace(/intel\(r\)?/i, 'Intel')  // Clean Intel name
        .replace(/\s+/g, ' ')              // Normalize spacing
        .trim();
    }
  }

  // Try to extract some fallback if nothing matched
  const fallbackMatch = gpuString.match(/([a-zA-Z]+)\s?(\d{3,4})/);
  return fallbackMatch ? fallbackMatch[0] : 'Unknown';
}
