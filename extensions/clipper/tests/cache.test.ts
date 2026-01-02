import { describe, it, expect, beforeEach } from "bun:test";

/**
 * Cache module tests
 *
 * Note: IndexedDB is not available in Bun test environment.
 * The cache module gracefully falls back to memory-only mode,
 * so we test the memory cache behavior here.
 */

// Import the cache module - will use memory-only mode since no IndexedDB
import {
  getCached,
  setCache,
  clearCache,
  getCacheStats,
} from "../src/lib/cache.js";

describe("cache module (memory mode)", () => {
  beforeEach(async () => {
    await clearCache();
  });

  describe("setCache and getCached", () => {
    it("stores and retrieves data", async () => {
      const testData = { title: "Test Paper", year: 2024 };
      await setCache("https://api.example.com/paper/1", testData);

      const cached = await getCached<typeof testData>(
        "https://api.example.com/paper/1"
      );
      expect(cached).toEqual(testData);
    });

    it("returns null for missing keys", async () => {
      const cached = await getCached("https://api.example.com/nonexistent");
      expect(cached).toBeNull();
    });

    it("respects TTL expiration", async () => {
      const testData = { title: "Expiring Paper" };
      await setCache("https://api.example.com/paper/2", testData);

      // Should exist with default TTL (10 min)
      let cached = await getCached<typeof testData>(
        "https://api.example.com/paper/2"
      );
      expect(cached).toEqual(testData);

      // Should be "expired" with 0ms TTL
      cached = await getCached<typeof testData>(
        "https://api.example.com/paper/2",
        0
      );
      expect(cached).toBeNull();
    });

    it("handles complex nested data", async () => {
      const testData = {
        paper: {
          title: "Complex Paper",
          authors: [{ name: "Alice" }, { name: "Bob" }],
          metadata: { doi: "10.1234/test", year: 2024 },
        },
      };
      await setCache("https://api.example.com/complex", testData);

      const cached = await getCached<typeof testData>(
        "https://api.example.com/complex"
      );
      expect(cached).toEqual(testData);
      expect(cached?.paper.authors).toHaveLength(2);
    });
  });

  describe("clearCache", () => {
    it("removes all cached entries", async () => {
      await setCache("https://api.example.com/1", { id: 1 });
      await setCache("https://api.example.com/2", { id: 2 });

      // Verify data exists
      expect(await getCached("https://api.example.com/1")).not.toBeNull();
      expect(await getCached("https://api.example.com/2")).not.toBeNull();

      // Clear and verify
      await clearCache();
      expect(await getCached("https://api.example.com/1")).toBeNull();
      expect(await getCached("https://api.example.com/2")).toBeNull();
    });
  });

  describe("getCacheStats", () => {
    it("returns memory entry count", async () => {
      const initialStats = await getCacheStats();
      expect(initialStats.memoryEntries).toBe(0);

      await setCache("https://api.example.com/stats-1", { id: 1 });
      await setCache("https://api.example.com/stats-2", { id: 2 });

      const stats = await getCacheStats();
      expect(stats.memoryEntries).toBe(2);
    });
  });

  describe("cache key handling", () => {
    it("treats different URLs as different keys", async () => {
      await setCache("https://dblp.org/search?q=paper1", { title: "Paper 1" });
      await setCache("https://dblp.org/search?q=paper2", { title: "Paper 2" });

      const cached1 = await getCached<{ title: string }>(
        "https://dblp.org/search?q=paper1"
      );
      const cached2 = await getCached<{ title: string }>(
        "https://dblp.org/search?q=paper2"
      );

      expect(cached1?.title).toBe("Paper 1");
      expect(cached2?.title).toBe("Paper 2");
    });

    it("handles URLs with special characters", async () => {
      const url =
        "https://api.example.com/search?q=machine%20learning&year=2024";
      await setCache(url, { query: "machine learning" });

      const cached = await getCached<{ query: string }>(url);
      expect(cached?.query).toBe("machine learning");
    });

    it("overwrites existing entries with same key", async () => {
      const url = "https://api.example.com/paper";
      await setCache(url, { version: 1 });
      await setCache(url, { version: 2 });

      const cached = await getCached<{ version: number }>(url);
      expect(cached?.version).toBe(2);
    });
  });
});
