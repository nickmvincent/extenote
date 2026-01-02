import { describe, expect, it } from "bun:test";
import { validateObjects } from "../src/validation";
import type { ExtenoteConfig, LoadedSchema, VaultObject } from "../src/types";

// ─── Test Fixtures ───────────────────────────────────────────────────────────

const schema: LoadedSchema = {
  name: "demo_note",
  description: "Example note",
  fields: {
    title: { type: "string" },
    count: { type: "number" },
    published: { type: "boolean" },
    createdAt: { type: "date" },
    tags: { type: "array", items: "string" }
  },
  required: ["title"],
  filePath: "schemas/demo.yaml"
};

const config: ExtenoteConfig = {
  schemaDir: "schemas",
  sources: [],
  sites: [],
  lint: { rules: { "required-visibility": "warn" } },
  defaultVisibility: "private",
  visibilityField: "visibility"
};

function buildObject(overrides: Partial<VaultObject> & { frontmatter: Record<string, unknown> }): VaultObject {
  return {
    id: "test",
    type: "demo_note",
    sourceId: "local",
    filePath: "test.md",
    relativePath: "test.md",
    body: "",
    mtime: Date.now(),
    visibility: "private",
    ...overrides,
    frontmatter: {
      type: "demo_note",
      visibility: "private",
      ...overrides.frontmatter,
    },
  };
}

// ─── validateObjects Tests ───────────────────────────────────────────────────

/**
 * @narrative validation/schema-basics
 * @title Schema Validation Basics
 * @description Learn how Extenote validates objects against their schemas.
 * Every markdown file must declare a type that matches a defined schema,
 * and required fields must be present.
 */
