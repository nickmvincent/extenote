/**
 * @extenote/refcheck
 *
 * Unified bibliographic metadata validation for Extenote.
 * Used by both CLI and browser extension.
 */

// =============================================================================
// Type Exports
// =============================================================================

export type {
  // Status types
  CheckStatus,
  ValidationStatus,
  MismatchSeverity,

  // Field comparison types
  FieldCheck,
  AuthorCheck,
  AuthorDetail,
  YearCheck,
  FieldChecks,

  // CheckLog types
  CheckLog,
  ExternalBibtex,
  RemoteValues,

  // Entry types
  EntryMetadata,
  VaultEntry,

  // Provider types
  PaperMetadata,
  LookupResult,
  Provider,

  // Check types
  CheckResult,
  CheckOptions,

  // Match types
  MatchType,
  MatchResult,
} from "./types.js";

// =============================================================================
// Normalization Utilities
// =============================================================================

export {
  normalizeString,
  normalizeStrict,
  normalizeDoi,
  extractDoi,
  extractArxivId,
  levenshteinDistance,
  jaccardSimilarity,
  parseAuthorName,
  normalizeUrl,
  parseYear,
} from "./normalize.js";

// =============================================================================
// Field Comparison
// =============================================================================

export {
  compareTitle,
  compareAuthors,
  compareYear,
  compareVenue,
  compareDoi,
  compareFields,
  determineStatus,
  authorsMatch,
  needsValidation,
  getValidationStatus,
  classifyMismatchSeverity,
} from "./compare.js";

// =============================================================================
// CheckLog Utilities
// =============================================================================

export {
  createCheckLog,
  createNotFoundLog,
  createErrorLog,
  isStale,
  getAge,
  needsRevalidation,
  getStatusBadge,
  formatCheckLog,
} from "./check-log.js";

// =============================================================================
// Providers
// =============================================================================

export {
  registerProvider,
  getProvider,
  getAvailableProviders,
  hasProvider,
  BaseProvider,
  AutoProvider,
  dblp,
  DblpProvider,
  semanticScholar,
  SemanticScholarProvider,
  openalex,
  OpenAlexProvider,
  crossref,
  CrossrefProvider,
} from "./providers/index.js";

// =============================================================================
// Matcher (for browser extension)
// =============================================================================

export {
  matchPageToVault,
  findRelatedEntries,
} from "./matcher.js";

// =============================================================================
// High-Level API
// =============================================================================

import type { EntryMetadata, CheckResult, CheckOptions, CheckLog } from "./types.js";
import { getProvider } from "./providers/index.js";
import { compareFields, determineStatus, classifyMismatchSeverity } from "./compare.js";
import { createCheckLog, createNotFoundLog, createErrorLog } from "./check-log.js";

/**
 * Check a single entry against a provider
 */
export async function checkEntry(
  entry: EntryMetadata,
  options: CheckOptions = {}
): Promise<CheckResult> {
  const providerName = options.provider || "auto";
  const provider = getProvider(providerName);

  if (!provider) {
    return {
      entry,
      checkLog: createErrorLog(providerName, `Provider not found: ${providerName}`),
      provider: providerName,
      updated: false,
    };
  }

  try {
    const result = await provider.lookup(entry);

    if (!result.found) {
      return {
        entry,
        checkLog: createNotFoundLog(result.provider),
        provider: result.provider,
        updated: false,
      };
    }

    const paper = result.paper!;
    const fields = compareFields(entry, paper);
    const status = determineStatus(fields);

    // Classify severity for mismatches
    const severity = status === "mismatch" ? classifyMismatchSeverity(fields) : undefined;

    const checkLog = createCheckLog({
      status,
      severity,
      provider: result.provider,
      paperId: paper.id,
      fields,
      remote: paper,
      bibtex: options.includeBibtex ? paper.bibtex : undefined,
    });

    return {
      entry,
      checkLog,
      provider: result.provider,
      updated: !options.dryRun,
    };
  } catch (err) {
    return {
      entry,
      checkLog: createErrorLog(providerName, err instanceof Error ? err.message : "Unknown error"),
      provider: providerName,
      updated: false,
    };
  }
}

/**
 * Check multiple entries with rate limiting
 */
export async function checkEntries(
  entries: EntryMetadata[],
  options: CheckOptions = {},
  onProgress?: (result: CheckResult, index: number, total: number) => void
): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const rateLimit = options.rateLimit ?? 100;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    // Check if we should skip this entry
    if (!options.force && entry.check_log) {
      results.push({
        entry,
        checkLog: { ...entry.check_log, status: "skipped" } as CheckLog,
        provider: entry.check_log.checked_with,
        updated: false,
      });
      continue;
    }

    const result = await checkEntry(entry, options);
    results.push(result);

    if (onProgress) {
      onProgress(result, i, entries.length);
    }

    // Rate limiting
    if (i < entries.length - 1 && rateLimit > 0) {
      await new Promise((resolve) => setTimeout(resolve, rateLimit));
    }
  }

  return results;
}
