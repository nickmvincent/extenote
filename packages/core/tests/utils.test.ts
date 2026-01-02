import { describe, expect, it } from "bun:test";
import { hasValue, objectBelongsToProject, summarizeVault } from "../src/utils";
import type { ExtenoteConfig, VaultObject, VaultIssue } from "../src/types";

// ─── hasValue Tests ──────────────────────────────────────────────────────────

describe("hasValue", () => {
  it("returns false for null", () => {
    expect(hasValue(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(hasValue(undefined)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(hasValue("")).toBe(false);
  });

  it("returns false for whitespace-only string", () => {
    expect(hasValue("   ")).toBe(false);
    expect(hasValue("\t\n")).toBe(false);
  });

  it("returns false for empty array", () => {
    expect(hasValue([])).toBe(false);
  });

  it("returns true for non-empty string", () => {
    expect(hasValue("hello")).toBe(true);
    expect(hasValue(" hello ")).toBe(true);
  });

  it("returns true for non-empty array", () => {
    expect(hasValue([1, 2, 3])).toBe(true);
    expect(hasValue([""])).toBe(true); // array with empty string is still non-empty
  });

  it("returns true for objects", () => {
    expect(hasValue({})).toBe(true);
    expect(hasValue({ a: 1 })).toBe(true);
  });

  it("returns true for numbers including zero", () => {
    expect(hasValue(0)).toBe(true);
    expect(hasValue(42)).toBe(true);
    expect(hasValue(-1)).toBe(true);
  });

  it("returns true for booleans", () => {
    expect(hasValue(true)).toBe(true);
    expect(hasValue(false)).toBe(true);
  });
});

// ─── objectBelongsToProject Tests ────────────────────────────────────────────

describe("objectBelongsToProject", () => {
  const baseConfig: ExtenoteConfig = {
    schemaDir: "schemas",
    sources: [],
    sites: [],
    lint: { rules: {} },
  };

  it("returns true for direct project match", () => {
    const object = { project: "my-project" };
    expect(objectBelongsToProject(object, "my-project", baseConfig)).toBe(true);
  });

  it("returns false when project does not match and no includes", () => {
    const object = { project: "project-a" };
    expect(objectBelongsToProject(object, "project-b", baseConfig)).toBe(false);
  });

  it("returns true when target project includes object's project", () => {
    const config: ExtenoteConfig = {
      ...baseConfig,
      projectProfiles: [
        {
          name: "main-project",
          includes: ["sub-project-a", "sub-project-b"],
        },
      ],
    };
    const object = { project: "sub-project-a" };
    expect(objectBelongsToProject(object, "main-project", config)).toBe(true);
  });

  it("returns false when target project does not include object's project", () => {
    const config: ExtenoteConfig = {
      ...baseConfig,
      projectProfiles: [
        {
          name: "main-project",
          includes: ["sub-project-a"],
        },
      ],
    };
    const object = { project: "sub-project-c" };
    expect(objectBelongsToProject(object, "main-project", config)).toBe(false);
  });

  it("returns false when profile has no includes array", () => {
    const config: ExtenoteConfig = {
      ...baseConfig,
      projectProfiles: [
        {
          name: "main-project",
          // no includes
        },
      ],
    };
    const object = { project: "other-project" };
    expect(objectBelongsToProject(object, "main-project", config)).toBe(false);
  });

  it("returns false when projectProfiles is undefined", () => {
    const object = { project: "project-a" };
    expect(objectBelongsToProject(object, "project-b", baseConfig)).toBe(false);
  });
});

// ─── summarizeVault Tests ────────────────────────────────────────────────────

describe("summarizeVault", () => {
  function buildObject(overrides: Partial<VaultObject>): VaultObject {
    return {
      id: "test",
      type: "note",
      sourceId: "local",
      project: "default",
      filePath: "/tmp/test.md",
      relativePath: "test.md",
      frontmatter: {},
      body: "",
      mtime: Date.now(),
      visibility: "private",
      ...overrides,
    };
  }

  it("returns zero counts for empty arrays", () => {
    const summary = summarizeVault([], []);
    expect(summary.totalObjects).toBe(0);
    expect(summary.totalIssues).toBe(0);
    expect(summary.typeCounts).toEqual({});
    expect(summary.visibilityCounts).toEqual({});
    expect(summary.projectCounts).toEqual({});
  });

  it("counts objects by type", () => {
    const objects = [
      buildObject({ type: "note" }),
      buildObject({ type: "note" }),
      buildObject({ type: "article" }),
    ];
    const summary = summarizeVault(objects, []);
    expect(summary.typeCounts).toEqual({ note: 2, article: 1 });
  });

  it("counts objects by visibility", () => {
    const objects = [
      buildObject({ visibility: "public" }),
      buildObject({ visibility: "public" }),
      buildObject({ visibility: "private" }),
      buildObject({ visibility: "unlisted" }),
    ];
    const summary = summarizeVault(objects, []);
    expect(summary.visibilityCounts).toEqual({
      public: 2,
      private: 1,
      unlisted: 1,
    });
  });

  it("counts objects by project", () => {
    const objects = [
      buildObject({ project: "project-a" }),
      buildObject({ project: "project-a" }),
      buildObject({ project: "project-b" }),
    ];
    const summary = summarizeVault(objects, []);
    expect(summary.projectCounts).toEqual({
      "project-a": 2,
      "project-b": 1,
    });
  });

  it("counts issues by severity", () => {
    const issues: VaultIssue[] = [
      { sourceId: "local", filePath: "a.md", message: "error1", severity: "error" },
      { sourceId: "local", filePath: "b.md", message: "warn1", severity: "warn" },
      { sourceId: "local", filePath: "c.md", message: "warn2", severity: "warn" },
      { sourceId: "local", filePath: "d.md", message: "info1", severity: "info" },
    ];
    const summary = summarizeVault([], issues);
    expect(summary.issueCounts).toEqual({ error: 1, warn: 2, info: 1 });
    expect(summary.totalIssues).toBe(4);
  });

  it("handles comprehensive scenario", () => {
    const objects = [
      buildObject({ type: "note", visibility: "public", project: "main" }),
      buildObject({ type: "article", visibility: "private", project: "main" }),
      buildObject({ type: "note", visibility: "public", project: "other" }),
    ];
    const issues: VaultIssue[] = [
      { sourceId: "local", filePath: "a.md", message: "test", severity: "warn" },
    ];
    const summary = summarizeVault(objects, issues);

    expect(summary.totalObjects).toBe(3);
    expect(summary.totalIssues).toBe(1);
    expect(summary.typeCounts).toEqual({ note: 2, article: 1 });
    expect(summary.visibilityCounts).toEqual({ public: 2, private: 1 });
    expect(summary.projectCounts).toEqual({ main: 2, other: 1 });
    expect(summary.issueCounts.warn).toBe(1);
  });
});
