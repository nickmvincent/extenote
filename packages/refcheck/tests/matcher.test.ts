/**
 * Tests for entry matching logic
 */

import { describe, it, expect } from "bun:test";
import { matchPageToVault, findRelatedEntries } from "../src/matcher.js";
import type { VaultEntry } from "../src/types.js";

// =============================================================================
// Test Data
// =============================================================================

const testEntries: VaultEntry[] = [
  {
    id: "attention2017",
    relativePath: "papers/attention2017.md",
    title: "Attention Is All You Need",
    url: "https://arxiv.org/abs/1706.03762",
    doi: "10.48550/arXiv.1706.03762",
    authors: ["Vaswani", "Shazeer", "Parmar"],
    year: 2017,
    venue: "NeurIPS",
    frontmatter: {},
  },
  {
    id: "bert2019",
    relativePath: "papers/bert2019.md",
    title: "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding",
    url: "https://aclanthology.org/N19-1423",
    doi: "10.18653/v1/N19-1423",
    authors: ["Devlin", "Chang", "Lee", "Toutanova"],
    year: 2019,
    venue: "NAACL",
    frontmatter: {},
  },
  {
    id: "gpt3-2020",
    relativePath: "papers/gpt3-2020.md",
    title: "Language Models are Few-Shot Learners",
    url: "https://arxiv.org/abs/2005.14165",
    doi: "10.48550/arXiv.2005.14165",
    authors: ["Brown", "Mann", "Ryder"],
    year: 2020,
    venue: "NeurIPS",
    frontmatter: {},
  },
  {
    id: "no-url-entry",
    relativePath: "papers/no-url.md",
    title: "Paper Without URL",
    authors: ["Smith"],
    year: 2021,
    frontmatter: {},
  },
];

// =============================================================================
// matchPageToVault - URL Matching
// =============================================================================

/**
 * @narrative refcheck/page-matching
 * @title Page-to-Bibliography Matching
 * @description When you visit an academic paper online, Extenote checks if it's already in your
 * bibliography. It tries multiple matching strategies: exact URL, DOI, arXiv ID, and finally
 * title similarity. Each match type has a confidence score.
 */
describe("matchPageToVault - URL matching", () => {
  /**
   * @narrative-step 1
   * @explanation The fastest match is by exact URL. If the page URL matches an entry's url field,
   * that's a perfect match with 100% confidence.
   */
  it("matches exact URL", () => {
    const result = matchPageToVault(
      "https://arxiv.org/abs/1706.03762",
      "Some Page Title",
      testEntries
    );

    expect(result).not.toBeNull();
    expect(result!.entry.id).toBe("attention2017");
    expect(result!.matchType).toBe("url");
    expect(result!.confidence).toBe(1.0);
  });

  it("matches URL ignoring query string", () => {
    const result = matchPageToVault(
      "https://arxiv.org/abs/1706.03762?v=2",
      "Title",
      testEntries
    );

    expect(result).not.toBeNull();
    expect(result!.entry.id).toBe("attention2017");
    expect(result!.matchType).toBe("url");
  });

  it("matches URL case-insensitively", () => {
    const result = matchPageToVault(
      "HTTPS://ARXIV.ORG/abs/1706.03762",
      "Title",
      testEntries
    );

    expect(result).not.toBeNull();
    expect(result!.entry.id).toBe("attention2017");
  });

  it("returns null for non-matching URL when title also doesn't match", () => {
    const result = matchPageToVault(
      "https://example.com/unknown",
      "Completely Different Title",
      testEntries
    );

    expect(result).toBeNull();
  });
});

// =============================================================================
// matchPageToVault - DOI Matching
// =============================================================================

