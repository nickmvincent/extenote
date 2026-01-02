import fs from "fs/promises";
import path from "path";
import type { NetworkData } from "../../types.js";

/**
 * Generate JSON string from network data for Astro consumption
 */
export function generateAstroNetworkJson(data: NetworkData): string {
  return JSON.stringify(data, null, 2);
}

/**
 * Write Astro output files
 */
export async function writeAstroOutput(
  data: NetworkData,
  projectDir: string
): Promise<void> {
  // Ensure data directory exists
  const dataDir = path.join(projectDir, "src", "data");
  await fs.mkdir(dataDir, { recursive: true });

  // Write network.json
  const jsonContent = generateAstroNetworkJson(data);
  const jsonPath = path.join(dataDir, "network.json");
  await fs.writeFile(jsonPath, jsonContent, "utf8");
}
