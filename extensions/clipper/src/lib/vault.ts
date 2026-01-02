/**
 * Vault matching logic for validation workflow
 *
 * Uses @extenote/refcheck for unified validation logic.
 */

import type { CheckLog, ValidationStatus, VaultObject } from "./types";

// Import from refcheck
import {
  matchPageToVault as refcheckMatch,
  getStatusBadge,
  createCheckLog as refcheckCreateCheckLog,
  compareFields as refcheckCompareFields,
  jaccardSimilarity,
  normalizeDoi,
  type VaultEntry as RefcheckEntry,
  type MatchResult as RefcheckMatchResult,
  type CheckLog as RefcheckCheckLog,
} from "@extenote/refcheck";

// Re-export VaultEntry type for compatibility
export interface VaultEntry {
  id: string;
  relativePath: string;
  title: string;
  url?: string;
  doi?: string;
  arxivId?: string;
  checkLog?: CheckLog;
  frontmatter: Record<string, unknown>;
}

export interface MatchResult {
  entry: VaultEntry;
  matchType: "url" | "doi" | "arxiv" | "title";
  confidence: number;
}

/**
 * Convert vault object to refcheck entry format
 */
function toRefcheckEntry(obj: {
  id: string;
  relativePath: string;
  title: string;
  frontmatter: Record<string, unknown>;
}): RefcheckEntry {
  const fm = obj.frontmatter;
  return {
    id: obj.id,
    relativePath: obj.relativePath,
    title: obj.title,
    url: fm.url as string | undefined,
    doi: fm.doi as string | undefined,
    authors: fm.authors as string[] | undefined,
    year: fm.year as string | number | undefined,
    venue: fm.venue as string | undefined,
    frontmatter: fm,
  };
}

/**
 * Convert refcheck match result to extension format
 */
function toMatchResult(
  refcheckResult: RefcheckMatchResult,
  vaultObjects: Array<{
    id: string;
    relativePath: string;
    title: string;
    frontmatter: Record<string, unknown>;
  }>
): MatchResult {
  // Find original object
  const originalObj = vaultObjects.find(
    (obj) => obj.id === refcheckResult.entry.id
  );

  const fm = originalObj?.frontmatter || refcheckResult.entry.frontmatter;

  const entry: VaultEntry = {
    id: refcheckResult.entry.id,
    relativePath: refcheckResult.entry.relativePath,
    title: refcheckResult.entry.title,
    url: fm.url as string | undefined,
    doi: fm.doi as string | undefined,
    arxivId: fm.arxiv_id as string | undefined,
    checkLog: fm.check_log as CheckLog | undefined,
    frontmatter: fm,
  };

  return {
    entry,
    matchType: refcheckResult.matchType,
    confidence: refcheckResult.confidence,
  };
}

/**
 * Match a page URL/title to vault entries
 */
export function matchPageToVault(
  pageUrl: string,
  pageTitle: string,
  vaultObjects: Array<{
    id: string;
    relativePath: string;
    title: string;
    frontmatter: Record<string, unknown>;
  }>
): MatchResult | null {
  // Convert to refcheck format
  const refcheckEntries = vaultObjects.map(toRefcheckEntry);

  // Use refcheck matching
  const result = refcheckMatch(pageUrl, pageTitle, refcheckEntries);

  if (!result) return null;

  return toMatchResult(result, vaultObjects);
}

/**
 * Get validation status from a vault entry
 */
export function getValidationStatus(entry: VaultEntry): ValidationStatus {
  if (!entry.checkLog) {
    return "unchecked";
  }

  const badge = getStatusBadge(entry.checkLog as RefcheckCheckLog);
  return badge.status as ValidationStatus;
}

/**
 * Create a check_log entry for validation
 */
export function createCheckLog(
  status: CheckLog["status"],
  provider: string,
  fields?: Record<string, { match: boolean; vault?: unknown; api?: unknown }>
): CheckLog {
  // Use refcheck's createCheckLog
  const log = refcheckCreateCheckLog({
    status: status as "confirmed" | "mismatch" | "not_found" | "error",
    provider,
  });

  // Add fields in extension format
  if (fields) {
    return {
      ...log,
      fields,
    } as CheckLog;
  }

  return log as CheckLog;
}

/**
 * Compare vault entry fields with API result
 */
export function compareFields(
  vaultEntry: VaultEntry,
  apiResult: {
    title?: string;
    authors?: string[];
    year?: string;
    venue?: string;
    doi?: string;
  }
): {
  status: CheckLog["status"];
  fields: Record<string, { match: boolean; vault?: unknown; api?: unknown }>;
} {
  const fields: Record<string, { match: boolean; vault?: unknown; api?: unknown }> = {};
  let hasMismatch = false;

  // Compare title using refcheck's jaccardSimilarity
  if (apiResult.title) {
    const vaultTitle = vaultEntry.title || (vaultEntry.frontmatter.title as string);
    const match = jaccardSimilarity(vaultTitle || "", apiResult.title) > 0.9;
    fields.title = { match, vault: vaultTitle, api: apiResult.title };
    if (!match) hasMismatch = true;
  }

  // Compare authors
  if (apiResult.authors) {
    const vaultAuthors = (vaultEntry.frontmatter.authors as string[]) || [];
    const apiAuthorsNorm = apiResult.authors.map((a) => a.toLowerCase());
    const vaultAuthorsNorm = vaultAuthors.map((a) => a.toLowerCase());
    const match = apiAuthorsNorm.length === vaultAuthorsNorm.length &&
      apiAuthorsNorm.every((a, i) => a === vaultAuthorsNorm[i]);
    fields.authors = { match, vault: vaultAuthors, api: apiResult.authors };
    if (!match) hasMismatch = true;
  }

  // Compare year
  if (apiResult.year) {
    const vaultYear = String(vaultEntry.frontmatter.year || "");
    const match = vaultYear === apiResult.year;
    fields.year = { match, vault: vaultYear, api: apiResult.year };
    if (!match) hasMismatch = true;
  }

  // Compare venue using refcheck's jaccardSimilarity
  if (apiResult.venue) {
    const vaultVenue = (vaultEntry.frontmatter.venue as string) || "";
    const match = jaccardSimilarity(vaultVenue, apiResult.venue) > 0.8;
    fields.venue = { match, vault: vaultVenue, api: apiResult.venue };
    if (!match) hasMismatch = true;
  }

  // Compare DOI using refcheck's normalizeDoi
  if (apiResult.doi) {
    const vaultDoi = normalizeDoi(vaultEntry.doi || "");
    const apiDoi = normalizeDoi(apiResult.doi);
    const match = vaultDoi === apiDoi;
    fields.doi = { match, vault: vaultEntry.doi, api: apiResult.doi };
    if (!match) hasMismatch = true;
  }

  return {
    status: hasMismatch ? "mismatch" : "confirmed",
    fields,
  };
}
