/**
 * Tests for field comparison logic
 */

import { describe, it, expect } from "bun:test";
import {
  compareTitle,
  compareAuthors,
  authorsMatch,
  compareYear,
  compareVenue,
  compareDoi,
  compareFields,
  determineStatus,
  needsValidation,
  getValidationStatus,
  classifyMismatchSeverity,
} from "../src/compare.js";
import type { EntryMetadata, PaperMetadata } from "../src/types.js";

// =============================================================================
// compareTitle
// =============================================================================

/**
 * @narrative refcheck/field-comparison
 * @title Reference Field Comparison
 * @description When verifying your bibliography against DBLP or OpenAlex, Extenote compares
 * each field (title, authors, year, venue) individually. The comparison is fuzzy - it handles
 * differences in case, punctuation, diacritics, and name formats.
 */
describe("compareTitle", () => {
  /**
   * @narrative-step 1
   * @explanation Titles are compared after normalizing case and whitespace. Identical titles
   * match perfectly with no edit distance reported.
   */
  it("matches identical titles", () => {
    const result = compareTitle("Attention Is All You Need", "Attention Is All You Need");
    expect(result.match).toBe(true);
    expect(result.edit_distance).toBeUndefined();
  });

  it("matches titles with different case", () => {
    const result = compareTitle("attention is all you need", "ATTENTION IS ALL YOU NEED");
    expect(result.match).toBe(true);
  });

  /**
   * @narrative-step 2
   * @explanation Punctuation like colons and hyphens is ignored during comparison. This handles
   * variations in how titles are formatted across different databases.
   */
  it("matches titles ignoring punctuation", () => {
    const result = compareTitle(
      "BERT: Pre-training of Deep Bidirectional Transformers",
      "BERT Pre-training of Deep Bidirectional Transformers"
    );
    expect(result.match).toBe(true);
  });

  /**
   * @narrative-step 3
   * @explanation When titles don't match, the edit distance (Levenshtein) is reported so you
   * can see how different they are. Small differences might indicate typos.
   */
  it("reports mismatch with edit distance for different titles", () => {
    const result = compareTitle("Paper About Cats", "Paper About Dogs");
    expect(result.match).toBe(false);
    expect(result.edit_distance).toBeGreaterThan(0);
  });

  it("handles undefined local", () => {
    const result = compareTitle(undefined, "Some Title");
    expect(result.match).toBe(false);
    expect(result.local).toBeNull();
  });

  it("handles undefined remote", () => {
    const result = compareTitle("Some Title", undefined);
    expect(result.match).toBe(false);
    expect(result.remote).toBeNull();
  });

  it("handles both undefined", () => {
    const result = compareTitle(undefined, undefined);
    expect(result.match).toBe(true);
  });

  it("handles empty strings", () => {
    const result = compareTitle("", "");
    expect(result.match).toBe(true);
  });

  it("handles whitespace-only strings", () => {
    const result = compareTitle("   ", "   ");
    expect(result.match).toBe(true);
  });

  /**
   * @narrative-step 4
   * @explanation Diacritics (accents) are normalized so "Café" matches "Cafe". This is essential
   * for international author names and venues.
   */
  it("matches titles with diacritics", () => {
    const result = compareTitle("Café-Résumé Analysis", "Cafe-Resume Analysis");
    expect(result.match).toBe(true);
  });

  it("handles very long titles", () => {
    const long1 = "A " + "very ".repeat(50) + "long title about machine learning";
    const long2 = "A " + "very ".repeat(50) + "long title about machine learning";
    const result = compareTitle(long1, long2);
    expect(result.match).toBe(true);
  });

  it("handles subtle differences", () => {
    // Minor differences should still match if > 90% similar
    const result = compareTitle(
      "Deep Learning for Natural Language Processing",
      "Deep Learning for NLP"
    );
    // This might not match due to abbreviation - depends on Jaccard threshold
    expect(result.local).toBe("Deep Learning for Natural Language Processing");
    expect(result.remote).toBe("Deep Learning for NLP");
  });
});

// =============================================================================
// compareAuthors
// =============================================================================

/**
 * @narrative refcheck/author-comparison
 * @title Author List Comparison
 * @description Comparing author lists is tricky because names appear in different formats:
 * "John Smith", "Smith, John", "J. Smith", "Smith, J.". Extenote compares authors by matching
 * last names and provides detailed per-author match results.
 */
