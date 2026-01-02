/**
 * Refcheck Type Definitions
 *
 * Unified types for bibliographic metadata validation across CLI and browser extension.
 */

// =============================================================================
// Check Status
// =============================================================================

/**
 * Overall validation status for an entry
 */
export type CheckStatus =
  | "confirmed"   // All checked fields match the provider
  | "mismatch"    // One or more fields differ from provider
  | "not_found"   // Entry not found in provider database
  | "error"       // API or processing error occurred
  | "skipped";    // Entry was skipped (already checked, unless --force)

/**
 * Severity of a mismatch - helps prioritize review
 */
export type MismatchSeverity =
  | "minor"   // Likely a false positive (venue abbreviation, author initials, year ±1)
  | "major";  // Needs human review (wrong authors, book review matched, etc.)

/**
 * Validation status including staleness
 */
export type ValidationStatus = CheckStatus | "stale" | "unchecked";

// =============================================================================
// Field Comparison
// =============================================================================

/**
 * Comparison result for a single text field
 */
export interface FieldCheck {
  /** Value from the local vault entry */
  local: string | null;
  /** Value from the remote API */
  remote: string | null;
  /** Whether the values match */
  match: boolean;
  /** Levenshtein edit distance for mismatches */
  edit_distance?: number;
}

/**
 * Individual author comparison details
 */
export interface AuthorDetail {
  /** Position in author list (0-indexed) */
  index: number;
  /** Local author name */
  local: string;
  /** Remote author name */
  remote: string;
  /** Whether first names match */
  first_match: boolean;
  /** Whether last names match */
  last_match: boolean;
}

/**
 * Comparison result for author lists
 */
export interface AuthorCheck {
  /** Number of authors in local entry */
  local_count: number;
  /** Number of authors from remote API */
  remote_count: number;
  /** Whether counts match */
  count_match: boolean;
  /** Per-author comparison details (if counts match) */
  details?: AuthorDetail[];
}

/**
 * Year comparison with difference tracking
 */
export interface YearCheck extends FieldCheck {
  /** Signed difference: remote - local (positive = remote is later) */
  year_diff?: number;
}

/**
 * Complete field comparison results
 */
export interface FieldChecks {
  title: FieldCheck;
  authors: AuthorCheck;
  year: YearCheck;
  venue?: FieldCheck;
  doi?: FieldCheck;
}

// =============================================================================
// CheckLog (Stored in Frontmatter)
// =============================================================================

/**
 * External BibTeX captured from provider
 */
export interface ExternalBibtex {
  /** Provider name (e.g., "dblp") */
  source: string;
  /** Raw BibTeX string */
  bibtex: string;
  /** When the BibTeX was fetched */
  fetched_at: string;
}

/**
 * Remote metadata values for easy adoption
 */
export interface RemoteValues {
  title?: string;
  authors?: string[];
  year?: number;
  venue?: string;
  doi?: string;
}

/**
 * Manual verification record - human sign-off on reference accuracy
 */
export interface ManualVerification {
  /** ISO 8601 timestamp of verification */
  verified_at: string;
  /** Who verified: "agent" or "human:username" */
  verified_by: string;
  /** Optional notes about the verification */
  notes?: string;
}

/**
 * Canonical external source - authoritative link for 100% match verification
 */
export interface CanonicalSource {
  /** URL to the authoritative source */
  url: string;
  /** Page title as displayed at the source */
  title?: string;
  /** When the source was accessed */
  accessed_at?: string;
  /** Match confidence 0-1 (1.0 = exact match confirmed) */
  match_confidence?: number;
}

/**
 * CheckLog structure stored in YAML frontmatter
 *
 * This is the canonical format used by both CLI and browser extension.
 */
export interface CheckLog {
  /** ISO 8601 timestamp of when check was performed */
  checked_at: string;

  /** Provider used: "dblp", "s2", "openalex", "crossref", or "auto" */
  checked_with: string;

