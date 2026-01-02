import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { exportContent } from "../src/exporters";
import type { ExtenoteConfig, LoadedSchema, VaultObject } from "../src/types";

let tmpDir: string;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "extenote-export-"));
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ─── Test Fixtures ───────────────────────────────────────────────────────────

const config: ExtenoteConfig = {
  schemaDir: "schemas",
  sources: [],
  sites: [],
  lint: { rules: { "required-visibility": "warn" } },
  defaultVisibility: "public",
  visibilityField: "visibility",
};

const schema: LoadedSchema = {
  name: "demo_note",
  description: "",
  fields: {},
  required: [],
  filePath: "schemas/demo.yaml",
};

const bibtexSchema: LoadedSchema = {
  name: "bibtex_entry",
  description: "Bibliographic entry",
  fields: {},
  required: [],
  filePath: "schemas/bibtex_entry.yaml",
};

function buildObject(overrides: Partial<VaultObject> = {}): VaultObject {
  const base: VaultObject = {
    id: "demo",
    type: "demo_note",
    sourceId: "local",
    filePath: "/tmp/demo.md",
    relativePath: "demo.md",
    frontmatter: { type: "demo_note", title: "Demo" },
    body: "Hello world",
    title: "Demo",
    mtime: Date.now(),
    schema,
    visibility: "public",
  };

  if (overrides.frontmatter) {
    return {
      ...base,
      ...overrides,
      frontmatter: { ...base.frontmatter, ...overrides.frontmatter },
    };
  }
  return { ...base, ...overrides };
}

function buildBibtexObject(overrides: Partial<VaultObject> = {}): VaultObject {
  const base: VaultObject = {
    id: "smith-2024",
    type: "bibtex_entry",
    sourceId: "local",
    filePath: "/tmp/smith-2024.md",
    relativePath: "smith-2024.md",
    frontmatter: {
      type: "bibtex_entry",
      title: "Test Paper Title",
      entry_type: "article",
      citation_key: "smith2024",
      authors: ["John Smith", "Jane Doe"],
      year: 2024,
      venue: "Journal of Testing",
    },
    body: "Paper notes here",
    title: "Test Paper Title",
    mtime: Date.now(),
    schema: bibtexSchema,
    visibility: "public",
  };

  if (overrides.frontmatter) {
    return {
      ...base,
      ...overrides,
      frontmatter: { ...base.frontmatter, ...overrides.frontmatter },
    };
  }
  return { ...base, ...overrides };
}

// ─── JSON Exporter Tests ─────────────────────────────────────────────────────

/**
 * @narrative export/json-format
 * @title JSON Export Format
 * @description The JSON exporter creates a single objects.json file containing
 * all vault objects with their frontmatter and body content.
 */
