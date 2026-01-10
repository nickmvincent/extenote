import { describe, it, expect, beforeEach } from "bun:test";
import {
  SearchIndex,
  createSearchIndex,
  createEmptySearchIndex,
} from "../src/search.js";
import type { VaultObject } from "../src/types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Test Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function createTestObject(overrides: Partial<VaultObject> = {}): VaultObject {
  return {
    id: overrides.id || "test-object",
    type: overrides.type || "doc",
    title: overrides.title || "Test Object",
    sourceId: "main",
    project: overrides.project || "test-project",
    filePath: `/content/${overrides.id || "test-object"}.md`,
    relativePath: `${overrides.id || "test-object"}.md`,
    frontmatter: overrides.frontmatter || {},
    body: overrides.body || "",
    mtime: Date.now(),
    visibility: "public",
    ...overrides,
  };
}

const sampleObjects: VaultObject[] = [
  createTestObject({
    id: "ml-intro",
    title: "Introduction to Machine Learning",
    type: "doc",
    project: "tutorials",
    frontmatter: { tags: ["machine-learning", "ai", "tutorial"] },
    body: "Machine learning is a subset of artificial intelligence that enables systems to learn from data.",
  }),
  createTestObject({
    id: "deep-learning-basics",
    title: "Deep Learning Fundamentals",
    type: "doc",
    project: "tutorials",
    frontmatter: { tags: ["deep-learning", "neural-networks", "ai"] },
    body: "Deep learning uses neural networks with multiple layers to extract high-level features from raw input.",
  }),
  createTestObject({
    id: "smith2024",
    title: "Transformer Architecture for NLP",
    type: "bibtex_entry",
    project: "references",
    frontmatter: { tags: ["nlp", "transformers", "attention"], citation_key: "Smith2024" },
    body: "Abstract: We present a novel approach to natural language processing using transformer models.",
  }),
  createTestObject({
    id: "jones2023",
    title: "Data Governance in AI Systems",
    type: "bibtex_entry",
    project: "references",
    frontmatter: { tags: ["data-governance", "ai", "ethics"] },
    body: "This paper explores the challenges of data governance in modern AI systems.",
  }),
  createTestObject({
    id: "python-setup",
    title: "Setting Up Python Environment",
    type: "readme",
    project: "guides",
    frontmatter: { tags: ["python", "setup", "tutorial"] },
    body: "This guide covers how to set up a Python development environment on various operating systems.",
  }),
];

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("SearchIndex", () => {
  describe("Basic Operations", () => {
    it("should create an empty index", () => {
      const index = createEmptySearchIndex();

      expect(index.isEmpty()).toBe(true);
      expect(index.documentCount).toBe(0);
    });

    it("should create an index from objects", () => {
      const index = createSearchIndex(sampleObjects);

      expect(index.isEmpty()).toBe(false);
      expect(index.documentCount).toBe(5);
    });

    it("should add objects individually", () => {
      const index = new SearchIndex();

      index.addObject(sampleObjects[0]);
      expect(index.documentCount).toBe(1);

      index.addObject(sampleObjects[1]);
      expect(index.documentCount).toBe(2);
    });

    it("should update existing objects", () => {
      const index = createSearchIndex(sampleObjects);
      const updatedObject = createTestObject({
        id: "ml-intro",
        title: "Updated: Introduction to ML",
        body: "Updated content about machine learning.",
      });

      index.updateObject(updatedObject);

      expect(index.documentCount).toBe(5);
      const results = index.search("Updated Introduction");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].id).toBe("ml-intro");
    });

    it("should remove objects", () => {
      const index = createSearchIndex(sampleObjects);

      const removed = index.removeObject("ml-intro");
      expect(removed).toBe(true);
      expect(index.documentCount).toBe(4);

      const results = index.search("machine learning");
      expect(results.every((r) => r.id !== "ml-intro")).toBe(true);
    });

    it("should return false when removing non-existent object", () => {
      const index = createSearchIndex(sampleObjects);

      const removed = index.removeObject("non-existent");
      expect(removed).toBe(false);
      expect(index.documentCount).toBe(5);
    });
  });

  describe("Search Functionality", () => {
    let index: SearchIndex;

    beforeEach(() => {
      index = createSearchIndex(sampleObjects);
    });

    it("should search by title", () => {
      const results = index.search("Machine Learning");

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].id).toBe("ml-intro");
    });

    it("should search by body content", () => {
      const results = index.search("neural networks");

      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.id === "deep-learning-basics")).toBe(true);
    });

    it("should search by tags", () => {
      const results = index.search("transformers");

      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.id === "smith2024")).toBe(true);
    });

    it("should search by id", () => {
      const results = index.search("jones2023");

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].id).toBe("jones2023");
    });

    it("should return results with scores", () => {
      const results = index.search("machine learning");

      expect(results.length).toBeGreaterThan(0);
      expect(typeof results[0].score).toBe("number");
      expect(results[0].score).toBeGreaterThan(0);
    });

    it("should return matched terms", () => {
      const results = index.search("machine learning");

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].terms).toBeDefined();
      expect(results[0].terms.length).toBeGreaterThan(0);
    });

    it("should include object metadata", () => {
      const results = index.search("machine learning");

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].object).toBeDefined();
      expect(results[0].object!.type).toBe("doc");
      expect(results[0].object!.project).toBe("tutorials");
    });

    it("should handle empty query", () => {
      const results = index.search("");

      expect(results).toEqual([]);
    });

    it("should handle whitespace-only query", () => {
      const results = index.search("   ");

      expect(results).toEqual([]);
    });

    it("should handle no matches", () => {
      const results = index.search("xyzzy");

      expect(results).toEqual([]);
    });

    it("should boost title matches over body matches", () => {
      // "Python" appears in title of python-setup and in body of ml-intro
      const results = index.search("Python");

      expect(results.length).toBeGreaterThan(0);
      // Title match should rank higher
      expect(results[0].id).toBe("python-setup");
    });
  });

  describe("Search Options", () => {
    let index: SearchIndex;

    beforeEach(() => {
      index = createSearchIndex(sampleObjects);
    });

    it("should limit results", () => {
      const results = index.search("ai", { limit: 2 });

      expect(results.length).toBeLessThanOrEqual(2);
    });

    it("should filter by type", () => {
      const results = index.search("ai", { type: "bibtex_entry" });

      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => r.object?.type === "bibtex_entry")).toBe(true);
    });

    it("should filter by project", () => {
      const results = index.search("ai", { project: "tutorials" });

      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => r.object?.project === "tutorials")).toBe(true);
    });

    it("should combine type and project filters", () => {
      const results = index.search("learning", { type: "doc", project: "tutorials" });

      expect(results.length).toBeGreaterThan(0);
      expect(
        results.every(
          (r) => r.object?.type === "doc" && r.object?.project === "tutorials"
        )
      ).toBe(true);
    });

    it("should support prefix matching", () => {
      const results = index.search("mach", { prefix: true });

      expect(results.length).toBeGreaterThan(0);
      // Should match "machine"
      expect(results.some((r) => r.id === "ml-intro")).toBe(true);
    });

    it("should support fuzzy matching", () => {
      const results = index.search("machin lerning", { fuzzy: 0.2 });

      // Should still find machine learning despite typo
      expect(results.length).toBeGreaterThan(0);
    });

    it("should support custom boost weights", () => {
      const results = index.search("learning", {
        boost: { title: 1, body: 10 },
      });

      // With body boost higher, body matches should rank higher
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe("Query Syntax", () => {
    let index: SearchIndex;

    beforeEach(() => {
      index = createSearchIndex(sampleObjects);
    });

    it("should parse type filter from query", () => {
      // Search for "data" with type filter - should find bibtex entries about data
      const results = index.search("type:bibtex_entry data");

      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => r.object?.type === "bibtex_entry")).toBe(true);
    });

    it("should parse project filter from query", () => {
      // Search for "learning" with project filter
      const results = index.search("project:tutorials learning");

      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => r.object?.project === "tutorials")).toBe(true);
    });

    it("should combine field filter with search term", () => {
      const results = index.search("type:doc learning");

      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => r.object?.type === "doc")).toBe(true);
    });

    it("should handle tag filter in query", () => {
      const results = index.search("tag:nlp");

      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.id === "smith2024")).toBe(true);
    });

    it("should handle tags filter (plural)", () => {
      const results = index.search("tags:ethics");

      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.id === "jones2023")).toBe(true);
    });
  });

  describe("Suggestions", () => {
    let index: SearchIndex;

    beforeEach(() => {
      index = createSearchIndex(sampleObjects);
    });

    it("should suggest completions", () => {
      const suggestions = index.suggest("mach");

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some((s) => s.includes("machine"))).toBe(true);
    });

    it("should limit suggestions", () => {
      const suggestions = index.suggest("a", 3);

      expect(suggestions.length).toBeLessThanOrEqual(3);
    });

    it("should return empty for empty partial", () => {
      const suggestions = index.suggest("");

      expect(suggestions).toEqual([]);
    });
  });

  describe("Serialization", () => {
    it("should serialize and deserialize index", () => {
      const original = createSearchIndex(sampleObjects);
      const serialized = original.serialize();

      expect(typeof serialized).toBe("string");
      expect(serialized.length).toBeGreaterThan(0);

      const restored = SearchIndex.deserialize(serialized);

      expect(restored.documentCount).toBe(original.documentCount);
    });

    it("should preserve search functionality after deserialization", () => {
      const original = createSearchIndex(sampleObjects);
      const serialized = original.serialize();
      const restored = SearchIndex.deserialize(serialized);

      const originalResults = original.search("machine learning");
      const restoredResults = restored.search("machine learning");

      expect(restoredResults.length).toBe(originalResults.length);
      expect(restoredResults[0].id).toBe(originalResults[0].id);
    });

    it("should preserve metadata after deserialization", () => {
      const original = createSearchIndex(sampleObjects);
      const serialized = original.serialize();
      const restored = SearchIndex.deserialize(serialized);

      const results = restored.search("machine learning");

      expect(results[0].object).toBeDefined();
      expect(results[0].object!.type).toBe("doc");
      expect(results[0].object!.project).toBe("tutorials");
    });

    it("should preserve stats after deserialization", () => {
      const original = createSearchIndex(sampleObjects);
      const originalStats = original.getStats();
      const serialized = original.serialize();
      const restored = SearchIndex.deserialize(serialized);
      const restoredStats = restored.getStats();

      expect(restoredStats.documentCount).toBe(originalStats.documentCount);
      expect(restoredStats.lastUpdated).toBe(originalStats.lastUpdated);
    });
  });

  describe("Statistics", () => {
    it("should report correct document count", () => {
      const index = createSearchIndex(sampleObjects);
      const stats = index.getStats();

      expect(stats.documentCount).toBe(5);
    });

    it("should report term count", () => {
      const index = createSearchIndex(sampleObjects);
      const stats = index.getStats();

      expect(stats.termCount).toBeGreaterThan(0);
    });

    it("should track last updated timestamp", () => {
      const before = Date.now();
      const index = createSearchIndex(sampleObjects);
      const after = Date.now();

      const stats = index.getStats();

      expect(stats.lastUpdated).toBeGreaterThanOrEqual(before);
      expect(stats.lastUpdated).toBeLessThanOrEqual(after);
    });

    it("should update timestamp on modifications", () => {
      const index = createSearchIndex(sampleObjects);
      const initialStats = index.getStats();

      // Wait a bit to ensure different timestamp
      const newObject = createTestObject({
        id: "new-object",
        title: "New Object",
      });

      // Add a small delay to ensure different timestamp
      const newTimestamp = Date.now() + 1;
      index.addObject(newObject);

      const updatedStats = index.getStats();

      expect(updatedStats.lastUpdated).toBeGreaterThanOrEqual(initialStats.lastUpdated);
      expect(updatedStats.documentCount).toBe(6);
    });
  });

  describe("Edge Cases", () => {
    it("should handle objects without title", () => {
      const object = createTestObject({
        id: "no-title",
        title: undefined,
        body: "Content without title",
      });

      const index = createSearchIndex([object]);
      const results = index.search("Content");

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].id).toBe("no-title");
    });

    it("should handle objects without body", () => {
      const object = createTestObject({
        id: "no-body",
        title: "Title Only",
        body: "",
      });

      const index = createSearchIndex([object]);
      const results = index.search("Title Only");

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].id).toBe("no-body");
    });

    it("should handle objects without tags", () => {
      const object = createTestObject({
        id: "no-tags",
        title: "No Tags Object",
        frontmatter: {},
      });

      const index = createSearchIndex([object]);
      const results = index.search("No Tags");

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].id).toBe("no-tags");
    });

    it("should handle single string tag", () => {
      const object = createTestObject({
        id: "single-tag",
        title: "Single Tag",
        frontmatter: { tags: "only-one" },
      });

      const index = createSearchIndex([object]);
      const results = index.search("only-one");

      expect(results.length).toBeGreaterThan(0);
    });

    it("should handle special characters in content", () => {
      const object = createTestObject({
        id: "special-chars",
        title: "C++ Programming Guide",
        body: "Learn about pointers (*ptr), references (&ref), and operators (<<, >>).",
      });

      const index = createSearchIndex([object]);
      const results = index.search("pointers references");

      expect(results.length).toBeGreaterThan(0);
    });

    it("should handle unicode content", () => {
      const object = createTestObject({
        id: "unicode",
        title: "机器学习入门",
        body: "这是一个关于机器学习的教程。",
      });

      const index = createSearchIndex([object]);
      const results = index.search("机器学习");

      expect(results.length).toBeGreaterThan(0);
    });

    it("should handle very long content", () => {
      const longBody = "word ".repeat(10000);
      const object = createTestObject({
        id: "long-content",
        title: "Long Document",
        body: longBody + "unique_term_at_end",
      });

      const index = createSearchIndex([object]);
      const results = index.search("unique_term_at_end");

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].id).toBe("long-content");
    });

    it("should handle re-indexing", () => {
      const index = createSearchIndex(sampleObjects);
      expect(index.documentCount).toBe(5);

      // Re-index with fewer objects
      index.indexAll(sampleObjects.slice(0, 2));
      expect(index.documentCount).toBe(2);

      const results = index.search("machine learning");
      expect(results.length).toBeGreaterThan(0);
    });
  });
});
