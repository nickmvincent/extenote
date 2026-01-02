import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { exportBibtex } from "../src/exporters/bibtex";
import type { ExportOptions, VaultObject, ExtenoteConfig, LoadedSchema } from "../src/types";

// ─── Test Setup ──────────────────────────────────────────────────────────────

let tmpDir: string;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "extenote-bibtex-test-"));
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function buildBibtexObject(overrides: Partial<VaultObject> & { frontmatter: Record<string, unknown> }): VaultObject {
  return {
    id: "test-entry",
    type: "bibtex_entry",
    sourceId: "local",
    project: "default",
    filePath: "/tmp/test.md",
    relativePath: "test.md",
    body: "",
    mtime: Date.now(),
    visibility: "public",
    ...overrides,
    frontmatter: {
      type: "bibtex_entry",
      ...overrides.frontmatter,
    },
  };
}

const baseConfig: ExtenoteConfig = {
  schemaDir: "schemas",
  sources: [],
  sites: [],
  lint: { rules: {} },
};

const baseSchema: LoadedSchema = {
  name: "bibtex_entry",
  fields: {},
  required: [],
  filePath: "schemas/bibtex.yaml",
};

// ─── exportBibtex Tests ──────────────────────────────────────────────────────

/**
 * @narrative export/bibtex
 * @title BibTeX Export
 * @description Export your bibliography entries to standard BibTeX format for use with
 * LaTeX, citation managers, and other academic tools. Extenote converts your markdown
 * frontmatter into properly formatted .bib entries.
 */
