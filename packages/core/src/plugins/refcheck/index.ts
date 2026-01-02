/**
 * Check Plugin
 *
 * Re-exports check functionality, using @extenote/refcheck for providers.
 */

// Types (keep core types for backwards compatibility)
export type {
  CheckStatus,
  FieldCheck,
  CheckResult,
  CheckReport,
  CheckLog,
  ProviderLookupResult,
  CheckProvider,
  CheckOptions,
} from "./types.js";

// Re-export from refcheck
export {
  getAvailableProviders,
  // Normalization utilities
  normalizeString,
  normalizeStrict,
  levenshteinDistance,
  parseAuthorName,
  // Comparison utilities
  compareTitle,
  compareAuthors,
  compareYear,
  compareVenue,
  compareDoi,
} from "@extenote/refcheck";

// Main check function
export { checkBibtexEntries } from "./bibtex.js";
