import { describe, expect, test } from "bun:test";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { lintFrontmatter } from "../src/index.js";

async function makeTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

describe("frontmatter-lint", () => {
  test("reports missing required fields", async () => {
    const root = await makeTempDir("frontmatter-lint-");
    const contentDir = path.join(root, "content");
    const schemaDir = path.join(root, "schemas");
    await fs.mkdir(contentDir, { recursive: true });
    await fs.mkdir(schemaDir, { recursive: true });

    await fs.writeFile(
      path.join(schemaDir, "schemas.yaml"),
      `schemas:\n  - name: note\n    required: [title]\n    fields:\n      title:\n        type: string\n`,
      "utf8"
    );

    await fs.writeFile(
      path.join(contentDir, "missing-title.md"),
      `---\ntype: note\nvisibility: public\n---\n\nBody\n`,
      "utf8"
    );

    const result = await lintFrontmatter({
      contentDir,
      schemaDir,
    });

    expect(result.success).toBeFalse();
    expect(result.issueCounts.error).toBe(1);
    expect(result.issues.some((i) => i.message.includes("Missing required field title"))).toBeTrue();
  });

  test("fixes missing visibility when fix is enabled", async () => {
    const root = await makeTempDir("frontmatter-lint-fix-");
    const contentDir = path.join(root, "content");
    const schemaDir = path.join(root, "schemas");
    await fs.mkdir(contentDir, { recursive: true });
    await fs.mkdir(schemaDir, { recursive: true });

    await fs.writeFile(
      path.join(schemaDir, "schemas.yaml"),
      `schemas:\n  - name: note\n    required: [title]\n    fields:\n      title:\n        type: string\n`,
      "utf8"
    );

    const filePath = path.join(contentDir, "no-visibility.md");
    await fs.writeFile(
      filePath,
      `---\ntype: note\ntitle: Test\n---\n\nBody\n`,
      "utf8"
    );

    const result = await lintFrontmatter({
      contentDir,
      schemaDir,
      fix: true,
      defaultVisibility: "private",
    });

    expect(result.success).toBeTrue();
    expect(result.issueCounts.warn).toBe(1);
    expect(result.updatedFiles.length).toBe(1);

    const updated = await fs.readFile(filePath, "utf8");
    expect(updated).toContain("visibility: private");
  });
});