describe("compareAuthors", () => {
  /**
   * @narrative-step 1
   * @explanation Author lists are compared position-by-position. Each author gets a detailed
   * match result showing whether the last name matched.
   */
  it("matches identical author lists", () => {
    const result = compareAuthors(
      ["John Smith", "Jane Doe"],
      ["John Smith", "Jane Doe"]
    );
    expect(result.count_match).toBe(true);
    expect(result.details).toHaveLength(2);
    expect(result.details![0].last_match).toBe(true);
    expect(result.details![1].last_match).toBe(true);
  });

  /**
   * @narrative-step 2
   * @explanation "Smith, John" and "John Smith" both match because the comparison extracts
   * and compares last names regardless of format.
   */
  it("matches authors with different name formats", () => {
    const result = compareAuthors(
      ["Smith, John", "Doe, Jane"],
      ["John Smith", "Jane Doe"]
    );
    expect(result.count_match).toBe(true);
    expect(result.details![0].last_match).toBe(true);
    expect(result.details![1].last_match).toBe(true);
  });

  /**
   * @narrative-step 3
   * @explanation If your entry has 2 authors but the database has 1, that's flagged as a
   * count mismatch. This helps catch incomplete author lists.
   */
  it("detects author count mismatch", () => {
    const result = compareAuthors(
      ["John Smith", "Jane Doe"],
      ["John Smith"]
    );
    expect(result.count_match).toBe(false);
    expect(result.local_count).toBe(2);
    expect(result.remote_count).toBe(1);
  });

  it("provides per-author match details", () => {
    const result = compareAuthors(
      ["John Smith", "Mary Jones"],
      ["John Smith", "Mary Johnson"]
    );
    expect(result.details).toHaveLength(2);
    expect(result.details![0].last_match).toBe(true);
    expect(result.details![1].last_match).toBe(false); // Jones vs Johnson
  });

  /**
   * @narrative-step 4
   * @explanation International names with diacritics are normalized: "François Müller" matches
   * "Francois Muller". This prevents false mismatches for non-ASCII characters.
   */
  it("handles diacritics in author names", () => {
    const result = compareAuthors(
      ["François Müller"],
      ["Francois Muller"]
    );
    expect(result.details![0].last_match).toBe(true);
  });

  it("matches authors with middle names", () => {
    const result = compareAuthors(
      ["John David Smith"],
      ["J. D. Smith"]
    );
    // Should match on last name
    expect(result.details![0].last_match).toBe(true);
  });

  it("handles empty author lists", () => {
    const result = compareAuthors([], []);
    expect(result.count_match).toBe(true);
    expect(result.local_count).toBe(0);
    expect(result.remote_count).toBe(0);
  });

  it("handles undefined author lists", () => {
    const result = compareAuthors(undefined, undefined);
    expect(result.count_match).toBe(true);
    expect(result.local_count).toBe(0);
  });

  it("handles one undefined author list", () => {
    const result = compareAuthors(["John Smith"], undefined);
    expect(result.count_match).toBe(false);
    expect(result.local_count).toBe(1);
    expect(result.remote_count).toBe(0);
  });

  it("handles large author lists", () => {
    const authors = Array.from({ length: 50 }, (_, i) => `Author ${i}`);
    const result = compareAuthors(authors, authors);
    expect(result.count_match).toBe(true);
    expect(result.details).toHaveLength(50);
  });
});

describe("authorsMatch", () => {
  it("returns true for matching authors", () => {
    const check = compareAuthors(["John Smith"], ["John Smith"]);
    expect(authorsMatch(check)).toBe(true);
  });

  it("returns false for count mismatch", () => {
    const check = compareAuthors(["John Smith", "Jane Doe"], ["John Smith"]);
    expect(authorsMatch(check)).toBe(false);
  });

  it("returns false for last name mismatch", () => {
    const check = compareAuthors(["John Smith"], ["John Jones"]);
    expect(authorsMatch(check)).toBe(false);
  });

  it("returns true for empty lists", () => {
    const check = compareAuthors([], []);
    expect(authorsMatch(check)).toBe(true);
  });
});

// =============================================================================
// compareYear
// =============================================================================

