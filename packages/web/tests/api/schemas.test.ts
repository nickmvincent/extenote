import { describe, it, expect } from "bun:test";
import {
  // Common schemas
  ErrorResponseSchema,
  ValidationErrorSchema,
  VisibilitySchema,
  ProjectNameSchema,
  FilePathSchema,
  SlugSchema,
  PaginationQuerySchema,
  SuccessResponseSchema,
  // Object schemas
  CreateRequestSchema,
  CreateResponseSchema,
  WriteRequestSchema,
  WriteResponseSchema,
  GetObjectQuerySchema,
  OpenInEditorRequestSchema,
  // Export schemas
  ExportFormatSchema,
  ExportRequestSchema,
  ExportResponseSchema,
  // Refcheck schemas
  RefcheckProviderSchema,
  RefcheckRequestSchema,
  RefcheckAcceptRequestSchema,
  // Tag schemas
  TagMutationTypeSchema,
  TagMutationSchema,
  TagPreviewRequestSchema,
  TagApplyRequestSchema,
  TaxonomyFixRequestSchema,
} from "../../server/api/schemas";

describe("Common Schemas", () => {
  describe("ErrorResponseSchema", () => {
    it("should validate error response", () => {
      const result = ErrorResponseSchema.safeParse({
        error: "Something went wrong",
        code: "INTERNAL_ERROR",
      });

      expect(result.success).toBe(true);
    });

    it("should accept optional details", () => {
      const result = ErrorResponseSchema.safeParse({
        error: "Validation failed",
        code: "VALIDATION_ERROR",
        details: { field: "email" },
      });

      expect(result.success).toBe(true);
    });

    it("should accept validation errors", () => {
      const result = ErrorResponseSchema.safeParse({
        error: "Validation failed",
        validationErrors: [{ path: "name", message: "Required" }],
      });

      expect(result.success).toBe(true);
    });

    it("should require error message", () => {
      const result = ErrorResponseSchema.safeParse({});

      expect(result.success).toBe(false);
    });
  });

  describe("VisibilitySchema", () => {
    it("should accept valid visibility values", () => {
      expect(VisibilitySchema.parse("public")).toBe("public");
      expect(VisibilitySchema.parse("private")).toBe("private");
      expect(VisibilitySchema.parse("unlisted")).toBe("unlisted");
    });

    it("should reject invalid values", () => {
      const result = VisibilitySchema.safeParse("invalid");
      expect(result.success).toBe(false);
    });
  });

  describe("SlugSchema", () => {
    it("should accept valid slugs", () => {
      expect(SlugSchema.parse("my-post")).toBe("my-post");
      expect(SlugSchema.parse("post123")).toBe("post123");
      expect(SlugSchema.parse("a")).toBe("a");
    });

    it("should reject empty string", () => {
      const result = SlugSchema.safeParse("");
      expect(result.success).toBe(false);
    });

    it("should reject uppercase", () => {
      const result = SlugSchema.safeParse("MyPost");
      expect(result.success).toBe(false);
    });

    it("should reject spaces", () => {
      const result = SlugSchema.safeParse("my post");
      expect(result.success).toBe(false);
    });

    it("should reject underscores", () => {
      const result = SlugSchema.safeParse("my_post");
      expect(result.success).toBe(false);
    });
  });

  describe("PaginationQuerySchema", () => {
    it("should apply defaults", () => {
      const result = PaginationQuerySchema.parse({});

      expect(result.limit).toBe(20);
      expect(result.offset).toBe(0);
    });

    it("should coerce string to number", () => {
      const result = PaginationQuerySchema.parse({ limit: "50", offset: "10" });

      expect(result.limit).toBe(50);
      expect(result.offset).toBe(10);
    });

    it("should enforce max limit", () => {
      const result = PaginationQuerySchema.safeParse({ limit: 500 });
      expect(result.success).toBe(false);
    });

    it("should reject negative offset", () => {
      const result = PaginationQuerySchema.safeParse({ offset: -1 });
      expect(result.success).toBe(false);
    });
  });

  describe("SuccessResponseSchema", () => {
    it("should validate success response", () => {
      const result = SuccessResponseSchema.safeParse({ success: true });
      expect(result.success).toBe(true);

      const parsed = SuccessResponseSchema.parse({ success: true });
      expect(parsed.success).toBe(true);
    });
  });
});