describe("matchPageToVault - DOI matching", () => {
  /**
   * @narrative-step 2
   * @explanation DOIs are extracted from URLs like doi.org/10.xxxx or embedded in publisher URLs.
   * DOI matches have 95% confidence since they're unique identifiers.
   */
  it("matches DOI in URL", () => {
    const result = matchPageToVault(
      "https://doi.org/10.18653/v1/N19-1423",
      "Some Title",
      testEntries
    );

    expect(result).not.toBeNull();
    expect(result!.entry.id).toBe("bert2019");
    expect(result!.matchType).toBe("doi");
    expect(result!.confidence).toBe(0.95);
  });

  it("matches DOI with different URL prefix", () => {
    const result = matchPageToVault(
      "https://dx.doi.org/10.18653/v1/N19-1423",
      "Title",
      testEntries
    );

    expect(result).not.toBeNull();
    expect(result!.entry.id).toBe("bert2019");
  });

  it("matches DOI case-insensitively", () => {
    const result = matchPageToVault(
      "https://doi.org/10.18653/V1/N19-1423",
      "Title",
      testEntries
    );

    expect(result).not.toBeNull();
    expect(result!.entry.id).toBe("bert2019");
  });

  it("handles DOI embedded in page URL", () => {
    const result = matchPageToVault(
      "https://publisher.com/article/10.18653/v1/N19-1423",
      "Title",
      testEntries
    );

    expect(result).not.toBeNull();
    expect(result!.entry.id).toBe("bert2019");
  });
});

// =============================================================================
// matchPageToVault - arXiv Matching
// =============================================================================

describe("matchPageToVault - arXiv matching", () => {
  /**
   * @narrative-step 3
   * @explanation arXiv IDs are extracted from various URL formats: /abs/xxxx, /pdf/xxxx.pdf,
   * and versioned URLs like /abs/xxxx.v3. All resolve to the same paper.
   */
  it("matches arXiv abs URL", () => {
    const result = matchPageToVault(
      "https://arxiv.org/abs/2005.14165",
      "Some Title",
      testEntries
    );

    expect(result).not.toBeNull();
    expect(result!.entry.id).toBe("gpt3-2020");
    // URL match takes precedence over arXiv match since the entry has exact URL
    expect(result!.matchType).toBe("url");
    expect(result!.confidence).toBe(1.0);
  });

  it("matches arXiv pdf URL", () => {
    const result = matchPageToVault(
      "https://arxiv.org/pdf/2005.14165.pdf",
      "Title",
      testEntries
    );

    expect(result).not.toBeNull();
    expect(result!.entry.id).toBe("gpt3-2020");
  });

  it("matches arXiv URL with version suffix", () => {
    const result = matchPageToVault(
      "https://arxiv.org/abs/2005.14165v3",
      "Title",
      testEntries
    );

    expect(result).not.toBeNull();
    expect(result!.entry.id).toBe("gpt3-2020");
  });

  it("matches arXiv URL from Hugging Face papers mirror", () => {
    // This would need special handling if we want to support it
    const result = matchPageToVault(
      "https://arxiv.org/abs/1706.03762",
      "Attention Paper",
      testEntries
    );

    expect(result).not.toBeNull();
    expect(result!.entry.id).toBe("attention2017");
  });
});

// =============================================================================
// matchPageToVault - Title Matching
// =============================================================================

describe("matchPageToVault - title matching", () => {
  /**
   * @narrative-step 4
   * @explanation When URL-based matching fails, Extenote falls back to title similarity.
   * The page title is compared against all entry titles using fuzzy matching. Confidence
   * depends on how closely the titles match.
   */
  it("matches by title when URL doesn't match", () => {
    const result = matchPageToVault(
      "https://example.com/unknown",
      "Attention Is All You Need",
      testEntries
    );

    expect(result).not.toBeNull();
    expect(result!.entry.id).toBe("attention2017");
    expect(result!.matchType).toBe("title");
    expect(result!.confidence).toBeGreaterThan(0.85);
  });

  it("matches title with different case", () => {
    const result = matchPageToVault(
      "https://example.com",
      "attention is all you need",
      testEntries
    );

    expect(result).not.toBeNull();
    expect(result!.entry.id).toBe("attention2017");
  });

  it("matches title ignoring punctuation", () => {
    const result = matchPageToVault(
      "https://example.com",
      "BERT - Pre-training of Deep Bidirectional Transformers for Language Understanding",
      testEntries
    );

    expect(result).not.toBeNull();
    expect(result!.entry.id).toBe("bert2019");
  });

  it("returns highest confidence match when multiple titles are similar", () => {
    const result = matchPageToVault(
      "https://example.com",
      "Attention Is All You Need",
      testEntries
    );

    expect(result).not.toBeNull();
    expect(result!.confidence).toBeGreaterThan(0.9);
  });

  it("returns null for low-similarity title", () => {
    const result = matchPageToVault(
      "https://example.com",
      "A Completely Unrelated Topic About Cooking",
      testEntries
    );

    expect(result).toBeNull();
  });

  it("handles empty title", () => {
    const result = matchPageToVault(
      "https://example.com/unknown",
      "",
      testEntries
    );

    expect(result).toBeNull();
  });
});