  /** Overall validation status */
  status: CheckStatus;

  /** Severity of mismatch - only present when status is "mismatch" */
  mismatch_severity?: MismatchSeverity;

  /** External identifier from provider (e.g., DBLP key, S2 paper ID) */
  paper_id?: string;

  /** Field-by-field comparison details */
  fields?: FieldChecks;

  /** Remote values for easy adoption if mismatched */
  remote?: RemoteValues;

  /** Raw BibTeX from provider (optional) */
  external_bibtex?: ExternalBibtex;

  /** Manual verification by human - sign-off that reference is correct */
  manually_verified?: ManualVerification;

  /** Canonical external source - authoritative URL for this reference */
  canonical_source?: CanonicalSource;
}

// =============================================================================
// Entry Types
// =============================================================================

/**
 * Minimal entry interface for validation
 */
export interface EntryMetadata {
  /** Unique identifier (usually citation_key) */
  id: string;
  /** Entry title */
  title: string;
  /** Author names */
  authors?: string[];
  /** Publication year */
  year?: string | number;
  /** Venue (journal, conference, etc.) */
  venue?: string;
  /** DOI (without URL prefix) */
  doi?: string;
  /** URL of the entry */
  url?: string;
  /** Existing check_log if any */
  check_log?: CheckLog;
}

/**
 * Full vault object with file metadata
 */
export interface VaultEntry extends EntryMetadata {
  /** Relative path to file */
  relativePath: string;
  /** Full frontmatter */
  frontmatter: Record<string, unknown>;
}

// =============================================================================
// Provider Types
// =============================================================================

/**
 * Paper metadata returned by providers
 */
export interface PaperMetadata {
  /** Provider-specific paper ID */
  id?: string;
  /** Paper title */
  title: string;
  /** Author names */
  authors?: string[];
  /** Publication year */
  year?: number;
  /** Venue name */
  venue?: string;
  /** DOI (without URL prefix) */
  doi?: string;
  /** Abstract text */
  abstract?: string;
  /** URL to paper */
  url?: string;
  /** Raw BibTeX if available */
  bibtex?: string;
}

/**
 * Result from a provider lookup
 */
export interface LookupResult {
  /** Whether the lookup was successful */
  found: boolean;
  /** Paper metadata if found */
  paper?: PaperMetadata;
  /** Error message if lookup failed */
  error?: string;
  /** Provider that was used */
  provider: string;
}

/**
 * Provider interface
 */
export interface Provider {
  /** Provider name */
  name: string;
  /** Look up a paper by entry metadata */
  lookup(entry: EntryMetadata): Promise<LookupResult>;
}

// =============================================================================
// Check Result
// =============================================================================

/**
 * Complete check result for an entry
 */
export interface CheckResult {
  /** Entry that was checked */
  entry: EntryMetadata;
  /** Resulting check_log */
  checkLog: CheckLog;
  /** Provider that was used */
  provider: string;
  /** Whether frontmatter was updated */
  updated: boolean;
}

/**
 * Options for checking entries
 */
export interface CheckOptions {
  /** Provider to use: "dblp", "s2", "openalex", "crossref", or "auto" */
  provider?: string;
  /** If true, don't update frontmatter */
  dryRun?: boolean;
  /** If true, re-check even if check_log exists */
  force?: boolean;
  /** Include external BibTeX in check_log */
  includeBibtex?: boolean;
  /** Rate limit delay in ms between API calls */
  rateLimit?: number;
}

// =============================================================================
// Match Types (for browser extension)
// =============================================================================

/**
 * Match type when identifying vault entries
 */
export type MatchType = "url" | "doi" | "arxiv" | "title";

/**
 * Result of matching a page to vault entries
 */
export interface MatchResult {
  /** The matched entry */
  entry: VaultEntry;
  /** How the match was made */
  matchType: MatchType;
  /** Match confidence (0-1) */
  confidence: number;
}