describe("exportContent - JSON format", () => {
  /**
   * @narrative-step 1
   * @explanation Basic JSON export creates a single file with structured data.
   */
  it("writes JSON bundle with single object", async () => {
    const outputDir = path.join(tmpDir, "json-single");
    const object = buildObject();
    const result = await exportContent({
      format: "json",
      outputDir,
      objects: [object],
      config,
      schemas: [schema],
    });

    expect(result.format).toBe("json");
    expect(result.files.length).toBe(1);
    expect(result.files[0]).toContain("objects.json");

    const content = JSON.parse(
      await fs.readFile(result.files[0], "utf8")
    );
    expect(content.objects).toHaveLength(1);
    expect(content.objects[0].id).toBe("demo");
    expect(content.objects[0].title).toBe("Demo");
    expect(content.objects[0].body).toBe("Hello world");
  });

  /**
   * @narrative-step 2
   * @explanation Multiple objects are exported to the same JSON file.
   */
  it("writes multiple objects to single JSON file", async () => {
    const outputDir = path.join(tmpDir, "json-multi");
    const obj1 = buildObject({ id: "first", title: "First" });
    const obj2 = buildObject({ id: "second", title: "Second" });
    const result = await exportContent({
      format: "json",
      outputDir,
      objects: [obj1, obj2],
      config,
      schemas: [schema],
    });

    const content = JSON.parse(
      await fs.readFile(result.files[0], "utf8")
    );
    expect(content.objects).toHaveLength(2);
    expect(content.objects[0].id).toBe("first");
    expect(content.objects[1].id).toBe("second");
  });

  it("handles empty objects array", async () => {
    const outputDir = path.join(tmpDir, "json-empty");
    const result = await exportContent({
      format: "json",
      outputDir,
      objects: [],
      config,
      schemas: [],
    });

    const content = JSON.parse(
      await fs.readFile(result.files[0], "utf8")
    );
    expect(content.objects).toHaveLength(0);
  });

  it("includes frontmatter in JSON output", async () => {
    const outputDir = path.join(tmpDir, "json-frontmatter");
    const object = buildObject({
      frontmatter: {
        type: "demo_note",
        title: "Demo",
        tags: ["test", "example"],
        custom_field: "custom value",
      },
    });
    const result = await exportContent({
      format: "json",
      outputDir,
      objects: [object],
      config,
      schemas: [schema],
    });

    const content = JSON.parse(
      await fs.readFile(result.files[0], "utf8")
    );
    expect(content.objects[0].frontmatter.tags).toEqual(["test", "example"]);
    expect(content.objects[0].frontmatter.custom_field).toBe("custom value");
  });

  it("preserves visibility in JSON output", async () => {
    const outputDir = path.join(tmpDir, "json-visibility");
    const publicObj = buildObject({ id: "public-obj", visibility: "public" });
    const privateObj = buildObject({ id: "private-obj", visibility: "private" });
    const result = await exportContent({
      format: "json",
      outputDir,
      objects: [publicObj, privateObj],
      config,
      schemas: [schema],
    });

    const content = JSON.parse(
      await fs.readFile(result.files[0], "utf8")
    );
    expect(content.objects[0].visibility).toBe("public");
    expect(content.objects[1].visibility).toBe("private");
  });
});

// ─── Markdown Exporter Tests ─────────────────────────────────────────────────

/**
 * @narrative export/markdown-mirror
 * @title Markdown Mirror Export
 * @description The markdown exporter creates a mirror of the vault structure,
 * preserving source organization and directory hierarchy.
 */
describe("exportContent - Markdown format", () => {
  /**
   * @narrative-step 1
   * @explanation Each object becomes a separate .md file with frontmatter and body.
   */
  it("exports single object as markdown file", async () => {
    const outputDir = path.join(tmpDir, "md-single");
    const object = buildObject({
      sourceId: "source1",
      relativePath: "notes/demo.md",
    });
    const result = await exportContent({
      format: "markdown",
      outputDir,
      objects: [object],
      config,
      schemas: [schema],
    });

    expect(result.format).toBe("markdown");
    expect(result.files.length).toBe(1);

    const content = await fs.readFile(result.files[0], "utf8");
    expect(content).toContain("---");
    expect(content).toContain("title: Demo");
    expect(content).toContain("Hello world");
  });

  /**
   * @narrative-step 2
   * @explanation The directory structure mirrors sourceId/relativePath hierarchy.
   */
  it("creates proper directory structure", async () => {
    const outputDir = path.join(tmpDir, "md-structure");
    const obj1 = buildObject({
      id: "a",
      sourceId: "vault-a",
      relativePath: "folder/note-a.md",
    });
    const obj2 = buildObject({
      id: "b",
      sourceId: "vault-b",
      relativePath: "deep/nested/note-b.md",
    });
    const result = await exportContent({
      format: "markdown",
      outputDir,
      objects: [obj1, obj2],
      config,
      schemas: [schema],
    });

    expect(result.files).toHaveLength(2);
    expect(result.files[0]).toContain("vault-a");
    expect(result.files[0]).toContain("folder");
    expect(result.files[1]).toContain("vault-b");
    expect(result.files[1]).toContain("deep/nested");
  });

  it("handles empty objects array", async () => {
    const outputDir = path.join(tmpDir, "md-empty");
    const result = await exportContent({
      format: "markdown",
      outputDir,
      objects: [],
      config,
      schemas: [],
    });

    expect(result.files).toHaveLength(0);
  });

  it("preserves complex frontmatter", async () => {
    const outputDir = path.join(tmpDir, "md-frontmatter");
    const object = buildObject({
      frontmatter: {
        type: "demo_note",
        title: "Complex Note",
        tags: ["tag1", "tag2:subtag"],
        authors: ["Author One", "Author Two"],
        year: 2024,
      },
    });
    const result = await exportContent({
      format: "markdown",
      outputDir,
      objects: [object],
      config,
      schemas: [schema],
    });

    const content = await fs.readFile(result.files[0], "utf8");
    expect(content).toContain("tags:");
    expect(content).toContain("tag1");
    expect(content).toContain("year: 2024");
  });
});