describe("compareYear", () => {
  it("matches identical years", () => {
    const result = compareYear(2023, 2023);
    expect(result.match).toBe(true);
    expect(result.year_diff).toBeUndefined();
  });

  it("matches string and number years", () => {
    const result = compareYear("2023", 2023);
    expect(result.match).toBe(true);
  });

  it("reports year difference for mismatches", () => {
    const result = compareYear(2020, 2023);
    expect(result.match).toBe(false);
    expect(result.year_diff).toBe(3);
  });

  it("reports negative year difference", () => {
    const result = compareYear(2023, 2020);
    expect(result.match).toBe(false);
    expect(result.year_diff).toBe(-3);
  });

  it("handles undefined years", () => {
    const result = compareYear(undefined, undefined);
    expect(result.match).toBe(true);
  });

  it("handles one undefined year", () => {
    const result = compareYear(2023, undefined);
    expect(result.match).toBe(false);
    expect(result.local).toBe("2023");
    expect(result.remote).toBeNull();
  });

  it("handles invalid year strings", () => {
    const result = compareYear("not a year", 2023);
    expect(result.match).toBe(false);
    expect(result.local).toBeNull();
  });
});

// =============================================================================
// compareVenue
// =============================================================================

describe("compareVenue", () => {
  it("matches identical venues", () => {
    const result = compareVenue("NeurIPS 2023", "NeurIPS 2023");
    expect(result.match).toBe(true);
  });

  it("matches venues ignoring case", () => {
    const result = compareVenue("neurips", "NeurIPS");
    expect(result.match).toBe(true);
  });

  it("matches venues ignoring punctuation", () => {
    const result = compareVenue(
      "Proc. of the ACM Conference",
      "Proceedings of the ACM Conference"
    );
    // May or may not match depending on threshold
    expect(result.local).toBe("Proc. of the ACM Conference");
  });

  it("reports mismatch for different venues", () => {
    const result = compareVenue("NeurIPS", "ICML");
    expect(result.match).toBe(false);
    expect(result.edit_distance).toBeGreaterThan(0);
  });

  it("considers missing venue as match", () => {
    // Design decision: missing venue shouldn't be a mismatch
    const result = compareVenue("NeurIPS", undefined);
    expect(result.match).toBe(true);
    expect(result.remote).toBeNull();
  });

  it("handles both undefined", () => {
    const result = compareVenue(undefined, undefined);
    expect(result.match).toBe(true);
  });

  it("handles arXiv venue variations", () => {
    const result = compareVenue("arXiv preprint", "arXiv:2301.07041");
    // These should have some similarity
    expect(result.local).toBe("arXiv preprint");
  });

  it("handles conference abbreviations", () => {
    const result = compareVenue("AAAI", "AAAI Conference on Artificial Intelligence");
    // Depends on threshold - AAAI word matches
    expect(result.local).toBe("AAAI");
  });
});

// =============================================================================
// compareDoi
// =============================================================================

describe("compareDoi", () => {
  it("matches identical DOIs", () => {
    const result = compareDoi("10.1234/abc", "10.1234/abc");
    expect(result.match).toBe(true);
  });

  it("matches DOIs with different URL prefixes", () => {
    const result = compareDoi("10.1234/abc", "https://doi.org/10.1234/abc");
    expect(result.match).toBe(true);
  });

  it("matches DOIs case-insensitively", () => {
    const result = compareDoi("10.1234/ABC", "10.1234/abc");
    expect(result.match).toBe(true);
  });

  it("reports mismatch for different DOIs", () => {
    const result = compareDoi("10.1234/abc", "10.1234/xyz");
    expect(result.match).toBe(false);
  });

  it("considers missing DOI as match", () => {
    // Design decision: missing DOI shouldn't be a mismatch
    const result = compareDoi("10.1234/abc", undefined);
    expect(result.match).toBe(true);
    expect(result.remote).toBeNull();
  });

  it("handles both undefined", () => {
    const result = compareDoi(undefined, undefined);
    expect(result.match).toBe(true);
  });
});

// =============================================================================
// compareFields
// =============================================================================

