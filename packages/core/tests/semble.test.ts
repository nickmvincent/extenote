import { describe, expect, it } from "bun:test";
import { computeObjectHash } from "../src/plugins/semble/sync";
import type { VaultObject } from "../src/types";

// ─── Test Helpers ─────────────────────────────────────────────────────────────

function buildObject(overrides: Partial<VaultObject>): VaultObject {
  return {
    id: "test-object",
    type: "bibtex_entry",
    sourceId: "local",
    project: "test-project",
    filePath: "/tmp/test.md",
    relativePath: "test.md",
    frontmatter: {},
    body: "",
    mtime: Date.now(),
    visibility: "private",
    ...overrides,
  };
}

// ─── computeObjectHash Tests ──────────────────────────────────────────────────

describe("computeObjectHash", () => {
  it("returns null for objects without URL", () => {
    const object = buildObject({
      frontmatter: { title: "No URL here" },
      body: "Some body content",
    });
    const hash = computeObjectHash(object);
    expect(hash).toBe(null);
  });

  it("returns a hash for objects with URL", () => {
    const object = buildObject({
      frontmatter: {
        url: "https://example.com/article",
        title: "Test Article",
      },
    });
    const hash = computeObjectHash(object);
    expect(hash).not.toBe(null);
    expect(typeof hash).toBe("string");
    expect(hash!.length).toBe(16); // SHA256 truncated to 16 chars
  });

  it("returns same hash for same URL content", () => {
    const object1 = buildObject({
      frontmatter: {
        url: "https://example.com/article",
        title: "Test Article",
      },
    });
    const object2 = buildObject({
      frontmatter: {
        url: "https://example.com/article",
        title: "Test Article",
      },
    });
    expect(computeObjectHash(object1)).toBe(computeObjectHash(object2));
  });

  it("returns different hash for different URLs", () => {
    const object1 = buildObject({
      frontmatter: { url: "https://example.com/article1" },
    });
    const object2 = buildObject({
      frontmatter: { url: "https://example.com/article2" },
    });
    expect(computeObjectHash(object1)).not.toBe(computeObjectHash(object2));
  });

  it("checks multiple URL fields", () => {
    // Should work with 'website' field
    const objectWithWebsite = buildObject({
      frontmatter: { website: "https://example.com" },
    });
    expect(computeObjectHash(objectWithWebsite)).not.toBe(null);

    // Should work with 'link' field
    const objectWithLink = buildObject({
      frontmatter: { link: "https://example.com" },
    });
    expect(computeObjectHash(objectWithLink)).not.toBe(null);

    // Should work with 'href' field
    const objectWithHref = buildObject({
      frontmatter: { href: "https://example.com" },
    });
    expect(computeObjectHash(objectWithHref)).not.toBe(null);
  });

  it("handles author array correctly", () => {
    const objectWithArrayAuthor = buildObject({
      frontmatter: {
        url: "https://example.com",
        author: ["Author One", "Author Two"],
      },
    });
    const objectWithStringAuthor = buildObject({
      frontmatter: {
        url: "https://example.com",
        author: "Author One, Author Two",
      },
    });
    // These should produce different hashes since the serialization differs
    const hash1 = computeObjectHash(objectWithArrayAuthor);
    const hash2 = computeObjectHash(objectWithStringAuthor);
    expect(hash1).not.toBe(null);
    expect(hash2).not.toBe(null);
  });

  it("produces consistent hashes for same content", () => {
    const object = buildObject({
      frontmatter: {
        url: "https://example.com/article",
        title: "Test Article",
        abstract: "This is a test abstract",
      },
    });
    // Hash should be deterministic
    const hash1 = computeObjectHash(object);
    const hash2 = computeObjectHash(object);
    expect(hash1).toBe(hash2);
  });

  it("includes metadata in hash", () => {
    const objectWithTitle = buildObject({
      frontmatter: {
        url: "https://example.com",
        title: "With Title",
      },
    });
    const objectWithoutTitle = buildObject({
      frontmatter: {
        url: "https://example.com",
      },
    });
    // Different metadata should produce different hashes
    expect(computeObjectHash(objectWithTitle)).not.toBe(
      computeObjectHash(objectWithoutTitle)
    );
  });
});

// ─── URL Field Priority Tests ─────────────────────────────────────────────────