// ─── HTML Exporter Tests ─────────────────────────────────────────────────────

/**
 * @narrative export/html-format
 * @title HTML Export Format
 * @description The HTML exporter creates a single-page HTML document
 * with all objects rendered as articles.
 */
describe("exportContent - HTML format", () => {
  /**
   * @narrative-step 1
   * @explanation All objects are rendered as article elements in a single HTML file.
   */
  it("exports objects as HTML page", async () => {
    const outputDir = path.join(tmpDir, "html-single");
    const object = buildObject();
    const result = await exportContent({
      format: "html",
      outputDir,
      objects: [object],
      config,
      schemas: [schema],
    });

    expect(result.format).toBe("html");
    expect(result.files.length).toBe(1);
    expect(result.files[0]).toContain("index.html");

    const content = await fs.readFile(result.files[0], "utf8");
    expect(content).toContain("<!doctype html>");
    expect(content).toContain("<h2>Demo</h2>");
    expect(content).toContain("Hello world");
  });

  /**
   * @narrative-step 2
   * @explanation Object count is displayed in the page title.
   */
  it("shows object count in header", async () => {
    const outputDir = path.join(tmpDir, "html-count");
    const objects = [
      buildObject({ id: "a", title: "A" }),
      buildObject({ id: "b", title: "B" }),
      buildObject({ id: "c", title: "C" }),
    ];
    const result = await exportContent({
      format: "html",
      outputDir,
      objects,
      config,
      schemas: [schema],
    });

    const content = await fs.readFile(result.files[0], "utf8");
    expect(content).toContain("3 objects");
  });

  it("escapes HTML special characters in body", async () => {
    const outputDir = path.join(tmpDir, "html-escape");
    const object = buildObject({
      body: "<script>alert('xss')</script> & more <tags>",
    });
    const result = await exportContent({
      format: "html",
      outputDir,
      objects: [object],
      config,
      schemas: [schema],
    });

    const content = await fs.readFile(result.files[0], "utf8");
    expect(content).toContain("&lt;script&gt;");
    expect(content).toContain("&amp;");
    expect(content).not.toContain("<script>");
  });

  it("falls back to ID when title is missing", async () => {
    const outputDir = path.join(tmpDir, "html-notitle");
    const object = buildObject({
      id: "fallback-id",
      title: undefined,
    });
    const result = await exportContent({
      format: "html",
      outputDir,
      objects: [object],
      config,
      schemas: [schema],
    });

    const content = await fs.readFile(result.files[0], "utf8");
    expect(content).toContain("<h2>fallback-id</h2>");
  });

  it("truncates very long body content", async () => {
    const outputDir = path.join(tmpDir, "html-long");
    const longBody = "x".repeat(5000);
    const object = buildObject({ body: longBody });
    const result = await exportContent({
      format: "html",
      outputDir,
      objects: [object],
      config,
      schemas: [schema],
    });

    const content = await fs.readFile(result.files[0], "utf8");
    // Body is truncated to 2000 chars
    const bodyMatch = content.match(/<pre>([^<]*)<\/pre>/);
    expect(bodyMatch).toBeTruthy();
    expect(bodyMatch![1].length).toBeLessThanOrEqual(2000);
  });

  it("includes metadata in article", async () => {
    const outputDir = path.join(tmpDir, "html-meta");
    const object = buildObject({
      type: "custom_type",
      visibility: "private",
      sourceId: "my-source",
    });
    const result = await exportContent({
      format: "html",
      outputDir,
      objects: [object],
      config,
      schemas: [schema],
    });

    const content = await fs.readFile(result.files[0], "utf8");
    expect(content).toContain("custom_type");
    expect(content).toContain("private");
    expect(content).toContain("my-source");
  });

  it("handles empty objects array", async () => {
    const outputDir = path.join(tmpDir, "html-empty");
    const result = await exportContent({
      format: "html",
      outputDir,
      objects: [],
      config,
      schemas: [],
    });

    const content = await fs.readFile(result.files[0], "utf8");
    expect(content).toContain("0 objects");
  });
});

