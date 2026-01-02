import type { VaultObject, ExtenoteConfig } from "./types.js";
import { objectBelongsToProject } from "./utils.js";

export interface CitationScanObject {
  body: string;
  frontmatter: Record<string, unknown>;
  filePath: string;
}

/**
 * Detect citation keys referenced in project objects.
 *
 * For Quarto/Pandoc files (.qmd, .md): extracts [@key] patterns from body
 * For other objects: checks frontmatter fields that might link to references
 */
export function detectCitedReferences(objects: CitationScanObject[]): Set<string> {
  const citedKeys = new Set<string>();

  for (const obj of objects) {
    // 1. Scan body for Quarto/Pandoc citations
    if (obj.body) {
      for (const bracketMatch of obj.body.matchAll(/\[([^\]]*@[^\]]+)\]/g)) {
        const bracketContent = bracketMatch[1];
        if (bracketContent.toLowerCase().includes("mailto:")) {
          continue; // skip email addresses inside links
        }
        // Extract all @keys from within the brackets
        for (const keyMatch of bracketContent.matchAll(/@([\w][\w:._-]*)/g)) {
          citedKeys.add(keyMatch[1]);
        }
      }
    }

    // 2. Check frontmatter for reference links
    // Common patterns: references: [key1, key2], citations: [...], bibliography_keys: [...]
    const refFields = ["references", "citations", "bibliography_keys", "cites"];
    for (const field of refFields) {
      const value = obj.frontmatter[field];
      if (Array.isArray(value)) {
        for (const key of value) {
          if (typeof key === "string") {
            citedKeys.add(key);
          }
        }
      } else if (typeof value === "string") {
        citedKeys.add(value);
      }
    }
  }

  return citedKeys;
}

export interface CitedInMap {
  /** Map from citation_key to list of projects that cite it */
  citedIn: Map<string, string[]>;
  /** Total citations found across all projects */
  totalCitations: number;
  /** Projects that were scanned */
  scannedProjects: string[];
}

/**
 * Compute cited_in map dynamically from vault objects.
 *
 * This scans all projects that include shared-references (or any specified reference project)
 * and builds a reverse index of which projects cite each bibtex entry.
 *
 * @param objects All vault objects
 * @param config Vault configuration with project profiles
 * @param referenceProject The project containing bibtex entries (default: "shared-references")
 * @returns Map from citation_key to list of citing projects
 */
export function computeCitedIn(
  objects: VaultObject[],
  config: ExtenoteConfig,
  referenceProject = "shared-references"
): CitedInMap {
  const citedIn = new Map<string, Set<string>>();
  const scannedProjects: string[] = [];
  let totalCitations = 0;

  // Find projects that include the reference project
  const projectsToScan: string[] = [];
  for (const profile of config.projectProfiles || []) {
    const includes = profile.includes || [];
    if (includes.includes(referenceProject) || profile.name === referenceProject) {
      projectsToScan.push(profile.name);
    }
  }

  // Scan each project for citations
  for (const projectName of projectsToScan) {
    const projectObjects = objects.filter((o) => {
      return objectBelongsToProject(o, projectName, config) && o.type !== "bibtex_entry";
    });

    if (!projectObjects.length) continue;

    const citations = detectCitedReferences(projectObjects);
    if (citations.size === 0) continue;

    scannedProjects.push(projectName);
    totalCitations += citations.size;

    // Add to reverse index
    for (const key of citations) {
      if (!citedIn.has(key)) {
        citedIn.set(key, new Set());
      }
      citedIn.get(key)!.add(projectName);
    }
  }

  // Convert Sets to sorted arrays
  const result = new Map<string, string[]>();
  for (const [key, projects] of citedIn) {
    result.set(key, [...projects].sort());
  }

  return {
    citedIn: result,
    totalCitations,
    scannedProjects,
  };
}

/**
 * Get cited_in for a specific bibtex entry.
 *
 * If the entry has a persisted cited_in field, returns that.
 * Otherwise computes it dynamically from the provided citedInMap.
 *
 * @param entry The bibtex entry object
 * @param citedInMap Pre-computed cited_in map (from computeCitedIn)
 * @returns List of projects that cite this entry
 */
export function getCitedIn(
  entry: VaultObject,
  citedInMap?: CitedInMap
): string[] {
  // Check for persisted value first
  const persisted = entry.frontmatter.cited_in;
  if (Array.isArray(persisted) && persisted.length > 0) {
    return persisted as string[];
  }

  // Fall back to dynamic computation
  if (citedInMap) {
    const key = (entry.frontmatter.citation_key as string) || entry.id;
    return citedInMap.citedIn.get(key) || [];
  }

  return [];
}