describe("Object Schemas", () => {
  describe("CreateRequestSchema", () => {
    it("should validate full create request", () => {
      const result = CreateRequestSchema.safeParse({
        schema: "doc",
        slug: "my-document",
        title: "My Document",
        visibility: "public",
        dir: "posts",
        project: "main",
      });

      expect(result.success).toBe(true);
    });

    it("should validate minimal create request", () => {
      const result = CreateRequestSchema.safeParse({
        schema: "doc",
        slug: "my-doc",
      });

      expect(result.success).toBe(true);
    });

    it("should require schema", () => {
      const result = CreateRequestSchema.safeParse({
        slug: "my-doc",
      });

      expect(result.success).toBe(false);
    });

    it("should require slug", () => {
      const result = CreateRequestSchema.safeParse({
        schema: "doc",
      });

      expect(result.success).toBe(false);
    });
  });

  describe("WriteRequestSchema", () => {
    it("should validate write request", () => {
      const result = WriteRequestSchema.safeParse({
        filePath: "content/posts/my-post.md",
        frontmatter: { title: "My Post", tags: ["test"] },
        body: "Content here",
      });

      expect(result.success).toBe(true);
    });

    it("should validate without body", () => {
      const result = WriteRequestSchema.safeParse({
        filePath: "content/posts/my-post.md",
        frontmatter: { title: "My Post" },
      });

      expect(result.success).toBe(true);
    });

    it("should default merge to false", () => {
      const result = WriteRequestSchema.parse({
        filePath: "content/posts/my-post.md",
        frontmatter: {},
      });

      expect(result.merge).toBe(false);
    });

    it("should accept merge option", () => {
      const result = WriteRequestSchema.parse({
        filePath: "content/posts/my-post.md",
        frontmatter: { tags: ["new"] },
        merge: true,
      });

      expect(result.merge).toBe(true);
    });
  });

  describe("GetObjectQuerySchema", () => {
    it("should accept path parameter", () => {
      const result = GetObjectQuerySchema.safeParse({
        path: "content/posts/my-post.md",
      });

      expect(result.success).toBe(true);
    });

    it("should accept id parameter", () => {
      const result = GetObjectQuerySchema.safeParse({
        id: "abc123",
      });

      expect(result.success).toBe(true);
    });

    it("should accept both parameters", () => {
      const result = GetObjectQuerySchema.safeParse({
        path: "content/posts/my-post.md",
        id: "abc123",
      });

      expect(result.success).toBe(true);
    });

    it("should reject empty object", () => {
      const result = GetObjectQuerySchema.safeParse({});

      expect(result.success).toBe(false);
    });
  });
});

describe("Export Schemas", () => {
  describe("ExportFormatSchema", () => {
    it("should accept valid formats", () => {
      expect(ExportFormatSchema.parse("json")).toBe("json");
      expect(ExportFormatSchema.parse("markdown")).toBe("markdown");
      expect(ExportFormatSchema.parse("html")).toBe("html");
      expect(ExportFormatSchema.parse("bibtex")).toBe("bibtex");
      expect(ExportFormatSchema.parse("atproto")).toBe("atproto");
    });

    it("should reject invalid format", () => {
      const result = ExportFormatSchema.safeParse("pdf");
      expect(result.success).toBe(false);
    });
  });

  describe("ExportRequestSchema", () => {
    it("should validate export request", () => {
      const result = ExportRequestSchema.safeParse({
        project: "shared-references",
        format: "json",
        outputDir: "/tmp/export",
      });

      expect(result.success).toBe(true);
    });

    it("should require project", () => {
      const result = ExportRequestSchema.safeParse({
        format: "json",
      });

      expect(result.success).toBe(false);
    });

    it("should require format", () => {
      const result = ExportRequestSchema.safeParse({
        project: "shared-references",
      });

      expect(result.success).toBe(false);
    });
  });

  describe("ExportResponseSchema", () => {
    it("should validate export response", () => {
      const result = ExportResponseSchema.safeParse({
        success: true,
        outputPath: "/tmp/export/shared-references",
        count: 150,
      });

      expect(result.success).toBe(true);
    });

    it("should validate minimal response", () => {
      const result = ExportResponseSchema.safeParse({
        success: false,
      });

      expect(result.success).toBe(true);
    });
  });
});