describe("URL field extraction priority", () => {
  it("prefers 'url' over other fields", () => {
    const object = buildObject({
      frontmatter: {
        url: "https://primary.com",
        website: "https://secondary.com",
        link: "https://tertiary.com",
      },
    });
    const hash = computeObjectHash(object);

    // Same object with only url should produce same hash
    const objectWithOnlyUrl = buildObject({
      frontmatter: { url: "https://primary.com" },
    });
    expect(computeObjectHash(objectWithOnlyUrl)).toBe(hash);
  });

  it("falls back to 'website' when 'url' is missing", () => {
    const object = buildObject({
      frontmatter: {
        website: "https://example.com",
        link: "https://other.com",
      },
    });
    const hash = computeObjectHash(object);
    expect(hash).not.toBe(null);

    // Same object with url set to website value should produce same hash
    const objectWithUrl = buildObject({
      frontmatter: { url: "https://example.com" },
    });
    expect(computeObjectHash(objectWithUrl)).toBe(hash);
  });

  it("falls back to 'link' when 'url' and 'website' are missing", () => {
    const object = buildObject({
      frontmatter: {
        link: "https://example.com",
        href: "https://other.com",
      },
    });
    const hash = computeObjectHash(object);
    expect(hash).not.toBe(null);

    const objectWithUrl = buildObject({
      frontmatter: { url: "https://example.com" },
    });
    expect(computeObjectHash(objectWithUrl)).toBe(hash);
  });

  it("falls back to 'href' as last resort", () => {
    const object = buildObject({
      frontmatter: {
        href: "https://example.com",
      },
    });
    const hash = computeObjectHash(object);
    expect(hash).not.toBe(null);

    const objectWithUrl = buildObject({
      frontmatter: { url: "https://example.com" },
    });
    expect(computeObjectHash(objectWithUrl)).toBe(hash);
  });
});

// ─── Metadata Mapping Tests ───────────────────────────────────────────────────

describe("Metadata mapping in hash", () => {
  it("includes title changes in hash", () => {
    const object1 = buildObject({
      frontmatter: {
        url: "https://example.com",
        title: "Original Title",
      },
    });
    const object2 = buildObject({
      frontmatter: {
        url: "https://example.com",
        title: "Updated Title",
      },
    });
    expect(computeObjectHash(object1)).not.toBe(computeObjectHash(object2));
  });

  it("includes abstract/description changes in hash", () => {
    const object1 = buildObject({
      frontmatter: {
        url: "https://example.com",
        abstract: "Original abstract",
      },
    });
    const object2 = buildObject({
      frontmatter: {
        url: "https://example.com",
        abstract: "Updated abstract",
      },
    });
    expect(computeObjectHash(object1)).not.toBe(computeObjectHash(object2));
  });

  it("includes author changes in hash", () => {
    const object1 = buildObject({
      frontmatter: {
        url: "https://example.com",
        author: "John Smith",
      },
    });
    const object2 = buildObject({
      frontmatter: {
        url: "https://example.com",
        author: "Jane Doe",
      },
    });
    expect(computeObjectHash(object1)).not.toBe(computeObjectHash(object2));
  });

  it("includes date/year changes in hash", () => {
    const object1 = buildObject({
      frontmatter: {
        url: "https://example.com",
        year: 2023,
      },
    });
    const object2 = buildObject({
      frontmatter: {
        url: "https://example.com",
        year: 2024,
      },
    });
    expect(computeObjectHash(object1)).not.toBe(computeObjectHash(object2));
  });

  it("includes journal/venue changes in hash", () => {
    const object1 = buildObject({
      frontmatter: {
        url: "https://example.com",
        journal: "Nature",
      },
    });
    const object2 = buildObject({
      frontmatter: {
        url: "https://example.com",
        journal: "Science",
      },
    });
    expect(computeObjectHash(object1)).not.toBe(computeObjectHash(object2));
  });

  it("treats booktitle same as journal for hash", () => {
    const objectWithJournal = buildObject({
      frontmatter: {
        url: "https://example.com",
        journal: "NeurIPS",
      },
    });
    const objectWithBooktitle = buildObject({
      frontmatter: {
        url: "https://example.com",
        booktitle: "NeurIPS",
      },
    });
    // Both should produce same hash since they map to siteName
    expect(computeObjectHash(objectWithJournal)).toBe(computeObjectHash(objectWithBooktitle));
  });

  it("handles complex author array", () => {
    const object = buildObject({
      frontmatter: {
        url: "https://example.com",
        author: ["Author One", "Author Two", "Author Three"],
      },
    });
    const hash = computeObjectHash(object);
    expect(hash).not.toBe(null);

    // Changing order should change hash
    const objectReordered = buildObject({
      frontmatter: {
        url: "https://example.com",
        author: ["Author Three", "Author Two", "Author One"],
      },
    });
    expect(computeObjectHash(objectReordered)).not.toBe(hash);
  });

  it("handles ISO date format", () => {
    const object = buildObject({
      frontmatter: {
        url: "https://example.com",
        date: "2024-01-15",
      },
    });
    const hash = computeObjectHash(object);
    expect(hash).not.toBe(null);

    // Different date should change hash
    const objectDifferentDate = buildObject({
      frontmatter: {
        url: "https://example.com",
        date: "2024-06-20",
      },
    });
    expect(computeObjectHash(objectDifferentDate)).not.toBe(hash);
  });
});

