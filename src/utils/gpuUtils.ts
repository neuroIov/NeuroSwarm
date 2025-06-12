/**
 * Extracts a clean GPU model name from a longer GPU information string
 * @param gpuString The full GPU information string
 * @returns A cleaned, simplified GPU model name
 */
export function extractGPUModel(gpuString: string): string {
  if (!gpuString) return 'Unknown';

  // Special case for Apple mobile devices which often just report "Apple GPU"
  if (gpuString.toLowerCase().includes('apple gpu')) {
    return 'Apple GPU';
  }
  
  // Special case for Adreno GPUs in mobile devices (including TM variants)
  const adrenoMatch = gpuString.match(/adreno\s*(?:\(tm\))?\s*(\d{3,4})/i);
  if (adrenoMatch && adrenoMatch[1]) {
    return `Adreno ${adrenoMatch[1]}`;
  }
  
  // Special case for Mali GPUs in mobile devices
  const maliMatch = gpuString.match(/mali[\s-]*([a-z]\d{3,4})/i);
  if (maliMatch && maliMatch[1]) {
    return `Mali-${maliMatch[1].toUpperCase()}`;
  }

  // MediaTek GPUs (PowerVR, Mali variants in MediaTek SoCs)
  const mediaTekMatch = gpuString.match(/mediatek/i);
  if (mediaTekMatch) {
    // Try to extract specific GPU info from MediaTek string
    const mtGpuMatch = gpuString.match(/(?:powervr|mali)[\s-]*([a-z0-9]{3,6})/i);
    if (mtGpuMatch) {
      return `MediaTek ${mtGpuMatch[0]}`;
    }
    return 'MediaTek GPU';
  }

  // PowerVR GPUs (common in MediaTek and some other SoCs)
  const powerVRMatch = gpuString.match(/powervr[\s-]*([a-z0-9]{2,6})/i);
  if (powerVRMatch && powerVRMatch[1]) {
    return `PowerVR ${powerVRMatch[1].toUpperCase()}`;
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
    /tegra\s+\d+/i,                  // NVIDIA Tegra mobile GPUs
    /exynos\s+\d+/i,                 // Samsung Exynos SoCs
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

  // Try to extract brand names for better fallback
  const brandMatches = [
    /qualcomm/i,
    /mediatek/i,
    /samsung/i,
    /huawei/i,
    /broadcom/i,
    /imagination/i
  ];

  for (const brandPattern of brandMatches) {
    if (gpuString.match(brandPattern)) {
      const brand = gpuString.match(brandPattern)?.[0];
      return `${brand} GPU`;
    }
  }

  // Try to extract some fallback if nothing matched
  const fallbackMatch = gpuString.match(/([a-zA-Z]+)\s?(\d{3,4})/);
  return fallbackMatch ? fallbackMatch[0] : 'Unknown';
}