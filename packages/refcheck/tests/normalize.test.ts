/**
 * Tests for normalization utilities
 */

import { describe, it, expect } from "bun:test";
import {
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
} from "../src/normalize.js";

// =============================================================================
// normalizeString
// =============================================================================

describe("normalizeString", () => {
  it("converts to lowercase", () => {
    expect(normalizeString("Hello World")).toBe("hello world");
  });

  it("removes diacritics", () => {
    expect(normalizeString("café")).toBe("cafe");
    expect(normalizeString("naïve")).toBe("naive");
    expect(normalizeString("Müller")).toBe("muller");
    expect(normalizeString("Björk")).toBe("bjork");
    expect(normalizeString("Señor")).toBe("senor");
  });

  it("collapses multiple whitespace", () => {
    expect(normalizeString("hello    world")).toBe("hello world");
    expect(normalizeString("  hello  world  ")).toBe("hello world");
    expect(normalizeString("hello\n\nworld")).toBe("hello world");
    expect(normalizeString("hello\t\tworld")).toBe("hello world");
  });

  it("handles empty strings", () => {
    expect(normalizeString("")).toBe("");
    expect(normalizeString("   ")).toBe("");
  });

  it("preserves punctuation", () => {
    expect(normalizeString("Hello, World!")).toBe("hello, world!");
    expect(normalizeString("test@example.com")).toBe("test@example.com");
  });

  it("handles unicode characters", () => {
    expect(normalizeString("日本語")).toBe("日本語"); // Non-latin preserved
    expect(normalizeString("Ω")).toBe("ω"); // Greek
  });
});

// =============================================================================
// normalizeStrict
// =============================================================================

describe("normalizeStrict", () => {
  it("removes punctuation", () => {
    expect(normalizeStrict("Hello, World!")).toBe("hello world");
    expect(normalizeStrict("it's a test")).toBe("its a test");
    expect(normalizeStrict("test: something")).toBe("test something");
  });

  it("removes non-alphanumeric characters", () => {
    expect(normalizeStrict("hello@world.com")).toBe("helloworldcom");
    expect(normalizeStrict("test#123")).toBe("test123");
    expect(normalizeStrict("a+b=c")).toBe("abc");
  });

  it("removes diacritics and punctuation together", () => {
    // Hyphen is removed, words are joined by normalization then space-collapsed
    expect(normalizeStrict("Café-Résumé")).toBe("caferesume");
    expect(normalizeStrict("naïve, café")).toBe("naive cafe");
  });

  it("removes non-ASCII unicode for academic text", () => {
    expect(normalizeStrict("日本語")).toBe(""); // CJK removed
    expect(normalizeStrict("Ω")).toBe(""); // Greek symbols removed
  });

  it("handles academic titles with special chars", () => {
    expect(normalizeStrict("BERT: Pre-training of Deep Bidirectional Transformers"))
      .toBe("bert pretraining of deep bidirectional transformers");
    expect(normalizeStrict("GPT-4: A Large Language Model"))
      .toBe("gpt4 a large language model");
  });
});

// =============================================================================
// normalizeDoi
// =============================================================================

