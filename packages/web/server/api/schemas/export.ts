/**
 * Zod schemas for export operations
 */

import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Export Request
// ─────────────────────────────────────────────────────────────────────────────

export const ExportFormatSchema = z.enum([
  "json",
  "markdown",
  "html",
  "bibtex",
  "atproto",
]);

export const ExportRequestSchema = z.object({
  project: z.string().min(1).describe("Project to export"),
  format: ExportFormatSchema.describe("Export format"),
  outputDir: z.string().optional().describe("Output directory path"),
});

export const ExportResponseSchema = z.object({
  success: z.boolean(),
  outputPath: z.string().optional(),
  count: z.number().optional(),
});

// Types
export type ExportFormat = z.infer<typeof ExportFormatSchema>;
export type ExportRequest = z.infer<typeof ExportRequestSchema>;
