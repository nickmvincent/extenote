import type { ExtenoteConfig, VaultObject } from "./types.js";

/**
 * Check if a value is "present" (not null, undefined, empty string, or empty array)
 */
export function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return true;
}

/**
 * Check if an object belongs to a project (either directly or via includes)
 */
export function objectBelongsToProject(
  object: { project: string },
  targetProject: string,
  config: ExtenoteConfig
): boolean {
  // Direct ownership: object belongs to the target project
  if (object.project === targetProject) {
    return true;
  }
  // Included: target project includes object's project
  const profile = config.projectProfiles?.find((p) => p.name === targetProject);
  return profile?.includes?.includes(object.project) ?? false;
}

/**
 * Summary statistics for a vault
 */
export interface VaultSummary {
  totalObjects: number;
  totalIssues: number;
  typeCounts: Record<string, number>;
  visibilityCounts: Record<string, number>;
  issueCounts: Record<string, number>;
  projectCounts: Record<string, number>;
}

/**
 * Calculate summary statistics for a vault
 */
export function summarizeVault(
  objects: VaultObject[],
  issues: { severity: string }[]
): VaultSummary {
  const typeCounts: Record<string, number> = {};
  const visibilityCounts: Record<string, number> = {};
  const issueCounts: Record<string, number> = { info: 0, warn: 0, error: 0 };
  const projectCounts: Record<string, number> = {};

  for (const object of objects) {
    typeCounts[object.type] = (typeCounts[object.type] ?? 0) + 1;
    visibilityCounts[object.visibility] = (visibilityCounts[object.visibility] ?? 0) + 1;
    projectCounts[object.project] = (projectCounts[object.project] ?? 0) + 1;
  }

  for (const issue of issues) {
    issueCounts[issue.severity] = (issueCounts[issue.severity] ?? 0) + 1;
  }

  return {
    totalObjects: objects.length,
    totalIssues: issues.length,
    typeCounts,
    visibilityCounts,
    issueCounts,
    projectCounts
  };
}
