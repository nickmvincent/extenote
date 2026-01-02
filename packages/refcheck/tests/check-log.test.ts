/**
 * Tests for CheckLog creation and utilities
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  createCheckLog,
  createNotFoundLog,
  createErrorLog,
  isStale,
  getAge,
  needsRevalidation,
  getStatusBadge,
  formatCheckLog,
} from "../src/check-log.js";
import type { CheckLog, FieldChecks, PaperMetadata } from "../src/types.js";

// =============================================================================
// createCheckLog
// =============================================================================

describe("createCheckLog", () => {
  it("creates log with required fields", () => {
    const log = createCheckLog({
      status: "confirmed",
      provider: "dblp",
    });

    expect(log.status).toBe("confirmed");
    expect(log.checked_with).toBe("dblp");
    expect(log.checked_at).toBeDefined();
    expect(new Date(log.checked_at).getTime()).not.toBeNaN();
  });

  it("includes paper_id when provided", () => {
    const log = createCheckLog({
      status: "confirmed",
      provider: "openalex",
      paperId: "W123456789",
    });

    expect(log.paper_id).toBe("W123456789");
  });

  it("includes fields when provided", () => {
    const fields: FieldChecks = {
      title: { local: "Test", remote: "Test", match: true },
      authors: { local_count: 1, remote_count: 1, count_match: true },
      year: { local: "2023", remote: "2023", match: true },
    };

    const log = createCheckLog({
      status: "confirmed",
      provider: "dblp",
      fields,
    });

    expect(log.fields).toEqual(fields);
  });

  it("extracts remote values from paper metadata", () => {
    const remote: PaperMetadata = {
      title: "Test Paper",
      authors: ["John Smith", "Jane Doe"],
      year: 2023,
      venue: "NeurIPS",
      doi: "10.1234/test",
    };

    const log = createCheckLog({
      status: "confirmed",
      provider: "dblp",
      remote,
    });

    expect(log.remote?.title).toBe("Test Paper");
    expect(log.remote?.authors).toEqual(["John Smith", "Jane Doe"]);
    expect(log.remote?.year).toBe(2023);
    expect(log.remote?.venue).toBe("NeurIPS");
    expect(log.remote?.doi).toBe("10.1234/test");
  });

  it("includes bibtex when provided", () => {
    const log = createCheckLog({
      status: "confirmed",
      provider: "dblp",
      bibtex: "@article{test2023, ...}",
    });

    expect(log.external_bibtex?.source).toBe("dblp");
    expect(log.external_bibtex?.bibtex).toBe("@article{test2023, ...}");
    expect(log.external_bibtex?.fetched_at).toBeDefined();
  });

  it("creates log for all status types", () => {
    const statuses = ["confirmed", "mismatch", "not_found", "error", "skipped"] as const;

    for (const status of statuses) {
      const log = createCheckLog({ status, provider: "test" });
      expect(log.status).toBe(status);
    }
  });

  it("includes mismatch_severity when provided for mismatch status", () => {
    const log = createCheckLog({
      status: "mismatch",
      severity: "minor",
      provider: "dblp",
    });

    expect(log.status).toBe("mismatch");
    expect(log.mismatch_severity).toBe("minor");
  });

  it("includes major severity for mismatch", () => {
    const log = createCheckLog({
      status: "mismatch",
      severity: "major",
      provider: "openalex",
    });

    expect(log.mismatch_severity).toBe("major");
  });

  it("does not include severity for non-mismatch status", () => {
    const log = createCheckLog({
      status: "confirmed",
      severity: "minor", // This should be ignored
      provider: "dblp",
    });

    expect(log.status).toBe("confirmed");
    expect(log.mismatch_severity).toBeUndefined();
  });
});

// =============================================================================
// createNotFoundLog
// =============================================================================

describe("createNotFoundLog", () => {
  it("creates log with not_found status", () => {
    const log = createNotFoundLog("openalex");

    expect(log.status).toBe("not_found");
    expect(log.checked_with).toBe("openalex");
    expect(log.checked_at).toBeDefined();
  });

  it("does not include optional fields", () => {
    const log = createNotFoundLog("dblp");

    expect(log.paper_id).toBeUndefined();
    expect(log.fields).toBeUndefined();
    expect(log.remote).toBeUndefined();
    expect(log.external_bibtex).toBeUndefined();
  });
});

// =============================================================================
// createErrorLog
// =============================================================================

describe("createErrorLog", () => {
  it("creates log with error status", () => {
    const log = createErrorLog("crossref");

    expect(log.status).toBe("error");
    expect(log.checked_with).toBe("crossref");
    expect(log.checked_at).toBeDefined();
  });

  it("accepts optional error message (reserved for future)", () => {
    // Currently the error message is not stored, but API accepts it
    const log = createErrorLog("dblp", "API rate limit exceeded");
    expect(log.status).toBe("error");
  });
});

// =============================================================================
// isStale
// =============================================================================

describe("isStale", () => {
  it("returns false for recent check_log", () => {
    const log: CheckLog = {
      checked_at: new Date().toISOString(),
      checked_with: "test",
      status: "confirmed",
    };

    expect(isStale(log)).toBe(false);
    expect(isStale(log, 30)).toBe(false);
  });

  it("returns true for old check_log", () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 60);

    const log: CheckLog = {
      checked_at: oldDate.toISOString(),
      checked_with: "test",
      status: "confirmed",
    };

    expect(isStale(log, 30)).toBe(true);
  });

  it("respects custom stale days", () => {
    const date = new Date();
    date.setDate(date.getDate() - 10);

    const log: CheckLog = {
      checked_at: date.toISOString(),
      checked_with: "test",
      status: "confirmed",
    };

    expect(isStale(log, 7)).toBe(true);
    expect(isStale(log, 14)).toBe(false);
  });

  it("handles edge case at exactly stale threshold", () => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    date.setHours(date.getHours() - 1); // Just over 30 days

    const log: CheckLog = {
      checked_at: date.toISOString(),
      checked_with: "test",
      status: "confirmed",
    };

    expect(isStale(log, 30)).toBe(true);
  });
});

// =============================================================================
// getAge
// =============================================================================

describe("getAge", () => {
  it("returns approximately 0 for just-created log", () => {
    const log: CheckLog = {
      checked_at: new Date().toISOString(),
      checked_with: "test",
      status: "confirmed",
    };

    expect(getAge(log)).toBeLessThan(0.01);
  });

  it("returns correct age in days", () => {
    const date = new Date();
    date.setDate(date.getDate() - 7);

    const log: CheckLog = {
      checked_at: date.toISOString(),
      checked_with: "test",
      status: "confirmed",
    };

    const age = getAge(log);
    expect(age).toBeGreaterThan(6.9);
    expect(age).toBeLessThan(7.1);
  });

  it("handles very old dates", () => {
    const date = new Date();
    date.setFullYear(date.getFullYear() - 1);

    const log: CheckLog = {
      checked_at: date.toISOString(),
      checked_with: "test",
      status: "confirmed",
    };

    expect(getAge(log)).toBeGreaterThan(360);
  });
});

// =============================================================================
// needsRevalidation
// =============================================================================

describe("needsRevalidation", () => {
  it("returns true for undefined check_log", () => {
    expect(needsRevalidation(undefined)).toBe(true);
  });

  it("returns true when force is true", () => {
    const log: CheckLog = {
      checked_at: new Date().toISOString(),
      checked_with: "test",
      status: "confirmed",
    };

    expect(needsRevalidation(log, true)).toBe(true);
  });

  it("returns true for error status", () => {
    const log: CheckLog = {
      checked_at: new Date().toISOString(),
      checked_with: "test",
      status: "error",
    };

    expect(needsRevalidation(log)).toBe(true);
  });

  it("returns true for stale check_log", () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 60);

    const log: CheckLog = {
      checked_at: oldDate.toISOString(),
      checked_with: "test",
      status: "confirmed",
    };

    expect(needsRevalidation(log, false, 30)).toBe(true);
  });

  it("returns false for recent confirmed check_log", () => {
    const log: CheckLog = {
      checked_at: new Date().toISOString(),
      checked_with: "test",
      status: "confirmed",
    };

    expect(needsRevalidation(log)).toBe(false);
  });

  it("returns false for recent mismatch check_log", () => {
    const log: CheckLog = {
      checked_at: new Date().toISOString(),
      checked_with: "test",
      status: "mismatch",
    };

    expect(needsRevalidation(log)).toBe(false);
  });

  it("returns false for recent not_found check_log", () => {
    const log: CheckLog = {
      checked_at: new Date().toISOString(),
      checked_with: "test",
      status: "not_found",
    };

    expect(needsRevalidation(log)).toBe(false);
  });
});

// =============================================================================
// getStatusBadge
// =============================================================================

describe("getStatusBadge", () => {
  it("returns unchecked for undefined", () => {
    const badge = getStatusBadge(undefined);
    expect(badge.status).toBe("unchecked");
    expect(badge.text).toBe("?");
    expect(badge.color).toBe("#888888");
  });

  it("returns stale for old check_log", () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 60);

    const log: CheckLog = {
      checked_at: oldDate.toISOString(),
      checked_with: "test",
      status: "confirmed",
    };

    const badge = getStatusBadge(log, 30);
    expect(badge.status).toBe("stale");
    expect(badge.text).toBe("?");
  });

  it("returns correct badge for confirmed", () => {
    const log: CheckLog = {
      checked_at: new Date().toISOString(),
      checked_with: "test",
      status: "confirmed",
    };

    const badge = getStatusBadge(log);
    expect(badge.status).toBe("confirmed");
    expect(badge.text).toBe("✓");
    expect(badge.color).toBe("#28a745");
  });

  it("returns correct badge for mismatch", () => {
    const log: CheckLog = {
      checked_at: new Date().toISOString(),
      checked_with: "test",
      status: "mismatch",
    };

    const badge = getStatusBadge(log);
    expect(badge.status).toBe("mismatch");
    expect(badge.text).toBe("!");
    expect(badge.color).toBe("#ffc107");
  });

  it("returns correct badge for not_found", () => {
    const log: CheckLog = {
      checked_at: new Date().toISOString(),
      checked_with: "test",
      status: "not_found",
    };

    const badge = getStatusBadge(log);
    expect(badge.status).toBe("not_found");
    expect(badge.text).toBe("✗");
    expect(badge.color).toBe("#dc3545");
  });

  it("returns correct badge for error", () => {
    const log: CheckLog = {
      checked_at: new Date().toISOString(),
      checked_with: "test",
      status: "error",
    };

    const badge = getStatusBadge(log);
    expect(badge.status).toBe("error");
    expect(badge.text).toBe("✗");
  });

  it("returns correct badge for skipped", () => {
    const log: CheckLog = {
      checked_at: new Date().toISOString(),
      checked_with: "test",
      status: "skipped",
    };

    const badge = getStatusBadge(log);
    expect(badge.status).toBe("skipped");
    expect(badge.text).toBe("-");
  });
});

// =============================================================================
// formatCheckLog
// =============================================================================

describe("formatCheckLog", () => {
  it("formats basic check_log", () => {
    const log: CheckLog = {
      checked_at: "2023-12-27T12:00:00.000Z",
      checked_with: "dblp",
      status: "confirmed",
    };

    const formatted = formatCheckLog(log);
    expect(formatted).toContain("Status: confirmed");
    expect(formatted).toContain("Provider: dblp");
    expect(formatted).toContain("Checked:");
  });

  it("includes paper_id when present", () => {
    const log: CheckLog = {
      checked_at: new Date().toISOString(),
      checked_with: "openalex",
      status: "confirmed",
      paper_id: "W123456789",
    };

    const formatted = formatCheckLog(log);
    expect(formatted).toContain("Paper ID: W123456789");
  });

  it("formats field checks", () => {
    const log: CheckLog = {
      checked_at: new Date().toISOString(),
      checked_with: "dblp",
      status: "mismatch",
      fields: {
        title: { local: "Test", remote: "Test", match: true },
        authors: { local_count: 2, remote_count: 2, count_match: true, details: [
          { index: 0, local: "Smith", remote: "Smith", first_match: true, last_match: true },
          { index: 1, local: "Jones", remote: "Johnson", first_match: true, last_match: false },
        ]},
        year: { local: "2023", remote: "2020", match: false, year_diff: -3 },
        venue: { local: "NeurIPS", remote: "NeurIPS", match: true },
        doi: { local: "10.1234/a", remote: "10.1234/b", match: false },
      },
    };

    const formatted = formatCheckLog(log);
    expect(formatted).toContain("Fields:");
    expect(formatted).toContain("✓ title");
    expect(formatted).toContain("✗ authors");
    expect(formatted).toContain("✗ year");
    expect(formatted).toContain("✓ venue");
    expect(formatted).toContain("✗ doi");
  });

  it("shows year diff when present", () => {
    const log: CheckLog = {
      checked_at: new Date().toISOString(),
      checked_with: "dblp",
      status: "mismatch",
      fields: {
        title: { local: "Test", remote: "Test", match: true },
        authors: { local_count: 1, remote_count: 1, count_match: true },
        year: { local: "2020", remote: "2023", match: false, year_diff: 3 },
      },
    };

    const formatted = formatCheckLog(log);
    expect(formatted).toContain("diff: 3 years");
  });

  it("shows author counts", () => {
    const log: CheckLog = {
      checked_at: new Date().toISOString(),
      checked_with: "dblp",
      status: "confirmed",
      fields: {
        title: { local: "Test", remote: "Test", match: true },
        authors: {
          local_count: 5,
          remote_count: 5,
          count_match: true,
          details: Array.from({ length: 5 }, (_, i) => ({
            index: i,
            local: `Author ${i}`,
            remote: `Author ${i}`,
            first_match: true,
            last_match: true,
          })),
        },
        year: { local: "2023", remote: "2023", match: true },
      },
    };

    const formatted = formatCheckLog(log);
    expect(formatted).toContain("authors (5/5)");
  });
});
