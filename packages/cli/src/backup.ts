import pc from "picocolors";
import {
  createBackup as coreCreateBackup,
  undoLastOperation,
  listBackups,
  restoreBackup,
  type BackupManifest,
} from "@extenote/core";

export async function createBackup(
  cwd: string,
  operation: string,
  filePaths: string[]
): Promise<string> {
  return coreCreateBackup(cwd, operation, filePaths, {
    log: (message) => console.warn(pc.dim(message)),
  });
}

export { undoLastOperation, listBackups, restoreBackup };

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