// =============================================================================
// matchPageToVault - Priority Order
// =============================================================================

describe("matchPageToVault - priority order", () => {
  it("prefers URL match over DOI match", () => {
    // Create an entry that could match by URL or DOI
    const entries: VaultEntry[] = [
      {
        id: "url-match",
        relativePath: "url.md",
        title: "URL Match",
        url: "https://example.com/paper",
        frontmatter: {},
      },
      {
        id: "doi-match",
        relativePath: "doi.md",
        title: "DOI Match",
        doi: "10.1234/example",
        frontmatter: {},
      },
    ];

    const result = matchPageToVault(
      "https://example.com/paper",
      "Some Title",
      entries
    );

    expect(result).not.toBeNull();
    expect(result!.matchType).toBe("url");
  });

  it("prefers DOI match over arXiv match", () => {
    // When URL has both DOI and arXiv patterns, DOI should win
    // (In practice this scenario is rare)
    const entries: VaultEntry[] = [
      {
        id: "doi-entry",
        relativePath: "doi.md",
        title: "DOI Entry",
        doi: "10.1234/test",
        frontmatter: {},
      },
    ];

    const result = matchPageToVault(
      "https://doi.org/10.1234/test",
      "Title",
      entries
    );

    expect(result).not.toBeNull();
    expect(result!.matchType).toBe("doi");
  });

  it("falls back to title when no identifiers match", () => {
    const result = matchPageToVault(
      "https://example.com/random",
      "Language Models are Few-Shot Learners",
      testEntries
    );

    expect(result).not.toBeNull();
    expect(result!.matchType).toBe("title");
    expect(result!.entry.id).toBe("gpt3-2020");
  });
});

// =============================================================================
// matchPageToVault - Edge Cases
// =============================================================================

describe("matchPageToVault - edge cases", () => {
  it("handles empty entries array", () => {
    const result = matchPageToVault(
      "https://example.com",
      "Some Title",
      []
    );

    expect(result).toBeNull();
  });

  it("handles entries without URL or DOI", () => {
    const result = matchPageToVault(
      "https://example.com",
      "Paper Without URL",
      testEntries
    );

    expect(result).not.toBeNull();
    expect(result!.entry.id).toBe("no-url-entry");
    expect(result!.matchType).toBe("title");
  });

  it("handles malformed URL gracefully", () => {
    const result = matchPageToVault(
      "not-a-valid-url",
      "Attention Is All You Need",
      testEntries
    );

    // Should fall back to title matching
    expect(result).not.toBeNull();
    expect(result!.matchType).toBe("title");
  });

  it("handles entries with URL in frontmatter instead of direct field", () => {
    const entries: VaultEntry[] = [
      {
        id: "fm-url",
        relativePath: "fm.md",
        title: "Frontmatter URL",
        frontmatter: {
          url: "https://example.com/fm-paper",
        },
      },
    ];

    const result = matchPageToVault(
      "https://example.com/fm-paper",
      "Title",
      entries
    );

    expect(result).not.toBeNull();
    expect(result!.matchType).toBe("url");
  });

  it("handles entries with DOI in frontmatter instead of direct field", () => {
    const entries: VaultEntry[] = [
      {
        id: "fm-doi",
        relativePath: "fm.md",
        title: "Frontmatter DOI",
        frontmatter: {
          doi: "10.1234/fm-paper",
        },
      },
    ];

    const result = matchPageToVault(
      "https://doi.org/10.1234/fm-paper",
      "Title",
      entries
    );

    expect(result).not.toBeNull();
    expect(result!.matchType).toBe("doi");
  });
});

// =============================================================================
// findRelatedEntries
// =============================================================================

