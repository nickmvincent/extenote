/**
 * Field Comparison Logic
 *
 * Algorithms for comparing bibliographic fields between local and remote sources.
 */

import type {
  EntryMetadata,
  PaperMetadata,
  FieldCheck,
  AuthorCheck,
  AuthorDetail,
  YearCheck,
  FieldChecks,
  CheckStatus,
  MismatchSeverity,
} from "./types.js";

import {
  normalizeStrict,
  normalizeDoi,
  levenshteinDistance,
  jaccardSimilarity,
  parseAuthorName,
  parseYear,
} from "./normalize.js";

// =============================================================================
// Threshold Constants (defaults, can be overridden via options)
// =============================================================================

/** Default Jaccard similarity threshold for title matching */
export const DEFAULT_TITLE_MATCH_THRESHOLD = 0.9;

/** Default Jaccard similarity threshold for venue matching */
export const DEFAULT_VENUE_MATCH_THRESHOLD = 0.8;

/** Comparison thresholds that can be passed to functions */
export interface CompareThresholds {
  titleMatchThreshold?: number;
  venueMatchThreshold?: number;
}

// =============================================================================
// Field Comparison Functions
// =============================================================================

/**
 * Compare title fields
 */
export function compareTitle(
  local: string | undefined,
  remote: string | undefined,
  threshold: number = DEFAULT_TITLE_MATCH_THRESHOLD
): FieldCheck {
  const localValue = local?.trim() || null;
  const remoteValue = remote?.trim() || null;

  if (!localValue && !remoteValue) {
    return { local: null, remote: null, match: true };
  }

  if (!localValue || !remoteValue) {
    return { local: localValue, remote: remoteValue, match: false };
  }

  const similarity = jaccardSimilarity(localValue, remoteValue);
  const match = similarity >= threshold;

  const result: FieldCheck = {
    local: localValue,
    remote: remoteValue,
    match,
  };

  if (!match) {
    result.edit_distance = levenshteinDistance(
      normalizeStrict(localValue),
      normalizeStrict(remoteValue)
    );
  }

  return result;
}

/**
 * Compare author lists
 */
export function compareAuthors(
  local: string[] | undefined,
  remote: string[] | undefined
): AuthorCheck {
  const localAuthors = local || [];
  const remoteAuthors = remote || [];

  const result: AuthorCheck = {
    local_count: localAuthors.length,
    remote_count: remoteAuthors.length,
    count_match: localAuthors.length === remoteAuthors.length,
  };

  // If counts don't match, we can still compare what we have
  if (localAuthors.length > 0 && remoteAuthors.length > 0) {
    const minLength = Math.min(localAuthors.length, remoteAuthors.length);
    const details: AuthorDetail[] = [];

    for (let i = 0; i < minLength; i++) {
      const localParsed = parseAuthorName(localAuthors[i]);
      const remoteParsed = parseAuthorName(remoteAuthors[i]);

      details.push({
        index: i,
        local: localAuthors[i],
        remote: remoteAuthors[i],
        first_match:
          normalizeStrict(localParsed.first) ===
          normalizeStrict(remoteParsed.first),
        last_match:
          normalizeStrict(localParsed.last) ===
          normalizeStrict(remoteParsed.last),
      });
    }

    result.details = details;
  }

  return result;
}

/**
 * Check if author comparison is a match
 */
export function authorsMatch(check: AuthorCheck): boolean {
  // Counts must match
  if (!check.count_match) return false;

  // If both are empty, it's a match
  if (check.local_count === 0 && check.remote_count === 0) return true;

  // All authors must have matching last names
  if (!check.details) return false;

  return check.details.every((d) => d.last_match);
}

/**
 * Compare year fields
 */
export function compareYear(
  local: string | number | undefined,
  remote: string | number | undefined
): YearCheck {
  const localYear = parseYear(local);
  const remoteYear = parseYear(remote);

  const result: YearCheck = {
    local: localYear?.toString() || null,
    remote: remoteYear?.toString() || null,
    match: localYear === remoteYear,
  };

  if (!result.match && localYear !== null && remoteYear !== null) {
    result.year_diff = remoteYear - localYear;
  }

  return result;
}

