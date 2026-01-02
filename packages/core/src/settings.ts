/**
 * User-configurable settings for Extenote.
 *
 * Settings are stored in `.extenote/settings.json` and can be modified
 * via the web app or TUI settings menu. Changes take effect immediately.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface RefcheckSettings {
  /** Title similarity threshold for compare.ts (default: 0.9) */
  titleMatchThreshold: number;
  /** Title similarity threshold for matcher.ts (default: 0.85) */
  titleMatchThresholdMatcher: number;
  /** Venue similarity threshold (default: 0.8) */
  venueMatchThreshold: number;
  /** Search result similarity threshold (default: 0.7) */
  searchSimilarityThreshold: number;
  /** Author count ratio threshold (default: 0.5) */
  authorCountRatioThreshold: number;
  /** Minimum title similarity for partial match (default: 0.3) */
  minTitleSimilarity: number;
}

export interface GraphSettings {
  /** Force repulsion strength (default: 8000) */
  repulsionStrength: number;
  /** Force attraction strength (default: 0.01) */
  attractionStrength: number;
  /** Centering force strength (default: 0.003) */
  centeringStrength: number;
  /** Velocity damping factor (default: 0.85) */
  damping: number;
  /** Minimum velocity before stopping (default: 0.1) */
  minVelocity: number;
  /** Minimum zoom level (default: 0.1) */
  minZoom: number;
  /** Maximum zoom level (default: 4) */
  maxZoom: number;
  /** Base node size (default: 15) */
  baseNodeSize: number;
  /** Maximum node size (default: 40) */
  maxNodeSize: number;
  /** Node size growth factor (default: 0.3) */
  nodeSizeGrowth: number;
}

export interface DisplaySettings {
  /** Default limit for list/search results (default: 20) */
  listLimit: number;
  /** Default limit for issues display (default: 20) */
  issuesLimit: number;
  /** Default limit for validation queue (default: 50) */
  validationQueueLimit: number;
  /** Maximum recent items to track (default: 10) */
  maxRecentItems: number;
  /** TUI page size for pagination (default: 12) */
  pageSize: number;
  /** Search results limit (default: 50) */
  searchResultsLimit: number;
  /** Preview line limit (default: 3) */
  previewLineLimit: number;
}

export interface BackupSettings {
  /** Maximum number of backups to keep (default: 10) */
  maxBackups: number;
  /** Backup directory name (default: '.extenote-backup') */
  backupDir: string;
}

export interface CacheSettings {
  /** Cache TTL in milliseconds (default: 30000) */
  ttl: number;
  /** Enable caching (default: true) */
  enabled: boolean;
}

export interface FtpSettings {
  /** FTP connection timeout in seconds (default: 30) */
  timeout: number;
  /** Parallel upload threads (default: 4) */
  parallelThreads: number;
}

export interface EditorSettings {
  /** Editor command (default: 'code') */
  command: string;
}

export interface ApiSettings {
  /** Rate limit delay in ms (default: 250) */
  rateLimitDelay: number;
  /** Max results from external APIs (default: 5) */
  maxResults: number;
}

export interface ExtenoteSettings {
  refcheck: RefcheckSettings;
  graph: GraphSettings;
  display: DisplaySettings;
  backup: BackupSettings;
  cache: CacheSettings;
  ftp: FtpSettings;
  editor: EditorSettings;
  api: ApiSettings;
}