// ─── ATProto Exporter Tests ──────────────────────────────────────────────────

/**
 * @narrative export/atproto-format
 * @title ATProto Export Format
 * @description The ATProto exporter creates records compatible with the
 * AT Protocol, ready for publishing to Bluesky/ATProto networks.
 */
describe("exportContent - ATProto format", () => {
  /**
   * @narrative-step 1
   * @explanation Records include $type field and createdAt timestamp.
   */
  it("exports objects as ATProto records", async () => {
    const outputDir = path.join(tmpDir, "proto-single");
    const object = buildObject({ mtime: 1704067200000 }); // 2024-01-01 00:00:00 UTC
    const result = await exportContent({
      format: "atproto",
      outputDir,
      objects: [object],
      config,
      schemas: [schema],
    });

    expect(result.format).toBe("atproto");
    expect(result.files[0]).toContain("records.json");

    const content = JSON.parse(
      await fs.readFile(result.files[0], "utf8")
    );
    expect(content.records).toHaveLength(1);
    expect(content.records[0].collection).toBe("app.extenote.demo_note");
    expect(content.records[0].record.$type).toBe("app.extenote.demo_note");
    expect(content.records[0].record.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  /**
   * @narrative-step 2
   * @explanation Collection names are derived from object type.
   */
  it("uses object type for collection name", async () => {
    const outputDir = path.join(tmpDir, "proto-collection");
    const customSchema: LoadedSchema = { ...schema, name: "my_custom_type" };
    const object = buildObject({ type: "my_custom_type", schema: customSchema });
    const result = await exportContent({
      format: "atproto",
      outputDir,
      objects: [object],
      config,
      schemas: [customSchema],
    });

    const content = JSON.parse(
      await fs.readFile(result.files[0], "utf8")
    );
    expect(content.records[0].collection).toBe("app.extenote.my_custom_type");
  });

  it("falls back to ID when title is missing", async () => {
    const outputDir = path.join(tmpDir, "proto-notitle");
    const object = buildObject({
      id: "fallback-record-id",
      title: undefined,
    });
    const result = await exportContent({
      format: "atproto",
      outputDir,
      objects: [object],
      config,
      schemas: [schema],
    });

    const content = JSON.parse(
      await fs.readFile(result.files[0], "utf8")
    );
    expect(content.records[0].record.title).toBe("fallback-record-id");
  });

  it("includes metadata from frontmatter", async () => {
    const outputDir = path.join(tmpDir, "proto-metadata");
    const object = buildObject({
      frontmatter: {
        type: "demo_note",
        title: "Demo",
        tags: ["tag1", "tag2"],
        custom: "value",
      },
    });
    const result = await exportContent({
      format: "atproto",
      outputDir,
      objects: [object],
      config,
      schemas: [schema],
    });

    const content = JSON.parse(
      await fs.readFile(result.files[0], "utf8")
    );
    expect(content.records[0].record.metadata.tags).toEqual(["tag1", "tag2"]);
    expect(content.records[0].record.metadata.custom).toBe("value");
  });

  it("includes visibility in record", async () => {
    const outputDir = path.join(tmpDir, "proto-visibility");
    const object = buildObject({ visibility: "private" });
    const result = await exportContent({
      format: "atproto",
      outputDir,
      objects: [object],
      config,
      schemas: [schema],
    });

    const content = JSON.parse(
      await fs.readFile(result.files[0], "utf8")
    );
    expect(content.records[0].record.visibility).toBe("private");
  });

  it("handles empty objects array", async () => {
    const outputDir = path.join(tmpDir, "proto-empty");
    const result = await exportContent({
      format: "atproto",
      outputDir,
      objects: [],
      config,
      schemas: [],
    });

    const content = JSON.parse(
      await fs.readFile(result.files[0], "utf8")
    );
    expect(content.records).toHaveLength(0);
  });
});

// ─── BibTeX Exporter Tests ───────────────────────────────────────────────────

/**
 * @narrative export/bibtex-format
 * @title BibTeX Export Format
 * @description The BibTeX exporter converts bibtex_entry objects to
 * standard .bib format for use with LaTeX and citation managers.
 */
describe("exportContent - BibTeX format", () => {
  /**
   * @narrative-step 1
   * @explanation Only bibtex_entry objects are included in the export.
   */
  it("exports bibtex entries to .bib file", async () => {
    const outputDir = path.join(tmpDir, "bib-single");
    const object = buildBibtexObject();
    const result = await exportContent({
      format: "bibtex",
      outputDir,
      objects: [object],
      config,
      schemas: [bibtexSchema],
    });

    expect(result.format).toBe("bibtex");
    expect(result.files[0]).toContain("references.bib");

    const content = await fs.readFile(result.files[0], "utf8");
    expect(content).toContain("@article{smith2024,");
    expect(content).toContain("title = {Test Paper Title}");
    expect(content).toContain("author = {John Smith and Jane Doe}");
    expect(content).toContain("year = {2024}");
    expect(content).toContain("journal = {Journal of Testing}");
  });

  /**
   * @narrative-step 2
   * @explanation Non-bibtex objects are filtered out.
   */
  it("filters out non-bibtex objects", async () => {
    const outputDir = path.join(tmpDir, "bib-filter");
    const bibObj = buildBibtexObject();
    const noteObj = buildObject(); // demo_note type
    const result = await exportContent({
      format: "bibtex",
      outputDir,
      objects: [bibObj, noteObj],
      config,
      schemas: [bibtexSchema, schema],
    });

    const content = await fs.readFile(result.files[0], "utf8");
    expect(content).toContain("@article{smith2024,");
    expect(content).not.toContain("demo_note");
    expect(content).not.toContain("demo");
  });

  it("handles different entry types", async () => {
    const outputDir = path.join(tmpDir, "bib-types");
    const article = buildBibtexObject({
      id: "article1",
      frontmatter: {
        type: "bibtex_entry",
        entry_type: "article",
        citation_key: "article1",
        title: "Article Title",
        venue: "Some Journal",
      },
    });
    const inproc = buildBibtexObject({
      id: "inproc1",
      frontmatter: {
        type: "bibtex_entry",
        entry_type: "inproceedings",
        citation_key: "inproc1",
        title: "Conference Paper",
        venue: "Some Conference",
      },
    });
    const misc = buildBibtexObject({
      id: "misc1",
      frontmatter: {
        type: "bibtex_entry",
        entry_type: "misc",
        citation_key: "misc1",
        title: "Miscellaneous",
        venue: "Some Publisher",
      },
    });

    const result = await exportContent({
      format: "bibtex",
      outputDir,
      objects: [article, inproc, misc],
      config,
      schemas: [bibtexSchema],
    });

    const content = await fs.readFile(result.files[0], "utf8");
    expect(content).toContain("@article{article1,");
    expect(content).toContain("journal = {Some Journal}");
    expect(content).toContain("@inproceedings{inproc1,");
    expect(content).toContain("booktitle = {Some Conference}");
    expect(content).toContain("@misc{misc1,");
    expect(content).toContain("publisher = {Some Publisher}");
  });

  it("formats authors from array with 'and'", async () => {
    const outputDir = path.join(tmpDir, "bib-authors");
    const object = buildBibtexObject({
      frontmatter: {
        type: "bibtex_entry",
        title: "Multi Author Paper",
        citation_key: "multi2024",
        entry_type: "article",
        authors: ["First Author", "Second Author", "Third Author"],
      },
    });
    const result = await exportContent({
      format: "bibtex",
      outputDir,
      objects: [object],
      config,
      schemas: [bibtexSchema],
    });

    const content = await fs.readFile(result.files[0], "utf8");
    expect(content).toContain("author = {First Author and Second Author and Third Author}");
  });

  it("handles authors as string", async () => {
    const outputDir = path.join(tmpDir, "bib-author-string");
    const object = buildBibtexObject({
      frontmatter: {
        type: "bibtex_entry",
        title: "Single Author",
        citation_key: "single2024",
        entry_type: "article",
        authors: "Just One Author",
      },
    });
    const result = await exportContent({
      format: "bibtex",
      outputDir,
      objects: [object],
      config,
      schemas: [bibtexSchema],
    });

    const content = await fs.readFile(result.files[0], "utf8");
    expect(content).toContain("author = {Just One Author}");
  });

  it("includes DOI and URL when present", async () => {
    const outputDir = path.join(tmpDir, "bib-doi");
    const object = buildBibtexObject({
      frontmatter: {
        type: "bibtex_entry",
        title: "Paper with DOI",
        citation_key: "doi2024",
        entry_type: "article",
        doi: "10.1234/example.doi",
        url: "https://example.com/paper",
      },
    });
    const result = await exportContent({
      format: "bibtex",
      outputDir,
      objects: [object],
      config,
      schemas: [bibtexSchema],
    });

    const content = await fs.readFile(result.files[0], "utf8");
    expect(content).toContain("doi = {10.1234/example.doi}");
    expect(content).toContain("url = {https://example.com/paper}");
  });

  it("includes abstract when present", async () => {
    const outputDir = path.join(tmpDir, "bib-abstract");
    const object = buildBibtexObject({
      frontmatter: {
        type: "bibtex_entry",
        title: "Paper with Abstract",
        citation_key: "abs2024",
        entry_type: "article",
        abstract: "This paper discusses important topics.",
      },
    });
    const result = await exportContent({
      format: "bibtex",
      outputDir,
      objects: [object],
      config,
      schemas: [bibtexSchema],
    });

    const content = await fs.readFile(result.files[0], "utf8");
    expect(content).toContain("abstract = {This paper discusses important topics.}");
  });

  it("passes through custom fields", async () => {
    const outputDir = path.join(tmpDir, "bib-custom");
    const object = buildBibtexObject({
      frontmatter: {
        type: "bibtex_entry",
        title: "Paper with Custom",
        citation_key: "custom2024",
        entry_type: "article",
        keywords: "machine learning, deep learning",
        note: "This is a note",
        pages: "1-10",
        volume: "42",
        number: "3",
      },
    });
    const result = await exportContent({
      format: "bibtex",
      outputDir,
      objects: [object],
      config,
      schemas: [bibtexSchema],
    });

    const content = await fs.readFile(result.files[0], "utf8");
    expect(content).toContain("keywords = {machine learning, deep learning}");
    expect(content).toContain("note = {This is a note}");
    expect(content).toContain("pages = {1-10}");
    expect(content).toContain("volume = {42}");
    expect(content).toContain("number = {3}");
  });

  it("uses object ID as citation key when missing", async () => {
    const outputDir = path.join(tmpDir, "bib-fallback-key");
    // Create object without using buildBibtexObject to avoid default citation_key
    const object: VaultObject = {
      id: "fallback-key-id",
      type: "bibtex_entry",
      sourceId: "local",
      filePath: "/tmp/fallback.md",
      relativePath: "fallback.md",
      frontmatter: {
        type: "bibtex_entry",
        title: "No Citation Key",
        entry_type: "article",
        // citation_key is intentionally missing
      },
      body: "",
      title: "No Citation Key",
      mtime: Date.now(),
      schema: bibtexSchema,
      visibility: "public",
    };
    const result = await exportContent({
      format: "bibtex",
      outputDir,
      objects: [object],
      config,
      schemas: [bibtexSchema],
    });

    const content = await fs.readFile(result.files[0], "utf8");
    expect(content).toContain("@article{fallback-key-id,");
  });

  it("defaults to misc entry type when missing", async () => {
    const outputDir = path.join(tmpDir, "bib-default-type");
    // Create object without using buildBibtexObject to avoid default entry_type
    const object: VaultObject = {
      id: "notype2024",
      type: "bibtex_entry",
      sourceId: "local",
      filePath: "/tmp/notype.md",
      relativePath: "notype.md",
      frontmatter: {
        type: "bibtex_entry",
        title: "No Entry Type",
        citation_key: "notype2024",
        // entry_type is intentionally missing
      },
      body: "",
      title: "No Entry Type",
      mtime: Date.now(),
      schema: bibtexSchema,
      visibility: "public",
    };
    const result = await exportContent({
      format: "bibtex",
      outputDir,
      objects: [object],
      config,
      schemas: [bibtexSchema],
    });

    const content = await fs.readFile(result.files[0], "utf8");
    expect(content).toContain("@misc{notype2024,");
  });

  it("handles empty objects array", async () => {
    const outputDir = path.join(tmpDir, "bib-empty");
    const result = await exportContent({
      format: "bibtex",
      outputDir,
      objects: [],
      config,
      schemas: [],
    });

    const content = await fs.readFile(result.files[0], "utf8");
    expect(content.trim()).toBe("");
  });

  it("handles array fields by joining with comma", async () => {
    const outputDir = path.join(tmpDir, "bib-array-fields");
    const object = buildBibtexObject({
      frontmatter: {
        type: "bibtex_entry",
        title: "Paper with Tags",
        citation_key: "tags2024",
        entry_type: "article",
        tags: ["ml", "nlp", "transformers"],
      },
    });
    const result = await exportContent({
      format: "bibtex",
      outputDir,
      objects: [object],
      config,
      schemas: [bibtexSchema],
    });

    const content = await fs.readFile(result.files[0], "utf8");
    expect(content).toContain("tags = {ml, nlp, transformers}");
  });
});

// ─── Error Handling Tests ────────────────────────────────────────────────────

describe("exportContent - Error handling", () => {
  it("throws error for unknown format", async () => {
    const outputDir = path.join(tmpDir, "unknown-format");
    await expect(
      exportContent({
        format: "unknown" as any,
        outputDir,
        objects: [],
        config,
        schemas: [],
      })
    ).rejects.toThrow("Unknown export format unknown");
  });
});

// ─── Edge Cases ──────────────────────────────────────────────────────────────

describe("exportContent - Edge cases", () => {
  it("handles object with very large body", async () => {
    const outputDir = path.join(tmpDir, "large-body");
    const largeBody = "x".repeat(100000); // 100KB
    const object = buildObject({ body: largeBody });
    const result = await exportContent({
      format: "json",
      outputDir,
      objects: [object],
      config,
      schemas: [schema],
    });

    const content = JSON.parse(
      await fs.readFile(result.files[0], "utf8")
    );
    expect(content.objects[0].body.length).toBe(100000);
  });

  it("handles unicode content", async () => {
    const outputDir = path.join(tmpDir, "unicode");
    const object = buildObject({
      title: "日本語タイトル",
      body: "Content with émojis 🎉 and ñ special chars",
    });
    const result = await exportContent({
      format: "json",
      outputDir,
      objects: [object],
      config,
      schemas: [schema],
    });

    const content = JSON.parse(
      await fs.readFile(result.files[0], "utf8")
    );
    expect(content.objects[0].title).toBe("日本語タイトル");
    expect(content.objects[0].body).toContain("🎉");
  });

  it("handles special characters in frontmatter values", async () => {
    const outputDir = path.join(tmpDir, "special-chars");
    const object = buildObject({
      frontmatter: {
        type: "demo_note",
        title: 'Title with "quotes" and: colons',
        description: "Line 1\nLine 2\nLine 3",
      },
    });
    const result = await exportContent({
      format: "markdown",
      outputDir,
      objects: [object],
      config,
      schemas: [schema],
    });

    // Should create valid YAML
    const content = await fs.readFile(result.files[0], "utf8");
    expect(content).toContain("---");
    expect(content).toContain("quotes");
  });

  it("creates output directory if not exists", async () => {
    const outputDir = path.join(tmpDir, "nested", "deep", "path");
    const object = buildObject();
    const result = await exportContent({
      format: "json",
      outputDir,
      objects: [object],
      config,
      schemas: [schema],
    });

    expect(result.files.length).toBe(1);
    const stat = await fs.stat(result.files[0]);
    expect(stat.isFile()).toBe(true);
  });
});