describe("normalizeDoi", () => {
  it("handles bare DOI", () => {
    expect(normalizeDoi("10.1234/abc.123")).toBe("10.1234/abc.123");
  });

  it("strips https://doi.org/ prefix", () => {
    expect(normalizeDoi("https://doi.org/10.1234/abc")).toBe("10.1234/abc");
  });

  it("strips http://doi.org/ prefix", () => {
    expect(normalizeDoi("http://doi.org/10.1234/abc")).toBe("10.1234/abc");
  });

  it("strips https://dx.doi.org/ prefix", () => {
    expect(normalizeDoi("https://dx.doi.org/10.1234/abc")).toBe("10.1234/abc");
  });

  it("strips http://dx.doi.org/ prefix", () => {
    expect(normalizeDoi("http://dx.doi.org/10.1234/abc")).toBe("10.1234/abc");
  });

  it("strips doi: prefix", () => {
    expect(normalizeDoi("doi:10.1234/abc")).toBe("10.1234/abc");
  });

  it("lowercases DOI", () => {
    expect(normalizeDoi("10.1234/ABC.XYZ")).toBe("10.1234/abc.xyz");
  });

  it("handles complex DOIs", () => {
    expect(normalizeDoi("https://doi.org/10.1145/3442188.3445922"))
      .toBe("10.1145/3442188.3445922");
    expect(normalizeDoi("10.1038/s41586-020-2649-2"))
      .toBe("10.1038/s41586-020-2649-2");
  });

  it("handles DOIs with special characters", () => {
    expect(normalizeDoi("10.1000/xyz%2Fabc")).toBe("10.1000/xyz%2fabc");
  });
});

// =============================================================================
// extractDoi
// =============================================================================

describe("extractDoi", () => {
  it("extracts DOI from URL", () => {
    expect(extractDoi("https://doi.org/10.1234/abc")).toBe("10.1234/abc");
  });

  it("extracts DOI from text containing DOI", () => {
    expect(extractDoi("See the paper at 10.1234/abc.def for more info"))
      .toBe("10.1234/abc.def");
  });

  it("returns null for non-DOI text", () => {
    expect(extractDoi("hello world")).toBeNull();
    expect(extractDoi("https://example.com")).toBeNull();
  });

  it("extracts DOI from various URL formats", () => {
    expect(extractDoi("https://www.nature.com/articles/10.1038/s41586-020-2649-2"))
      .toBe("10.1038/s41586-020-2649-2");
  });

  it("handles DOI with long suffix", () => {
    expect(extractDoi("10.48550/arXiv.2301.07041")).toBe("10.48550/arxiv.2301.07041");
  });
});

// =============================================================================
// extractArxivId
// =============================================================================

describe("extractArxivId", () => {
  it("extracts ID from arxiv.org/abs/ URL", () => {
    expect(extractArxivId("https://arxiv.org/abs/2301.07041")).toBe("2301.07041");
  });

  it("extracts ID from arxiv.org/pdf/ URL", () => {
    expect(extractArxivId("https://arxiv.org/pdf/2301.07041")).toBe("2301.07041");
  });

  it("extracts bare arXiv ID", () => {
    expect(extractArxivId("2301.07041")).toBe("2301.07041");
  });

  it("strips version suffix", () => {
    expect(extractArxivId("2301.07041v2")).toBe("2301.07041");
    expect(extractArxivId("https://arxiv.org/abs/2301.07041v3")).toBe("2301.07041");
  });

  it("handles 5-digit IDs", () => {
    expect(extractArxivId("2301.12345")).toBe("2301.12345");
  });

  it("returns null for non-arXiv content", () => {
    expect(extractArxivId("hello world")).toBeNull();
    expect(extractArxivId("https://example.com")).toBeNull();
    expect(extractArxivId("10.1234/abc")).toBeNull();
  });

  it("handles arXiv: prefix", () => {
    expect(extractArxivId("arXiv:2301.07041")).toBe("2301.07041");
  });
});

// =============================================================================
// levenshteinDistance
// =============================================================================

