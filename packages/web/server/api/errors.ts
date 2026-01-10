/**
 * API Error handling and response formatting
 */

import { ZodError } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Error Codes
// ─────────────────────────────────────────────────────────────────────────────

export const ErrorCodes = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  NOT_FOUND: "NOT_FOUND",
  INVALID_JSON: "INVALID_JSON",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  BAD_REQUEST: "BAD_REQUEST",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

// ─────────────────────────────────────────────────────────────────────────────
// Error Classes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Base API error class
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code: ErrorCode = "INTERNAL_ERROR",
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ApiError";
  }

  toJSON(): Record<string, unknown> {
    return {
      error: this.message,
      code: this.code,
      ...(this.details && { details: this.details }),
    };
  }
}

/**
 * Validation error with field-level details
 */
export class ApiValidationError extends ApiError {
  public validationErrors: Array<{
    path: string;
    message: string;
  }>;

  constructor(zodError: ZodError) {
    super("Validation failed", 400, "VALIDATION_ERROR");
    this.name = "ApiValidationError";
    this.validationErrors = zodError.errors.map((err) => ({
      path: err.path.join("."),
      message: err.message,
    }));
  }

  toJSON(): Record<string, unknown> {
    return {
      error: this.message,
      code: this.code,
      validationErrors: this.validationErrors,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Error Formatting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format any error into a consistent API response
 */
export function formatErrorResponse(error: unknown): {
  body: Record<string, unknown>;
  status: number;
} {
  if (error instanceof ApiError) {
    return {
      body: error.toJSON(),
      status: error.statusCode,
    };
  }

  if (error instanceof ZodError) {
    const apiError = new ApiValidationError(error);
    return {
      body: apiError.toJSON(),
      status: apiError.statusCode,
    };
  }

  if (error instanceof Error) {
    return {
      body: {
        error: error.message,
        code: "INTERNAL_ERROR",
      },
      status: 500,
    };
  }

  return {
    body: { error: "Unknown error", code: "INTERNAL_ERROR" },
    status: 500,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Error Factory Functions
// ─────────────────────────────────────────────────────────────────────────────

export function notFound(message: string): ApiError {
  return new ApiError(message, 404, "NOT_FOUND");
}

export function badRequest(message: string): ApiError {
  return new ApiError(message, 400, "BAD_REQUEST");
}

export function invalidJson(): ApiError {
  return new ApiError("Invalid JSON body", 400, "INVALID_JSON");
}
