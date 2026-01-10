import { describe, it, expect } from "bun:test";
import { z } from "zod";
import {
  zodToOpenAPI,
  generateOpenAPISpec,
  getOpenAPISpec,
  getSwaggerUIHtml,
} from "../../server/api/openapi";

describe("zodToOpenAPI", () => {
  describe("primitive types", () => {
    it("should convert string schema", () => {
      const schema = z.string();
      const result = zodToOpenAPI(schema);

      expect(result).toEqual({ type: "string" });
    });

    it("should convert string with description", () => {
      const schema = z.string().describe("A test string");
      const result = zodToOpenAPI(schema);

      expect(result).toEqual({ type: "string", description: "A test string" });
    });

    it("should convert string with constraints", () => {
      const schema = z.string().min(1).max(100);
      const result = zodToOpenAPI(schema);

      expect(result.type).toBe("string");
      expect(result.minLength).toBe(1);
      expect(result.maxLength).toBe(100);
    });

    it("should convert string with pattern", () => {
      const schema = z.string().regex(/^[a-z]+$/);
      const result = zodToOpenAPI(schema);

      expect(result.type).toBe("string");
      expect(result.pattern).toBe("^[a-z]+$");
    });

    it("should convert email string", () => {
      const schema = z.string().email();
      const result = zodToOpenAPI(schema);

      expect(result.type).toBe("string");
      expect(result.format).toBe("email");
    });

    it("should convert url string", () => {
      const schema = z.string().url();
      const result = zodToOpenAPI(schema);

      expect(result.type).toBe("string");
      expect(result.format).toBe("uri");
    });

    it("should convert uuid string", () => {
      const schema = z.string().uuid();
      const result = zodToOpenAPI(schema);

      expect(result.type).toBe("string");
      expect(result.format).toBe("uuid");
    });

    it("should convert number schema", () => {
      const schema = z.number();
      const result = zodToOpenAPI(schema);

      expect(result).toEqual({ type: "number" });
    });

    it("should convert integer schema", () => {
      const schema = z.number().int();
      const result = zodToOpenAPI(schema);

      expect(result.type).toBe("integer");
    });

    it("should convert number with constraints", () => {
      const schema = z.number().min(0).max(100);
      const result = zodToOpenAPI(schema);

      expect(result.type).toBe("number");
      expect(result.minimum).toBe(0);
      expect(result.maximum).toBe(100);
    });

    it("should convert boolean schema", () => {
      const schema = z.boolean();
      const result = zodToOpenAPI(schema);

      expect(result).toEqual({ type: "boolean" });
    });
  });

  describe("complex types", () => {
    it("should convert object schema", () => {
      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });
      const result = zodToOpenAPI(schema);

      expect(result.type).toBe("object");
      expect(result.properties).toBeDefined();
      expect(result.properties!.name).toEqual({ type: "string" });
      expect(result.properties!.age).toEqual({ type: "number" });
      expect(result.required).toContain("name");
      expect(result.required).toContain("age");
    });

    it("should handle optional fields", () => {
      const schema = z.object({
        required: z.string(),
        optional: z.string().optional(),
      });
      const result = zodToOpenAPI(schema);

      expect(result.required).toContain("required");
      expect(result.required).not.toContain("optional");
    });

    it("should convert array schema", () => {
      const schema = z.array(z.string());
      const result = zodToOpenAPI(schema);

      expect(result.type).toBe("array");
      expect(result.items).toEqual({ type: "string" });
    });

    it("should convert array of objects", () => {
      const schema = z.array(
        z.object({
          id: z.number(),
        })
      );
      const result = zodToOpenAPI(schema);

      expect(result.type).toBe("array");
      expect(result.items?.type).toBe("object");
      expect(result.items?.properties?.id).toEqual({ type: "number" });
    });

    it("should convert enum schema", () => {
      const schema = z.enum(["draft", "published", "archived"]);
      const result = zodToOpenAPI(schema);

      expect(result.type).toBe("string");
      expect(result.enum).toEqual(["draft", "published", "archived"]);
    });

    it("should convert union schema", () => {
      const schema = z.union([z.string(), z.number()]);
      const result = zodToOpenAPI(schema);

      expect(result.oneOf).toBeDefined();
      expect(result.oneOf).toHaveLength(2);
      expect(result.oneOf![0]).toEqual({ type: "string" });
      expect(result.oneOf![1]).toEqual({ type: "number" });
    });

    it("should convert record schema", () => {
      const schema = z.record(z.number());
      const result = zodToOpenAPI(schema);

      expect(result.type).toBe("object");
      expect(result.additionalProperties).toEqual({ type: "number" });
    });
  });

  describe("modifiers", () => {
    it("should convert optional schema", () => {
      const schema = z.string().optional();
      const result = zodToOpenAPI(schema);

      expect(result.type).toBe("string");
    });

    it("should convert nullable schema", () => {
      const schema = z.string().nullable();
      const result = zodToOpenAPI(schema);

      expect(result.type).toBe("string");
      expect(result.nullable).toBe(true);
    });

    it("should convert default schema", () => {
      const schema = z.number().default(42);
      const result = zodToOpenAPI(schema);

      expect(result.type).toBe("number");
      expect(result.default).toBe(42);
    });

    it("should handle effects (refine, transform)", () => {
      const schema = z
        .object({ value: z.number() })
        .refine((data) => data.value > 0);
      const result = zodToOpenAPI(schema);

      expect(result.type).toBe("object");
      expect(result.properties?.value).toEqual({ type: "number" });
    });
  });

  describe("literal types", () => {
    it("should convert string literal", () => {
      const schema = z.literal("fixed");
      const result = zodToOpenAPI(schema);

      expect(result.type).toBe("string");
      expect(result.enum).toEqual(["fixed"]);
    });

    it("should convert number literal", () => {
      const schema = z.literal(42);
      const result = zodToOpenAPI(schema);

      expect(result.type).toBe("number");
      expect(result.enum).toEqual([42]);
    });

    it("should convert boolean literal", () => {
      const schema = z.literal(true);
      const result = zodToOpenAPI(schema);

      expect(result.type).toBe("boolean");
      expect(result.enum).toEqual([true]);
    });
  });

  describe("special types", () => {
    it("should convert unknown schema", () => {
      const schema = z.unknown();
      const result = zodToOpenAPI(schema);

      expect(result).toEqual({});
    });

    it("should convert any schema", () => {
      const schema = z.any();
      const result = zodToOpenAPI(schema);

      expect(result).toEqual({});
    });
  });
});

