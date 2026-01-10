import { describe, it, expect } from "bun:test";
import { ZodError, z } from "zod";
import {
  ApiError,
  ApiValidationError,
  formatErrorResponse,
  notFound,
  badRequest,
  invalidJson,
  ErrorCodes,
} from "../../server/api/errors";

describe("ApiError", () => {
  it("should create error with default values", () => {
    const error = new ApiError("Something went wrong");

    expect(error.message).toBe("Something went wrong");
    expect(error.statusCode).toBe(500);
    expect(error.code).toBe("INTERNAL_ERROR");
    expect(error.details).toBeUndefined();
    expect(error.name).toBe("ApiError");
  });

  it("should create error with custom status and code", () => {
    const error = new ApiError("Not found", 404, "NOT_FOUND");

    expect(error.message).toBe("Not found");
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe("NOT_FOUND");
  });

  it("should include details when provided", () => {
    const details = { field: "email", reason: "invalid format" };
    const error = new ApiError("Validation failed", 400, "VALIDATION_ERROR", details);

    expect(error.details).toEqual(details);
  });

  it("should serialize to JSON correctly", () => {
    const error = new ApiError("Bad request", 400, "BAD_REQUEST", { extra: "info" });
    const json = error.toJSON();

    expect(json).toEqual({
      error: "Bad request",
      code: "BAD_REQUEST",
      details: { extra: "info" },
    });
  });

  it("should omit details from JSON when not provided", () => {
    const error = new ApiError("Error");
    const json = error.toJSON();

    expect(json).toEqual({
      error: "Error",
      code: "INTERNAL_ERROR",
    });
    expect("details" in json).toBe(false);
  });

  it("should be an instance of Error", () => {
    const error = new ApiError("Test");
    expect(error).toBeInstanceOf(Error);
  });
});

describe("ApiValidationError", () => {
  it("should create error from ZodError", () => {
    const schema = z.object({
      name: z.string().min(1),
      email: z.string().email(),
    });

    const result = schema.safeParse({ name: "", email: "invalid" });
    expect(result.success).toBe(false);

    if (!result.success) {
      const error = new ApiValidationError(result.error);

      expect(error.message).toBe("Validation failed");
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe("VALIDATION_ERROR");
      expect(error.name).toBe("ApiValidationError");
      expect(error.validationErrors.length).toBeGreaterThan(0);
    }
  });

  it("should format validation errors with paths", () => {
    const schema = z.object({
      user: z.object({
        profile: z.object({
          age: z.number().positive(),
        }),
      }),
    });

    const result = schema.safeParse({ user: { profile: { age: -5 } } });
    expect(result.success).toBe(false);

    if (!result.success) {
      const error = new ApiValidationError(result.error);

      expect(error.validationErrors).toContainEqual({
        path: "user.profile.age",
        message: expect.any(String),
      });
    }
  });

  it("should serialize to JSON with validation errors", () => {
    const schema = z.object({ value: z.number() });
    const result = schema.safeParse({ value: "not a number" });

    if (!result.success) {
      const error = new ApiValidationError(result.error);
      const json = error.toJSON();

      expect(json).toEqual({
        error: "Validation failed",
        code: "VALIDATION_ERROR",
        validationErrors: expect.any(Array),
      });
    }
  });

  it("should be an instance of ApiError", () => {
    const schema = z.string();
    const result = schema.safeParse(123);

    if (!result.success) {
      const error = new ApiValidationError(result.error);
      expect(error).toBeInstanceOf(ApiError);
    }
  });
});

describe("formatErrorResponse", () => {
  it("should format ApiError correctly", () => {
    const error = new ApiError("Not found", 404, "NOT_FOUND");
    const { body, status } = formatErrorResponse(error);

    expect(status).toBe(404);
    expect(body).toEqual({
      error: "Not found",
      code: "NOT_FOUND",
    });
  });

  it("should format ApiValidationError correctly", () => {
    const schema = z.string();
    const result = schema.safeParse(123);

    if (!result.success) {
      const error = new ApiValidationError(result.error);
      const { body, status } = formatErrorResponse(error);

      expect(status).toBe(400);
      expect(body.code).toBe("VALIDATION_ERROR");
      expect(body.validationErrors).toBeDefined();
    }
  });

  it("should format ZodError directly", () => {
    const schema = z.number();
    const result = schema.safeParse("string");

    if (!result.success) {
      const { body, status } = formatErrorResponse(result.error);

      expect(status).toBe(400);
      expect(body.code).toBe("VALIDATION_ERROR");
      expect(body.validationErrors).toBeDefined();
    }
  });

  it("should format regular Error", () => {
    const error = new Error("Something broke");
    const { body, status } = formatErrorResponse(error);

    expect(status).toBe(500);
    expect(body).toEqual({
      error: "Something broke",
      code: "INTERNAL_ERROR",
    });
  });

  it("should format unknown error", () => {
    const { body, status } = formatErrorResponse("string error");

    expect(status).toBe(500);
    expect(body).toEqual({
      error: "Unknown error",
      code: "INTERNAL_ERROR",
    });
  });

  it("should format null error", () => {
    const { body, status } = formatErrorResponse(null);

    expect(status).toBe(500);
    expect(body.error).toBe("Unknown error");
  });
});

describe("Error factory functions", () => {
  describe("notFound", () => {
    it("should create a 404 error", () => {
      const error = notFound("Resource not found");

      expect(error.statusCode).toBe(404);
      expect(error.code).toBe("NOT_FOUND");
      expect(error.message).toBe("Resource not found");
    });
  });

  describe("badRequest", () => {
    it("should create a 400 error", () => {
      const error = badRequest("Invalid input");

      expect(error.statusCode).toBe(400);
      expect(error.code).toBe("BAD_REQUEST");
      expect(error.message).toBe("Invalid input");
    });
  });

  describe("invalidJson", () => {
    it("should create a 400 error for invalid JSON", () => {
      const error = invalidJson();

      expect(error.statusCode).toBe(400);
      expect(error.code).toBe("INVALID_JSON");
      expect(error.message).toBe("Invalid JSON body");
    });
  });
});

describe("ErrorCodes", () => {
  it("should have all expected error codes", () => {
    expect(ErrorCodes.VALIDATION_ERROR).toBe("VALIDATION_ERROR");
    expect(ErrorCodes.NOT_FOUND).toBe("NOT_FOUND");
    expect(ErrorCodes.INVALID_JSON).toBe("INVALID_JSON");
    expect(ErrorCodes.INTERNAL_ERROR).toBe("INTERNAL_ERROR");
    expect(ErrorCodes.BAD_REQUEST).toBe("BAD_REQUEST");
  });
});