// ─────────────────────────────────────────────────────────────────────────────
// Defaults
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_SETTINGS: ExtenoteSettings = {
  refcheck: {
    titleMatchThreshold: 0.9,
    titleMatchThresholdMatcher: 0.85,
    venueMatchThreshold: 0.8,
    searchSimilarityThreshold: 0.7,
    authorCountRatioThreshold: 0.5,
    minTitleSimilarity: 0.3,
  },
  graph: {
    repulsionStrength: 8000,
    attractionStrength: 0.01,
    centeringStrength: 0.003,
    damping: 0.85,
    minVelocity: 0.1,
    minZoom: 0.1,
    maxZoom: 4,
    baseNodeSize: 15,
    maxNodeSize: 40,
    nodeSizeGrowth: 0.3,
  },
  display: {
    listLimit: 20,
    issuesLimit: 20,
    validationQueueLimit: 50,
    maxRecentItems: 10,
    pageSize: 12,
    searchResultsLimit: 50,
    previewLineLimit: 3,
  },
  backup: {
    maxBackups: 10,
    backupDir: ".extenote-backup",
  },
  cache: {
    ttl: 30000,
    enabled: true,
  },
  ftp: {
    timeout: 30,
    parallelThreads: 4,
  },
  editor: {
    command: "code",
  },
  api: {
    rateLimitDelay: 250,
    maxResults: 5,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Settings File Path
// ─────────────────────────────────────────────────────────────────────────────

const SETTINGS_FILE = "settings.json";
const SETTINGS_DIR = ".extenote";

/**
 * Get the settings file path for a given base directory.
 */
export function getSettingsPath(baseDir?: string): string {
  const base = baseDir || process.cwd();
  return join(base, SETTINGS_DIR, SETTINGS_FILE);
}

// ─────────────────────────────────────────────────────────────────────────────
// Deep Merge Utility
// ─────────────────────────────────────────────────────────────────────────────

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Deep merge two objects, with source values overriding target values.
 */
function deepMerge<T extends object>(target: T, source: DeepPartial<T>): T {
  const result = { ...target };

  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const sourceValue = source[key];
      const targetValue = target[key];

      if (
        sourceValue !== undefined &&
        typeof sourceValue === "object" &&
        sourceValue !== null &&
        !Array.isArray(sourceValue) &&
        typeof targetValue === "object" &&
        targetValue !== null &&
        !Array.isArray(targetValue)
      ) {
        (result as Record<string, unknown>)[key] = deepMerge(
          targetValue as object,
          sourceValue as DeepPartial<object>
        );
      } else if (sourceValue !== undefined) {
        (result as Record<string, unknown>)[key] = sourceValue;
      }
    }
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Load / Save Functions
// ─────────────────────────────────────────────────────────────────────────────

/** In-memory cache for settings */
let settingsCache: ExtenoteSettings | null = null;
let settingsCacheBaseDir: string | null = null;

/**
 * Load settings from `.extenote/settings.json`, merged with defaults.
 * Returns DEFAULT_SETTINGS if file doesn't exist.
 */
export function loadSettings(baseDir?: string): ExtenoteSettings {
  const base = baseDir || process.cwd();

  // Return cached settings if available for same base dir
  if (settingsCache && settingsCacheBaseDir === base) {
    return settingsCache;
  }

  const settingsPath = getSettingsPath(base);

  if (!existsSync(settingsPath)) {
    settingsCache = { ...DEFAULT_SETTINGS };
    settingsCacheBaseDir = base;
    return settingsCache;
  }

  try {
    const content = readFileSync(settingsPath, "utf-8");
    const userSettings = JSON.parse(content) as DeepPartial<ExtenoteSettings>;
    settingsCache = deepMerge(DEFAULT_SETTINGS, userSettings);
    settingsCacheBaseDir = base;
    return settingsCache;
  } catch (error) {
    console.error(`Failed to load settings from ${settingsPath}:`, error);
    settingsCache = { ...DEFAULT_SETTINGS };
    settingsCacheBaseDir = base;
    return settingsCache;
  }
}

/**
 * Save settings to `.extenote/settings.json`.
 * Supports partial updates - only saves non-default values.
 */
export function saveSettings(
  settings: DeepPartial<ExtenoteSettings>,
  baseDir?: string
): void {
  const base = baseDir || process.cwd();
  const settingsPath = getSettingsPath(base);
  const settingsDir = dirname(settingsPath);

  // Ensure directory exists
  if (!existsSync(settingsDir)) {
    mkdirSync(settingsDir, { recursive: true });
  }

  // Load existing settings and merge
  const existingSettings = loadSettings(base);
  const mergedSettings = deepMerge(existingSettings, settings);

  // Write to file
  writeFileSync(settingsPath, JSON.stringify(mergedSettings, null, 2), "utf-8");

  // Update cache
  settingsCache = mergedSettings;
  settingsCacheBaseDir = base;
}

/**
 * Invalidate the settings cache, forcing a reload on next access.
 */
export function invalidateSettingsCache(): void {
  settingsCache = null;
  settingsCacheBaseDir = null;
}

/**
 * Reset settings to defaults by deleting the settings file.
 */
export function resetSettings(baseDir?: string): void {
  const base = baseDir || process.cwd();
  const settingsPath = getSettingsPath(base);

  if (existsSync(settingsPath)) {
    const { unlinkSync } = require("fs");
    unlinkSync(settingsPath);
  }

  // Clear cache
  invalidateSettingsCache();
}

/**
 * Reset a specific section of settings to defaults.
 */
export function resetSettingsSection<K extends keyof ExtenoteSettings>(
  section: K,
  baseDir?: string
): void {
  const currentSettings = loadSettings(baseDir);
  const updatedSettings = {
    ...currentSettings,
    [section]: DEFAULT_SETTINGS[section],
  };
  saveSettings(updatedSettings, baseDir);
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

export interface SettingsValidationError {
  path: string;
  message: string;
  value: unknown;
}

/**
 * Validate settings values.
 * Returns an array of validation errors (empty if valid).
 */
export function validateSettings(
  settings: DeepPartial<ExtenoteSettings>
): SettingsValidationError[] {
  const errors: SettingsValidationError[] = [];

  // Refcheck validation (0-1 range for thresholds)
  if (settings.refcheck) {
    const r = settings.refcheck;
    const thresholdFields: (keyof RefcheckSettings)[] = [
      "titleMatchThreshold",
      "titleMatchThresholdMatcher",
      "venueMatchThreshold",
      "searchSimilarityThreshold",
      "authorCountRatioThreshold",
      "minTitleSimilarity",
    ];

    for (const field of thresholdFields) {
      const value = r[field];
      if (value !== undefined && (value < 0 || value > 1)) {
        errors.push({
          path: `refcheck.${field}`,
          message: "Must be between 0 and 1",
          value,
        });
      }
    }
  }

  // Graph validation (positive numbers)
  if (settings.graph) {
    const g = settings.graph;
    const positiveFields: (keyof GraphSettings)[] = [
      "repulsionStrength",
      "attractionStrength",
      "centeringStrength",
      "damping",
      "minVelocity",
      "minZoom",
      "maxZoom",
      "baseNodeSize",
      "maxNodeSize",
      "nodeSizeGrowth",
    ];

    for (const field of positiveFields) {
      const value = g[field];
      if (value !== undefined && value < 0) {
        errors.push({
          path: `graph.${field}`,
          message: "Must be a positive number",
          value,
        });
      }
    }

    if (g.minZoom !== undefined && g.maxZoom !== undefined && g.minZoom > g.maxZoom) {
      errors.push({
        path: "graph.minZoom",
        message: "minZoom must be less than or equal to maxZoom",
        value: g.minZoom,
      });
    }
  }

  // Display validation (positive integers)
  if (settings.display) {
    const d = settings.display;
    const positiveIntFields: (keyof DisplaySettings)[] = [
      "listLimit",
      "issuesLimit",
      "validationQueueLimit",
      "maxRecentItems",
      "pageSize",
      "searchResultsLimit",
      "previewLineLimit",
    ];

    for (const field of positiveIntFields) {
      const value = d[field];
      if (value !== undefined && (value < 1 || !Number.isInteger(value))) {
        errors.push({
          path: `display.${field}`,
          message: "Must be a positive integer",
          value,
        });
      }
    }
  }

  // Backup validation
  if (settings.backup) {
    if (
      settings.backup.maxBackups !== undefined &&
      (settings.backup.maxBackups < 1 || !Number.isInteger(settings.backup.maxBackups))
    ) {
      errors.push({
        path: "backup.maxBackups",
        message: "Must be a positive integer",
        value: settings.backup.maxBackups,
      });
    }
  }

  // Cache validation
  if (settings.cache) {
    if (settings.cache.ttl !== undefined && settings.cache.ttl < 0) {
      errors.push({
        path: "cache.ttl",
        message: "Must be a non-negative number",
        value: settings.cache.ttl,
      });
    }
  }

  // FTP validation
  if (settings.ftp) {
    if (settings.ftp.timeout !== undefined && settings.ftp.timeout < 1) {
      errors.push({
        path: "ftp.timeout",
        message: "Must be at least 1 second",
        value: settings.ftp.timeout,
      });
    }
    if (
      settings.ftp.parallelThreads !== undefined &&
      (settings.ftp.parallelThreads < 1 || !Number.isInteger(settings.ftp.parallelThreads))
    ) {
      errors.push({
        path: "ftp.parallelThreads",
        message: "Must be a positive integer",
        value: settings.ftp.parallelThreads,
      });
    }
  }

  // Editor validation
  if (settings.editor) {
    if (
      settings.editor.command !== undefined &&
      (typeof settings.editor.command !== "string" || settings.editor.command.trim() === "")
    ) {
      errors.push({
        path: "editor.command",
        message: "Must be a non-empty string",
        value: settings.editor.command,
      });
    }
  }

  // API validation
  if (settings.api) {
    if (settings.api.rateLimitDelay !== undefined && settings.api.rateLimitDelay < 0) {
      errors.push({
        path: "api.rateLimitDelay",
        message: "Must be a non-negative number",
        value: settings.api.rateLimitDelay,
      });
    }
    if (
      settings.api.maxResults !== undefined &&
      (settings.api.maxResults < 1 || !Number.isInteger(settings.api.maxResults))
    ) {
      errors.push({
        path: "api.maxResults",
        message: "Must be a positive integer",
        value: settings.api.maxResults,
      });
    }
  }

  return errors;
}

// ─────────────────────────────────────────────────────────────────────────────
// Type Export for Partial Updates
// ─────────────────────────────────────────────────────────────────────────────

export type PartialSettings = DeepPartial<ExtenoteSettings>;