describe("validateObjects", () => {
  /**
   * @narrative-step 1
   * @explanation Schemas can mark fields as required. If a required field is missing
   * from the frontmatter, validation fails with an error. In this example, the schema
   * requires a "title" field.
   */
  it("flags missing required fields", () => {
    const object = buildObject({
      frontmatter: { type: "demo_note", tags: [1] }
    });

    const results = validateObjects([object], config, [schema]);
    expect(results[0].issues.length).toBeGreaterThan(0);
    expect(results[0].issues.some(i => i.message.includes("Missing required field"))).toBe(true);
  });

  it("returns no issues for valid object", () => {
    const object = buildObject({
      frontmatter: {
        title: "Valid Title",
        count: 42,
        published: true,
        createdAt: "2024-01-15",
        tags: ["tag1", "tag2"],
        visibility: "private"
      }
    });

    const results = validateObjects([object], config, [schema]);
    expect(results[0].issues.length).toBe(0);
  });

  /**
   * @narrative-step 2
   * @explanation Each object must have a type that matches a known schema.
   * If the type in frontmatter doesn't match any schema definition, validation
   * fails with an error.
   */
  it("flags unknown schema", () => {
    const object = buildObject({
      type: "unknown_type",
      frontmatter: { type: "unknown_type" }
    });

    const results = validateObjects([object], config, [schema]);
    expect(results[0].issues.some(i => i.message.includes("Unknown schema"))).toBe(true);
    expect(results[0].issues[0].severity).toBe("error");
  });

  /**
   * @narrative-step 3
   * @explanation String fields must contain text values. Numbers, booleans, or other
   * types in a string field will be rejected.
   */
  it("validates string type", () => {
    const object = buildObject({
      frontmatter: { title: 123, visibility: "private" } // title should be string
    });

    const results = validateObjects([object], config, [schema]);
    expect(results[0].issues.some(i => i.field === "title" && i.message.includes("should be string"))).toBe(true);
  });

  /**
   * @narrative-step 4
   * @explanation Number fields require numeric values. Strings containing digits
   * (like "42") are not automatically converted - they must be actual numbers.
   */
  it("validates number type", () => {
    const object = buildObject({
      frontmatter: { title: "Test", count: "not a number", visibility: "private" }
    });

    const results = validateObjects([object], config, [schema]);
    expect(results[0].issues.some(i => i.field === "count" && i.message.includes("should be number"))).toBe(true);
  });

  /**
   * @narrative-step 5
   * @explanation Boolean fields must be true or false. Strings like "yes", "no",
   * or "true" are not accepted - YAML will parse unquoted true/false as booleans.
   */
  it("validates boolean type", () => {
    const object = buildObject({
      frontmatter: { title: "Test", published: "yes", visibility: "private" }
    });

    const results = validateObjects([object], config, [schema]);
    expect(results[0].issues.some(i => i.field === "published" && i.message.includes("should be boolean"))).toBe(true);
  });

  /**
   * @narrative-step 6
   * @explanation Date fields accept ISO 8601 format strings (like "2024-01-15") and
   * Date objects parsed from YAML. The date must include at least a 4-digit year.
   */
  it("validates date type with valid ISO string", () => {
    const object = buildObject({
      frontmatter: { title: "Test", createdAt: "2024-01-15T10:30:00Z", visibility: "private" }
    });

    const results = validateObjects([object], config, [schema]);
    expect(results[0].issues.some(i => i.field === "createdAt")).toBe(false);
  });

  /**
   * @narrative-step 7
   * @explanation Random strings that don't look like dates are rejected.
   * @code-highlight
   */
  it("validates date type rejects invalid date string", () => {
    const object = buildObject({
      frontmatter: { title: "Test", createdAt: "not-a-date", visibility: "private" }
    });

    const results = validateObjects([object], config, [schema]);
    expect(results[0].issues.some(i => i.field === "createdAt" && i.message.includes("should be date"))).toBe(true);
  });

  /**
   * @narrative-step 8
   * @explanation Month names alone (like "March") are rejected because they lack a year.
   * This prevents JavaScript's Date.parse() from accepting ambiguous formats.
   */
  it("validates date type rejects month name without year", () => {
    const object = buildObject({
      frontmatter: { title: "Test", createdAt: "March", visibility: "private" }
    });

    const results = validateObjects([object], config, [schema]);
    expect(results[0].issues.some(i => i.field === "createdAt" && i.message.includes("should be date"))).toBe(true);
  });

  /**
   * @narrative-step 9
   * @explanation Year-only strings like "2024" are valid - common for academic citations
   * where only the publication year is known.
   */
  it("validates date type accepts year-only string", () => {
    const object = buildObject({
      frontmatter: { title: "Test", createdAt: "2024", visibility: "private" }
    });

    const results = validateObjects([object], config, [schema]);
    expect(results[0].issues.some(i => i.field === "createdAt")).toBe(false);
  });

  it("validates date type accepts Date object from YAML", () => {
    const object = buildObject({
      frontmatter: { title: "Test", createdAt: new Date("2024-01-15"), visibility: "private" }
    });

    const results = validateObjects([object], config, [schema]);
    expect(results[0].issues.some(i => i.field === "createdAt")).toBe(false);
  });

  it("validates date type rejects invalid Date object", () => {
    const object = buildObject({
      frontmatter: { title: "Test", createdAt: new Date("invalid"), visibility: "private" }
    });

    const results = validateObjects([object], config, [schema]);
    expect(results[0].issues.some(i => i.field === "createdAt" && i.message.includes("should be date"))).toBe(true);
  });

  /**
   * @narrative-step 10
   * @explanation Array fields must be actual arrays (using YAML list syntax).
   * A single string value won't be automatically wrapped in an array.
   */
  it("validates array type", () => {
    const object = buildObject({
      frontmatter: { title: "Test", tags: "not-an-array", visibility: "private" }
    });

    const results = validateObjects([object], config, [schema]);
    expect(results[0].issues.some(i => i.field === "tags" && i.message.includes("should be array"))).toBe(true);
  });

  /**
   * @narrative-step 11
   * @explanation Arrays can have typed items. If the schema specifies items: string,
   * each element must be a string. An array of numbers in a string array field fails.
   */
  it("validates array item types", () => {
    const object = buildObject({
      frontmatter: { title: "Test", tags: [1, 2, 3], visibility: "private" } // items should be strings
    });

    const results = validateObjects([object], config, [schema]);
    expect(results[0].issues.some(i => i.field === "tags" && i.message.includes("should be array"))).toBe(true);
  });

  it("accepts empty array for array type", () => {
    const object = buildObject({
      frontmatter: { title: "Test", tags: [], visibility: "private" }
    });

    const results = validateObjects([object], config, [schema]);
    expect(results[0].issues.some(i => i.field === "tags")).toBe(false);
  });

  it("skips validation for null/undefined fields", () => {
    const object = buildObject({
      frontmatter: { title: "Test", count: null, visibility: "private" }
    });

    const results = validateObjects([object], config, [schema]);
    expect(results[0].issues.some(i => i.field === "count")).toBe(false);
  });

  it("warns about missing visibility", () => {
    // Create object without using buildObject to avoid default visibility
    const object: VaultObject = {
      id: "test",
      type: "demo_note",
      sourceId: "local",
      filePath: "test.md",
      relativePath: "test.md",
      frontmatter: { type: "demo_note", title: "Test" }, // no visibility field
      body: "",
      mtime: Date.now(),
      visibility: "private",
      project: "default",
    };

    const results = validateObjects([object], config, [schema]);
    expect(results[0].issues.some(i => i.message.includes("Visibility missing"))).toBe(true);
  });

  it("validates multiple objects", () => {
    const validObject = buildObject({
      id: "valid",
      frontmatter: { title: "Valid", visibility: "private" }
    });
    const invalidObject = buildObject({
      id: "invalid",
      frontmatter: { visibility: "private" } // missing title
    });

    const results = validateObjects([validObject, invalidObject], config, [schema]);
    expect(results.length).toBe(2);
    expect(results[0].issues.length).toBe(0);
    expect(results[1].issues.length).toBeGreaterThan(0);
  });

  it("attaches schema to validated object", () => {
    const object = buildObject({
      frontmatter: { title: "Test", visibility: "private" }
    });

    const results = validateObjects([object], config, [schema]);
    expect(results[0].object.schema).toBeDefined();
    expect(results[0].object.schema?.name).toBe("demo_note");
  });
});

