/**
 * Zod schemas for object CRUD operations
 */

import { z } from "zod";
import { VisibilitySchema, FilePathSchema } from "./common.js";

// ─────────────────────────────────────────────────────────────────────────────
// Create Object
// ─────────────────────────────────────────────────────────────────────────────

export const CreateRequestSchema = z.object({
  schema: z.string().min(1).describe("Schema name to use for the new object"),
  slug: z.string().min(1).describe("URL-friendly identifier for the object"),
  title: z.string().optional().describe("Human-readable title"),
  visibility: VisibilitySchema.optional().describe("Object visibility level"),
  dir: z.string().optional().describe("Subdirectory within source"),
  project: z.string().optional().describe("Target project name"),
});

export const CreateResponseSchema = z.object({
  filePath: z.string().describe("Path to the created file"),
});

// ─────────────────────────────────────────────────────────────────────────────
// Write Object
// ─────────────────────────────────────────────────────────────────────────────

export const WriteRequestSchema = z.object({
  filePath: FilePathSchema.describe("Relative path to the file"),
  frontmatter: z.record(z.unknown()).describe("YAML frontmatter fields"),
  body: z.string().optional().describe("Markdown body content"),
  merge: z
    .boolean()
    .optional()
    .default(false)
    .describe("Merge with existing frontmatter instead of replacing"),
});

export const WriteResponseSchema = z.object({
  success: z.boolean(),
  filePath: z.string(),
  relativePath: z.string(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Get Object
// ─────────────────────────────────────────────────────────────────────────────

export const GetObjectQuerySchema = z
  .object({
    path: z.string().optional().describe("Relative file path"),
    id: z.string().optional().describe("Object ID"),
  })
  .refine((data) => data.path || data.id, {
    message: "Either path or id parameter is required",
  });

// ─────────────────────────────────────────────────────────────────────────────
// Open in Editor
// ─────────────────────────────────────────────────────────────────────────────

export const OpenInEditorRequestSchema = z.object({
  filePath: FilePathSchema.describe("Path to open in editor"),
});

// Types
export type CreateRequest = z.infer<typeof CreateRequestSchema>;
export type WriteRequest = z.infer<typeof WriteRequestSchema>;
export type GetObjectQuery = z.infer<typeof GetObjectQuerySchema>;