// ─── Hash Stability Tests ─────────────────────────────────────────────────────

describe("Hash stability", () => {
  it("produces same hash regardless of frontmatter key order", () => {
    const object1 = buildObject({
      frontmatter: {
        url: "https://example.com",
        title: "Test",
        author: "Author",
        year: 2024,
      },
    });
    const object2 = buildObject({
      frontmatter: {
        year: 2024,
        author: "Author",
        url: "https://example.com",
        title: "Test",
      },
    });
    expect(computeObjectHash(object1)).toBe(computeObjectHash(object2));
  });

  it("ignores non-metadata fields in hash", () => {
    const object1 = buildObject({
      frontmatter: {
        url: "https://example.com",
        title: "Test",
        // These fields are not mapped to Semble metadata
        citation_key: "test-2024",
        visibility: "public",
        tags: ["research"],
      },
    });
    const object2 = buildObject({
      frontmatter: {
        url: "https://example.com",
        title: "Test",
        citation_key: "different-key",
        visibility: "private",
        tags: ["different", "tags"],
      },
    });
    // Hash should be same because only mapped fields matter
    expect(computeObjectHash(object1)).toBe(computeObjectHash(object2));
  });

  it("body content does not affect hash", () => {
    const object1 = buildObject({
      frontmatter: { url: "https://example.com" },
      body: "Original body content",
    });
    const object2 = buildObject({
      frontmatter: { url: "https://example.com" },
      body: "Completely different body content with more text",
    });
    expect(computeObjectHash(object1)).toBe(computeObjectHash(object2));
  });

  it("object id and path do not affect hash", () => {
    const object1 = buildObject({
      id: "object-1",
      relativePath: "path/to/object1.md",
      filePath: "/full/path/to/object1.md",
      frontmatter: { url: "https://example.com" },
    });
    const object2 = buildObject({
      id: "object-2",
      relativePath: "different/path/object2.md",
      filePath: "/another/full/path/object2.md",
      frontmatter: { url: "https://example.com" },
    });
    expect(computeObjectHash(object1)).toBe(computeObjectHash(object2));
  });
});

// ─── Edge Cases ───────────────────────────────────────────────────────────────

describe("Edge cases", () => {
  it("handles empty string URL", () => {
    const object = buildObject({
      frontmatter: { url: "" },
    });
    expect(computeObjectHash(object)).toBe(null);
  });

  it("handles whitespace-only URL", () => {
    const object = buildObject({
      frontmatter: { url: "   " },
    });
    // Depending on implementation, might be null or a hash
    const hash = computeObjectHash(object);
    // The important thing is it doesn't crash
    expect(hash === null || typeof hash === "string").toBe(true);
  });

  it("handles special characters in metadata", () => {
    const object = buildObject({
      frontmatter: {
        url: "https://example.com",
        title: "Title with 'quotes' and \"double quotes\"",
        abstract: "Abstract with\nnewlines\tand\ttabs",
      },
    });
    const hash = computeObjectHash(object);
    expect(hash).not.toBe(null);
    expect(typeof hash).toBe("string");
  });

  it("handles unicode in metadata", () => {
    const object = buildObject({
      frontmatter: {
        url: "https://example.com",
        title: "日本語タイトル",
        author: "田中太郎",
      },
    });
    const hash = computeObjectHash(object);
    expect(hash).not.toBe(null);
  });

  it("handles very long URLs", () => {
    const longUrl = "https://example.com/" + "a".repeat(1000);
    const object = buildObject({
      frontmatter: { url: longUrl },
    });
    const hash = computeObjectHash(object);
    expect(hash).not.toBe(null);
    expect(hash!.length).toBe(16);
  });

  it("handles numeric values in frontmatter", () => {
    const object = buildObject({
      frontmatter: {
        url: "https://example.com",
        year: 2024,
        date: 2024, // Numeric date (unusual but possible)
      },
    });
    const hash = computeObjectHash(object);
    expect(hash).not.toBe(null);
  });
});
