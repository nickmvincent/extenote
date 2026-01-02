/**
 * Duplicate and related paper detection service
 * Checks vault for existing papers with same DOI, citation key, or similar metadata
 */

import type { PageMetadata, ExtenoteVaultInfo } from "./types";

export interface VaultObject {
  id: string;
  relativePath: string;
  frontmatter: {
    type?: string;
    citation_key?: string;
    title?: string;
    doi?: string;
    arxiv_id?: string;
    authors?: string[];
    year?: string;
    tags?: string[];
  };
}

export interface DuplicateMatch {
  citationKey: string;
  path: string;
  matchType: "exact_doi" | "exact_arxiv" | "exact_key" | "similar_title";
  confidence: number;
  title?: string;
}

export interface RelatedPaper {
  citationKey: string;
  path: string;
  title: string;
  sharedTags: string[];
  relevanceScore: number;
}

export interface DuplicateCheckResult {
  hasDuplicate: boolean;
  duplicates: DuplicateMatch[];
  related: RelatedPaper[];
}

/**
 * Normalize title for comparison (remove punctuation, lowercase)
 */
function normalizeForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Calculate Jaccard similarity between two sets of words
 */
function jaccardSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = [...setA].filter((x) => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Check if two titles are similar enough to be the same paper
 */
function titlesSimilar(title1: string, title2: string): number {
  const norm1 = normalizeForComparison(title1);
  const norm2 = normalizeForComparison(title2);

  // Exact match
  if (norm1 === norm2) return 1;

  // Word-level Jaccard similarity
  const words1 = norm1.split(" ").filter((w) => w.length > 2);
  const words2 = norm2.split(" ").filter((w) => w.length > 2);

  return jaccardSimilarity(words1, words2);
}

/**
 * Check for duplicates and find related papers in the vault
 */
export async function checkDuplicates(
  metadata: PageMetadata,
  apiUrl: string
): Promise<DuplicateCheckResult> {
  const result: DuplicateCheckResult = {
    hasDuplicate: false,
    duplicates: [],
    related: [],
  };

  try {
    // Fetch vault objects from API
    const response = await fetch(`${apiUrl}/api/vault`);
    if (!response.ok) {
      console.warn("[Duplicates] Could not fetch vault data");
      return result;
    }

    const data = await response.json();
    const objects: VaultObject[] = data.vault?.objects || [];

    // Filter to bibtex entries
    const bibEntries = objects.filter(
      (obj) => obj.frontmatter?.type === "bibtex_entry"
    );

    // Check for exact duplicates
    for (const entry of bibEntries) {
      const fm = entry.frontmatter;

      // Check DOI match
      if (metadata.doi && fm.doi) {
        const normDoi1 = metadata.doi.toLowerCase().replace(/^https?:\/\/doi\.org\//i, "");
        const normDoi2 = fm.doi.toLowerCase().replace(/^https?:\/\/doi\.org\//i, "");
        if (normDoi1 === normDoi2) {
          result.duplicates.push({
            citationKey: fm.citation_key || entry.id,
            path: entry.relativePath,
            matchType: "exact_doi",
            confidence: 1.0,
            title: fm.title,
          });
          continue;
        }
      }

      // Check ArXiv ID match
      if (metadata.arxivId && fm.arxiv_id) {
        const normArxiv1 = metadata.arxivId.replace(/^arxiv:/i, "").toLowerCase();
        const normArxiv2 = fm.arxiv_id.replace(/^arxiv:/i, "").toLowerCase();
        if (normArxiv1 === normArxiv2) {
          result.duplicates.push({
            citationKey: fm.citation_key || entry.id,
            path: entry.relativePath,
            matchType: "exact_arxiv",
            confidence: 1.0,
            title: fm.title,
          });
          continue;
        }
      }

      // Check title similarity
      if (metadata.title && fm.title) {
        const similarity = titlesSimilar(metadata.title, fm.title);
        if (similarity > 0.85) {
          result.duplicates.push({
            citationKey: fm.citation_key || entry.id,
            path: entry.relativePath,
            matchType: "similar_title",
            confidence: similarity,
            title: fm.title,
          });
        }
      }
    }

    result.hasDuplicate = result.duplicates.length > 0;

    // Find related papers by tag overlap (if we have suggested tags)
    if (metadata.tags && metadata.tags.length > 0) {
      const metadataTags = new Set(metadata.tags.map((t) => t.toLowerCase()));

      for (const entry of bibEntries) {
        // Skip if it's a duplicate
        if (result.duplicates.some((d) => d.citationKey === (entry.frontmatter.citation_key || entry.id))) {
          continue;
        }

        const entryTags = (entry.frontmatter.tags || []).map((t) => t.toLowerCase());
        const sharedTags = entryTags.filter((t) => metadataTags.has(t));

        if (sharedTags.length >= 2) {
          result.related.push({
            citationKey: entry.frontmatter.citation_key || entry.id,
            path: entry.relativePath,
            title: entry.frontmatter.title || entry.id,
            sharedTags,
            relevanceScore: sharedTags.length / Math.max(metadataTags.size, entryTags.length),
          });
        }
      }

      // Sort by relevance and limit to top 5
      result.related.sort((a, b) => b.relevanceScore - a.relevanceScore);
      result.related = result.related.slice(0, 5);
    }

    return result;
  } catch (err) {
    console.warn("[Duplicates] Check failed:", err);
    return result;
  }
}

/**
 * Generate a unique citation key that doesn't conflict with existing ones
 */
export async function generateUniqueCitationKey(
  baseKey: string,
  apiUrl: string
): Promise<string> {
  try {
    const response = await fetch(`${apiUrl}/api/vault`);
    if (!response.ok) {
      return baseKey;
    }

    const data = await response.json();
    const objects: VaultObject[] = data.vault?.objects || [];

    const existingKeys = new Set(
      objects
        .filter((obj) => obj.frontmatter?.type === "bibtex_entry")
        .map((obj) => obj.frontmatter.citation_key || obj.id)
    );

    if (!existingKeys.has(baseKey)) {
      return baseKey;
    }

    // Add suffix to make unique
    let suffix = 2;
    while (existingKeys.has(`${baseKey}${String.fromCharCode(96 + suffix)}`)) {
      suffix++;
      if (suffix > 26) {
        // Fallback to numbers
        return `${baseKey}_${Date.now()}`;
      }
    }

    return `${baseKey}${String.fromCharCode(96 + suffix)}`;
  } catch {
    return baseKey;
  }
}
