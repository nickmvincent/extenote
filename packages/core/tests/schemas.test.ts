import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { loadSchemas } from "../src/schemas";
import type { ExtenoteConfig } from "../src/types";

// ─── Test Setup ──────────────────────────────────────────────────────────────

let tmpDir: string;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "extenote-schemas-test-"));
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function buildConfig(schemaDir: string): ExtenoteConfig {
  return {
    schemaDir,
    sources: [],
    sites: [],
    lint: { rules: {} },
  };
}

// ─── loadSchemas Tests ───────────────────────────────────────────────────────

describe("loadSchemas", () => {
  it("loads single schema from YAML file", async () => {
    const schemaDir = path.join(tmpDir, "single-schema");
    await fs.mkdir(schemaDir, { recursive: true });
    await fs.writeFile(
      path.join(schemaDir, "notes.yaml"),
      `schemas:
  - name: note
    description: A simple note
    fields:
      title:
        type: string
      tags:
        type: array
        items: string
    required:
      - title
`,
      "utf8"
    );

    const schemas = await loadSchemas(buildConfig(schemaDir), tmpDir);

    expect(schemas.length).toBe(1);
    expect(schemas[0].name).toBe("note");
    expect(schemas[0].description).toBe("A simple note");
    expect(schemas[0].fields.title.type).toBe("string");
    expect(schemas[0].fields.tags.type).toBe("array");
    expect(schemas[0].required).toEqual(["title"]);
    expect(schemas[0].filePath).toContain("notes.yaml");
  });

  it("loads multiple schemas from single file", async () => {
    const schemaDir = path.join(tmpDir, "multi-schema-single-file");
    await fs.mkdir(schemaDir, { recursive: true });
    await fs.writeFile(
      path.join(schemaDir, "content.yaml"),
      `schemas:
  - name: article
    fields:
      title:
        type: string
  - name: reference
    fields:
      url:
        type: string
`,
      "utf8"
    );

    const schemas = await loadSchemas(buildConfig(schemaDir), tmpDir);

    expect(schemas.length).toBe(2);
    expect(schemas.map(s => s.name).sort()).toEqual(["article", "reference"]);
  });

  it("loads schemas from multiple YAML files", async () => {
    const schemaDir = path.join(tmpDir, "multi-file");
    await fs.mkdir(schemaDir, { recursive: true });
    await fs.writeFile(
      path.join(schemaDir, "notes.yaml"),
      `schemas:
  - name: note
    fields: {}
`,
      "utf8"
    );
    await fs.writeFile(
      path.join(schemaDir, "articles.yml"),
      `schemas:
  - name: article
    fields: {}
`,
      "utf8"
    );

    const schemas = await loadSchemas(buildConfig(schemaDir), tmpDir);

    expect(schemas.length).toBe(2);
    expect(schemas.map(s => s.name).sort()).toEqual(["article", "note"]);
  });

  it("throws error for duplicate schema names", async () => {
    const schemaDir = path.join(tmpDir, "duplicate");
    await fs.mkdir(schemaDir, { recursive: true });
    await fs.writeFile(
      path.join(schemaDir, "first.yaml"),
      `schemas:
  - name: duplicate
    fields: {}
`,
      "utf8"
    );
    await fs.writeFile(
      path.join(schemaDir, "second.yaml"),
      `schemas:
  - name: duplicate
    fields: {}
`,
      "utf8"
    );

    await expect(loadSchemas(buildConfig(schemaDir), tmpDir)).rejects.toThrow(/Duplicate schema name/);
  });

  it("returns empty array for directory with no schema files", async () => {
    const schemaDir = path.join(tmpDir, "empty");
    await fs.mkdir(schemaDir, { recursive: true });

    const schemas = await loadSchemas(buildConfig(schemaDir), tmpDir);

    expect(schemas).toEqual([]);
  });

  it("handles YAML file with no schemas array", async () => {
    const schemaDir = path.join(tmpDir, "no-schemas-key");
    await fs.mkdir(schemaDir, { recursive: true });
    await fs.writeFile(
      path.join(schemaDir, "empty.yaml"),
      `# Just a comment, no schemas key
other_key: value
`,
      "utf8"
    );

    const schemas = await loadSchemas(buildConfig(schemaDir), tmpDir);

    expect(schemas).toEqual([]);
  });

  it("defaults fields and required to empty when not specified", async () => {
    const schemaDir = path.join(tmpDir, "minimal");
    await fs.mkdir(schemaDir, { recursive: true });
    await fs.writeFile(
      path.join(schemaDir, "minimal.yaml"),
      `schemas:
  - name: minimal_schema
`,
      "utf8"
    );

    const schemas = await loadSchemas(buildConfig(schemaDir), tmpDir);

    expect(schemas.length).toBe(1);
    expect(schemas[0].name).toBe("minimal_schema");
    expect(schemas[0].fields).toEqual({});
    expect(schemas[0].required).toEqual([]);
  });

  it("loads schemas from nested subdirectories", async () => {
    const schemaDir = path.join(tmpDir, "nested");
    const subDir = path.join(schemaDir, "sub", "dir");
    await fs.mkdir(subDir, { recursive: true });
    await fs.writeFile(
      path.join(subDir, "nested.yaml"),
      `schemas:
  - name: nested_schema
    fields: {}
`,
      "utf8"
    );

    const schemas = await loadSchemas(buildConfig(schemaDir), tmpDir);

    expect(schemas.length).toBe(1);
    expect(schemas[0].name).toBe("nested_schema");
  });
});
