import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  createMarkdownObject,
  slugify,
  determineBaseDir,
  selectSchemaProject,
  resolveVisibilityDefaults,
  buildCreatePlan,
  type ExtenoteConfig,
  type LoadedSchema,
} from "@extenote/core";

let tmpDir: string;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "extenote-create-"));
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

const schema: LoadedSchema = {
  name: "demo_note",
  description: "Example note",
  fields: {
    rating: { type: "number" },
    published: { type: "boolean" },
    tags: { type: "array", items: "string" }
  },
  required: ["rating", "published", "tags"],
  filePath: "schemas/demo.yaml"
};

/**
 * @narrative object-creation/full-flow
 * @title Object Creation Flow
 * @description This test demonstrates the complete object creation flow, from schema
 * selection to file creation. The flow is: Schema → CreatePlan → File.
 */
describe("createMarkdownObject", () => {
  /**
   * @narrative-step 1
   * @explanation The createMarkdownObject function uses schema field types to generate
   * appropriate placeholder values. Number fields get 0, booleans get false, arrays get [].
   * @code-highlight
   */
  it("uses type-aware placeholders for required fields", async () => {
    const config: ExtenoteConfig = {
      schemaDir: "schemas",
      sources: [{ id: "local", type: "local", root: tmpDir }],
      sites: [],
      lint: { rules: { "required-visibility": "warn" } },
      defaultVisibility: "private",
      visibilityField: "visibility"
    };

    const plan = await createMarkdownObject({
      config,
      schema,
      cwd: process.cwd(),
      slug: "demo"
    });

    const content = await fs.readFile(plan.filePath, "utf8");
    expect(content).toContain("rating: 0");
    expect(content).toContain("published: false");
    expect(content).toContain("tags: []");
  });
});

// ─── slugify Tests ───────────────────────────────────────────────────────────

/**
 * @narrative object-creation/slug-generation
 * @title Slug Generation
 * @description Slugs are URL-friendly identifiers derived from titles.
 * They're used for filenames and object IDs.
 */
