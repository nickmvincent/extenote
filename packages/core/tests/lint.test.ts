import { describe, expect, it } from "bun:test";
import { lintObjects } from "../src/lint";
import type { ExtenoteConfig, VaultObject } from "../src/types";

// ─── Test Fixtures ───────────────────────────────────────────────────────────

const baseConfig: ExtenoteConfig = {
  schemaDir: "schemas",
  sources: [],
  sites: [],
  lint: { rules: { "required-visibility": "warn" } },
  defaultVisibility: "private",
  visibilityField: "visibility"
};

function buildObject(overrides: Partial<VaultObject>): VaultObject {
  return {
    id: "test",
    type: "note",
    sourceId: "local",
    project: "default",
    filePath: "test.md",
    relativePath: "test.md",
    frontmatter: { type: "note" },
    body: "",
    mtime: Date.now(),
    visibility: "private",
    ...overrides,
  };
}

// ─── lintObjects Tests ───────────────────────────────────────────────────────

/**
 * @narrative lint/visibility
 * @title Content Linting
 * @description Extenote validates your content against configurable rules. The linter
 * checks for issues like missing required fields and reports them with configurable severity.
 */
describe("lintObjects", () => {
  /**
   * @narrative-step 1
   * @explanation The "required-visibility" rule ensures all content has a visibility field
   * (public, private, or unlisted). Missing visibility is reported as an issue.
   * @code-highlight
   */
  it("reports missing visibility when rule enabled", async () => {
    const objects = [buildObject({
      frontmatter: { type: "note" } // no visibility
    })];

    const result = await lintObjects(objects, baseConfig, { fix: false });
    expect(result.issues.length).toBe(1);
    expect(result.issues[0].message).toContain("Missing visibility");
    expect(result.issues[0].rule).toBe("required-visibility");
  });

  it("returns no issues when visibility is present", async () => {
    const objects = [buildObject({
      frontmatter: { type: "note", visibility: "public" }
    })];

    const result = await lintObjects(objects, baseConfig, { fix: false });
    expect(result.issues.length).toBe(0);
  });

  /**
   * @narrative-step 2
   * @explanation Rules can be set to "off", "warn", or "error". Setting a rule to "off"
   * disables it entirely - no issues will be reported even if content violates the rule.
   */
  it("respects rule set to off", async () => {
    const config: ExtenoteConfig = {
      ...baseConfig,
      lint: { rules: { "required-visibility": "off" } }
    };
    const objects = [buildObject({
      frontmatter: { type: "note" } // no visibility
    })];

    const result = await lintObjects(objects, config, { fix: false });
    expect(result.issues.length).toBe(0);
  });

  /**
   * @narrative-step 3
   * @explanation The rule level determines severity. "warn" produces warnings (informational),
   * while "error" produces errors (should be fixed before publishing).
   */
  it("sets severity based on rule level", async () => {
    const errorConfig: ExtenoteConfig = {
      ...baseConfig,
      lint: { rules: { "required-visibility": "error" } }
    };
    const objects = [buildObject({
      frontmatter: { type: "note" }
    })];

    const result = await lintObjects(objects, errorConfig, { fix: false });
    expect(result.issues[0].severity).toBe("error");
  });

  /**
   * @narrative-step 4
   * @explanation Project profiles can override global lint rules. This allows different
   * projects to have different requirements - a blog might require visibility while
   * personal notes might not.
   */
  it("uses project profile lint rules when available", async () => {
    const config: ExtenoteConfig = {
      ...baseConfig,
      lint: { rules: { "required-visibility": "warn" } },
      projectProfiles: [
        {
          name: "my-project",
          lint: { rules: { "required-visibility": "off" } }
        }
      ]
    };
    const objects = [buildObject({
      relativePath: "my-project/note.md",
      frontmatter: { type: "note" }
    })];

    const result = await lintObjects(objects, config, { fix: false });
    expect(result.issues.length).toBe(0); // profile overrides to off
  });

  it("uses project profile visibility field", async () => {
    const config: ExtenoteConfig = {
      ...baseConfig,
      visibilityField: "visibility",
      projectProfiles: [
        {
          name: "custom",
          visibilityField: "access",
          lint: { rules: { "required-visibility": "warn" } }
        }
      ]
    };
    const objects = [buildObject({
      relativePath: "custom/note.md",
      frontmatter: { type: "note", access: "public" } // uses project's field
    })];

    const result = await lintObjects(objects, config, { fix: false });
    expect(result.issues.length).toBe(0);
  });

  /**
   * @narrative-step 5
   * @explanation Compatibility rules check that content meets requirements for target
   * platforms like Astro or Quarto. Required fields for each platform are validated.
   * @code-highlight
   */
  it("checks compatibility required fields", async () => {
    const config: ExtenoteConfig = {
      ...baseConfig,
      projectProfiles: [
        {
          name: "website",
          lint: { rules: { "compatibility:astro": "warn" } },
          compatibility: {
            astro: {
              requiredFields: ["slug", "description"]
            }
          }
        }
      ]
    };
    const objects = [buildObject({
      relativePath: "website/article.md",
      frontmatter: { type: "note", visibility: "public", slug: "my-article" } // missing description
    })];

    const result = await lintObjects(objects, config, { fix: false });
    expect(result.issues.some(i => i.message.includes("description is required for astro"))).toBe(true);
  });

  it("checks compatibility public visibility requirement", async () => {
    const config: ExtenoteConfig = {
      ...baseConfig,
      projectProfiles: [
        {
          name: "website",
          lint: { rules: { "compatibility:astro": "warn" } },
          compatibility: {
            astro: {
              requirePublicVisibility: true
            }
          }
        }
      ]
    };
    const objects = [buildObject({
      relativePath: "website/article.md",
      visibility: "private",
      frontmatter: { type: "note", visibility: "private" }
    })];

    const result = await lintObjects(objects, config, { fix: false });
    expect(result.issues.some(i => i.message.includes("must be public"))).toBe(true);
  });

  it("skips compatibility when rule is off", async () => {
    const config: ExtenoteConfig = {
      ...baseConfig,
      projectProfiles: [
        {
          name: "website",
          lint: { rules: { "compatibility:astro": "off" } },
          compatibility: {
            astro: {
              requiredFields: ["slug"]
            }
          }
        }
      ]
    };
    const objects = [buildObject({
      relativePath: "website/article.md",
      frontmatter: { type: "note", visibility: "public" } // missing slug
    })];

    const result = await lintObjects(objects, config, { fix: false });
    expect(result.issues.some(i => i.message.includes("slug"))).toBe(false);
  });

  it("handles multiple compatibility targets", async () => {
    const config: ExtenoteConfig = {
      ...baseConfig,
      projectProfiles: [
        {
          name: "website",
          lint: { rules: { "compatibility:astro": "warn", "compatibility:quarto": "warn" } },
          compatibility: {
            astro: { requiredFields: ["slug"] },
            quarto: { requiredFields: ["category"] }
          }
        }
      ]
    };
    const objects = [buildObject({
      relativePath: "website/article.md",
      frontmatter: { type: "note", visibility: "public" } // missing both
    })];

    const result = await lintObjects(objects, config, { fix: false });
    expect(result.issues.some(i => i.message.includes("slug"))).toBe(true);
    expect(result.issues.some(i => i.message.includes("category"))).toBe(true);
  });

  it("lints multiple objects", async () => {
    const objects = [
      buildObject({ id: "valid", frontmatter: { type: "note", visibility: "public" } }),
      buildObject({ id: "invalid", frontmatter: { type: "note" } }) // missing visibility
    ];

    const result = await lintObjects(objects, baseConfig, { fix: false });
    expect(result.issues.length).toBe(1);
  });
});