/**
 * Compare venue fields
 */
export function compareVenue(
  local: string | undefined,
  remote: string | undefined,
  threshold: number = DEFAULT_VENUE_MATCH_THRESHOLD
): FieldCheck {
  const localValue = local?.trim() || null;
  const remoteValue = remote?.trim() || null;

  if (!localValue && !remoteValue) {
    return { local: null, remote: null, match: true };
  }

  if (!localValue || !remoteValue) {
    // Missing venue is not a mismatch if we have a value in one place
    return { local: localValue, remote: remoteValue, match: true };
  }

  const similarity = jaccardSimilarity(localValue, remoteValue);
  const match = similarity >= threshold;

  const result: FieldCheck = {
    local: localValue,
    remote: remoteValue,
    match,
  };

  if (!match) {
    result.edit_distance = levenshteinDistance(
      normalizeStrict(localValue),
      normalizeStrict(remoteValue)
    );
  }

  return result;
}

/**
 * Compare DOI fields
 */
export function compareDoi(
  local: string | undefined,
  remote: string | undefined
): FieldCheck {
  const localDoi = local ? normalizeDoi(local) : null;
  const remoteDoi = remote ? normalizeDoi(remote) : null;

  if (!localDoi && !remoteDoi) {
    return { local: null, remote: null, match: true };
  }

  if (!localDoi || !remoteDoi) {
    // Missing DOI is not necessarily a mismatch
    return { local: localDoi, remote: remoteDoi, match: true };
  }

  return {
    local: localDoi,
    remote: remoteDoi,
    match: localDoi === remoteDoi,
  };
}

// =============================================================================
// Full Entry Comparison
// =============================================================================

/**
 * Compare all fields between local entry and remote paper metadata
 */
export function compareFields(
  local: EntryMetadata,
  remote: PaperMetadata
): FieldChecks {
  return {
    title: compareTitle(local.title, remote.title),
    authors: compareAuthors(local.authors, remote.authors),
    year: compareYear(local.year, remote.year),
    venue: compareVenue(local.venue, remote.venue),
    doi: compareDoi(local.doi, remote.doi),
  };
}

/**
 * Determine overall check status from field comparisons
 */
export function determineStatus(fields: FieldChecks): CheckStatus {
  // Check critical fields: title and authors
  if (!fields.title.match) return "mismatch";
  if (!authorsMatch(fields.authors)) return "mismatch";

  // Check year
  if (!fields.year.match) return "mismatch";

  // Venue and DOI mismatches are also reported
  if (fields.venue && !fields.venue.match) return "mismatch";
  if (fields.doi && !fields.doi.match) return "mismatch";

  return "confirmed";
}

/**
 * Check if an entry needs validation
 */
export function needsValidation(
  entry: EntryMetadata,
  force: boolean = false,
  staleDays: number = 30
): boolean {
  // No check_log = needs validation
  if (!entry.check_log) return true;

  // Force flag overrides existing check
  if (force) return true;

  // Check if stale
  const checkedAt = new Date(entry.check_log.checked_at);
  const now = new Date();
  const daysSince = (now.getTime() - checkedAt.getTime()) / (1000 * 60 * 60 * 24);

  if (daysSince > staleDays) return true;

  // Check status
  if (entry.check_log.status === "error") return true;

  return false;
}

/**
 * Get human-readable validation status from check_log
 */
export function getValidationStatus(
  checkLog: EntryMetadata["check_log"],
  staleDays: number = 30
): string {
  if (!checkLog) return "unchecked";

  const checkedAt = new Date(checkLog.checked_at);
  const now = new Date();
  const daysSince = (now.getTime() - checkedAt.getTime()) / (1000 * 60 * 60 * 24);

  if (daysSince > staleDays) return "stale";

  return checkLog.status;
}

// =============================================================================
// Mismatch Severity Classification
// =============================================================================