describe("levenshteinDistance", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshteinDistance("hello", "hello")).toBe(0);
    expect(levenshteinDistance("", "")).toBe(0);
  });

  it("returns length for empty comparison", () => {
    expect(levenshteinDistance("hello", "")).toBe(5);
    expect(levenshteinDistance("", "world")).toBe(5);
  });

  it("counts single character insertions", () => {
    expect(levenshteinDistance("cat", "cart")).toBe(1);
    expect(levenshteinDistance("hello", "hellos")).toBe(1);
  });

  it("counts single character deletions", () => {
    expect(levenshteinDistance("cart", "cat")).toBe(1);
    expect(levenshteinDistance("hello", "helo")).toBe(1);
  });

  it("counts single character substitutions", () => {
    expect(levenshteinDistance("cat", "bat")).toBe(1);
    expect(levenshteinDistance("hello", "hallo")).toBe(1);
  });

  it("calculates complex distances correctly", () => {
    expect(levenshteinDistance("kitten", "sitting")).toBe(3);
    expect(levenshteinDistance("saturday", "sunday")).toBe(3);
  });

  it("handles case sensitivity", () => {
    expect(levenshteinDistance("Hello", "hello")).toBe(1);
    expect(levenshteinDistance("ABC", "abc")).toBe(3);
  });
});

// =============================================================================
// jaccardSimilarity
// =============================================================================

describe("jaccardSimilarity", () => {
  it("returns 1 for identical strings", () => {
    expect(jaccardSimilarity("hello world", "hello world")).toBe(1);
  });

  it("returns 0 for completely different strings", () => {
    expect(jaccardSimilarity("abc def ghi", "xyz uvw rst")).toBe(0);
  });

  it("returns 1 for both empty strings", () => {
    expect(jaccardSimilarity("", "")).toBe(1);
  });

  it("returns 0 when one string is empty", () => {
    expect(jaccardSimilarity("hello world", "")).toBe(0);
    expect(jaccardSimilarity("", "hello world")).toBe(0);
  });

  it("calculates partial similarity", () => {
    // "the quick brown" vs "the quick fox" -> shared: the, quick -> 2/4 = 0.5
    const sim = jaccardSimilarity("the quick brown", "the quick fox");
    expect(sim).toBeCloseTo(0.5, 1);
  });

  it("ignores word order", () => {
    const sim1 = jaccardSimilarity("hello world test", "test world hello");
    expect(sim1).toBe(1);
  });

  it("ignores case and punctuation", () => {
    const sim = jaccardSimilarity("Hello, World!", "hello world");
    expect(sim).toBe(1);
  });

  it("filters short words (< 3 chars)", () => {
    // "a" is filtered (< 3 chars), "the" is kept (= 3 chars), "hello" and "world" match
    // Set A: {the, hello, world}, Set B: {hello, world}
    // Intersection: {hello, world} = 2, Union: {the, hello, world} = 3
    // Jaccard = 2/3
    const sim = jaccardSimilarity("a hello the world", "hello world");
    expect(sim).toBeCloseTo(2/3, 2);
  });

  it("handles academic paper titles", () => {
    const title1 = "Attention Is All You Need";
    const title2 = "Attention is All You Need";
    // Words: {attention, all, you, need} (is filtered as < 3 chars)
    expect(jaccardSimilarity(title1, title2)).toBe(1);

    const title3 = "BERT: Pre-training of Deep Bidirectional Transformers";
    const title4 = "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding";
    // Shared words should give high similarity
    expect(jaccardSimilarity(title3, title4)).toBeGreaterThan(0.6);
  });
});

// =============================================================================
// parseAuthorName
// =============================================================================