describe("slugify", () => {
  /**
   * @narrative-step 1
   * @explanation Slugs are lowercase with hyphens replacing spaces and special characters removed.
   */
  it("converts to lowercase", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("replaces spaces with hyphens", () => {
    expect(slugify("my cool title")).toBe("my-cool-title");
  });

  it("removes special characters", () => {
    expect(slugify("Hello, World!")).toBe("hello-world");
    expect(slugify("What's up?")).toBe("what-s-up");
  });

  it("collapses multiple hyphens", () => {
    expect(slugify("hello   world")).toBe("hello-world");
    expect(slugify("hello---world")).toBe("hello-world");
  });

  it("removes leading and trailing hyphens", () => {
    expect(slugify("--hello--")).toBe("hello");
    expect(slugify("  hello  ")).toBe("hello");
  });

  it("handles unicode characters", () => {
    expect(slugify("Café Résumé")).toBe("caf-r-sum");
  });

  it("handles empty string", () => {
    expect(slugify("")).toBe("");
  });

  it("handles numbers", () => {
    expect(slugify("Article 123")).toBe("article-123");
  });
});

// ─── determineBaseDir Tests ──────────────────────────────────────────────────

/**
 * @narrative object-creation/directory-selection
 * @title Directory Selection Logic
 * @description When creating an object, the system must determine which directory
 * to place it in. This follows a priority order: explicit override → schema sourceIds →
 * project profile sourceIds → first local source → fallback to "content".
 */
describe("determineBaseDir", () => {
  const minimalSchema: LoadedSchema = {
    name: "note",
    fields: {},
    required: [],
    filePath: "schemas/note.yaml",
  };

  const baseConfig: ExtenoteConfig = {
    schemaDir: "schemas",
    sources: [],
    sites: [],
    lint: { rules: {} },
  };

  it("uses override when provided", () => {
    const result = determineBaseDir(baseConfig, minimalSchema, undefined, "/custom/path", "/cwd");
    expect(result).toBe("/custom/path");
  });

  it("uses relative override resolved against cwd", () => {
    const result = determineBaseDir(baseConfig, minimalSchema, undefined, "relative/path", "/cwd");
    expect(result).toBe("/cwd/relative/path");
  });

  it("uses schema sourceIds to find local source", () => {
    const config: ExtenoteConfig = {
      ...baseConfig,
      sources: [{ id: "my-source", type: "local", root: "content/notes" }],
    };
    const schemaWithSource: LoadedSchema = {
      ...minimalSchema,
      sourceIds: ["my-source"],
    };
    const result = determineBaseDir(config, schemaWithSource, undefined, undefined, "/cwd");
    expect(result).toBe("/cwd/content/notes");
  });

  it("uses project profile sourceIds", () => {
    const config: ExtenoteConfig = {
      ...baseConfig,
      sources: [{ id: "proj-source", type: "local", root: "projects/main" }],
      projectProfiles: [{ name: "main", sourceIds: ["proj-source"] }],
    };
    const result = determineBaseDir(config, minimalSchema, "main", undefined, "/cwd");
    expect(result).toBe("/cwd/projects/main");
  });

  it("falls back to first local source", () => {
    const config: ExtenoteConfig = {
      ...baseConfig,
      sources: [{ id: "fallback", type: "local", root: "fallback/content" }],
    };
    const result = determineBaseDir(config, minimalSchema, undefined, undefined, "/cwd");
    expect(result).toBe("/cwd/fallback/content");
  });

  it("falls back to 'content' when no sources", () => {
    const result = determineBaseDir(baseConfig, minimalSchema, undefined, undefined, "/cwd");
    expect(result).toBe("/cwd/content");
  });
});

// ─── selectSchemaProject Tests ───────────────────────────────────────────────

/**
 * @narrative object-creation/project-selection
 * @title Schema-Project Association
 * @description Schemas can be restricted to specific projects. This controls which
 * projects can use a schema, and auto-selects when there's only one option.
 */
describe("selectSchemaProject", () => {
  const minimalSchema: LoadedSchema = {
    name: "note",
    fields: {},
    required: [],
    filePath: "schemas/note.yaml",
  };

  it("returns undefined when schema has no projects", () => {
    const result = selectSchemaProject(minimalSchema, undefined);
    expect(result).toBeUndefined();
  });

  it("returns requested when schema has no projects constraint", () => {
    const result = selectSchemaProject(minimalSchema, "my-project");
    expect(result).toBe("my-project");
  });

  it("auto-selects single project", () => {
    const schema: LoadedSchema = { ...minimalSchema, projects: ["only-project"] };
    const result = selectSchemaProject(schema, undefined);
    expect(result).toBe("only-project");
  });

  it("returns requested project when valid", () => {
    const schema: LoadedSchema = { ...minimalSchema, projects: ["proj-a", "proj-b"] };
    const result = selectSchemaProject(schema, "proj-b");
    expect(result).toBe("proj-b");
  });

  it("throws when requested project not in schema projects", () => {
    const schema: LoadedSchema = { ...minimalSchema, projects: ["proj-a", "proj-b"] };
    expect(() => selectSchemaProject(schema, "proj-c")).toThrow(/not associated with schema/);
  });

  it("throws when multiple projects and none requested", () => {
    const schema: LoadedSchema = { ...minimalSchema, projects: ["proj-a", "proj-b"] };
    expect(() => selectSchemaProject(schema, undefined)).toThrow(/multiple projects/);
  });
});

// ─── resolveVisibilityDefaults Tests ─────────────────────────────────────────

/**
 * @narrative object-creation/visibility-inheritance
 * @title Visibility Inheritance
 * @description Visibility settings follow an inheritance chain:
 * Config defaults → Project profile overrides → Hardcoded fallbacks.
 * This determines which field name and default value are used.
 */
describe("resolveVisibilityDefaults", () => {
  const minimalSchema: LoadedSchema = {
    name: "note",
    fields: {},
    required: [],
    filePath: "schemas/note.yaml",
  };

  const baseConfig: ExtenoteConfig = {
    schemaDir: "schemas",
    sources: [],
    sites: [],
    lint: { rules: {} },
  };

  it("uses config defaults", () => {
    const config: ExtenoteConfig = {
      ...baseConfig,
      visibilityField: "status",
      defaultVisibility: "public",
    };
    const result = resolveVisibilityDefaults(config, minimalSchema);
    expect(result.visibilityField).toBe("status");
    expect(result.defaultVisibility).toBe("public");
  });

  it("uses project profile overrides", () => {
    const config: ExtenoteConfig = {
      ...baseConfig,
      visibilityField: "visibility",
      defaultVisibility: "private",
      projectProfiles: [
        {
          name: "public-project",
          visibilityField: "access",
          defaultVisibility: "public",
        },
      ],
    };
    const schema: LoadedSchema = { ...minimalSchema, projects: ["public-project"] };
    const result = resolveVisibilityDefaults(config, schema, "public-project");
    expect(result.visibilityField).toBe("access");
    expect(result.defaultVisibility).toBe("public");
  });

  it("falls back to hardcoded defaults", () => {
    const result = resolveVisibilityDefaults(baseConfig, minimalSchema);
    expect(result.visibilityField).toBe("visibility");
    expect(result.defaultVisibility).toBe("private");
  });
});

// ─── buildCreatePlan Tests ───────────────────────────────────────────────────

/**
 * @narrative object-creation/create-plan
 * @title Create Plan Generation
 * @description The CreatePlan object contains all the information needed to create
 * a new object: target directory, filename, visibility settings, and metadata.
 * This is the intermediate representation before file creation.
 */
describe("buildCreatePlan", () => {
  const minimalSchema: LoadedSchema = {
    name: "note",
    fields: {},
    required: [],
    filePath: "schemas/note.yaml",
  };

  const baseConfig: ExtenoteConfig = {
    schemaDir: "schemas",
    sources: [{ id: "local", type: "local", root: "content" }],
    sites: [],
    lint: { rules: {} },
  };

  it("builds complete plan with all defaults", () => {
    const plan = buildCreatePlan({
      config: baseConfig,
      schema: minimalSchema,
      cwd: "/home/user/project",
    });

    expect(plan.slug).toBe("note"); // derived from schema name
    expect(plan.title).toBe("note");
    expect(plan.visibility).toBe("private");
    expect(plan.visibilityField).toBe("visibility");
    expect(plan.filePath).toContain("note.md");
  });

  it("uses provided slug and title", () => {
    const plan = buildCreatePlan({
      config: baseConfig,
      schema: minimalSchema,
      cwd: "/home/user/project",
      slug: "my-custom-slug",
      title: "My Custom Title",
    });

    expect(plan.slug).toBe("my-custom-slug");
    expect(plan.title).toBe("My Custom Title");
    expect(plan.filePath).toContain("my-custom-slug.md");
  });

  it("generates slug from title", () => {
    const plan = buildCreatePlan({
      config: baseConfig,
      schema: minimalSchema,
      cwd: "/home/user/project",
      title: "Hello World Example",
    });

    expect(plan.slug).toBe("hello-world-example");
  });

  it("includes project in plan when specified", () => {
    const schema: LoadedSchema = { ...minimalSchema, projects: ["my-project"] };
    const plan = buildCreatePlan({
      config: baseConfig,
      schema,
      cwd: "/home/user/project",
    });

    expect(plan.project).toBe("my-project");
  });

  it("avoids duplicate project prefix when source root includes project name", () => {
    // When source root already ends with project name (e.g., content/shared-references),
    // don't add project prefix to subdirectory
    const config: ExtenoteConfig = {
      ...baseConfig,
      sources: [{ id: "refs", type: "local", root: "content/shared-references" }],
    };
    const schema: LoadedSchema = {
      ...minimalSchema,
      name: "bibtex_entry",
      subdirectory: "bibtex-entries",
      projects: ["shared-references"],
      sourceIds: ["refs"],
    };
    const plan = buildCreatePlan({
      config,
      schema,
      cwd: "/home/user/project",
      slug: "test-entry",
    });

    // Should be content/shared-references/bibtex-entries/test-entry.md
    // NOT content/shared-references/shared-references/bibtex-entries/test-entry.md
    expect(plan.targetDir).toBe("/home/user/project/content/shared-references/bibtex-entries");
    expect(plan.filePath).toBe("/home/user/project/content/shared-references/bibtex-entries/test-entry.md");
  });
});