/** Patterns that indicate arXiv/preprint venue */
const ARXIV_PATTERNS = [
  /arxiv/i,
  /preprint/i,
  /cornell\s*university/i,
  /biorxiv/i,
  /medrxiv/i,
];

/** Patterns that indicate a book review (not the actual book) */
const BOOK_REVIEW_VENUE_PATTERNS = [
  /journal/i,
  /review\s+of/i,
  /technology\s+and\s+culture/i,
  /international\s+studies/i,
  /cyber\s+policy/i,
];

/**
 * Check if a venue looks like arXiv/preprint
 */
function isArxivVenue(venue: string | null): boolean {
  if (!venue) return false;
  return ARXIV_PATTERNS.some((pattern) => pattern.test(venue));
}

/**
 * Check if a venue looks like a journal that might publish book reviews
 */
function isBookReviewVenue(venue: string | null): boolean {
  if (!venue) return false;
  return BOOK_REVIEW_VENUE_PATTERNS.some((pattern) => pattern.test(venue));
}

/**
 * Check if local venue looks like a book publisher
 */
function isBookPublisher(venue: string | null): boolean {
  if (!venue) return false;
  const publisherPatterns = [
    /press$/i,
    /publishing/i,
    /books?$/i,
    /\bpublicaffairs\b/i,
    /\bbloomsbury\b/i,
    /\bpenguin\b/i,
    /\brandom\s*house\b/i,
    /\bwiley\b/i,
    /\bspringer\b/i,
    /\belsevier\b/i,
    /\bO'Reilly\b/i,
  ];
  return publisherPatterns.some((pattern) => pattern.test(venue));
}

/**
 * Classify mismatch severity based on field comparison results
 *
 * Minor mismatches (likely false positives):
 * - Venue: local conference vs remote arXiv (very common)
 * - Authors: only first name/initial differences, all last names match
 * - Year: off by ±1 (preprint vs publication timing)
 * - Venue: minor text differences (abbreviation vs full name)
 *
 * Major mismatches (need human review):
 * - Authors: last names don't match (suggests wrong paper matched)
 * - Title mismatch (likely entirely wrong paper)
 * - Book publisher vs journal venue (book review problem)
 */
export function classifyMismatchSeverity(fields: FieldChecks): MismatchSeverity {
  // Title mismatch is always major - likely wrong paper
  if (!fields.title.match) {
    return "major";
  }

  // Check author mismatches
  if (!authorsMatch(fields.authors)) {
    const authors = fields.authors;

    // If any last names don't match, it's major (wrong paper)
    if (authors.details?.some((d) => !d.last_match)) {
      return "major";
    }

    // If count mismatch is large (>50% difference) and no details, it's major
    if (!authors.count_match) {
      const countRatio = Math.min(authors.local_count, authors.remote_count) /
                         Math.max(authors.local_count, authors.remote_count);
      // If counts differ by more than 50% and we have few authors, suspicious
      if (countRatio < 0.5 && authors.local_count < 10) {
        return "major";
      }
    }

    // Otherwise, author mismatch is likely just initials/formatting - minor
  }

  // Check venue mismatch patterns
  if (fields.venue && !fields.venue.match) {
    const localVenue = fields.venue.local;
    const remoteVenue = fields.venue.remote;

    // Book publisher matched to journal = book review problem = major
    if (isBookPublisher(localVenue) && isBookReviewVenue(remoteVenue)) {
      return "major";
    }

    // Conference vs arXiv is very common and minor
    if (!isArxivVenue(localVenue) && isArxivVenue(remoteVenue)) {
      // Local is conference, remote is arXiv - this is minor
      return "minor";
    }
  }

  // Year off by 1 is minor (preprint timing)
  if (!fields.year.match && fields.year.year_diff !== undefined) {
    if (Math.abs(fields.year.year_diff) > 1) {
      return "major"; // More than 1 year off is suspicious
    }
  }

  // DOI mismatch alone is major (different papers have different DOIs)
  if (fields.doi && !fields.doi.match && fields.doi.local && fields.doi.remote) {
    return "major";
  }

  // Default to minor for remaining cases (likely formatting differences)
  return "minor";
}
