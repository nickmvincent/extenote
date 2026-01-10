/**
 * Common Zod schemas used across multiple endpoints
 */

import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Error Response Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const ValidationErrorSchema = z.object({
  path: z.string(),
  message: z.string(),
});

export const ErrorResponseSchema = z.object({
  error: z.string().describe("Error message"),
  code: z.string().optional().describe("Machine-readable error code"),
  details: z.record(z.unknown()).optional().describe("Additional error context"),
  validationErrors: z
    .array(ValidationErrorSchema)
    .optional()
    .describe("Field-level validation errors"),
});

// ─────────────────────────────────────────────────────────────────────────────
// Common Field Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const VisibilitySchema = z.enum(["public", "private", "unlisted"]);

export const ProjectNameSchema = z
  .string()
  .min(1)
  .describe("Project name identifier");

export const FilePathSchema = z
  .string()
  .min(1)
  .describe("Relative file path");

export const SlugSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9-]+$/, "Slug must contain only lowercase letters, numbers, and hyphens")
  .describe("URL-friendly identifier");

// ─────────────────────────────────────────────────────────────────────────────
// Pagination Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const PaginationQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .default(20)
    .describe("Maximum number of results"),
  offset: z.coerce
    .number()
    .int()
    .nonnegative()
    .optional()
    .default(0)
    .describe("Number of results to skip"),
});

// ─────────────────────────────────────────────────────────────────────────────
// Success Response Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const SuccessResponseSchema = z.object({
  success: z.boolean(),
});

// Types derived from schemas
export type Visibility = z.infer<typeof VisibilitySchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
