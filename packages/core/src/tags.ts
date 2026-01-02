import fs from "fs/promises";
import path from "path";
import type { VaultObject, VaultState } from "./types.js";
import { parseMarkdown, stringifyMarkdown } from "./markdown.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TagNode {
  name: string;
  fullPath: string;
  count: number;
  children: TagNode[];
  objects: string[]; // relativePaths of objects with this tag
}

export interface TagTree {
  roots: TagNode[];
  totalTags: number;
  totalTaggedObjects: number;
}

export interface TagMutation {
  type: "rename" | "delete" | "merge";
  oldTag: string;
  newTag?: string; // for rename/merge
}

export interface TagMutationPreview {
  mutation: TagMutation;
  affectedFiles: Array<{
    relativePath: string;
    filePath: string;
    title?: string;
    currentTags: string[];
    newTags: string[];
  }>;
}

export interface TagMutationResult {
  success: boolean;
  filesModified: number;
  errors: Array<{ filePath: string; error: string }>;
}

// ─── Tag Tree Building ───────────────────────────────────────────────────────

/**
 * Extract tags from a vault object's frontmatter.
 */
export function getObjectTags(object: VaultObject): string[] {
  const tags = object.frontmatter.tags;
  if (!tags) return [];
  if (Array.isArray(tags)) return tags.map(String);
  if (typeof tags === "string") return [tags];
  return [];
}

/**
 * Build a hierarchical tag tree from vault objects.
 * Tags with colons (e.g., "collection:data-leverage") are treated as hierarchical.
 */