describe("generateOpenAPISpec", () => {
  it("should generate a valid OpenAPI 3.1 spec", () => {
    const spec = generateOpenAPISpec();

    expect(spec.openapi).toBe("3.1.0");
    expect(spec.info.title).toBe("Extenote API");
    expect(spec.info.version).toBe("0.1.0");
  });

  it("should have server configuration", () => {
    const spec = generateOpenAPISpec();

    expect(spec.servers).toBeDefined();
    expect(spec.servers!.length).toBeGreaterThan(0);
    expect(spec.servers![0].url).toContain("localhost");
  });

  it("should have paths defined", () => {
    const spec = generateOpenAPISpec();

    expect(spec.paths).toBeDefined();
    expect(Object.keys(spec.paths).length).toBeGreaterThan(0);
  });

  it("should include vault endpoint", () => {
    const spec = generateOpenAPISpec();

    expect(spec.paths["/api/vault"]).toBeDefined();
    expect(spec.paths["/api/vault"].get).toBeDefined();
    expect(spec.paths["/api/vault"].get!.operationId).toBe("getVault");
  });

  it("should include create endpoint", () => {
    const spec = generateOpenAPISpec();

    expect(spec.paths["/api/create"]).toBeDefined();
    expect(spec.paths["/api/create"].post).toBeDefined();
    expect(spec.paths["/api/create"].post!.operationId).toBe("createObject");
    expect(spec.paths["/api/create"].post!.requestBody).toBeDefined();
  });

  it("should include tags endpoints", () => {
    const spec = generateOpenAPISpec();

    expect(spec.paths["/api/tags"]).toBeDefined();
    expect(spec.paths["/api/tags/preview"]).toBeDefined();
    expect(spec.paths["/api/tags/apply"]).toBeDefined();
  });

  it("should include refcheck endpoints", () => {
    const spec = generateOpenAPISpec();

    expect(spec.paths["/api/refcheck"]).toBeDefined();
    expect(spec.paths["/api/refcheck/providers"]).toBeDefined();
    expect(spec.paths["/api/refcheck/stats"]).toBeDefined();
  });

  it("should include export endpoint", () => {
    const spec = generateOpenAPISpec();

    expect(spec.paths["/api/export"]).toBeDefined();
    expect(spec.paths["/api/export"].post).toBeDefined();
  });

  it("should include settings endpoints", () => {
    const spec = generateOpenAPISpec();

    expect(spec.paths["/api/settings"]).toBeDefined();
    expect(spec.paths["/api/settings"].get).toBeDefined();
    expect(spec.paths["/api/settings"].post).toBeDefined();
    expect(spec.paths["/api/settings/reset"]).toBeDefined();
  });

  it("should include openapi.json endpoint", () => {
    const spec = generateOpenAPISpec();

    expect(spec.paths["/api/openapi.json"]).toBeDefined();
    expect(spec.paths["/api/openapi.json"].get).toBeDefined();
  });

  it("should have tags defined", () => {
    const spec = generateOpenAPISpec();

    expect(spec.tags).toBeDefined();
    expect(spec.tags!.length).toBeGreaterThan(0);

    const tagNames = spec.tags!.map((t) => t.name);
    expect(tagNames).toContain("Vault");
    expect(tagNames).toContain("Objects");
    expect(tagNames).toContain("Tags");
    expect(tagNames).toContain("Refcheck");
    expect(tagNames).toContain("Export");
  });

  it("should have component schemas", () => {
    const spec = generateOpenAPISpec();

    expect(spec.components).toBeDefined();
    expect(spec.components!.schemas).toBeDefined();
    expect(spec.components!.schemas!.ErrorResponse).toBeDefined();
    expect(spec.components!.schemas!.CreateRequest).toBeDefined();
    expect(spec.components!.schemas!.WriteRequest).toBeDefined();
  });

  it("should have proper response definitions", () => {
    const spec = generateOpenAPISpec();
    const createPath = spec.paths["/api/create"];

    expect(createPath.post!.responses["200"]).toBeDefined();
    expect(createPath.post!.responses["400"]).toBeDefined();
    expect(createPath.post!.responses["200"].content).toBeDefined();
    expect(
      createPath.post!.responses["200"].content!["application/json"]
    ).toBeDefined();
  });
});

