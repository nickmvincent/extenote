import { describe, it, expect, beforeEach, mock } from "bun:test";
import type { VaultObject, VaultState, ExtenoteConfig, LoadedSchema } from "@extenote/core";

// Mock the core module before importing cache
const mockVaultObjects: VaultObject[] = [
  {
    id: "test-object-1",
    type: "doc",
    title: "Test Object 1",
    sourceId: "main",
    project: "test-project",
    filePath: "/path/to/test-object-1.md",
    relativePath: "test-object-1.md",
    frontmatter: { title: "Test Object 1", tags: ["test"] },
    body: "This is the body content that should be stripped from cache.",
    mtime: Date.now(),
    visibility: "public",
  },
  {
    id: "test-object-2",
    type: "bibtex_entry",
    title: "Test Paper",
    sourceId: "refs",
    project: "shared-references",
    filePath: "/path/to/test-object-2.md",
    relativePath: "test-object-2.md",
    frontmatter: { title: "Test Paper", citation_key: "Smith2024", tags: ["research"] },
    body: "Another body that takes up memory and should be stripped.",
    mtime: Date.now(),
    visibility: "public",
  },
];

const mockConfig: ExtenoteConfig = {
  schemaDir: "schemas",
  sources: [{ id: "main", type: "local", root: "./content" }],
  sites: [],
  lint: { rules: {} },
};

const mockVaultState: VaultState = {
  objects: mockVaultObjects,
  config: mockConfig,
  issues: [],
};

const mockSchemas: LoadedSchema[] = [
  {
    name: "doc",
    fields: {},
    filePath: "schemas/doc.yaml",
  },
];

const mockSettings = {
  cache: { ttl: 30000, enabled: true },
};

// Track call counts for mocks
let loadVaultCallCount = 0;
let loadSettingsCallCount = 0;

mock.module("@extenote/core", () => ({
  loadVault: async () => {
    loadVaultCallCount++;
    return mockVaultState;
  },
  loadConfig: async () => mockConfig,
  loadSchemas: async () => mockSchemas,
  loadSettings: () => {
    loadSettingsCallCount++;
    return mockSettings;
  },
  computeAllCrossRefs: (objects: VaultObject[]) => {
    const map = new Map();
    for (const obj of objects) {
      map.set(obj.id, { id: obj.id, outgoingLinks: [], backlinks: [] });
    }
    return map;
  },
  DEFAULT_CACHE_TTL: 30000,
}));

// Import after mocking
import {
  loadVaultBundle,
  invalidateVaultCache,
  invalidateSettingsCache,
  getCrossRefs,
  getCacheStatus,
  type CachedVaultObject,
  type CachedVaultState,
  type CachedBundle,
} from "../server/cache";