describe("parseAuthorName", () => {
  it("parses 'Last, First' format", () => {
    const result = parseAuthorName("Smith, John");
    expect(result.first).toBe("john");
    expect(result.last).toBe("smith");
  });

  it("parses 'Last, First Middle' format", () => {
    const result = parseAuthorName("Smith, John David");
    expect(result.first).toBe("john david");
    expect(result.last).toBe("smith");
  });

  it("parses 'First Last' format", () => {
    const result = parseAuthorName("John Smith");
    expect(result.first).toBe("john");
    expect(result.last).toBe("smith");
  });

  it("parses 'First Middle Last' format", () => {
    const result = parseAuthorName("John David Smith");
    expect(result.first).toBe("john david");
    expect(result.last).toBe("smith");
  });

  it("handles single name", () => {
    const result = parseAuthorName("Madonna");
    expect(result.first).toBe("");
    expect(result.last).toBe("madonna");
  });

  it("handles names with diacritics", () => {
    const result = parseAuthorName("François Müller");
    expect(result.first).toBe("francois");
    expect(result.last).toBe("muller");
  });

  it("trims whitespace", () => {
    const result = parseAuthorName("  Smith,   John  ");
    expect(result.first).toBe("john");
    expect(result.last).toBe("smith");
  });

  it("handles hyphenated last names in comma format", () => {
    const result = parseAuthorName("Garcia-Lopez, Maria");
    expect(result.first).toBe("maria");
    expect(result.last).toBe("garcia-lopez");
  });

  it("handles hyphenated last names in first-last format", () => {
    const result = parseAuthorName("Maria Garcia-Lopez");
    expect(result.first).toBe("maria");
    expect(result.last).toBe("garcia-lopez");
  });

  it("handles Jr/Sr suffixes in comma format", () => {
    const result = parseAuthorName("Smith Jr., John");
    // This may not be perfect, but should not crash
    expect(result.last).toBeTruthy();
  });
});

// =============================================================================
// normalizeUrl
// =============================================================================

describe("normalizeUrl", () => {
  it("removes query string", () => {
    expect(normalizeUrl("https://example.com/path?query=1"))
      .toBe("https://example.com/path");
  });

  it("removes hash fragment", () => {
    expect(normalizeUrl("https://example.com/path#section"))
      .toBe("https://example.com/path");
  });

  it("lowercases URL", () => {
    // The entire URL is lowercased including path
    expect(normalizeUrl("HTTPS://EXAMPLE.COM/Path"))
      .toBe("https://example.com/path");
  });

  it("handles URLs without path", () => {
    expect(normalizeUrl("https://example.com"))
      .toBe("https://example.com/");
  });

  it("preserves port numbers", () => {
    expect(normalizeUrl("http://localhost:3000/api"))
      .toBe("http://localhost:3000/api");
  });

  it("handles invalid URLs gracefully", () => {
    expect(normalizeUrl("not-a-url")).toBe("not-a-url");
    expect(normalizeUrl("")).toBe("");
  });

  it("handles arxiv URLs", () => {
    expect(normalizeUrl("https://arxiv.org/abs/2301.07041?v=2"))
      .toBe("https://arxiv.org/abs/2301.07041");
  });
});

// =============================================================================
// parseYear
// =============================================================================

describe("parseYear", () => {
  it("parses number years", () => {
    expect(parseYear(2023)).toBe(2023);
    expect(parseYear(1999)).toBe(1999);
  });

  it("parses string years", () => {
    expect(parseYear("2023")).toBe(2023);
    expect(parseYear("1999")).toBe(1999);
  });

  it("rejects out-of-range years", () => {
    expect(parseYear(1800)).toBeNull();
    expect(parseYear(2200)).toBeNull();
    expect(parseYear("1800")).toBeNull();
  });

  it("handles undefined/null", () => {
    expect(parseYear(undefined)).toBeNull();
    // @ts-ignore - testing runtime behavior
    expect(parseYear(null)).toBeNull();
  });

  it("extracts year from complex strings", () => {
    expect(parseYear("Published in 2023")).toBe(2023);
    expect(parseYear("circa 1999")).toBe(1999);
  });

  it("handles year ranges by taking first valid year", () => {
    expect(parseYear("2020-2023")).toBe(2020);
  });

  it("handles invalid strings", () => {
    expect(parseYear("no year here")).toBeNull();
    expect(parseYear("abc")).toBeNull();
    expect(parseYear("")).toBeNull();
  });

  it("handles edge years", () => {
    expect(parseYear(1900)).toBe(1900);
    expect(parseYear(2100)).toBe(2100);
    expect(parseYear(1899)).toBeNull();
    expect(parseYear(2101)).toBeNull();
  });
});