describe("getOpenAPISpec", () => {
  it("should return cached spec", () => {
    const spec1 = getOpenAPISpec();
    const spec2 = getOpenAPISpec();

    // Should return same object reference
    expect(spec1).toBe(spec2);
  });

  it("should return valid spec", () => {
    const spec = getOpenAPISpec();

    expect(spec.openapi).toBeDefined();
    expect(spec.info).toBeDefined();
    expect(spec.paths).toBeDefined();
  });
});

describe("getSwaggerUIHtml", () => {
  it("should return valid HTML", () => {
    const html = getSwaggerUIHtml();

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<html");
    expect(html).toContain("</html>");
  });

  it("should include Swagger UI script", () => {
    const html = getSwaggerUIHtml();

    expect(html).toContain("swagger-ui");
    expect(html).toContain("swagger-ui-bundle.js");
  });

  it("should reference the OpenAPI spec endpoint", () => {
    const html = getSwaggerUIHtml();

    expect(html).toContain("/api/openapi.json");
  });

  it("should have proper meta tags", () => {
    const html = getSwaggerUIHtml();

    expect(html).toContain('charset="UTF-8"');
    expect(html).toContain("viewport");
  });

  it("should have a title", () => {
    const html = getSwaggerUIHtml();

    expect(html).toContain("<title>");
    expect(html).toContain("Extenote API");
  });
});
