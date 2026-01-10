import { describe, it, expect } from "bun:test";
import { z } from "zod";
import {
  validateBody,
  validateQuery,
  tryValidateBody,
} from "../../server/api/validation";
import { ApiValidationError } from "../../server/api/errors";

describe("validateBody", () => {
  const schema = z.object({
    name: z.string().min(1),
    count: z.number().int().positive(),
    optional: z.string().optional(),
  });

  it("should validate and return parsed body", async () => {
    const body = JSON.stringify({ name: "test", count: 5 });
    const req = new Request("http://example.com/api/test", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" },
    });

    const result = await validateBody(req, schema);

    expect(result).toEqual({ name: "test", count: 5 });
  });

  it("should include optional fields when provided", async () => {
    const body = JSON.stringify({ name: "test", count: 5, optional: "value" });
    const req = new Request("http://example.com/api/test", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" },
    });

    const result = await validateBody(req, schema);

    expect(result).toEqual({ name: "test", count: 5, optional: "value" });
  });

  it("should throw ApiValidationError for invalid data", async () => {
    const body = JSON.stringify({ name: "", count: -1 });
    const req = new Request("http://example.com/api/test", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" },
    });

    await expect(validateBody(req, schema)).rejects.toThrow(ApiValidationError);
  });

  it("should throw for invalid JSON", async () => {
    const req = new Request("http://example.com/api/test", {
      method: "POST",
      body: "not json",
      headers: { "Content-Type": "application/json" },
    });

    try {
      await validateBody(req, schema);
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as any).code).toBe("INVALID_JSON");
    }
  });

  it("should throw for empty body", async () => {
    const req = new Request("http://example.com/api/test", {
      method: "POST",
      body: "",
    });

    try {
      await validateBody(req, schema);
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
    }
  });

  it("should apply default values from schema", async () => {
    const schemaWithDefaults = z.object({
      value: z.number().default(42),
    });

    const body = JSON.stringify({});
    const req = new Request("http://example.com/api/test", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" },
    });

    const result = await validateBody(req, schemaWithDefaults);

    expect(result.value).toBe(42);
  });

  it("should coerce types when schema uses coerce", async () => {
    const coerceSchema = z.object({
      count: z.coerce.number(),
    });

    const body = JSON.stringify({ count: "123" });
    const req = new Request("http://example.com/api/test", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" },
    });

    const result = await validateBody(req, coerceSchema);

    expect(result.count).toBe(123);
    expect(typeof result.count).toBe("number");
  });
});

describe("validateQuery", () => {
  const schema = z.object({
    page: z.coerce.number().int().positive().optional().default(1),
    limit: z.coerce.number().int().positive().max(100).optional().default(20),
    filter: z.string().optional(),
  });

  it("should validate and return parsed query params", () => {
    const url = new URL("http://example.com/api/list?page=2&limit=50&filter=active");
    const result = validateQuery(url, schema);

    expect(result).toEqual({ page: 2, limit: 50, filter: "active" });
  });

  it("should apply default values for missing params", () => {
    const url = new URL("http://example.com/api/list");
    const result = validateQuery(url, schema);

    expect(result).toEqual({ page: 1, limit: 20 });
  });

  it("should coerce string params to numbers", () => {
    const url = new URL("http://example.com/api/list?page=5");
    const result = validateQuery(url, schema);

    expect(result.page).toBe(5);
    expect(typeof result.page).toBe("number");
  });

  it("should throw ApiValidationError for invalid params", () => {
    const url = new URL("http://example.com/api/list?limit=500");

    expect(() => validateQuery(url, schema)).toThrow(ApiValidationError);
  });

  it("should throw for negative values when expecting positive", () => {
    const url = new URL("http://example.com/api/list?page=-1");

    expect(() => validateQuery(url, schema)).toThrow(ApiValidationError);
  });

  it("should handle boolean params", () => {
    const boolSchema = z.object({
      active: z.string().transform((v) => v === "true").optional(),
    });

    const url = new URL("http://example.com/api/list?active=true");
    const result = validateQuery(url, boolSchema);

    expect(result.active).toBe(true);
  });

  it("should handle array params", () => {
    const arraySchema = z.object({
      tags: z.string().optional(),
    });

    // Note: searchParams returns first value for duplicate keys
    const url = new URL("http://example.com/api/list?tags=one,two,three");
    const result = validateQuery(url, arraySchema);

    expect(result.tags).toBe("one,two,three");
  });
});

describe("tryValidateBody", () => {
  const schema = z.object({
    value: z.number(),
  });

  it("should return data on success", async () => {
    const body = JSON.stringify({ value: 42 });
    const req = new Request("http://example.com/api/test", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" },
    });

    const result = await tryValidateBody(req, schema);

    expect(result.error).toBeNull();
    expect(result.data).toEqual({ value: 42 });
  });

  it("should return error on validation failure", async () => {
    const body = JSON.stringify({ value: "not a number" });
    const req = new Request("http://example.com/api/test", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" },
    });

    const result = await tryValidateBody(req, schema);

    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(ApiValidationError);
  });

  it("should throw for non-validation errors", async () => {
    const req = new Request("http://example.com/api/test", {
      method: "POST",
      body: "invalid json",
    });

    // Invalid JSON throws, not wrapped in result
    await expect(tryValidateBody(req, schema)).rejects.toThrow();
  });
});

describe("Complex validation scenarios", () => {
  it("should validate nested objects", async () => {
    const nestedSchema = z.object({
      user: z.object({
        name: z.string(),
        settings: z.object({
          theme: z.enum(["light", "dark"]),
          notifications: z.boolean(),
        }),
      }),
    });

    const body = JSON.stringify({
      user: {
        name: "Test",
        settings: {
          theme: "dark",
          notifications: true,
        },
      },
    });

    const req = new Request("http://example.com/api/test", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" },
    });

    const result = await validateBody(req, nestedSchema);

    expect(result.user.settings.theme).toBe("dark");
  });

  it("should validate arrays", async () => {
    const arraySchema = z.object({
      items: z.array(z.string()).min(1),
    });

    const body = JSON.stringify({ items: ["a", "b", "c"] });
    const req = new Request("http://example.com/api/test", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" },
    });

    const result = await validateBody(req, arraySchema);

    expect(result.items).toEqual(["a", "b", "c"]);
  });

  it("should validate unions", async () => {
    const unionSchema = z.object({
      action: z.union([
        z.object({ type: z.literal("create"), name: z.string() }),
        z.object({ type: z.literal("delete"), id: z.string() }),
      ]),
    });

    const body = JSON.stringify({ action: { type: "delete", id: "123" } });
    const req = new Request("http://example.com/api/test", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" },
    });

    const result = await validateBody(req, unionSchema);

    expect(result.action.type).toBe("delete");
    expect((result.action as any).id).toBe("123");
  });

  it("should handle refinements", async () => {
    const refinedSchema = z.object({
      password: z.string(),
      confirmPassword: z.string(),
    }).refine((data) => data.password === data.confirmPassword, {
      message: "Passwords don't match",
      path: ["confirmPassword"],
    });

    const body = JSON.stringify({ password: "abc", confirmPassword: "xyz" });
    const req = new Request("http://example.com/api/test", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" },
    });

    await expect(validateBody(req, refinedSchema)).rejects.toThrow(ApiValidationError);
  });
});
