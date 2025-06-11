/**
 * Extracts a clean GPU model name from a longer GPU information string
 * @param gpuString The full GPU information string
 * @returns A cleaned, simplified GPU model name
 */
export function extractGPUModel(gpuString: string): string {
  if (!gpuString) return 'Unknown';

  // Special case for Apple mobile devices which often just report "Apple GPU"
  if (gpuString.toLowerCase().includes('apple gpu')) {
    return 'Apple GPU'; // Return the standardized name for Apple mobile GPUs
  }
  
  // Special case for Adreno GPUs in mobile devices
  const adrenoMatch = gpuString.match(/adreno\s*\(?\s*(\d{3,4})/i);
  if (adrenoMatch && adrenoMatch[1]) {
    return `Adreno ${adrenoMatch[1]}`;
  }
  
  // Special case for Mali GPUs in mobile devices
  const maliMatch = gpuString.match(/mali[\s-]*([a-z]\d{3,4})/i);
  if (maliMatch && maliMatch[1]) {
    return `Mali-${maliMatch[1].toUpperCase()}`;
  }

  // Normalize the input
  const input = gpuString.toLowerCase();

  // Common desktop/laptop GPU patterns
  const patterns = [
    /rtx\s?\d{3,4}/i,                // e.g., RTX 5070
    /gtx\s?\d{3,4}/i,                // e.g., GTX 1660
    /rx\s?\d{3,4}/i,                 // e.g., RX 6700
    /radeon\s?\d{3,4}/i,             // e.g., Radeon 6700
    /intel\(r\)?\s+uhd\s+graphics/i, // e.g., Intel(R) UHD Graphics
    /iris\s+xe/i,                    // Intel Iris Xe graphics
    /uhd\s+graphics/i,               // fallback for just "UHD Graphics"
    /snapdragon\s?\d{3,4}/i,         // e.g., Snapdragon 888
    /apple\s+m\d/i,                  // e.g., Apple M2
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
