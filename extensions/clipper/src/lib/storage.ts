/**
 * Extension storage utilities
 */

import { DEFAULT_CONFIG, type ClipperConfig } from "./types";

const STORAGE_KEY = "clipperConfig";

/**
 * Load config from extension storage
 */
export async function loadConfig(): Promise<ClipperConfig> {
  try {
    const result = await browser.storage.local.get(STORAGE_KEY);
    if (result[STORAGE_KEY]) {
      return { ...DEFAULT_CONFIG, ...result[STORAGE_KEY] };
    }
  } catch (err) {
    console.error("Failed to load config:", err);
  }
  return DEFAULT_CONFIG;
}

/**
 * Save config to extension storage
 */
export async function saveConfig(config: Partial<ClipperConfig>): Promise<void> {
  try {
    const current = await loadConfig();
    await browser.storage.local.set({
      [STORAGE_KEY]: { ...current, ...config },
    });
  } catch (err) {
    console.error("Failed to save config:", err);
    throw err;
  }
}

/**
 * Reset config to defaults
 */
export async function resetConfig(): Promise<void> {
  try {
    await browser.storage.local.remove(STORAGE_KEY);
  } catch (err) {
    console.error("Failed to reset config:", err);
    throw err;
  }
}
