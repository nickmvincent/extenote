/**
 * Zod schemas for reference checking operations
 */

import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Refcheck Request
// ─────────────────────────────────────────────────────────────────────────────

export const RefcheckProviderSchema = z.enum([
  "dblp",
  "openalex",
  "crossref",
  "s2",
  "auto",
]);

export const RefcheckRequestSchema = z.object({
  project: z.string().optional().describe("Project to check (defaults to shared-references)"),
  provider: RefcheckProviderSchema.optional().describe("Reference provider to use"),
  limit: z.coerce.number().int().positive().max(500).optional().default(50).describe("Maximum entries to check"),
  filter: z.string().optional().describe("Filter entries by title/key"),
  dryRun: z.boolean().optional().default(false).describe("Preview changes without applying"),
  force: z.boolean().optional().default(false).describe("Re-check even if already verified"),
});

export const RefcheckAcceptRequestSchema = z.object({
  updates: z
    .array(
      z.object({
        path: z.string(),
        field: z.string(),
        value: z.unknown(),
      })
    )
    .describe("Field updates to accept"),
});

// Types
export type RefcheckProvider = z.infer<typeof RefcheckProviderSchema>;
export type RefcheckRequest = z.infer<typeof RefcheckRequestSchema>;