describe("Cache Memory Optimizations", () => {
  beforeEach(() => {
    // Reset cache state between tests
    invalidateVaultCache();
    invalidateSettingsCache();
    loadVaultCallCount = 0;
    loadSettingsCallCount = 0;
  });

  describe("Body Stripping", () => {
    it("should strip body field from cached vault objects", async () => {
      const bundle = await loadVaultBundle("/test/cwd");

      // Verify objects exist
      expect(bundle.vault.objects.length).toBe(2);

      // Verify body is stripped (undefined, not empty string)
      for (const obj of bundle.vault.objects) {
        expect("body" in obj).toBe(false);
      }
    });

    it("should preserve all other object fields", async () => {
      const bundle = await loadVaultBundle("/test/cwd");
      const cachedObj = bundle.vault.objects[0];

      expect(cachedObj.id).toBe("test-object-1");
      expect(cachedObj.type).toBe("doc");
      expect(cachedObj.title).toBe("Test Object 1");
      expect(cachedObj.sourceId).toBe("main");
      expect(cachedObj.project).toBe("test-project");
      expect(cachedObj.filePath).toBe("/path/to/test-object-1.md");
      expect(cachedObj.relativePath).toBe("test-object-1.md");
      expect(cachedObj.frontmatter).toEqual({ title: "Test Object 1", tags: ["test"] });
      expect(cachedObj.visibility).toBe("public");
    });

    it("should preserve vault issues in cache", async () => {
      const bundle = await loadVaultBundle("/test/cwd");
      expect(bundle.vault.issues).toEqual([]);
    });
  });

  describe("Cache Reuse", () => {
    it("should reuse cached bundle on subsequent calls", async () => {
      // First call
      await loadVaultBundle("/test/cwd");
      expect(loadVaultCallCount).toBe(1);

      // Second call should use cache
      await loadVaultBundle("/test/cwd");
      expect(loadVaultCallCount).toBe(1);

      // Third call should still use cache
      await loadVaultBundle("/test/cwd");
      expect(loadVaultCallCount).toBe(1);
    });

    it("should reload vault when forceReload is true", async () => {
      await loadVaultBundle("/test/cwd");
      expect(loadVaultCallCount).toBe(1);

      await loadVaultBundle("/test/cwd", true);
      expect(loadVaultCallCount).toBe(2);
    });

    it("should reload vault after invalidation", async () => {
      await loadVaultBundle("/test/cwd");
      expect(loadVaultCallCount).toBe(1);

      invalidateVaultCache();

      await loadVaultBundle("/test/cwd");
      expect(loadVaultCallCount).toBe(2);
    });
  });

  describe("Lazy Cross-References", () => {
    it("should not include crossRefs in cached bundle", async () => {
      const bundle = await loadVaultBundle("/test/cwd");

      // crossRefs should not be in the bundle anymore
      expect("crossRefs" in bundle).toBe(false);
    });

    it("should compute cross-refs lazily via getCrossRefs", async () => {
      // First load bundle (no cross-refs computed yet)
      await loadVaultBundle("/test/cwd");
      const initialLoadCount = loadVaultCallCount;

      // Get cross-refs (should trigger full vault load for body access)
      const crossRefs = await getCrossRefs("/test/cwd");

      expect(crossRefs).toBeInstanceOf(Map);
      expect(crossRefs.size).toBe(2);
      expect(crossRefs.has("test-object-1")).toBe(true);
      expect(crossRefs.has("test-object-2")).toBe(true);
    });

    it("should cache cross-refs after first computation", async () => {
      await loadVaultBundle("/test/cwd");

      // First cross-refs call
      await getCrossRefs("/test/cwd");
      const countAfterFirst = loadVaultCallCount;

      // Second call should use cached cross-refs
      await getCrossRefs("/test/cwd");
      expect(loadVaultCallCount).toBe(countAfterFirst);
    });

    it("should invalidate cross-refs cache with vault cache", async () => {
      await loadVaultBundle("/test/cwd");
      await getCrossRefs("/test/cwd");

      invalidateVaultCache();

      // After invalidation, need to reload
      await loadVaultBundle("/test/cwd");
      await getCrossRefs("/test/cwd");

      // Should have loaded vault twice (once for each bundle load)
      // Plus once for each getCrossRefs call
      expect(loadVaultCallCount).toBeGreaterThan(2);
    });
  });

  describe("Settings Caching", () => {
    it("should cache settings and not reload on every access", async () => {
      // Trigger settings load via loadVaultBundle
      await loadVaultBundle("/test/cwd");
      const initialSettingsCount = loadSettingsCallCount;

      // Subsequent calls should use cached settings
      await loadVaultBundle("/test/cwd", true);
      await loadVaultBundle("/test/cwd", true);

      // Settings should only be loaded once (cached for 1 minute)
      expect(loadSettingsCallCount).toBe(initialSettingsCount);
    });

    it("should expose invalidateSettingsCache function", () => {
      // Verify the invalidation function exists and can be called
      expect(typeof invalidateSettingsCache).toBe("function");

      // Should not throw when called
      expect(() => invalidateSettingsCache()).not.toThrow();
    });
  });

  describe("Cache Status", () => {
    it("should report cache status correctly when empty", () => {
      invalidateVaultCache();
      const status = getCacheStatus();

      expect(status.cached).toBe(false);
      expect(status.age).toBeNull();
      expect(status.objectCount).toBeNull();
    });

    it("should report cache status correctly when populated", async () => {
      await loadVaultBundle("/test/cwd");
      const status = getCacheStatus();

      expect(status.cached).toBe(true);
      expect(status.age).toBeGreaterThanOrEqual(0);
      expect(status.objectCount).toBe(2);
      expect(status.isStale).toBe(false);
    });
  });

  describe("Type Safety", () => {
    it("CachedVaultObject should not have body field", async () => {
      const bundle = await loadVaultBundle("/test/cwd");
      const obj: CachedVaultObject = bundle.vault.objects[0];

      // TypeScript should prevent accessing body
      // At runtime, body should be undefined
      expect((obj as any).body).toBeUndefined();
    });

    it("CachedBundle should not have crossRefs field", async () => {
      const bundle = await loadVaultBundle("/test/cwd");

      // crossRefs removed from bundle type
      expect((bundle as any).crossRefs).toBeUndefined();
    });
  });
});

describe("Cache Memory Savings Estimation", () => {
  it("should demonstrate memory savings from body stripping", async () => {
    const bundle = await loadVaultBundle("/test/cwd");

    // Calculate what the original body sizes would have been
    const originalBodySizes = mockVaultObjects.reduce(
      (sum, obj) => sum + (obj.body?.length || 0),
      0
    );

    // Cached objects have no body
    const cachedBodySizes = bundle.vault.objects.reduce(
      (sum, obj) => sum + ((obj as any).body?.length || 0),
      0
    );

    expect(originalBodySizes).toBeGreaterThan(0);
    expect(cachedBodySizes).toBe(0);

    // Log the savings for visibility
    console.log(`Memory saved by stripping bodies: ${originalBodySizes} bytes`);
  });
});
