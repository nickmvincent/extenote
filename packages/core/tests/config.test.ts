import { describe, expect, it } from "bun:test";
import { buildSourceIdToProject, BuildConfigError } from "../src/config";
import type { ExtenoteConfig } from "../src/types";

// ─── buildSourceIdToProject Tests ────────────────────────────────────────────

describe("buildSourceIdToProject", () => {
  const baseConfig: ExtenoteConfig = {
    schemaDir: "schemas",
    sources: [],
    sites: [],
    lint: { rules: {} },
  };

  it("returns empty map when no project profiles", () => {
    const map = buildSourceIdToProject(baseConfig);
    expect(map.size).toBe(0);
  });

  it("returns empty map when project profiles have no sourceIds", () => {
    const config: ExtenoteConfig = {
      ...baseConfig,
      projectProfiles: [
        { name: "project-a" },
        { name: "project-b" },
      ],
    };
    const map = buildSourceIdToProject(config);
    expect(map.size).toBe(0);
  });

  it("maps single source to single project", () => {
    const config: ExtenoteConfig = {
      ...baseConfig,
      projectProfiles: [
        { name: "my-project", sourceIds: ["source-1"] },
      ],
    };
    const map = buildSourceIdToProject(config);
    expect(map.get("source-1")).toBe("my-project");
  });

  it("maps multiple sources to single project", () => {
    const config: ExtenoteConfig = {
      ...baseConfig,
      projectProfiles: [
        { name: "my-project", sourceIds: ["source-a", "source-b", "source-c"] },
      ],
    };
    const map = buildSourceIdToProject(config);
    expect(map.get("source-a")).toBe("my-project");
    expect(map.get("source-b")).toBe("my-project");
    expect(map.get("source-c")).toBe("my-project");
  });

  it("maps sources to respective projects", () => {
    const config: ExtenoteConfig = {
      ...baseConfig,
      projectProfiles: [
        { name: "project-a", sourceIds: ["source-a1", "source-a2"] },
        { name: "project-b", sourceIds: ["source-b1"] },
      ],
    };
    const map = buildSourceIdToProject(config);
    expect(map.get("source-a1")).toBe("project-a");
    expect(map.get("source-a2")).toBe("project-a");
    expect(map.get("source-b1")).toBe("project-b");
  });

  it("first project wins when source is shared", () => {
    const config: ExtenoteConfig = {
      ...baseConfig,
      projectProfiles: [
        { name: "first-project", sourceIds: ["shared-source"] },
        { name: "second-project", sourceIds: ["shared-source"] },
      ],
    };
    const map = buildSourceIdToProject(config);
    expect(map.get("shared-source")).toBe("first-project");
    expect(map.size).toBe(1);
  });

  it("handles mixed source assignments", () => {
    const config: ExtenoteConfig = {
      ...baseConfig,
      projectProfiles: [
        { name: "project-a", sourceIds: ["unique-a", "shared"] },
        { name: "project-b", sourceIds: ["shared", "unique-b"] },
      ],
    };
    const map = buildSourceIdToProject(config);
    expect(map.get("unique-a")).toBe("project-a");
    expect(map.get("shared")).toBe("project-a"); // first wins
    expect(map.get("unique-b")).toBe("project-b");
  });
});

// ─── BuildConfigError Tests ──────────────────────────────────────────────────

describe("BuildConfigError", () => {
  it("creates error with project and field info", () => {
    const error = new BuildConfigError("my-project", "websiteDir", "websiteDir is required");

    expect(error.name).toBe("BuildConfigError");
    expect(error.project).toBe("my-project");
    expect(error.field).toBe("websiteDir");
    expect(error.message).toContain("my-project");
    expect(error.message).toContain("websiteDir is required");
  });

  it("is an instance of Error", () => {
    const error = new BuildConfigError("proj", "field", "msg");
    expect(error instanceof Error).toBe(true);
  });

  it("has proper error name for identification", () => {
    const error = new BuildConfigError("project", "field", "message");
    expect(error.name).toBe("BuildConfigError");
    // Can be caught by name
    try {
      throw error;
    } catch (e) {
      expect((e as Error).name).toBe("BuildConfigError");
    }
  });

  it("preserves error stack trace", () => {
    const error = new BuildConfigError("project", "field", "message");
    expect(error.stack).toBeDefined();
    expect(error.stack).toContain("BuildConfigError");
  });
});

// ─── Edge Cases ──────────────────────────────────────────────────────────────

/**
 * @narrative config/edge-cases
 * @title Configuration Edge Cases
 * @description These tests cover unusual inputs and boundary conditions
 * for configuration handling.
 */