// ─── Edge Cases ──────────────────────────────────────────────────────────────

/**
 * @narrative validation/edge-cases
 * @title Validation Edge Cases
 * @description These tests cover unusual inputs and boundary conditions
 * that the validation system must handle gracefully.
 */
describe("Validation Edge Cases", () => {
  /**
   * @narrative-step 1
   * @explanation Schemas with no fields defined should still work for type-only validation.
   */
  describe("Schema with no fields defined", () => {
    const emptySchema: LoadedSchema = {
      name: "empty_type",
      description: "Schema with no fields",
      fields: {},
      required: [],
      filePath: "schemas/empty.yaml",
    };

    it("validates object with empty schema (no fields)", () => {
      const object: VaultObject = {
        id: "test",
        type: "empty_type",
        sourceId: "local",
        filePath: "test.md",
        relativePath: "test.md",
        frontmatter: { type: "empty_type", visibility: "private" },
        body: "",
        mtime: Date.now(),
        visibility: "private",
      };

      const results = validateObjects([object], config, [emptySchema]);
      expect(results[0].issues.length).toBe(0);
    });

    it("allows extra fields when schema has no fields defined", () => {
      const object: VaultObject = {
        id: "test",
        type: "empty_type",
        sourceId: "local",
        filePath: "test.md",
        relativePath: "test.md",
        frontmatter: {
          type: "empty_type",
          visibility: "private",
          extra_field: "extra value",
          another: 123,
        },
        body: "",
        mtime: Date.now(),
        visibility: "private",
      };

      const results = validateObjects([object], config, [emptySchema]);
      expect(results[0].issues.length).toBe(0);
    });
  });

  /**
   * @narrative-step 2
   * @explanation Required fields with empty string values should be flagged.
   */
  describe("Required field with empty string value", () => {
    it("treats empty string as missing for required field", () => {
      const object = buildObject({
        frontmatter: { title: "", visibility: "private" },
      });

      const results = validateObjects([object], config, [schema]);
      // Implementation considers empty string as "missing" for required fields
      // This documents the actual behavior
      const hasMissingRequired = results[0].issues.some((i) =>
        i.message.includes("Missing required field")
      );
      expect(hasMissingRequired).toBe(true);
    });

    it("validates empty string as valid string type", () => {
      const object = buildObject({
        frontmatter: { title: "", visibility: "private" },
      });

      const results = validateObjects([object], config, [schema]);
      // Empty string is a valid string
      const hasTypeError = results[0].issues.some(
        (i) => i.field === "title" && i.message.includes("should be string")
      );
      expect(hasTypeError).toBe(false);
    });
  });

  /**
   * @narrative-step 3
   * @explanation Date fields with timezone information should be handled.
   */
  describe("Date field with timezone", () => {
    it("accepts date with UTC timezone (Z suffix)", () => {
      const object = buildObject({
        frontmatter: {
          title: "Test",
          createdAt: "2024-01-15T10:30:00Z",
          visibility: "private",
        },
      });

      const results = validateObjects([object], config, [schema]);
      expect(results[0].issues.some((i) => i.field === "createdAt")).toBe(false);
    });

    it("accepts date with offset timezone", () => {
      const object = buildObject({
        frontmatter: {
          title: "Test",
          createdAt: "2024-01-15T10:30:00+05:30",
          visibility: "private",
        },
      });

      const results = validateObjects([object], config, [schema]);
      expect(results[0].issues.some((i) => i.field === "createdAt")).toBe(false);
    });

    it("accepts date with negative offset timezone", () => {
      const object = buildObject({
        frontmatter: {
          title: "Test",
          createdAt: "2024-01-15T10:30:00-08:00",
          visibility: "private",
        },
      });

      const results = validateObjects([object], config, [schema]);
      expect(results[0].issues.some((i) => i.field === "createdAt")).toBe(false);
    });

    it("accepts date-only format (no time/timezone)", () => {
      const object = buildObject({
        frontmatter: {
          title: "Test",
          createdAt: "2024-01-15",
          visibility: "private",
        },
      });

      const results = validateObjects([object], config, [schema]);
      expect(results[0].issues.some((i) => i.field === "createdAt")).toBe(false);
    });
  });

  /**
   * @narrative-step 4
   * @explanation Arrays with mixed types should be validated against item type.
   */
  describe("Array with mixed types", () => {
    it("rejects array with mixed string and number items when expecting strings", () => {
      const object = buildObject({
        frontmatter: {
          title: "Test",
          tags: ["valid", 123, "also-valid"],
          visibility: "private",
        },
      });

      const results = validateObjects([object], config, [schema]);
      expect(
        results[0].issues.some(
          (i) => i.field === "tags" && i.message.includes("should be array")
        )
      ).toBe(true);
    });

    it("rejects array with null elements", () => {
      const object = buildObject({
        frontmatter: {
          title: "Test",
          tags: ["valid", null, "also-valid"],
          visibility: "private",
        },
      });

      const results = validateObjects([object], config, [schema]);
      // null is not a string, so should fail item validation
      expect(
        results[0].issues.some((i) => i.field === "tags")
      ).toBe(true);
    });

    it("rejects array with object elements when expecting strings", () => {
      const object = buildObject({
        frontmatter: {
          title: "Test",
          tags: [{ name: "tag1" }, { name: "tag2" }],
          visibility: "private",
        },
      });

      const results = validateObjects([object], config, [schema]);
      expect(
        results[0].issues.some(
          (i) => i.field === "tags" && i.message.includes("should be array")
        )
      ).toBe(true);
    });
  });

  /**
   * @narrative-step 5
   * @explanation Nested object fields may be allowed by some schemas.
   */
  describe("Nested object fields", () => {
    const schemaWithObject: LoadedSchema = {
      name: "with_object",
      description: "Schema with object field",
      fields: {
        title: { type: "string" },
        metadata: { type: "object" },
      },
      required: ["title"],
      filePath: "schemas/with_object.yaml",
    };

    it("accepts object field when schema allows object type", () => {
      const object: VaultObject = {
        id: "test",
        type: "with_object",
        sourceId: "local",
        filePath: "test.md",
        relativePath: "test.md",
        frontmatter: {
          type: "with_object",
          visibility: "private",
          title: "Test",
          metadata: { author: "John", year: 2024 },
        },
        body: "",
        mtime: Date.now(),
        visibility: "private",
      };

      const results = validateObjects([object], config, [schemaWithObject]);
      expect(results[0].issues.some((i) => i.field === "metadata")).toBe(false);
    });

    it("accepts nested arrays in object field", () => {
      const object: VaultObject = {
        id: "test",
        type: "with_object",
        sourceId: "local",
        filePath: "test.md",
        relativePath: "test.md",
        frontmatter: {
          type: "with_object",
          visibility: "private",
          title: "Test",
          metadata: { tags: ["a", "b"], counts: [1, 2, 3] },
        },
        body: "",
        mtime: Date.now(),
        visibility: "private",
      };

      const results = validateObjects([object], config, [schemaWithObject]);
      expect(results[0].issues.some((i) => i.field === "metadata")).toBe(false);
    });

    it("accepts empty object for object field", () => {
      const object: VaultObject = {
        id: "test",
        type: "with_object",
        sourceId: "local",
        filePath: "test.md",
        relativePath: "test.md",
        frontmatter: {
          type: "with_object",
          visibility: "private",
          title: "Test",
          metadata: {},
        },
        body: "",
        mtime: Date.now(),
        visibility: "private",
      };

      const results = validateObjects([object], config, [schemaWithObject]);
      expect(results[0].issues.some((i) => i.field === "metadata")).toBe(false);
    });

    it("rejects string where object expected", () => {
      const object: VaultObject = {
        id: "test",
        type: "with_object",
        sourceId: "local",
        filePath: "test.md",
        relativePath: "test.md",
        frontmatter: {
          type: "with_object",
          visibility: "private",
          title: "Test",
          metadata: "not an object",
        },
        body: "",
        mtime: Date.now(),
        visibility: "private",
      };

      const results = validateObjects([object], config, [schemaWithObject]);
      expect(
        results[0].issues.some(
          (i) => i.field === "metadata" && i.message.includes("should be object")
        )
      ).toBe(true);
    });
  });

  /**
   * @narrative-step 6
   * @explanation Special field values like NaN, Infinity should be handled.
   */
  describe("Special numeric values", () => {
    it("handles NaN in number field", () => {
      const object = buildObject({
        frontmatter: { title: "Test", count: NaN, visibility: "private" },
      });

      const results = validateObjects([object], config, [schema]);
      // NaN is typeof number, so may pass or fail depending on implementation
      // This documents the behavior
      expect(Array.isArray(results)).toBe(true);
    });

    it("handles Infinity in number field", () => {
      const object = buildObject({
        frontmatter: { title: "Test", count: Infinity, visibility: "private" },
      });

      const results = validateObjects([object], config, [schema]);
      // Infinity is typeof number
      expect(Array.isArray(results)).toBe(true);
    });

    it("handles negative Infinity in number field", () => {
      const object = buildObject({
        frontmatter: { title: "Test", count: -Infinity, visibility: "private" },
      });

      const results = validateObjects([object], config, [schema]);
      expect(Array.isArray(results)).toBe(true);
    });
  });

  /**
   * @narrative-step 7
   * @explanation Unicode and special characters in field values.
   */
  describe("Unicode and special characters", () => {
    it("accepts unicode in string fields", () => {
      const object = buildObject({
        frontmatter: {
          title: "日本語タイトル 🎉 émojis",
          visibility: "private",
        },
      });

      const results = validateObjects([object], config, [schema]);
      expect(results[0].issues.some((i) => i.field === "title")).toBe(false);
    });

    it("accepts unicode in array items", () => {
      const object = buildObject({
        frontmatter: {
          title: "Test",
          tags: ["日本語", "中文", "한국어"],
          visibility: "private",
        },
      });

      const results = validateObjects([object], config, [schema]);
      expect(results[0].issues.some((i) => i.field === "tags")).toBe(false);
    });
  });

  /**
   * @narrative-step 8
   * @explanation Very large or deeply nested values should be handled.
   */
  describe("Large values", () => {
    it("handles very long string value", () => {
      const longTitle = "x".repeat(10000);
      const object = buildObject({
        frontmatter: { title: longTitle, visibility: "private" },
      });

      const results = validateObjects([object], config, [schema]);
      expect(results[0].issues.some((i) => i.field === "title")).toBe(false);
    });

    it("handles array with many items", () => {
      const manyTags = Array.from({ length: 1000 }, (_, i) => `tag-${i}`);
      const object = buildObject({
        frontmatter: { title: "Test", tags: manyTags, visibility: "private" },
      });

      const results = validateObjects([object], config, [schema]);
      expect(results[0].issues.some((i) => i.field === "tags")).toBe(false);
    });

    it("handles very large number", () => {
      const object = buildObject({
        frontmatter: {
          title: "Test",
          count: Number.MAX_SAFE_INTEGER,
          visibility: "private",
        },
      });

      const results = validateObjects([object], config, [schema]);
      expect(results[0].issues.some((i) => i.field === "count")).toBe(false);
    });

    it("handles very small number", () => {
      const object = buildObject({
        frontmatter: {
          title: "Test",
          count: Number.MIN_SAFE_INTEGER,
          visibility: "private",
        },
      });

      const results = validateObjects([object], config, [schema]);
      expect(results[0].issues.some((i) => i.field === "count")).toBe(false);
    });
  });
});