describe("exportBibtex", () => {
  /**
   * @narrative-step 1
   * @explanation The exporter creates a references.bib file containing all your
   * bibtex_entry objects. Each entry includes standard BibTeX fields like title,
   * author, and year.
   * @code-highlight
   */
  it("creates references.bib file", async () => {
    const outputDir = path.join(tmpDir, "basic-output");
    const object = buildBibtexObject({
      id: "smith2024",
      frontmatter: {
        entry_type: "article",
        citation_key: "smith2024",
        title: "A Test Article",
        authors: ["John Smith"],
        year: 2024,
      },
    });

    const options: ExportOptions = {
      format: "bibtex",
      outputDir,
      objects: [object],
      config: baseConfig,
      schemas: [baseSchema],
    };

    const result = await exportBibtex(options);

    expect(result.format).toBe("bibtex");
    expect(result.files.length).toBe(1);
    expect(result.files[0]).toContain("references.bib");

    const content = await fs.readFile(result.files[0], "utf8");
    expect(content).toContain("@article{smith2024");
    expect(content).toContain("title = {A Test Article}");
    expect(content).toContain("author = {John Smith}");
    expect(content).toContain("year = {2024}");
  });

  /**
   * @narrative-step 2
   * @explanation Only objects with type "bibtex_entry" are exported. Other content
   * types like notes or blog posts are automatically filtered out.
   */
  it("filters to only bibtex_entry type objects", async () => {
    const outputDir = path.join(tmpDir, "filter-output");
    const bibObject = buildBibtexObject({
      id: "bib-entry",
      frontmatter: { title: "BibTeX Entry" },
    });
    const noteObject: VaultObject = {
      id: "note-entry",
      type: "note",
      sourceId: "local",
      project: "default",
      filePath: "/tmp/note.md",
      relativePath: "note.md",
      frontmatter: { type: "note", title: "A Note" },
      body: "",
      mtime: Date.now(),
      visibility: "public",
    };

    const options: ExportOptions = {
      format: "bibtex",
      outputDir,
      objects: [bibObject, noteObject],
      config: baseConfig,
      schemas: [baseSchema],
    };

    const result = await exportBibtex(options);
    const content = await fs.readFile(result.files[0], "utf8");

    expect(content).toContain("bib-entry");
    expect(content).not.toContain("note-entry");
    expect(content).not.toContain("A Note");
  });

  /**
   * @narrative-step 3
   * @explanation The "venue" field in your frontmatter is mapped to the appropriate
   * BibTeX field: "journal" for articles, "booktitle" for conference papers.
   */
  it("exports article with journal field", async () => {
    const outputDir = path.join(tmpDir, "article-journal");
    const object = buildBibtexObject({
      id: "article1",
      frontmatter: {
        entry_type: "article",
        title: "Journal Article",
        venue: "Nature",
        year: 2023,
      },
    });

    const result = await exportBibtex({
      format: "bibtex",
      outputDir,
      objects: [object],
      config: baseConfig,
      schemas: [baseSchema],
    });

    const content = await fs.readFile(result.files[0], "utf8");
    expect(content).toContain("@article{");
    expect(content).toContain("journal = {Nature}");
  });

  it("exports inproceedings with booktitle field", async () => {
    const outputDir = path.join(tmpDir, "inproceedings");
    const object = buildBibtexObject({
      id: "conf1",
      frontmatter: {
        entry_type: "inproceedings",
        title: "Conference Paper",
        venue: "ICML 2024",
        year: 2024,
      },
    });

    const result = await exportBibtex({
      format: "bibtex",
      outputDir,
      objects: [object],
      config: baseConfig,
      schemas: [baseSchema],
    });

    const content = await fs.readFile(result.files[0], "utf8");
    expect(content).toContain("@inproceedings{");
    expect(content).toContain("booktitle = {ICML 2024}");
  });

  /**
   * @narrative-step 4
   * @explanation Author lists are automatically formatted with "and" separators
   * as required by BibTeX. You can list authors as an array in your frontmatter.
   */
  it("formats multiple authors with 'and' separator", async () => {
    const outputDir = path.join(tmpDir, "multi-author");
    const object = buildBibtexObject({
      id: "multi",
      frontmatter: {
        entry_type: "article",
        title: "Collaborative Work",
        authors: ["Alice Smith", "Bob Jones", "Carol White"],
      },
    });

    const result = await exportBibtex({
      format: "bibtex",
      outputDir,
      objects: [object],
      config: baseConfig,
      schemas: [baseSchema],
    });

    const content = await fs.readFile(result.files[0], "utf8");
    expect(content).toContain("author = {Alice Smith and Bob Jones and Carol White}");
  });

  it("uses object ID as citation key when not specified", async () => {
    const outputDir = path.join(tmpDir, "default-key");
    const object = buildBibtexObject({
      id: "my-unique-id",
      frontmatter: {
        entry_type: "misc",
        title: "No Citation Key",
      },
    });

    const result = await exportBibtex({
      format: "bibtex",
      outputDir,
      objects: [object],
      config: baseConfig,
      schemas: [baseSchema],
    });

    const content = await fs.readFile(result.files[0], "utf8");
    expect(content).toContain("@misc{my-unique-id");
  });

  it("defaults to misc entry type when not specified", async () => {
    const outputDir = path.join(tmpDir, "default-type");
    const object = buildBibtexObject({
      id: "no-type",
      frontmatter: {
        title: "No Entry Type",
      },
    });

    const result = await exportBibtex({
      format: "bibtex",
      outputDir,
      objects: [object],
      config: baseConfig,
      schemas: [baseSchema],
    });

    const content = await fs.readFile(result.files[0], "utf8");
    expect(content).toContain("@misc{");
  });

  it("includes doi and url fields", async () => {
    const outputDir = path.join(tmpDir, "doi-url");
    const object = buildBibtexObject({
      id: "with-links",
      frontmatter: {
        entry_type: "article",
        title: "Linked Article",
        doi: "10.1234/example",
        url: "https://example.com/paper",
      },
    });

    const result = await exportBibtex({
      format: "bibtex",
      outputDir,
      objects: [object],
      config: baseConfig,
      schemas: [baseSchema],
    });

    const content = await fs.readFile(result.files[0], "utf8");
    expect(content).toContain("doi = {10.1234/example}");
    expect(content).toContain("url = {https://example.com/paper}");
  });

  it("handles empty objects array", async () => {
    const outputDir = path.join(tmpDir, "empty");

    const result = await exportBibtex({
      format: "bibtex",
      outputDir,
      objects: [],
      config: baseConfig,
      schemas: [baseSchema],
    });

    const content = await fs.readFile(result.files[0], "utf8");
    expect(content.trim()).toBe("");
  });

  it("exports multiple entries to single file", async () => {
    const outputDir = path.join(tmpDir, "multi-entry");
    const objects = [
      buildBibtexObject({ id: "entry1", frontmatter: { title: "First" } }),
      buildBibtexObject({ id: "entry2", frontmatter: { title: "Second" } }),
    ];

    const result = await exportBibtex({
      format: "bibtex",
      outputDir,
      objects,
      config: baseConfig,
      schemas: [baseSchema],
    });

    const content = await fs.readFile(result.files[0], "utf8");
    expect(content).toContain("entry1");
    expect(content).toContain("entry2");
    expect(content).toContain("First");
    expect(content).toContain("Second");
  });
});