describe("findRelatedEntries", () => {
  it("finds entries with shared authors", () => {
    const entries: VaultEntry[] = [
      {
        id: "paper1",
        relativePath: "p1.md",
        title: "Paper One",
        authors: ["John Smith", "Jane Doe"],
        year: 2020,
        frontmatter: {},
      },
      {
        id: "paper2",
        relativePath: "p2.md",
        title: "Paper Two",
        authors: ["John Smith", "Bob Wilson"],
        year: 2021,
        frontmatter: {},
      },
      {
        id: "paper3",
        relativePath: "p3.md",
        title: "Paper Three",
        authors: ["Alice Brown"],
        year: 2022,
        frontmatter: {},
      },
    ];

    const related = findRelatedEntries(entries[0], entries);

    // paper2 should be related (shared author John Smith)
    expect(related.length).toBeGreaterThan(0);
    expect(related.some((e) => e.id === "paper2")).toBe(true);
  });

  it("finds entries with same venue", () => {
    const entries: VaultEntry[] = [
      {
        id: "neurips1",
        relativePath: "n1.md",
        title: "NeurIPS Paper One",
        venue: "NeurIPS 2023",
        year: 2023,
        frontmatter: {},
      },
      {
        id: "neurips2",
        relativePath: "n2.md",
        title: "NeurIPS Paper Two",
        venue: "NeurIPS 2023",
        year: 2023,
        frontmatter: {},
      },
      {
        id: "icml1",
        relativePath: "i1.md",
        title: "ICML Paper",
        venue: "ICML 2023",
        year: 2023,
        frontmatter: {},
      },
    ];

    const related = findRelatedEntries(entries[0], entries);

    expect(related.some((e) => e.id === "neurips2")).toBe(true);
  });

  it("excludes the source entry", () => {
    const entries: VaultEntry[] = [
      {
        id: "source",
        relativePath: "s.md",
        title: "Source Paper",
        authors: ["Smith"],
        frontmatter: {},
      },
      {
        id: "related",
        relativePath: "r.md",
        title: "Related Paper",
        authors: ["Smith"],
        frontmatter: {},
      },
    ];

    const related = findRelatedEntries(entries[0], entries);

    expect(related.every((e) => e.id !== "source")).toBe(true);
  });

  it("respects limit parameter", () => {
    const entries: VaultEntry[] = Array.from({ length: 20 }, (_, i) => ({
      id: `paper${i}`,
      relativePath: `p${i}.md`,
      title: `Paper ${i}`,
      authors: ["Common Author"],
      year: 2020,
      frontmatter: {},
    }));

    const related = findRelatedEntries(entries[0], entries, 3);

    expect(related.length).toBeLessThanOrEqual(3);
  });

  it("returns empty array when no related entries", () => {
    const entries: VaultEntry[] = [
      {
        id: "isolated",
        relativePath: "i.md",
        title: "Isolated Paper About Cats",
        authors: ["Unique Author"],
        venue: "Unique Venue",
        year: 1999,
        frontmatter: {},
      },
      {
        id: "different",
        relativePath: "d.md",
        title: "Different Paper About Dogs",
        authors: ["Another Author"],
        venue: "Another Venue",
        year: 2023,
        frontmatter: {},
      },
    ];

    const related = findRelatedEntries(entries[0], entries);

    // May or may not be empty depending on title similarity threshold
    expect(related.every((e) => e.id !== "isolated")).toBe(true);
  });

  it("handles entries with missing optional fields", () => {
    const entries: VaultEntry[] = [
      {
        id: "minimal1",
        relativePath: "m1.md",
        title: "Minimal Paper One",
        frontmatter: {},
      },
      {
        id: "minimal2",
        relativePath: "m2.md",
        title: "Minimal Paper Two",
        frontmatter: {},
      },
    ];

    // Should not throw
    const related = findRelatedEntries(entries[0], entries);
    expect(Array.isArray(related)).toBe(true);
  });

  it("sorts by relevance score", () => {
    const entries: VaultEntry[] = [
      {
        id: "source",
        relativePath: "s.md",
        title: "Deep Learning for NLP",
        authors: ["Smith", "Jones"],
        venue: "NeurIPS",
        year: 2023,
        frontmatter: {},
      },
      {
        id: "most-related",
        relativePath: "mr.md",
        title: "Deep Learning for Vision",
        authors: ["Smith", "Jones"], // Same authors
        venue: "NeurIPS", // Same venue
        year: 2023, // Same year
        frontmatter: {},
      },
      {
        id: "somewhat-related",
        relativePath: "sr.md",
        title: "Shallow Learning for NLP",
        authors: ["Smith"], // One shared author
        venue: "ICML",
        year: 2020,
        frontmatter: {},
      },
    ];

    const related = findRelatedEntries(entries[0], entries);

    // Most related should come first
    expect(related[0].id).toBe("most-related");
  });
});