export function buildTagTree(vault: VaultState): TagTree {
  const tagMap = new Map<string, Set<string>>(); // tag -> set of relativePaths
  const taggedObjects = new Set<string>();

  // Collect all tags and their objects
  for (const object of vault.objects) {
    const tags = getObjectTags(object);
    for (const tag of tags) {
      if (!tagMap.has(tag)) {
        tagMap.set(tag, new Set());
      }
      tagMap.get(tag)!.add(object.relativePath);
      taggedObjects.add(object.relativePath);
    }
  }

  // Build hierarchical structure based on colon separator
  const rootMap = new Map<string, TagNode>();

  for (const [tag, objects] of tagMap) {
    const parts = tag.split(":");
    const rootName = parts[0];

    if (!rootMap.has(rootName)) {
      rootMap.set(rootName, {
        name: rootName,
        fullPath: rootName,
        count: 0,
        children: [],
        objects: [],
      });
    }

    const root = rootMap.get(rootName)!;

    if (parts.length === 1) {
      // Simple tag (no colon)
      root.count = objects.size;
      root.objects = Array.from(objects);
    } else {
      // Hierarchical tag (has colon)
      const childName = parts.slice(1).join(":");
      const existingChild = root.children.find((c) => c.name === childName);

      if (existingChild) {
        existingChild.count = objects.size;
        existingChild.objects = Array.from(objects);
      } else {
        root.children.push({
          name: childName,
          fullPath: tag,
          count: objects.size,
          children: [],
          objects: Array.from(objects),
        });
      }
    }
  }

  // Sort children and calculate root counts (sum of children if it has children)
  const roots = Array.from(rootMap.values())
    .map((root) => {
      root.children.sort((a, b) => a.name.localeCompare(b.name));
      if (root.children.length > 0 && root.count === 0) {
        // If root has no direct objects but has children, sum children counts
        root.count = root.children.reduce((sum, child) => sum + child.count, 0);
      }
      return root;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    roots,
    totalTags: tagMap.size,
    totalTaggedObjects: taggedObjects.size,
  };
}

/**
 * Get a flat list of all unique tags with counts.
 */
export function getAllTags(vault: VaultState): Array<{ tag: string; count: number }> {
  const tagCounts = new Map<string, number>();

  for (const object of vault.objects) {
    const tags = getObjectTags(object);
    for (const tag of tags) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
  }

  return Array.from(tagCounts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

// ─── Tag Mutations ───────────────────────────────────────────────────────────

/**
 * Preview the effects of a tag mutation without applying it.
 */
export function previewTagMutation(
  vault: VaultState,
  mutation: TagMutation
): TagMutationPreview {
  const affectedFiles: TagMutationPreview["affectedFiles"] = [];

  for (const object of vault.objects) {
    const currentTags = getObjectTags(object);
    if (!currentTags.includes(mutation.oldTag)) continue;

    let newTags: string[];

    switch (mutation.type) {
      case "rename":
        newTags = currentTags.map((t) =>
          t === mutation.oldTag ? mutation.newTag! : t
        );
        break;
      case "delete":
        newTags = currentTags.filter((t) => t !== mutation.oldTag);
        break;
      case "merge":
        // Remove old tag, add new tag if not already present
        newTags = currentTags.filter((t) => t !== mutation.oldTag);
        if (!newTags.includes(mutation.newTag!)) {
          newTags.push(mutation.newTag!);
        }
        break;
      default:
        newTags = currentTags;
    }

    // Only include if tags actually changed
    if (JSON.stringify(currentTags.sort()) !== JSON.stringify(newTags.sort())) {
      affectedFiles.push({
        relativePath: object.relativePath,
        filePath: object.filePath,
        title: object.title,
        currentTags,
        newTags,
      });
    }
  }

  return { mutation, affectedFiles };
}

/**
 * Apply a tag mutation to affected files.
 */
export async function applyTagMutation(
  preview: TagMutationPreview
): Promise<TagMutationResult> {
  const errors: TagMutationResult["errors"] = [];
  let filesModified = 0;

  for (const file of preview.affectedFiles) {
    try {
      // Read current file content
      const content = await fs.readFile(file.filePath, "utf8");
      const parsed = parseMarkdown(content);

      // Update tags in frontmatter
      parsed.frontmatter.tags = file.newTags;

      // Write back
      const newContent = stringifyMarkdown(parsed.frontmatter, parsed.body);
      await fs.writeFile(file.filePath, newContent, "utf8");
      filesModified++;
    } catch (err) {
      errors.push({
        filePath: file.filePath,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    success: errors.length === 0,
    filesModified,
    errors,
  };
}

/**
 * Convenience function to rename a tag across all vault objects.
 */
export async function renameTag(
  vault: VaultState,
  oldTag: string,
  newTag: string
): Promise<TagMutationResult> {
  const preview = previewTagMutation(vault, {
    type: "rename",
    oldTag,
    newTag,
  });
  return applyTagMutation(preview);
}

/**
 * Convenience function to delete a tag from all vault objects.
 */
export async function deleteTag(
  vault: VaultState,
  tag: string
): Promise<TagMutationResult> {
  const preview = previewTagMutation(vault, {
    type: "delete",
    oldTag: tag,
  });
  return applyTagMutation(preview);
}

/**
 * Convenience function to merge one tag into another.
 */
export async function mergeTags(
  vault: VaultState,
  sourceTag: string,
  targetTag: string
): Promise<TagMutationResult> {
  const preview = previewTagMutation(vault, {
    type: "merge",
    oldTag: sourceTag,
    newTag: targetTag,
  });
  return applyTagMutation(preview);
}

// ─── Taxonomy Types ──────────────────────────────────────────────────────────

export interface TaxonomyBroadTag {
  description?: string;
  specific_tags: string[];
}

export interface Taxonomy {
  [broadTag: string]: TaxonomyBroadTag;
}

export interface TaxonomyViolation {
  relativePath: string;
  filePath: string;
  title?: string;
  specificTag: string;
  missingBroadTags: string[]; // All valid broad tags that could satisfy the requirement
}

export interface TaxonomyValidationResult {
  violations: TaxonomyViolation[];
  validFiles: number;
  totalFilesChecked: number;
  taxonomy: Taxonomy;
}

// ─── Taxonomy Loading & Validation ───────────────────────────────────────────

/**
 * Load taxonomy from _taxonomy.md file in content directory.
 * Returns null if file doesn't exist.
 */
export async function loadTaxonomy(contentRoot: string): Promise<Taxonomy | null> {
  const taxonomyPath = path.join(contentRoot, "_taxonomy.md");

  try {
    const content = await fs.readFile(taxonomyPath, "utf8");
    const parsed = parseMarkdown(content);

    // Extract taxonomy from frontmatter
    const taxonomyData = parsed.frontmatter.taxonomy as Taxonomy | undefined;
    if (!taxonomyData) {
      return null;
    }

    return taxonomyData;
  } catch {
    return null;
  }
}

/**
 * Build a reverse index: specific tag -> list of broad tags that contain it.
 */
export function buildReverseIndex(taxonomy: Taxonomy): Map<string, string[]> {
  const reverseIndex = new Map<string, string[]>();

  for (const [broadTag, config] of Object.entries(taxonomy)) {
    for (const specificTag of config.specific_tags) {
      const existing = reverseIndex.get(specificTag) || [];
      existing.push(broadTag);
      reverseIndex.set(specificTag, existing);
    }
  }

  return reverseIndex;
}

/**
 * Validate vault objects against taxonomy rules.
 * Returns violations where a file has a specific tag but is missing the required broad tag.
 */
export function validateTaxonomy(
  vault: VaultState,
  taxonomy: Taxonomy
): TaxonomyValidationResult {
  const reverseIndex = buildReverseIndex(taxonomy);
  const violations: TaxonomyViolation[] = [];
  let validFiles = 0;
  let totalFilesChecked = 0;

  for (const object of vault.objects) {
    const tags = getObjectTags(object);
    if (tags.length === 0) continue;

    totalFilesChecked++;
    let hasViolation = false;

    for (const tag of tags) {
      // Check if this tag is a specific tag in the taxonomy
      const requiredBroadTags = reverseIndex.get(tag);
      if (!requiredBroadTags) continue;

      // Check if the file has at least one of the required broad tags
      const hasBroadTag = requiredBroadTags.some((broadTag) => tags.includes(broadTag));

      if (!hasBroadTag) {
        hasViolation = true;
        violations.push({
          relativePath: object.relativePath,
          filePath: object.filePath,
          title: object.title,
          specificTag: tag,
          missingBroadTags: requiredBroadTags,
        });
      }
    }

    if (!hasViolation) {
      validFiles++;
    }
  }

  return {
    violations,
    validFiles,
    totalFilesChecked,
    taxonomy,
  };
}

/**
 * Auto-fix a taxonomy violation by adding the first suggested broad tag.
 */
export async function fixTaxonomyViolation(
  violation: TaxonomyViolation,
  broadTagToAdd?: string
): Promise<{ success: boolean; error?: string }> {
  const tagToAdd = broadTagToAdd || violation.missingBroadTags[0];

  if (!tagToAdd) {
    return { success: false, error: "No broad tag specified" };
  }

  try {
    const content = await fs.readFile(violation.filePath, "utf8");
    const parsed = parseMarkdown(content);

    const currentTags = parsed.frontmatter.tags as string[] | undefined || [];
    if (!currentTags.includes(tagToAdd)) {
      // Add broad tag at the beginning for visibility
      parsed.frontmatter.tags = [tagToAdd, ...currentTags];
    }

    const newContent = stringifyMarkdown(parsed.frontmatter, parsed.body);
    await fs.writeFile(violation.filePath, newContent, "utf8");

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err)
    };
  }
}

// ─── Tag Explorer Types ──────────────────────────────────────────────────────

export interface TagExplorerObject {
  relativePath: string;
  title: string;
  type: string;
}

export interface TagExplorerNode {
  name: string;
  fullPath: string;
  count: number;
  children: TagExplorerNode[];
  objects: TagExplorerObject[];
}

export interface TagExplorerTree {
  roots: TagExplorerNode[];
  totalTags: number;
  totalTaggedObjects: number;
}

// ─── Tag Explorer Building ───────────────────────────────────────────────────

/**
 * Build a tag tree with full object metadata for the Tag Explorer visualization.
 * Similar to buildTagTree but includes object title and type, not just paths.
 */
export function buildTagExplorerTree(vault: VaultState): TagExplorerTree {
  // Build a map of relativePath -> object metadata
  const objectMap = new Map<string, TagExplorerObject>();
  for (const object of vault.objects) {
    objectMap.set(object.relativePath, {
      relativePath: object.relativePath,
      title: object.title || object.id,
      type: object.type,
    });
  }

  // Collect tags -> set of relativePaths
  const tagMap = new Map<string, Set<string>>();
  const taggedObjects = new Set<string>();

  for (const object of vault.objects) {
    const tags = getObjectTags(object);
    for (const tag of tags) {
      if (!tagMap.has(tag)) {
        tagMap.set(tag, new Set());
      }
      tagMap.get(tag)!.add(object.relativePath);
      taggedObjects.add(object.relativePath);
    }
  }

  // Build hierarchical structure
  const rootMap = new Map<string, TagExplorerNode>();

  for (const [tag, objectPaths] of tagMap) {
    const parts = tag.split(":");
    const rootName = parts[0];

    if (!rootMap.has(rootName)) {
      rootMap.set(rootName, {
        name: rootName,
        fullPath: rootName,
        count: 0,
        children: [],
        objects: [],
      });
    }

    const root = rootMap.get(rootName)!;

    // Convert paths to full object metadata
    const objects = Array.from(objectPaths)
      .map((p) => objectMap.get(p))
      .filter((o): o is TagExplorerObject => o !== undefined)
      .sort((a, b) => a.title.localeCompare(b.title));

    if (parts.length === 1) {
      // Simple tag (no colon)
      root.count = objectPaths.size;
      root.objects = objects;
    } else {
      // Hierarchical tag
      const childName = parts.slice(1).join(":");
      const existingChild = root.children.find((c) => c.name === childName);

      if (existingChild) {
        existingChild.count = objectPaths.size;
        existingChild.objects = objects;
      } else {
        root.children.push({
          name: childName,
          fullPath: tag,
          count: objectPaths.size,
          children: [],
          objects,
        });
      }
    }
  }

  // Sort and calculate root counts
  const roots = Array.from(rootMap.values())
    .map((root) => {
      root.children.sort((a, b) => a.name.localeCompare(b.name));
      if (root.children.length > 0 && root.count === 0) {
        root.count = root.children.reduce((sum, child) => sum + child.count, 0);
      }
      return root;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    roots,
    totalTags: tagMap.size,
    totalTaggedObjects: taggedObjects.size,
  };
}

// ─── Tag Taxonomy Graph ──────────────────────────────────────────────────────

export interface TagTaxonomyNode {
  id: string;
  label: string;
  type: "broad" | "specific";
  description?: string;
  objectCount: number;
}

export interface TagTaxonomyEdge {
  source: string;
  target: string;
  directed: boolean;
}

export interface TagTaxonomyGraph {
  type: "tag-taxonomy";
  nodes: TagTaxonomyNode[];
  edges: TagTaxonomyEdge[];
}

/**
 * Build a graph visualization of the tag taxonomy.
 * Nodes are broad and specific tags, edges connect specific tags to their broad parents.
 */
export function buildTagTaxonomyGraph(
  taxonomy: Taxonomy,
  vault: VaultState
): TagTaxonomyGraph {
  const nodes: TagTaxonomyNode[] = [];
  const edges: TagTaxonomyEdge[] = [];
  const nodeIds = new Set<string>();

  // Count objects per tag
  const tagCounts = new Map<string, number>();
  for (const object of vault.objects) {
    const tags = getObjectTags(object);
    for (const tag of tags) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
  }

  // Create nodes for broad tags and their specific tags
  for (const [broadTag, config] of Object.entries(taxonomy)) {
    // Add broad tag node
    if (!nodeIds.has(broadTag)) {
      nodeIds.add(broadTag);
      nodes.push({
        id: broadTag,
        label: broadTag,
        type: "broad",
        description: config.description,
        objectCount: tagCounts.get(broadTag) || 0,
      });
    }

    // Add specific tag nodes and edges
    for (const specificTag of config.specific_tags) {
      if (!nodeIds.has(specificTag)) {
        nodeIds.add(specificTag);
        nodes.push({
          id: specificTag,
          label: specificTag,
          type: "specific",
          objectCount: tagCounts.get(specificTag) || 0,
        });
      }

      // Edge from broad to specific
      edges.push({
        source: broadTag,
        target: specificTag,
        directed: true,
      });
    }
  }

  return { type: "tag-taxonomy", nodes, edges };
}
