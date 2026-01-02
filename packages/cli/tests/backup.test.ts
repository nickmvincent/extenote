import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "fs/promises";
import path from "path";
import os from "os";
import {
  createBackup,
  undoLastOperation,
  listBackups,
  restoreBackup,
} from "../src/backup.js";

/**
 * @narrative backup/undo-system
 * @title Backup and Undo System
 * @description Every destructive operation in Extenote (tag renames, deletes, merges) creates
 * a backup first. You can undo any operation with a single command, restoring your files to
 * their previous state.
 */
describe("backup", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "extenote-backup-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("createBackup", () => {
    /**
     * @narrative-step 1
     * @explanation Before modifying files, Extenote saves their current contents. The backup
     * includes metadata about what operation was performed.
     */
    it("creates a backup of specified files", async () => {
      // Create test files
      const file1 = path.join(tempDir, "file1.md");
      const file2 = path.join(tempDir, "file2.md");
      await fs.writeFile(file1, "content 1");
      await fs.writeFile(file2, "content 2");

      const backupId = await createBackup(tempDir, "test operation", [
        file1,
        file2,
      ]);

      expect(backupId).toBeDefined();
      expect(typeof backupId).toBe("string");

      const backups = await listBackups(tempDir);
      expect(backups.length).toBe(1);
      expect(backups[0].operation).toBe("test operation");
      expect(backups[0].files.length).toBe(2);
    });

    it("handles non-existent files gracefully", async () => {
      const existingFile = path.join(tempDir, "exists.md");
      const missingFile = path.join(tempDir, "missing.md");
      await fs.writeFile(existingFile, "content");

      const backupId = await createBackup(tempDir, "test", [
        existingFile,
        missingFile,
      ]);

      expect(backupId).toBeDefined();

      const backups = await listBackups(tempDir);
      expect(backups[0].files.length).toBe(1);
    });

    it("stores backup metadata in manifest", async () => {
      const file = path.join(tempDir, "test.md");
      await fs.writeFile(file, "content");

      await createBackup(tempDir, "tag rename: old → new", [file]);

      const backups = await listBackups(tempDir);
      expect(backups[0].operation).toBe("tag rename: old → new");
      expect(backups[0].timestamp).toBeDefined();
      expect(new Date(backups[0].timestamp).getTime()).toBeLessThanOrEqual(
        Date.now()
      );
    });
  });

  describe("undoLastOperation", () => {
    /**
     * @narrative-step 2
     * @explanation Running "extenote undo" restores files from the most recent backup. The
     * original content is written back, and the backup is consumed (removed).
     */
    it("restores files from the last backup", async () => {
      const file = path.join(tempDir, "test.md");
      await fs.writeFile(file, "original content");

      await createBackup(tempDir, "test", [file]);

      // Modify the file
      await fs.writeFile(file, "modified content");

      const result = await undoLastOperation(tempDir);

      expect(result.success).toBe(true);
      expect(result.filesRestored).toBe(1);

      const restored = await fs.readFile(file, "utf8");
      expect(restored).toBe("original content");
    });

    it("returns error when no backups available", async () => {
      const result = await undoLastOperation(tempDir);

      expect(result.success).toBe(false);
      expect(result.message).toContain("No backups available");
      expect(result.filesRestored).toBe(0);
    });

    it("removes the backup after restore", async () => {
      const file = path.join(tempDir, "test.md");
      await fs.writeFile(file, "content");

      await createBackup(tempDir, "test", [file]);

      let backups = await listBackups(tempDir);
      expect(backups.length).toBe(1);

      await undoLastOperation(tempDir);

      backups = await listBackups(tempDir);
      expect(backups.length).toBe(0);
    });

    /**
     * @narrative-step 3
     * @explanation Multiple operations create stacked backups. Undo works in LIFO (last-in-first-out)
     * order: each undo reverts one operation, and you can keep undoing to go further back.
     */
    it("handles multiple backups correctly (LIFO order)", async () => {
      const file = path.join(tempDir, "test.md");

      // First backup
      await fs.writeFile(file, "version 1");
      await createBackup(tempDir, "first", [file]);

      // Second backup
      await fs.writeFile(file, "version 2");
      await createBackup(tempDir, "second", [file]);

      // Current state
      await fs.writeFile(file, "version 3");

      // Undo last (second) backup
      await undoLastOperation(tempDir);
      expect(await fs.readFile(file, "utf8")).toBe("version 2");

      // Undo first backup
      await undoLastOperation(tempDir);
      expect(await fs.readFile(file, "utf8")).toBe("version 1");
    });
  });

  describe("listBackups", () => {
    it("returns empty array when no backups exist", async () => {
      const backups = await listBackups(tempDir);
      expect(backups).toEqual([]);
    });

    it("returns backups in order", async () => {
      const file = path.join(tempDir, "test.md");
      await fs.writeFile(file, "content");

      await createBackup(tempDir, "first", [file]);
      await new Promise((resolve) => setTimeout(resolve, 10)); // Small delay
      await createBackup(tempDir, "second", [file]);

      const backups = await listBackups(tempDir);
      expect(backups.length).toBe(2);
      expect(backups[0].operation).toBe("first");
      expect(backups[1].operation).toBe("second");
    });
  });

  describe("restoreBackup", () => {
    it("restores files from a specific backup by ID", async () => {
      const file = path.join(tempDir, "test.md");

      await fs.writeFile(file, "version 1");
      await createBackup(tempDir, "first", [file]);

      await fs.writeFile(file, "version 2");
      await createBackup(tempDir, "second", [file]);

      await fs.writeFile(file, "version 3");

      const backups = await listBackups(tempDir);
      const firstBackupId = backups[0].id;

      const result = await restoreBackup(tempDir, firstBackupId);

      expect(result.success).toBe(true);
      expect(await fs.readFile(file, "utf8")).toBe("version 1");

      // Both backups should be removed (first and all after it)
      const remainingBackups = await listBackups(tempDir);
      expect(remainingBackups.length).toBe(0);
    });

    it("returns error for non-existent backup ID", async () => {
      const result = await restoreBackup(tempDir, "nonexistent-id");

      expect(result.success).toBe(false);
      expect(result.message).toContain("not found");
    });
  });

  describe("backup pruning", () => {
    it("keeps only the last 10 backups", async () => {
      const file = path.join(tempDir, "test.md");
      await fs.writeFile(file, "content");

      // Create 12 backups
      for (let i = 0; i < 12; i++) {
        await createBackup(tempDir, `backup ${i}`, [file]);
        await new Promise((resolve) => setTimeout(resolve, 5)); // Small delay for unique timestamps
      }

      const backups = await listBackups(tempDir);
      expect(backups.length).toBe(10);

      // First two should have been pruned
      expect(backups[0].operation).toBe("backup 2");
      expect(backups[9].operation).toBe("backup 11");
    });
  });
});
