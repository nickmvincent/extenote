import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { loadLocalSource } from "../src/sources/local";
import type { LoadedSchema, LocalSourceConfig } from "../src/types";

let tmpDir: string;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "extenote-local-source-"));
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

const schema: LoadedSchema = {
  name: "demo_note",
  description: "Example note",
  fields: {},
  required: [],
  filePath: "schemas/demo.yaml"
};

function buildSource(): LocalSourceConfig {
  return {
    id: "local",
    type: "local",
    root: tmpDir
  };
}

describe("loadLocalSource", () => {
  it("does not inject visibility into frontmatter", async () => {
    const filePath = path.join(tmpDir, "note.md");
    await fs.writeFile(
      filePath,
      "---\ntype: demo_note\ntitle: Demo\n---\nBody\n",
      "utf8"
    );

    const result = await loadLocalSource(buildSource(), {
      cwd: process.cwd(),
      schemas: [schema],
      visibilityField: "visibility",
      defaultVisibility: "private"
    });

    expect(result.objects.length).toBe(1);
    expect(result.objects[0].visibility).toBe("private");
    expect(result.objects[0].frontmatter.visibility).toBeUndefined();
  });

  it("records parse errors without aborting the load", async () => {
    const badPath = path.join(tmpDir, "bad.md");
    await fs.writeFile(
      badPath,
      "---\ntype: demo_note\ntitle: [\n---\nBody\n",
      "utf8"
    );

    const result = await loadLocalSource(buildSource(), {
      cwd: process.cwd(),
      schemas: [schema],
      visibilityField: "visibility",
      defaultVisibility: "private"
    });

    expect(result.objects.length).toBeGreaterThan(0);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues[0].message).toContain("Failed to load markdown");
  });
});