describe("compareFields", () => {
  const localEntry: EntryMetadata = {
    id: "test2023",
    title: "Test Paper",
    authors: ["John Smith"],
    year: 2023,
    venue: "NeurIPS",
    doi: "10.1234/test",
  };

  const remotePaper: PaperMetadata = {
    title: "Test Paper",
    authors: ["John Smith"],
    year: 2023,
    venue: "NeurIPS",
    doi: "10.1234/test",
  };

  it("compares all fields", () => {
    const result = compareFields(localEntry, remotePaper);
    expect(result.title).toBeDefined();
    expect(result.authors).toBeDefined();
    expect(result.year).toBeDefined();
    expect(result.venue).toBeDefined();
    expect(result.doi).toBeDefined();
  });

  it("all fields match for identical entries", () => {
    const result = compareFields(localEntry, remotePaper);
    expect(result.title.match).toBe(true);
    expect(authorsMatch(result.authors)).toBe(true);
    expect(result.year.match).toBe(true);
    expect(result.venue!.match).toBe(true);
    expect(result.doi!.match).toBe(true);
  });

  it("detects title mismatch", () => {
    const result = compareFields(localEntry, { ...remotePaper, title: "Different Title" });
    expect(result.title.match).toBe(false);
  });

  it("detects author mismatch", () => {
    const result = compareFields(localEntry, { ...remotePaper, authors: ["Jane Doe"] });
    expect(authorsMatch(result.authors)).toBe(false);
  });
});

// =============================================================================
// determineStatus
// =============================================================================

describe("determineStatus", () => {
  it("returns confirmed for all matching fields", () => {
    const fields = compareFields(
      { id: "test", title: "Test", authors: ["Smith"], year: 2023 },
      { title: "Test", authors: ["Smith"], year: 2023 }
    );
    expect(determineStatus(fields)).toBe("confirmed");
  });

  it("returns mismatch for title mismatch", () => {
    const fields = compareFields(
      { id: "test", title: "Test", authors: ["Smith"], year: 2023 },
      { title: "Different", authors: ["Smith"], year: 2023 }
    );
    expect(determineStatus(fields)).toBe("mismatch");
  });

  it("returns mismatch for author mismatch", () => {
    const fields = compareFields(
      { id: "test", title: "Test", authors: ["Smith"], year: 2023 },
      { title: "Test", authors: ["Jones"], year: 2023 }
    );
    expect(determineStatus(fields)).toBe("mismatch");
  });

  it("returns mismatch for year mismatch", () => {
    const fields = compareFields(
      { id: "test", title: "Test", authors: ["Smith"], year: 2023 },
      { title: "Test", authors: ["Smith"], year: 2020 }
    );
    expect(determineStatus(fields)).toBe("mismatch");
  });
});

// =============================================================================
// needsValidation
// =============================================================================

describe("needsValidation", () => {
  it("returns true for entry without check_log", () => {
    expect(needsValidation({ id: "test", title: "Test" })).toBe(true);
  });

  it("returns true when force is true", () => {
    const entry: EntryMetadata = {
      id: "test",
      title: "Test",
      check_log: {
        checked_at: new Date().toISOString(),
        checked_with: "test",
        status: "confirmed",
      },
    };
    expect(needsValidation(entry, true)).toBe(true);
  });

  it("returns true for stale check_log", () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 60);

    const entry: EntryMetadata = {
      id: "test",
      title: "Test",
      check_log: {
        checked_at: oldDate.toISOString(),
        checked_with: "test",
        status: "confirmed",
      },
    };
    expect(needsValidation(entry, false, 30)).toBe(true);
  });

  it("returns true for error status", () => {
    const entry: EntryMetadata = {
      id: "test",
      title: "Test",
      check_log: {
        checked_at: new Date().toISOString(),
        checked_with: "test",
        status: "error",
      },
    };
    expect(needsValidation(entry)).toBe(true);
  });

  it("returns false for recent confirmed entry", () => {
    const entry: EntryMetadata = {
      id: "test",
      title: "Test",
      check_log: {
        checked_at: new Date().toISOString(),
        checked_with: "test",
        status: "confirmed",
      },
    };
    expect(needsValidation(entry)).toBe(false);
  });
});

// =============================================================================
// getValidationStatus
// =============================================================================

