/**
 * Zod schemas for tag operations
 */

import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Tag Mutation
// ─────────────────────────────────────────────────────────────────────────────

export const TagMutationTypeSchema = z.enum(["rename", "delete", "merge"]);

export const TagMutationSchema = z.object({
  type: TagMutationTypeSchema.describe("Type of tag mutation"),
  tag: z.string().min(1).describe("Source tag to mutate"),
  newTag: z.string().optional().describe("Target tag for rename/merge operations"),
});

export const TagPreviewRequestSchema = z.object({
  mutation: TagMutationSchema,
});

export const TagApplyRequestSchema = z.object({
  mutation: TagMutationSchema,
});

// ─────────────────────────────────────────────────────────────────────────────
// Taxonomy
// ─────────────────────────────────────────────────────────────────────────────

export const TaxonomyFixRequestSchema = z.object({
  objectPath: z.string().describe("Path to the object to fix"),
  violation: z.string().describe("Violation type to fix"),
  fix: z.string().describe("Fix to apply"),
});

// Types
export type TagMutationType = z.infer<typeof TagMutationTypeSchema>;
export type TagMutation = z.infer<typeof TagMutationSchema>;
