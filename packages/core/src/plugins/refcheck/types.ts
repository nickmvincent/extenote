import type { VaultObject } from "../../types.js";

// ─── Check Status ─────────────────────────────────────────────────────────────

export type CheckStatus =
  | "confirmed" // All checked fields match
  | "mismatch" // Some fields don't match
  | "not_found" // Paper not found in provider
  | "error" // API or processing error
  | "skipped"; // Skipped (already checked, not applicable, etc.)

export type MismatchSeverity = "minor" | "major";

// ─── Field Check Result ───────────────────────────────────────────────────────

export interface FieldCheck {
  field: string;
  local: string | undefined;
  remote: string | undefined;
  match: boolean;
  /** Character difference (Levenshtein distance) for string fields */
  charDiff?: number;
  /** Year difference for year field */
  yearDiff?: number;
  /** Author count comparison */
  authorCountMatch?: boolean;
  /** Per-author match details */
  authorDetails?: Array<{
    index: number;
    firstMatch: boolean;
    lastMatch: boolean;
    localName: string;
    remoteName: string;
  }>;
}

// ─── Single Object Check Result ───────────────────────────────────────────────

export interface CheckResult {
  objectId: string;
  filePath: string;
  title: string;
  status: CheckStatus;
  /** Severity when status is mismatch */
  mismatchSeverity?: MismatchSeverity;
  provider: string;
  checkedAt: string;
  /** External paper ID from the provider */
  paperId?: string;
  /** Field-by-field comparison results */
  fieldChecks: FieldCheck[];
  /** Human-readable message (summary or error) */
  message?: string;
}

// ─── Check Report (batch results) ─────────────────────────────────────────────

export interface CheckReport {
  provider: string;
  checkedAt: string;
  total: number;
  confirmed: number;
  mismatches: number;
  /** Minor mismatches (likely false positives) */
  mismatchesMinor: number;
  /** Major mismatches (need human review) */
  mismatchesMajor: number;
  notFound: number;
  errors: number;
  skipped: number;
  results: CheckResult[];
}

// ─── Frontmatter Check Log ────────────────────────────────────────────────────

export interface FieldReport {
  local: string | null;
  remote: string | null;
  match: boolean;
  edit_distance?: number;
}

export interface AuthorReport {
  index: number;
  local: string;
  remote: string;
  first_match: boolean;
  last_match: boolean;
}

export interface CheckLog {
  checked_at: string;
  checked_with: string;
  status: CheckStatus;
  mismatch_severity?: MismatchSeverity;
  paper_id?: string;
  /** Field-by-field comparison with edit distances */
  fields?: {
    title?: FieldReport;
    year?: FieldReport & { year_diff?: number };
    venue?: FieldReport;
    doi?: FieldReport;
    authors?: {
      local_count: number;
      remote_count: number;
      count_match: boolean;
      details?: AuthorReport[];
    };
  };
  /** Remote values from API (for easy copy if adopting) */
  remote?: {
    title?: string;
    authors?: string[];
    year?: number;
    venue?: string;
    doi?: string;
  };
  /** Raw BibTeX from external provider */
  external_bibtex?: {
    source: string;
    bibtex: string;
    fetched_at: string;
  };
}

// ─── Provider Lookup Result ───────────────────────────────────────────────────

export interface ProviderLookupResult {
  found: boolean;
  paperId?: string;
  title?: string;
  authors?: string[];
  year?: number;
  venue?: string;
  doi?: string;
  url?: string;
  error?: string;
  /** Raw BibTeX string from provider (if available) */
  bibtex?: string;
  /** Actual provider that returned this result (for auto/combined providers) */
  actualProvider?: string;
}

// ─── Provider Interface ───────────────────────────────────────────────────────

export interface CheckProvider {
  name: string;
  lookup(object: VaultObject): Promise<ProviderLookupResult>;
}

// ─── Check Options ────────────────────────────────────────────────────────────

export interface CheckOptions {
  /** Provider to use (default: openalex) */
  provider?: string;
  /** Show what would be checked without updating frontmatter */
  dryRun?: boolean;
  /** Re-check entries that already have check_log */
  force?: boolean;
  /** Progress callback */
  onProgress?: (message: string) => void;
  /** Delay between API calls in ms (default: 100) */
  rateLimitDelay?: number;
}
