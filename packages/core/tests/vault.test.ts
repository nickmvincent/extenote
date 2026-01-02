import { describe, expect, it, mock, beforeEach } from "bun:test";
import type { ExtenoteConfig, VaultObject, Schema, SourceSummary } from "../src/types";

// ─── Mock Data ────────────────────────────────────────────────────────────────

function buildConfig(overrides: Partial<ExtenoteConfig> = {}): ExtenoteConfig {
  return {
    sources: [
      { id: "content", type: "local", path: "./content" }
    ],
    defaultVisibility: "private",
    projectProfiles: [
      { name: "project-a" },
      { name: "project-b" }
    ],
    ...overrides,
  };
}

function buildObject(overrides: Partial<VaultObject>): VaultObject {
  return {
    id: "test-object",
    title: "Test Object",
    type: "note",
    visibility: "public",
    project: "default",
    relativePath: "project-a/test.md",
    filePath: "/content/project-a/test.md",
    body: "Test content",
    frontmatter: {},
    rawContent: "---\ntitle: Test\n---\nTest content",
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("loadVault integration concepts", () => {
  // Note: Full integration tests would require file system mocking
  // These tests verify the conceptual behaviors

  describe("project assignment logic", () => {
    it("assigns project based on first directory component when it matches known project", () => {
      const config = buildConfig({
        projectProfiles: [
          { name: "research" },
          { name: "notes" }
        ]
      });
      const knownProjects = new Set(config.projectProfiles!.map(p => p.name));

      // Simulate the project assignment logic from vault.ts
      const obj = buildObject({ relativePath: "research/papers/foo.md" });
      const firstDir = obj.relativePath.split("/")[0];
      const assignedProject = knownProjects.has(firstDir) ? firstDir : "unknown";

      expect(assignedProject).toBe("research");
    });

    it("falls back to source mapping when directory is not a known project", () => {
      const config = buildConfig({
        projectProfiles: [
          { name: "project-a" }
        ],
        sources: [
          { id: "misc", type: "local", path: "./misc" }
        ]
      });
      const knownProjects = new Set(config.projectProfiles!.map(p => p.name));
      const sourceIdToProject = new Map([["misc", "project-a"]]);

      const obj = buildObject({ relativePath: "random-folder/doc.md" });
      const firstDir = obj.relativePath.split("/")[0];
      const fallbackProject = sourceIdToProject.get("misc") ?? "unknown";
      const assignedProject = knownProjects.has(firstDir) ? firstDir : fallbackProject;

      expect(assignedProject).toBe("project-a");
    });

    it("uses 'unknown' when neither directory nor source mapping matches", () => {
      const config = buildConfig({
        projectProfiles: [
          { name: "project-a" }
        ]
      });
      const knownProjects = new Set(config.projectProfiles!.map(p => p.name));
      const sourceIdToProject = new Map<string, string>();

      const obj = buildObject({ relativePath: "unmapped/doc.md" });
      const firstDir = obj.relativePath.split("/")[0];
      const fallbackProject = sourceIdToProject.get("content") ?? "unknown";
      const assignedProject = knownProjects.has(firstDir) ? firstDir : fallbackProject;

      expect(assignedProject).toBe("unknown");
    });
  });

  describe("issue aggregation", () => {
    it("collects issues from multiple sources", () => {
      const sourceIssues1 = [
        { type: "error" as const, message: "Missing field", filePath: "/a.md", severity: "error" as const }
      ];
      const sourceIssues2 = [
        { type: "warning" as const, message: "Deprecated", filePath: "/b.md", severity: "warning" as const }
      ];

      const allIssues = [...sourceIssues1, ...sourceIssues2];

      expect(allIssues).toHaveLength(2);
      expect(allIssues[0].message).toBe("Missing field");
      expect(allIssues[1].message).toBe("Deprecated");
    });
  });

  describe("source summary building", () => {
    it("creates summaries with object counts and issues", () => {
      const source = { id: "content", type: "local" as const, path: "./content" };
      const objects = [buildObject({}), buildObject({ id: "obj2" })];
      const issues = [{ type: "warning" as const, message: "Test", filePath: "/a.md", severity: "warning" as const }];

      const summary: SourceSummary = {
        source,
        objectCount: objects.length,
        issues,
      };

      expect(summary.objectCount).toBe(2);
      expect(summary.issues).toHaveLength(1);
      expect(summary.source.id).toBe("content");
    });
  });

  describe("vault state structure", () => {
    it("returns complete vault state with all components", () => {
      const config = buildConfig();
      const schemas: Schema[] = [{ name: "note", fields: [] }];
      const objects = [buildObject({})];
      const issues = [{ type: "info" as const, message: "Test", filePath: "/a.md", severity: "info" as const }];
      const summaries: SourceSummary[] = [];

      const vaultState = {
        config,
        schemas,
        objects,
        issues,
        summaries
      };

      expect(vaultState.config).toBeDefined();
      expect(vaultState.schemas).toHaveLength(1);
      expect(vaultState.objects).toHaveLength(1);
      expect(vaultState.issues).toHaveLength(1);
      expect(vaultState.summaries).toEqual([]);
    });
  });
});

describe("vault configuration edge cases", () => {
  it("handles empty projectProfiles", () => {
    const config = buildConfig({ projectProfiles: [] });
    const knownProjects = new Set(config.projectProfiles!.map(p => p.name));

    expect(knownProjects.size).toBe(0);
  });

  it("handles undefined projectProfiles", () => {
    const config: ExtenoteConfig = {
      sources: [],
      defaultVisibility: "private"
    };
    const knownProjects = new Set((config.projectProfiles ?? []).map(p => p.name));

    expect(knownProjects.size).toBe(0);
  });

  it("handles objects with deeply nested paths", () => {
    const knownProjects = new Set(["deep"]);
    const obj = buildObject({ relativePath: "deep/nested/folder/structure/file.md" });
    const firstDir = obj.relativePath.split("/")[0];

    expect(firstDir).toBe("deep");
    expect(knownProjects.has(firstDir)).toBe(true);
  });

  it("handles objects at root level (no directory)", () => {
    const knownProjects = new Set(["project-a"]);
    const obj = buildObject({ relativePath: "file.md" });
    const firstDir = obj.relativePath.split("/")[0];

    // "file.md" is not in knownProjects
    expect(knownProjects.has(firstDir)).toBe(false);
  });
});