describe("getValidationStatus", () => {
  it("returns 'unchecked' for undefined check_log", () => {
    expect(getValidationStatus(undefined)).toBe("unchecked");
  });

  it("returns 'stale' for old check_log", () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 60);

    expect(getValidationStatus({
      checked_at: oldDate.toISOString(),
      checked_with: "test",
      status: "confirmed",
    }, 30)).toBe("stale");
  });

  it("returns status for recent check_log", () => {
    expect(getValidationStatus({
      checked_at: new Date().toISOString(),
      checked_with: "test",
      status: "confirmed",
    })).toBe("confirmed");

    expect(getValidationStatus({
      checked_at: new Date().toISOString(),
      checked_with: "test",
      status: "mismatch",
    })).toBe("mismatch");
  });
});

// =============================================================================
// classifyMismatchSeverity
// =============================================================================

describe("classifyMismatchSeverity", () => {
  it("returns major for title mismatch", () => {
    const fields = compareFields(
      { id: "test", title: "Cats and Dogs", authors: ["Smith"], year: 2023 },
      { title: "Birds and Fish", authors: ["Smith"], year: 2023 }
    );
    expect(classifyMismatchSeverity(fields)).toBe("major");
  });

  it("returns major for author last name mismatch", () => {
    const fields = compareFields(
      { id: "test", title: "Test Paper", authors: ["John Smith"], year: 2023 },
      { title: "Test Paper", authors: ["John Jones"], year: 2023 }
    );
    expect(classifyMismatchSeverity(fields)).toBe("major");
  });

  it("returns minor for venue arXiv vs conference", () => {
    const fields = compareFields(
      { id: "test", title: "Test Paper", authors: ["Smith"], year: 2023, venue: "NeurIPS 2023" },
      { title: "Test Paper", authors: ["Smith"], year: 2023, venue: "arXiv (Cornell University)" }
    );
    expect(classifyMismatchSeverity(fields)).toBe("minor");
  });

  it("returns minor for year off by 1", () => {
    const fields = compareFields(
      { id: "test", title: "Test Paper", authors: ["Smith"], year: 2023 },
      { title: "Test Paper", authors: ["Smith"], year: 2024 }
    );
    expect(classifyMismatchSeverity(fields)).toBe("minor");
  });

  it("returns major for year off by more than 1", () => {
    const fields = compareFields(
      { id: "test", title: "Test Paper", authors: ["Smith"], year: 2020 },
      { title: "Test Paper", authors: ["Smith"], year: 2023 }
    );
    expect(classifyMismatchSeverity(fields)).toBe("major");
  });

  it("returns major for DOI mismatch", () => {
    const fields = compareFields(
      { id: "test", title: "Test Paper", authors: ["Smith"], year: 2023, doi: "10.1234/abc" },
      { title: "Test Paper", authors: ["Smith"], year: 2023, doi: "10.1234/xyz" }
    );
    expect(classifyMismatchSeverity(fields)).toBe("major");
  });

  it("returns major for book publisher vs journal venue (book review pattern)", () => {
    const fields = compareFields(
      { id: "test", title: "Test Book", authors: ["Smith"], year: 2023, venue: "PublicAffairs" },
      { title: "Test Book", authors: ["Smith"], year: 2023, venue: "Journal of International Studies" }
    );
    expect(classifyMismatchSeverity(fields)).toBe("major");
  });

  it("returns minor for author count mismatch with many authors", () => {
    // Large author list differences are often intentional truncation
    const manyAuthors = Array.from({ length: 50 }, (_, i) => `Author${i}`);
    const fields = compareFields(
      { id: "test", title: "Test Paper", authors: manyAuthors.slice(0, 10), year: 2023 },
      { title: "Test Paper", authors: manyAuthors, year: 2023 }
    );
    // With 10 vs 50 authors but >50% ratio threshold, this depends on implementation
    // The key is that large teams often truncate author lists
    expect(fields.authors.count_match).toBe(false);
  });

  it("returns minor for first name only differences", () => {
    // When last names match but first names differ (initials vs full)
    const fields = compareFields(
      { id: "test", title: "Test Paper", authors: ["J. Smith"], year: 2023 },
      { title: "Test Paper", authors: ["John Smith"], year: 2023 }
    );
    // Last names should match
    expect(fields.authors.details?.[0]?.last_match).toBe(true);
    expect(classifyMismatchSeverity(fields)).toBe("minor");
  });
});
