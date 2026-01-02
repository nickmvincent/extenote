/**
 * CheckLog Creation and Utilities
 *
 * Functions for creating and working with check_log entries.
 */

import type {
  CheckLog,
  CheckStatus,
  MismatchSeverity,
  FieldChecks,
  PaperMetadata,
  RemoteValues,
} from "./types.js";

/**
 * Create a new check_log entry
 */
export function createCheckLog(options: {
  status: CheckStatus;
  severity?: MismatchSeverity;
  provider: string;
  paperId?: string;
  fields?: FieldChecks;
  remote?: PaperMetadata;
  bibtex?: string;
}): CheckLog {
  const checkLog: CheckLog = {
    checked_at: new Date().toISOString(),
    checked_with: options.provider,
    status: options.status,
  };

  // Add severity for mismatches
  if (options.severity && options.status === "mismatch") {
    checkLog.mismatch_severity = options.severity;
  }

  if (options.paperId) {
    checkLog.paper_id = options.paperId;
  }

  if (options.fields) {
    checkLog.fields = options.fields;
  }

  if (options.remote) {
    checkLog.remote = extractRemoteValues(options.remote);
  }

  if (options.bibtex) {
    checkLog.external_bibtex = {
      source: options.provider,
      bibtex: options.bibtex,
      fetched_at: new Date().toISOString(),
    };
  }

  return checkLog;
}

/**
 * Extract remote values from paper metadata
 */
function extractRemoteValues(paper: PaperMetadata): RemoteValues {
  const remote: RemoteValues = {};

  if (paper.title) remote.title = paper.title;
  if (paper.authors?.length) remote.authors = paper.authors;
  if (paper.year) remote.year = paper.year;
  if (paper.venue) remote.venue = paper.venue;
  if (paper.doi) remote.doi = paper.doi;

  return remote;
}

/**
 * Create a check_log for a "not found" result
 */
export function createNotFoundLog(provider: string): CheckLog {
  return {
    checked_at: new Date().toISOString(),
    checked_with: provider,
    status: "not_found",
  };
}

/**
 * Create a check_log for an error result
 */
export function createErrorLog(provider: string, _error?: string): CheckLog {
  // Note: _error parameter reserved for future use (e.g., adding error message field)
  return {
    checked_at: new Date().toISOString(),
    checked_with: provider,
    status: "error",
  };
}

/**
 * Check if a check_log is stale (older than specified days)
 */
export function isStale(checkLog: CheckLog, days: number = 30): boolean {
  const checkedAt = new Date(checkLog.checked_at);
  const now = new Date();
  const daysSince = (now.getTime() - checkedAt.getTime()) / (1000 * 60 * 60 * 24);
  return daysSince > days;
}

/**
 * Get the age of a check_log in days
 */
export function getAge(checkLog: CheckLog): number {
  const checkedAt = new Date(checkLog.checked_at);
  const now = new Date();
  return (now.getTime() - checkedAt.getTime()) / (1000 * 60 * 60 * 24);
}

/**
 * Check if check_log indicates validation is needed
 */
export function needsRevalidation(
  checkLog: CheckLog | undefined,
  force: boolean = false,
  staleDays: number = 30
): boolean {
  if (!checkLog) return true;
  if (force) return true;
  if (checkLog.status === "error") return true;
  if (isStale(checkLog, staleDays)) return true;
  return false;
}

/**
 * Get status badge info for UI display
 */
export function getStatusBadge(checkLog: CheckLog | undefined, staleDays: number = 30): {
  text: string;
  color: string;
  status: string;
} {
  if (!checkLog) {
    return { text: "?", color: "#888888", status: "unchecked" };
  }

  if (isStale(checkLog, staleDays)) {
    return { text: "?", color: "#888888", status: "stale" };
  }

  switch (checkLog.status) {
    case "confirmed":
      return { text: "✓", color: "#28a745", status: "confirmed" };
    case "mismatch":
      return { text: "!", color: "#ffc107", status: "mismatch" };
    case "not_found":
      return { text: "✗", color: "#dc3545", status: "not_found" };
    case "error":
      return { text: "✗", color: "#dc3545", status: "error" };
    case "skipped":
      return { text: "-", color: "#888888", status: "skipped" };
    default:
      return { text: "?", color: "#888888", status: "unknown" };
  }
}

/**
 * Format check_log for display
 */
export function formatCheckLog(checkLog: CheckLog): string {
  const lines: string[] = [];

  lines.push(`Status: ${checkLog.status}`);
  lines.push(`Checked: ${new Date(checkLog.checked_at).toLocaleDateString()}`);
  lines.push(`Provider: ${checkLog.checked_with}`);

  if (checkLog.paper_id) {
    lines.push(`Paper ID: ${checkLog.paper_id}`);
  }

  if (checkLog.fields) {
    lines.push("");
    lines.push("Fields:");

    if (checkLog.fields.title) {
      const icon = checkLog.fields.title.match ? "✓" : "✗";
      lines.push(`  ${icon} title`);
    }

    if (checkLog.fields.authors) {
      const match =
        checkLog.fields.authors.count_match &&
        checkLog.fields.authors.details?.every((d) => d.last_match);
      const icon = match ? "✓" : "✗";
      lines.push(
        `  ${icon} authors (${checkLog.fields.authors.local_count}/${checkLog.fields.authors.remote_count})`
      );
    }

    if (checkLog.fields.year) {
      const icon = checkLog.fields.year.match ? "✓" : "✗";
      lines.push(`  ${icon} year`);
      if (checkLog.fields.year.year_diff) {
        lines.push(`      diff: ${checkLog.fields.year.year_diff} years`);
      }
    }

    if (checkLog.fields.venue) {
      const icon = checkLog.fields.venue.match ? "✓" : "✗";
      lines.push(`  ${icon} venue`);
    }

    if (checkLog.fields.doi) {
      const icon = checkLog.fields.doi.match ? "✓" : "✗";
      lines.push(`  ${icon} doi`);
    }
  }

  return lines.join("\n");
}