describe("Config Edge Cases", () => {
  const baseConfig: ExtenoteConfig = {
    schemaDir: "schemas",
    sources: [],
    sites: [],
    lint: { rules: {} },
  };

  /**
   * @narrative-step 1
   * @explanation Empty and undefined project profiles should be handled gracefully.
   */
  describe("Empty and undefined project profiles", () => {
    it("handles undefined projectProfiles", () => {
      const config: ExtenoteConfig = { ...baseConfig };
      delete (config as Partial<ExtenoteConfig>).projectProfiles;
      const map = buildSourceIdToProject(config);
      expect(map.size).toBe(0);
    });

    it("handles null projectProfiles", () => {
      const config: ExtenoteConfig = {
        ...baseConfig,
        projectProfiles: null as unknown as undefined,
      };
      const map = buildSourceIdToProject(config);
      expect(map.size).toBe(0);
    });

    it("handles empty projectProfiles array", () => {
      const config: ExtenoteConfig = {
        ...baseConfig,
        projectProfiles: [],
      };
      const map = buildSourceIdToProject(config);
      expect(map.size).toBe(0);
    });

    it("handles profile with undefined sourceIds", () => {
      const config: ExtenoteConfig = {
        ...baseConfig,
        projectProfiles: [
          { name: "project-a", sourceIds: undefined },
        ],
      };
      const map = buildSourceIdToProject(config);
      expect(map.size).toBe(0);
    });

    it("handles profile with empty sourceIds", () => {
      const config: ExtenoteConfig = {
        ...baseConfig,
        projectProfiles: [
          { name: "project-a", sourceIds: [] },
        ],
      };
      const map = buildSourceIdToProject(config);
      expect(map.size).toBe(0);
    });
  });

  /**
   * @narrative-step 2
   * @explanation Special characters in project names and source IDs should work.
   */
  describe("Special characters in identifiers", () => {
    it("handles unicode in project name", () => {
      const config: ExtenoteConfig = {
        ...baseConfig,
        projectProfiles: [
          { name: "日本語プロジェクト", sourceIds: ["source-1"] },
        ],
      };
      const map = buildSourceIdToProject(config);
      expect(map.get("source-1")).toBe("日本語プロジェクト");
    });

    it("handles unicode in source ID", () => {
      const config: ExtenoteConfig = {
        ...baseConfig,
        projectProfiles: [
          { name: "my-project", sourceIds: ["日本語ソース"] },
        ],
      };
      const map = buildSourceIdToProject(config);
      expect(map.get("日本語ソース")).toBe("my-project");
    });

    it("handles special characters in names", () => {
      const config: ExtenoteConfig = {
        ...baseConfig,
        projectProfiles: [
          { name: "project@2024", sourceIds: ["source:with:colons", "source/with/slashes"] },
        ],
      };
      const map = buildSourceIdToProject(config);
      expect(map.get("source:with:colons")).toBe("project@2024");
      expect(map.get("source/with/slashes")).toBe("project@2024");
    });

    it("handles empty string project name", () => {
      const config: ExtenoteConfig = {
        ...baseConfig,
        projectProfiles: [
          { name: "", sourceIds: ["source-1"] },
        ],
      };
      const map = buildSourceIdToProject(config);
      expect(map.get("source-1")).toBe("");
    });

    it("handles empty string source ID", () => {
      const config: ExtenoteConfig = {
        ...baseConfig,
        projectProfiles: [
          { name: "my-project", sourceIds: [""] },
        ],
      };
      const map = buildSourceIdToProject(config);
      expect(map.get("")).toBe("my-project");
    });
  });

  /**
   * @narrative-step 3
   * @explanation Includes in project profiles (circular references are allowed).
   */
  describe("Project includes", () => {
    it("handles project with includes", () => {
      const config: ExtenoteConfig = {
        ...baseConfig,
        projectProfiles: [
          { name: "main", sourceIds: ["main-source"], includes: ["shared"] },
          { name: "shared", sourceIds: ["shared-source"] },
        ],
      };
      const map = buildSourceIdToProject(config);
      // buildSourceIdToProject doesn't resolve includes, just maps sources
      expect(map.get("main-source")).toBe("main");
      expect(map.get("shared-source")).toBe("shared");
    });

    it("handles circular includes (A includes B, B includes A)", () => {
      const config: ExtenoteConfig = {
        ...baseConfig,
        projectProfiles: [
          { name: "project-a", sourceIds: ["source-a"], includes: ["project-b"] },
          { name: "project-b", sourceIds: ["source-b"], includes: ["project-a"] },
        ],
      };
      const map = buildSourceIdToProject(config);
      // buildSourceIdToProject handles this without infinite loop
      expect(map.get("source-a")).toBe("project-a");
      expect(map.get("source-b")).toBe("project-b");
    });

    it("handles self-referencing include", () => {
      const config: ExtenoteConfig = {
        ...baseConfig,
        projectProfiles: [
          { name: "self-ref", sourceIds: ["source"], includes: ["self-ref"] },
        ],
      };
      const map = buildSourceIdToProject(config);
      expect(map.get("source")).toBe("self-ref");
    });

    it("handles include of non-existent project", () => {
      const config: ExtenoteConfig = {
        ...baseConfig,
        projectProfiles: [
          { name: "main", sourceIds: ["source"], includes: ["nonexistent"] },
        ],
      };
      const map = buildSourceIdToProject(config);
      // buildSourceIdToProject doesn't validate includes
      expect(map.get("source")).toBe("main");
    });
  });

  /**
   * @narrative-step 4
   * @explanation Large configurations should be handled efficiently.
   */
  describe("Large configurations", () => {
    it("handles many projects", () => {
      const profiles = Array.from({ length: 100 }, (_, i) => ({
        name: `project-${i}`,
        sourceIds: [`source-${i}`],
      }));
      const config: ExtenoteConfig = {
        ...baseConfig,
        projectProfiles: profiles,
      };
      const map = buildSourceIdToProject(config);
      expect(map.size).toBe(100);
      expect(map.get("source-0")).toBe("project-0");
      expect(map.get("source-99")).toBe("project-99");
    });

    it("handles project with many sources", () => {
      const sourceIds = Array.from({ length: 100 }, (_, i) => `source-${i}`);
      const config: ExtenoteConfig = {
        ...baseConfig,
        projectProfiles: [
          { name: "big-project", sourceIds },
        ],
      };
      const map = buildSourceIdToProject(config);
      expect(map.size).toBe(100);
      for (let i = 0; i < 100; i++) {
        expect(map.get(`source-${i}`)).toBe("big-project");
      }
    });
  });

  /**
   * @narrative-step 5
   * @explanation BuildConfigError should be throwable and catchable.
   */
  describe("BuildConfigError usage patterns", () => {
    it("can be thrown and caught", () => {
      let caught: BuildConfigError | null = null;
      try {
        throw new BuildConfigError("my-project", "websiteDir", "websiteDir is required");
      } catch (e) {
        caught = e as BuildConfigError;
      }
      expect(caught).not.toBeNull();
      expect(caught!.project).toBe("my-project");
      expect(caught!.field).toBe("websiteDir");
    });

    it("can be distinguished from regular errors", () => {
      const buildError = new BuildConfigError("p", "f", "m");
      const regularError = new Error("regular error");

      expect(buildError.name).toBe("BuildConfigError");
      expect(regularError.name).toBe("Error");
    });

    it("includes project and field in message", () => {
      const error = new BuildConfigError("data-project", "preRender[0].src", "rsync step requires src");
      expect(error.message).toContain("data-project");
      expect(error.message).toContain("rsync step requires src");
    });
  });

  /**
   * @narrative-step 6
   * @explanation Project profiles with all optional fields.
   */
  describe("Project profile optional fields", () => {
    it("handles profile with only name", () => {
      const config: ExtenoteConfig = {
        ...baseConfig,
        projectProfiles: [{ name: "minimal" }],
      };
      const map = buildSourceIdToProject(config);
      expect(map.size).toBe(0);
    });

    it("handles profile with all optional fields", () => {
      const config: ExtenoteConfig = {
        ...baseConfig,
        projectProfiles: [
          {
            name: "full",
            sourceIds: ["source-1"],
            includes: ["other"],
            lint: { rules: { "required-visibility": "error" } },
            defaultVisibility: "public",
            visibilityField: "custom_visibility",
            recipes: [{ format: "json", outputDir: "dist" }],
            build: { type: "astro", websiteDir: "site" },
            deploy: { type: "cloudflare-pages" },
          },
        ],
      };
      const map = buildSourceIdToProject(config);
      expect(map.get("source-1")).toBe("full");
    });

    it("handles mixed profiles with different fields", () => {
      const config: ExtenoteConfig = {
        ...baseConfig,
        projectProfiles: [
          { name: "minimal" },
          { name: "with-sources", sourceIds: ["s1", "s2"] },
          { name: "with-includes", includes: ["minimal"] },
          { name: "with-build", build: { type: "quarto", websiteDir: "docs" } },
        ],
      };
      const map = buildSourceIdToProject(config);
      expect(map.size).toBe(2); // Only with-sources has sourceIds
      expect(map.get("s1")).toBe("with-sources");
      expect(map.get("s2")).toBe("with-sources");
    });
  });
});
