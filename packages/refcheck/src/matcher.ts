/**
 * Entry Matcher
 *
 * Matches pages/URLs to vault entries for validation.
 * Used primarily by the browser extension.
 */

import type { VaultEntry, MatchResult } from "./types.js";
import {
  normalizeUrl,
  extractDoi,
  extractArxivId,
  jaccardSimilarity,
  normalizeDoi,
} from "./normalize.js";

/** Default minimum title similarity for a match */
export const DEFAULT_MATCHER_TITLE_THRESHOLD = 0.85;

/** Matcher options */
export interface MatcherOptions {
  titleThreshold?: number;
}

/**
 * Match a page to vault entries
 */
export function matchPageToVault(
  url: string,
  pageTitle: string,
  entries: VaultEntry[],
  options: MatcherOptions = {}
): MatchResult | null {
  const { titleThreshold = DEFAULT_MATCHER_TITLE_THRESHOLD } = options;

  // Try URL match first (highest confidence)
  const urlMatch = matchByUrl(url, entries);
  if (urlMatch) return urlMatch;

  // Try DOI match
  const doiMatch = matchByDoi(url, entries);
  if (doiMatch) return doiMatch;

  // Try arXiv match
  const arxivMatch = matchByArxiv(url, entries);
  if (arxivMatch) return arxivMatch;

  // Fall back to title match
  const titleMatch = matchByTitle(pageTitle, entries, titleThreshold);
  if (titleMatch) return titleMatch;

  return null;
}

/**
 * Match by exact URL
 */
function matchByUrl(url: string, entries: VaultEntry[]): MatchResult | null {
  const normalizedUrl = normalizeUrl(url);

  for (const entry of entries) {
    const entryUrl = entry.url || (entry.frontmatter.url as string);
    if (!entryUrl) continue;

    if (normalizeUrl(entryUrl) === normalizedUrl) {
      return {
        entry,
        matchType: "url",
        confidence: 1.0,
      };
    }
  }

  return null;
}

/**
 * Match by DOI
 */
function matchByDoi(url: string, entries: VaultEntry[]): MatchResult | null {
  const pageDoi = extractDoi(url);
  if (!pageDoi) return null;

  for (const entry of entries) {
    const entryDoi = entry.doi || (entry.frontmatter.doi as string);
    if (!entryDoi) continue;

    if (normalizeDoi(entryDoi) === pageDoi) {
      return {
        entry,
        matchType: "doi",
        confidence: 0.95,
      };
    }
  }

  return null;
}

/**
 * Match by arXiv ID
 */
function matchByArxiv(url: string, entries: VaultEntry[]): MatchResult | null {
  const pageArxiv = extractArxivId(url);
  if (!pageArxiv) return null;

  for (const entry of entries) {
    // Check entry URL for arXiv ID
    const entryUrl = entry.url || (entry.frontmatter.url as string);
    if (!entryUrl) continue;

    const entryArxiv = extractArxivId(entryUrl);
    if (entryArxiv && entryArxiv === pageArxiv) {
      return {
        entry,
        matchType: "arxiv",
        confidence: 0.95,
      };
    }
  }

  return null;
}

/**
 * Match by title similarity
 */
function matchByTitle(
  pageTitle: string,
  entries: VaultEntry[],
  threshold: number = DEFAULT_MATCHER_TITLE_THRESHOLD
): MatchResult | null {
  if (!pageTitle) return null;

  let bestMatch: VaultEntry | null = null;
  let bestScore = 0;

  for (const entry of entries) {
    const entryTitle = entry.title;
    if (!entryTitle) continue;

    const similarity = jaccardSimilarity(pageTitle, entryTitle);

    if (similarity > bestScore && similarity >= threshold) {
      bestScore = similarity;
      bestMatch = entry;
    }
  }

  if (bestMatch) {
    return {
      entry: bestMatch,
      matchType: "title",
      confidence: bestScore,
    };
  }

  return null;
}

/**
 * Find entries that might be related to a given entry
 * (by shared authors, similar titles, same venue/year)
 */
export function findRelatedEntries(
  entry: VaultEntry,
  allEntries: VaultEntry[],
  limit: number = 5
): VaultEntry[] {
  const related: Array<{ entry: VaultEntry; score: number }> = [];

  for (const candidate of allEntries) {
    // Skip same entry
    if (candidate.id === entry.id) continue;

    let score = 0;

    // Check for shared authors
    if (entry.authors && candidate.authors) {
      const sharedAuthors = entry.authors.filter((a) =>
        candidate.authors?.some(
          (b) => a.toLowerCase().includes(b.toLowerCase().split(" ").pop() || "")
        )
      );
      score += sharedAuthors.length * 2;
    }

    // Check same venue
    if (entry.venue && candidate.venue) {
      if (jaccardSimilarity(entry.venue, candidate.venue) > 0.8) {
        score += 1;
      }
    }

    // Check same year
    if (entry.year && candidate.year && entry.year === candidate.year) {
      score += 0.5;
    }

    // Check title similarity (but not too similar)
    const titleSim = jaccardSimilarity(entry.title, candidate.title);
    if (titleSim > 0.3 && titleSim < 0.85) {
      score += titleSim;
    }

    if (score > 0) {
      related.push({ entry: candidate, score });
    }
  }

  // Sort by score and return top matches
  related.sort((a, b) => b.score - a.score);
  return related.slice(0, limit).map((r) => r.entry);
}