describe("Refcheck Schemas", () => {
  describe("RefcheckProviderSchema", () => {
    it("should accept valid providers", () => {
      expect(RefcheckProviderSchema.parse("dblp")).toBe("dblp");
      expect(RefcheckProviderSchema.parse("openalex")).toBe("openalex");
      expect(RefcheckProviderSchema.parse("crossref")).toBe("crossref");
      expect(RefcheckProviderSchema.parse("s2")).toBe("s2");
      expect(RefcheckProviderSchema.parse("auto")).toBe("auto");
    });

    it("should reject invalid provider", () => {
      const result = RefcheckProviderSchema.safeParse("google");
      expect(result.success).toBe(false);
    });
  });

  describe("RefcheckRequestSchema", () => {
    it("should validate full request", () => {
      const result = RefcheckRequestSchema.safeParse({
        project: "shared-references",
        provider: "dblp",
        limit: 100,
        filter: "machine learning",
        dryRun: true,
        force: false,
      });

      expect(result.success).toBe(true);
    });

    it("should apply defaults", () => {
      const parsed = RefcheckRequestSchema.parse({});

      expect(parsed.limit).toBe(50);
      expect(parsed.dryRun).toBe(false);
      expect(parsed.force).toBe(false);
    });

    it("should coerce limit from string", () => {
      const parsed = RefcheckRequestSchema.parse({ limit: "25" });

      expect(parsed.limit).toBe(25);
    });

    it("should enforce max limit", () => {
      const result = RefcheckRequestSchema.safeParse({ limit: 1000 });
      expect(result.success).toBe(false);
    });
  });

  describe("RefcheckAcceptRequestSchema", () => {
    it("should validate accept request", () => {
      const result = RefcheckAcceptRequestSchema.safeParse({
        updates: [
          { path: "refs/Smith2024.md", field: "doi", value: "10.1234/example" },
          { path: "refs/Jones2023.md", field: "venue", value: "ICML" },
        ],
      });

      expect(result.success).toBe(true);
    });

    it("should accept empty updates", () => {
      const result = RefcheckAcceptRequestSchema.safeParse({
        updates: [],
      });

      expect(result.success).toBe(true);
    });
  });
});

describe("Tag Schemas", () => {
  describe("TagMutationTypeSchema", () => {
    it("should accept valid mutation types", () => {
      expect(TagMutationTypeSchema.parse("rename")).toBe("rename");
      expect(TagMutationTypeSchema.parse("delete")).toBe("delete");
      expect(TagMutationTypeSchema.parse("merge")).toBe("merge");
    });

    it("should reject invalid type", () => {
      const result = TagMutationTypeSchema.safeParse("create");
      expect(result.success).toBe(false);
    });
  });

  describe("TagMutationSchema", () => {
    it("should validate rename mutation", () => {
      const result = TagMutationSchema.safeParse({
        type: "rename",
        tag: "old-tag",
        newTag: "new-tag",
      });

      expect(result.success).toBe(true);
    });

    it("should validate delete mutation", () => {
      const result = TagMutationSchema.safeParse({
        type: "delete",
        tag: "deprecated-tag",
      });

      expect(result.success).toBe(true);
    });

    it("should validate merge mutation", () => {
      const result = TagMutationSchema.safeParse({
        type: "merge",
        tag: "source-tag",
        newTag: "target-tag",
      });

      expect(result.success).toBe(true);
    });

    it("should require tag", () => {
      const result = TagMutationSchema.safeParse({
        type: "delete",
      });

      expect(result.success).toBe(false);
    });

    it("should reject empty tag", () => {
      const result = TagMutationSchema.safeParse({
        type: "delete",
        tag: "",
      });

      expect(result.success).toBe(false);
    });
  });

  describe("TaxonomyFixRequestSchema", () => {
    it("should validate taxonomy fix request", () => {
      const result = TaxonomyFixRequestSchema.safeParse({
        objectPath: "content/posts/my-post.md",
        violation: "missing_broad_tag",
        fix: "add_broad_tag:ml-methods",
      });

      expect(result.success).toBe(true);
    });

    it("should require all fields", () => {
      const result = TaxonomyFixRequestSchema.safeParse({
        objectPath: "content/posts/my-post.md",
      });

      expect(result.success).toBe(false);
    });
  });
});
