import fs from "fs/promises";
import path from "path";
import pc from "picocolors";
import { loadSettings, loadConfig } from "@extenote/core";

const MANIFEST_FILE = "manifest.json";

// Get backup settings (called fresh each time to pick up settings changes)
function getBackupSettings(cwd: string) {
  const settings = loadSettings(cwd);
  return {
    backupDir: settings.backup.backupDir,
    maxBackups: settings.backup.maxBackups,
  };
}

interface BackupManifest {
  id: string;
  timestamp: string;
  operation: string;
  files: Array<{
    originalPath: string;
    backupPath: string;
  }>;
}

interface BackupState {
  backups: BackupManifest[];
}

/**
 * Get path to backup directory.
 * Backups go to the private content root (EXTENOTE_PRIVATE_ROOT) if set,
 * otherwise to the first content source root.
 * This keeps backups with content, not in the tooling repo.
 */
async function getBackupDir(cwd: string): Promise<string> {
  const { backupDir } = getBackupSettings(cwd);

  // Prefer private root for backups (may contain sensitive data)
  if (process.env.EXTENOTE_PRIVATE_ROOT) {
    return path.join(path.resolve(cwd, process.env.EXTENOTE_PRIVATE_ROOT), backupDir);
  }

  // Fall back to first content source
  try {
    const config = await loadConfig({ cwd });
    const localSource = config.sources.find((s) => s.type === "local");
    if (localSource) {
      return path.join(path.resolve(cwd, localSource.root), backupDir);
    }
  } catch {
    // Fall back to cwd
  }

  return path.join(cwd, backupDir);
}

/**
 * Load backup state from manifest
 */
async function loadBackupState(cwd: string): Promise<BackupState> {
  const backupDir = await getBackupDir(cwd);
  const manifestPath = path.join(backupDir, MANIFEST_FILE);
  try {
    const content = await fs.readFile(manifestPath, "utf8");
    return JSON.parse(content);
  } catch {
    return { backups: [] };
  }
}

/**
 * Save backup state to manifest
 */
async function saveBackupState(cwd: string, state: BackupState): Promise<void> {
  const backupDir = await getBackupDir(cwd);
  await fs.mkdir(backupDir, { recursive: true });
  const manifestPath = path.join(backupDir, MANIFEST_FILE);
  await fs.writeFile(manifestPath, JSON.stringify(state, null, 2), "utf8");
}

let backupCounter = 0;

/**
 * Generate a unique backup ID
 */
function generateBackupId(): string {
  const now = new Date();
  backupCounter++;
  return `${now.toISOString().replace(/[:.]/g, "-")}-${backupCounter}`;
}

/**
 * Create a backup of files before a destructive operation
 */
export async function createBackup(
  cwd: string,
  operation: string,
  filePaths: string[]
): Promise<string> {
  const backupDir = await getBackupDir(cwd);
  const backupId = generateBackupId();
  const backupSubDir = path.join(backupDir, backupId);

  await fs.mkdir(backupSubDir, { recursive: true });

  const manifest: BackupManifest = {
    id: backupId,
    timestamp: new Date().toISOString(),
    operation,
    files: [],
  };

  for (const filePath of filePaths) {
    try {
      const content = await fs.readFile(filePath, "utf8");
      const relativePath = path.relative(cwd, filePath);
      const safeName = relativePath.replace(/[/\\]/g, "__");
      const backupPath = path.join(backupSubDir, safeName);

      await fs.writeFile(backupPath, content, "utf8");

      manifest.files.push({
        originalPath: filePath,
        backupPath,
      });
    } catch (err) {
      // File might not exist, skip it
      console.warn(pc.dim(`Could not backup ${filePath}: ${err}`));
    }
  }

  // Update manifest
  const state = await loadBackupState(cwd);
  state.backups.push(manifest);

  // Prune old backups
  const { maxBackups } = getBackupSettings(cwd);
  while (state.backups.length > maxBackups) {
    const oldest = state.backups.shift();
    if (oldest) {
      const oldDir = path.join(backupDir, oldest.id);
      try {
        await fs.rm(oldDir, { recursive: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  await saveBackupState(cwd, state);

  return backupId;
}

/**
 * Restore files from the most recent backup
 */
export async function undoLastOperation(
  cwd: string
): Promise<{ success: boolean; message: string; filesRestored: number }> {
  const state = await loadBackupState(cwd);

  if (state.backups.length === 0) {
    return {
      success: false,
      message: "No backups available to undo",
      filesRestored: 0,
    };
  }

  const backup = state.backups.pop()!;
  let filesRestored = 0;
  const errors: string[] = [];

  for (const file of backup.files) {
    try {
      const content = await fs.readFile(file.backupPath, "utf8");
      await fs.writeFile(file.originalPath, content, "utf8");
      filesRestored++;
    } catch (err) {
      errors.push(`${file.originalPath}: ${err}`);
    }
  }

  // Clean up backup directory
  const backupDir = await getBackupDir(cwd);
  const backupSubDir = path.join(backupDir, backup.id);
  try {
    await fs.rm(backupSubDir, { recursive: true });
  } catch {
    // Ignore cleanup errors
  }

  await saveBackupState(cwd, state);

  if (errors.length > 0) {
    return {
      success: false,
      message: `Restored ${filesRestored} files, but ${errors.length} failed:\n${errors.join("\n")}`,
      filesRestored,
    };
  }

  return {
    success: true,
    message: `Restored ${filesRestored} file(s) from "${backup.operation}" backup`,
    filesRestored,
  };
}

/**
 * List available backups
 */
export async function listBackups(
  cwd: string
): Promise<BackupManifest[]> {
  const state = await loadBackupState(cwd);
  return state.backups;
}

/**
 * Restore from a specific backup by ID
 */
export async function restoreBackup(
  cwd: string,
  backupId: string
): Promise<{ success: boolean; message: string; filesRestored: number }> {
  const state = await loadBackupState(cwd);

  const backupIndex = state.backups.findIndex((b) => b.id === backupId);
  if (backupIndex === -1) {
    return {
      success: false,
      message: `Backup ${backupId} not found`,
      filesRestored: 0,
    };
  }

  const backup = state.backups[backupIndex];
  let filesRestored = 0;
  const errors: string[] = [];

  for (const file of backup.files) {
    try {
      const content = await fs.readFile(file.backupPath, "utf8");
      await fs.writeFile(file.originalPath, content, "utf8");
      filesRestored++;
    } catch (err) {
      errors.push(`${file.originalPath}: ${err}`);
    }
  }

  // Remove this and all newer backups
  const backupDir = await getBackupDir(cwd);
  const removedBackups = state.backups.splice(backupIndex);
  for (const removed of removedBackups) {
    const backupSubDir = path.join(backupDir, removed.id);
    try {
      await fs.rm(backupSubDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  }

  await saveBackupState(cwd, state);

  if (errors.length > 0) {
    return {
      success: false,
      message: `Restored ${filesRestored} files, but ${errors.length} failed`,
      filesRestored,
    };
  }

  return {
    success: true,
    message: `Restored ${filesRestored} file(s) from "${backup.operation}" backup`,
    filesRestored,
  };
}

/**
 * Print backup list to console
 */
export function printBackups(backups: BackupManifest[]): void {
  if (backups.length === 0) {
    console.log(pc.dim("No backups available."));
    return;
  }

  console.log(pc.bold("\nAvailable backups:\n"));

  for (let i = backups.length - 1; i >= 0; i--) {
    const backup = backups[i];
    const date = new Date(backup.timestamp);
    const ago = getRelativeTime(date);

    console.log(`  ${pc.cyan(backup.id)}`);
    console.log(`    ${pc.dim("Operation:")} ${backup.operation}`);
    console.log(`    ${pc.dim("Time:")} ${ago} (${date.toLocaleString()})`);
    console.log(`    ${pc.dim("Files:")} ${backup.files.length}`);
    console.log();
  }
}

function getRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins} minute(s) ago`;
  if (diffHours < 24) return `${diffHours} hour(s) ago`;
  return `${diffDays} day(s) ago`;
}
