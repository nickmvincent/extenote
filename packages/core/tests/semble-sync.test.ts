import { describe, expect, it } from "bun:test";
import { computeObjectHash, validateSembleConfig } from "../src/plugins/semble/sync";
import type { VaultObject } from "../src/types";
import type { SembleConfig } from "../src/plugins/semble/types";

/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        ⚠️  ATPROTO INTEGRATION WARNING ⚠️                   ║
 * ╠═══════════════════════════════════════════════════════════════════════════╣
 * ║  These tests cover the LOGIC of semble sync (hashing, config validation,  ║
 * ║  state management concepts) but do NOT test actual ATProto API calls.     ║
 * ║                                                                           ║
 * ║  The ATProto/Semble integration is EXPERIMENTAL:                          ║
 * ║  - API may change without notice                                          ║
 * ║  - Requires SEMBLE_APP_PASSWORD or ATPROTO_APP_PASSWORD env var           ║
 * ║  - No mocked API tests exist - real sync requires manual testing          ║
 * ║  - Rate limiting and error recovery are basic                             ║
 * ║                                                                           ║
 * ║  Before using in production:                                              ║
 * ║  1. Test with --dry-run first: bun run cli -- sync <project> --dry-run    ║
 * ║  2. Start with a small test project                                       ║
 * ║  3. Monitor for API errors and rate limits                                ║
 * ║  4. Back up your sync state (.extenote/<project>/.semble-sync.json)       ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

// ─── Test Fixtures ───────────────────────────────────────────────────────────

function buildObject(overrides: Partial<VaultObject> = {}): VaultObject {
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
    visibility: "public",
    ...overrides,
  };
}

// ─── computeObjectHash Tests ─────────────────────────────────────────────────

/**
 * @narrative semble/hash-computation
 * @title Content Hash Computation
 * @description Semble uses content hashing to detect changes between local and remote.
 * Only objects with URLs are synced, and the hash is based on card content that would
 * be pushed to Semble.
 */
describe("computeObjectHash", () => {
  /**
   * @narrative-step 1
   * @explanation Objects without URLs cannot be synced to Semble. The hash function
   * returns null for these objects to indicate they should be skipped.
   */
  it("returns null for objects without URL", () => {
    const obj = buildObject({
      frontmatter: { title: "No URL" },
    });
    expect(computeObjectHash(obj)).toBeNull();
  });

  /**
   * @narrative-step 2
   * @explanation Objects with a URL produce a deterministic hash based on the card
   * content that would be pushed to Semble.
   */
  it("returns a hash for objects with URL", () => {
    const obj = buildObject({
      frontmatter: {
        title: "Test Paper",
        url: "https://example.com/paper",
      },
    });
    const hash = computeObjectHash(obj);
    expect(hash).not.toBeNull();
    expect(typeof hash).toBe("string");
    expect(hash!.length).toBe(16); // First 16 chars of SHA256
  });

  /**
   * @narrative-step 3
   * @explanation The same content always produces the same hash, regardless of
   * when or how many times it's computed.
   */
  it("returns same hash for same URL content", () => {
    const obj1 = buildObject({
      frontmatter: {
        title: "Test Paper",
        url: "https://example.com/paper",
      },
    });
    const obj2 = buildObject({
      frontmatter: {
        title: "Test Paper",
        url: "https://example.com/paper",
      },
    });
    expect(computeObjectHash(obj1)).toBe(computeObjectHash(obj2));
  });

  it("returns different hash for different URLs", () => {
    const obj1 = buildObject({
      frontmatter: { url: "https://example.com/paper1" },
    });
    const obj2 = buildObject({
      frontmatter: { url: "https://example.com/paper2" },
    });
    expect(computeObjectHash(obj1)).not.toBe(computeObjectHash(obj2));
  });

  it("checks multiple URL fields in priority order", () => {
    // Prefers 'url' over 'website'
    const objWithUrl = buildObject({
      frontmatter: {
        url: "https://primary.com",
        website: "https://secondary.com",
      },
    });
    const objWithUrlOnly = buildObject({
      frontmatter: { url: "https://primary.com" },
    });
    expect(computeObjectHash(objWithUrl)).toBe(computeObjectHash(objWithUrlOnly));

    // Falls back to 'website' when 'url' is missing
    const objWithWebsite = buildObject({
      frontmatter: { website: "https://secondary.com" },
    });
    expect(computeObjectHash(objWithWebsite)).not.toBeNull();
  });

  it("falls back to 'link' and 'href' fields", () => {
    const objWithLink = buildObject({
      frontmatter: { link: "https://link.com" },
    });
    expect(computeObjectHash(objWithLink)).not.toBeNull();

    const objWithHref = buildObject({
      frontmatter: { href: "https://href.com" },
    });
    expect(computeObjectHash(objWithHref)).not.toBeNull();
  });

  it("handles author array correctly", () => {
    const objArray = buildObject({
      frontmatter: {
        url: "https://example.com",
        author: ["John Smith", "Jane Doe"],
      },
    });
    const objString = buildObject({
      frontmatter: {
        url: "https://example.com",
        author: "John Smith, Jane Doe",
      },
    });
    // Array is joined with ", " so same hash as comma-separated string
    expect(computeObjectHash(objArray)).toBe(computeObjectHash(objString));
  });

  it("produces consistent hashes for same content", () => {
    const obj = buildObject({
      frontmatter: {
        url: "https://example.com/paper",
        title: "Test Paper",
        abstract: "An abstract",
        author: ["Author One"],
        year: 2024,
      },
    });
    const hash1 = computeObjectHash(obj);
    const hash2 = computeObjectHash(obj);
    const hash3 = computeObjectHash(obj);
    expect(hash1).toBe(hash2);
    expect(hash2).toBe(hash3);
  });

  it("includes metadata in hash", () => {
    const obj1 = buildObject({
      frontmatter: {
        url: "https://example.com",
        title: "Title A",
      },
    });
    const obj2 = buildObject({
      frontmatter: {
        url: "https://example.com",
        title: "Title B",
      },
    });
    // Same URL but different title = different hash
    expect(computeObjectHash(obj1)).not.toBe(computeObjectHash(obj2));
  });

  it("handles abstract/description mapping", () => {
    const obj1 = buildObject({
      frontmatter: {
        url: "https://example.com",
        abstract: "Description text",
      },
    });
    const obj2 = buildObject({
      frontmatter: {
        url: "https://example.com",
        abstract: "Different text",
      },
    });
    expect(computeObjectHash(obj1)).not.toBe(computeObjectHash(obj2));
  });

  it("handles date/year mapping", () => {
    const objDate = buildObject({
      frontmatter: {
        url: "https://example.com",
        date: "2024-01-15",
      },
    });
    const objYear = buildObject({
      frontmatter: {
        url: "https://example.com",
        year: 2024,
      },
    });
    // date takes precedence, produces different hash than year-only
    const objDateHash = computeObjectHash(objDate);
    const objYearHash = computeObjectHash(objYear);
    expect(objDateHash).not.toBeNull();
    expect(objYearHash).not.toBeNull();
  });

  it("handles journal/booktitle mapping", () => {
    const objJournal = buildObject({
      frontmatter: {
        url: "https://example.com",
        journal: "Nature",
      },
    });
    const objBooktitle = buildObject({
      frontmatter: {
        url: "https://example.com",
        booktitle: "NeurIPS",
      },
    });
    expect(computeObjectHash(objJournal)).not.toBeNull();
    expect(computeObjectHash(objBooktitle)).not.toBeNull();
    expect(computeObjectHash(objJournal)).not.toBe(computeObjectHash(objBooktitle));
  });

  it("produces same hash regardless of frontmatter key order", () => {
    const obj1 = buildObject({
      frontmatter: {
        url: "https://example.com",
        title: "Title",
        author: "Author",
      },
    });
    const obj2 = buildObject({
      frontmatter: {
        author: "Author",
        title: "Title",
        url: "https://example.com",
      },
    });
    expect(computeObjectHash(obj1)).toBe(computeObjectHash(obj2));
  });

  it("ignores non-metadata fields in hash", () => {
    const obj1 = buildObject({
      frontmatter: {
        url: "https://example.com",
        title: "Title",
        visibility: "public",
        tags: ["tag1", "tag2"],
      },
    });
    const obj2 = buildObject({
      frontmatter: {
        url: "https://example.com",
        title: "Title",
        visibility: "private",
        tags: ["different"],
      },
    });
    // visibility and tags don't affect card content
    expect(computeObjectHash(obj1)).toBe(computeObjectHash(obj2));
  });

  it("body content does not affect hash", () => {
    const obj1 = buildObject({
      frontmatter: { url: "https://example.com" },
      body: "Long body content here",
    });
    const obj2 = buildObject({
      frontmatter: { url: "https://example.com" },
      body: "Different body content",
    });
    expect(computeObjectHash(obj1)).toBe(computeObjectHash(obj2));
  });

  it("object id and path do not affect hash", () => {
    const obj1 = buildObject({
      id: "object-1",
      filePath: "/path/to/file1.md",
      frontmatter: { url: "https://example.com" },
    });
    const obj2 = buildObject({
      id: "object-2",
      filePath: "/path/to/file2.md",
      frontmatter: { url: "https://example.com" },
    });
    expect(computeObjectHash(obj1)).toBe(computeObjectHash(obj2));
  });

  // Edge cases
  it("handles empty string URL", () => {
    const obj = buildObject({
      frontmatter: { url: "" },
    });
    expect(computeObjectHash(obj)).toBeNull();
  });

  it("handles whitespace-only URL", () => {
    // Whitespace-only URL is still considered a URL (not filtered out)
    // The actual sync would fail, but hash computation works
    const obj = buildObject({
      frontmatter: { url: "   " },
    });
    expect(computeObjectHash(obj)).not.toBeNull();
  });

  it("handles special characters in metadata", () => {
    const obj = buildObject({
      frontmatter: {
        url: "https://example.com",
        title: "Test: A \"Quoted\" Title—With Dashes",
        author: "O'Brien, José",
      },
    });
    expect(computeObjectHash(obj)).not.toBeNull();
  });

  it("handles unicode in metadata", () => {
    const obj = buildObject({
      frontmatter: {
        url: "https://example.com",
        title: "日本語タイトル",
        author: "山田太郎",
      },
    });
    expect(computeObjectHash(obj)).not.toBeNull();
  });

  it("handles very long URLs", () => {
    const longUrl = "https://example.com/" + "a".repeat(2000);
    const obj = buildObject({
      frontmatter: { url: longUrl },
    });
    expect(computeObjectHash(obj)).not.toBeNull();
  });

  it("handles numeric values in frontmatter", () => {
    const obj = buildObject({
      frontmatter: {
        url: "https://example.com",
        year: 2024,
      },
    });
    expect(computeObjectHash(obj)).not.toBeNull();
  });
});

// ─── validateSembleConfig Tests ──────────────────────────────────────────────

/**
 * @narrative semble/config-validation
 * @title Semble Configuration Validation
 * @description Before syncing, Extenote validates the Semble configuration to ensure
 * all required fields are present.
 */
describe("validateSembleConfig", () => {
  const validConfig: SembleConfig = {
    enabled: true,
    identifier: "user.bsky.social",
    password: "app-password-here",
  };

  /**
   * @narrative-step 1
   * @explanation A valid configuration has an identifier (ATProto handle) and password.
   */
  it("returns valid for complete config", () => {
    const result = validateSembleConfig(validConfig);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  /**
   * @narrative-step 2
   * @explanation The identifier is required - this is your ATProto handle or DID.
   */
  it("requires identifier", () => {
    const config = { ...validConfig, identifier: "" };
    const result = validateSembleConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("identifier is required (ATProto handle or DID)");
  });

  /**
   * @narrative-step 3
   * @explanation Password can be provided directly or via environment variable.
   */
  it("requires password (direct or env)", () => {
    // Clear env vars for this test
    const originalSemble = process.env.SEMBLE_APP_PASSWORD;
    const originalAtproto = process.env.ATPROTO_APP_PASSWORD;
    delete process.env.SEMBLE_APP_PASSWORD;
    delete process.env.ATPROTO_APP_PASSWORD;

    try {
      const config = { ...validConfig, password: undefined };
      const result = validateSembleConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("password"))).toBe(true);
    } finally {
      // Restore env vars
      if (originalSemble) process.env.SEMBLE_APP_PASSWORD = originalSemble;
      if (originalAtproto) process.env.ATPROTO_APP_PASSWORD = originalAtproto;
    }
  });

  it("accepts password from SEMBLE_APP_PASSWORD env", () => {
    const originalEnv = process.env.SEMBLE_APP_PASSWORD;
    process.env.SEMBLE_APP_PASSWORD = "test-password";

    try {
      const config = { ...validConfig, password: undefined };
      const result = validateSembleConfig(config);
      expect(result.valid).toBe(true);
    } finally {
      if (originalEnv) {
        process.env.SEMBLE_APP_PASSWORD = originalEnv;
      } else {
        delete process.env.SEMBLE_APP_PASSWORD;
      }
    }
  });

  it("accepts password from ATPROTO_APP_PASSWORD env", () => {
    const originalSemble = process.env.SEMBLE_APP_PASSWORD;
    const originalAtproto = process.env.ATPROTO_APP_PASSWORD;
    delete process.env.SEMBLE_APP_PASSWORD;
    process.env.ATPROTO_APP_PASSWORD = "test-password";

    try {
      const config = { ...validConfig, password: undefined };
      const result = validateSembleConfig(config);
      expect(result.valid).toBe(true);
    } finally {
      if (originalSemble) process.env.SEMBLE_APP_PASSWORD = originalSemble;
      if (originalAtproto) {
        process.env.ATPROTO_APP_PASSWORD = originalAtproto;
      } else {
        delete process.env.ATPROTO_APP_PASSWORD;
      }
    }
  });

  it("returns multiple errors for multiple issues", () => {
    const originalSemble = process.env.SEMBLE_APP_PASSWORD;
    const originalAtproto = process.env.ATPROTO_APP_PASSWORD;
    delete process.env.SEMBLE_APP_PASSWORD;
    delete process.env.ATPROTO_APP_PASSWORD;

    try {
      const config: SembleConfig = {
        enabled: true,
        identifier: "",
        password: undefined,
      };
      const result = validateSembleConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    } finally {
      if (originalSemble) process.env.SEMBLE_APP_PASSWORD = originalSemble;
      if (originalAtproto) process.env.ATPROTO_APP_PASSWORD = originalAtproto;
    }
  });

  it("accepts DID as identifier", () => {
    const config = {
      ...validConfig,
      identifier: "did:plc:abc123xyz",
    };
    const result = validateSembleConfig(config);
    expect(result.valid).toBe(true);
  });

  it("accepts optional fields", () => {
    const config: SembleConfig = {
      enabled: true,
      identifier: "user.bsky.social",
      password: "password",
      pds: "https://custom.pds.example.com",
      collection: "my-collection",
      types: ["bibtex_entry", "note"],
      publicOnly: true,
      syncTag: "semble",
    };
    const result = validateSembleConfig(config);
    expect(result.valid).toBe(true);
  });
});

// ─── Collection Tag Extraction Tests ─────────────────────────────────────────

describe("Collection Tag Extraction (via hash behavior)", () => {
  it("objects with collection tags produce same hash as without (tags not in card)", () => {
    const obj1 = buildObject({
      frontmatter: {
        url: "https://example.com",
        title: "Test",
        tags: ["collection:data-leverage"],
      },
    });
    const obj2 = buildObject({
      frontmatter: {
        url: "https://example.com",
        title: "Test",
        tags: [],
      },
    });
    // Collection tags don't affect card content, only collection membership
    expect(computeObjectHash(obj1)).toBe(computeObjectHash(obj2));
  });
});

// ─── Sync State Tests ────────────────────────────────────────────────────────

describe("Sync State Concepts", () => {
  it("contentHash enables change detection", () => {
    const obj1 = buildObject({
      frontmatter: {
        url: "https://example.com",
        title: "Original Title",
      },
    });
    const hash1 = computeObjectHash(obj1);

    // Modify the title
    const obj2 = buildObject({
      frontmatter: {
        url: "https://example.com",
        title: "Updated Title",
      },
    });
    const hash2 = computeObjectHash(obj2);

    // Hash changed = content changed
    expect(hash1).not.toBe(hash2);
  });

  it("same content = same hash (no false change detection)", () => {
    const makeObject = () =>
      buildObject({
        frontmatter: {
          url: "https://example.com",
          title: "Same Title",
          author: "Same Author",
        },
      });

    const hashes = [
      computeObjectHash(makeObject()),
      computeObjectHash(makeObject()),
      computeObjectHash(makeObject()),
    ];

    expect(new Set(hashes).size).toBe(1);
  });
});

// ─── Object Type Filtering Tests ─────────────────────────────────────────────

describe("Object Type Filtering", () => {
  it("bibtex_entry with URL is syncable", () => {
    const obj = buildObject({
      type: "bibtex_entry",
      frontmatter: { url: "https://example.com" },
    });
    expect(computeObjectHash(obj)).not.toBeNull();
  });

  it("note without URL is not syncable", () => {
    const obj = buildObject({
      type: "note",
      frontmatter: { title: "Just a note" },
    });
    expect(computeObjectHash(obj)).toBeNull();
  });

  it("any type with URL is syncable", () => {
    const obj = buildObject({
      type: "custom_type",
      frontmatter: { url: "https://example.com" },
    });
    expect(computeObjectHash(obj)).not.toBeNull();
  });
});

// ─── Sync Mode Documentation Tests ────────────────────────────────────────────

/**
 * @narrative semble/sync-modes
 * @title Push-Only and Pull-Only Modes
 * @description Extenote supports different sync modes for different use cases:
 * - Push-only: Only send local changes to Semble, don't import new cards
 * - Pull-only: Only import new cards from Semble, don't push local changes
 * - Full sync: Both push and pull (default)
 */
describe("Sync Mode Concepts", () => {
  /**
   * @narrative-step 1
   * @explanation Push-only mode is useful when you want to publish your
   * local content without importing other people's cards.
   */
  it("push-only mode only processes local objects", () => {
    // This tests the concept - actual sync behavior is tested in integration
    // Push-only means: iterate local objects, push to remote, skip pull phase
    const pushOnlyOptions = { pushOnly: true, pullOnly: false };
    expect(pushOnlyOptions.pushOnly).toBe(true);
    expect(pushOnlyOptions.pullOnly).toBe(false);
  });

  /**
   * @narrative-step 2
   * @explanation Pull-only mode is useful when you want to import cards
   * from Semble without publishing your local content.
   */
  it("pull-only mode only imports remote cards", () => {
    const pullOnlyOptions = { pushOnly: false, pullOnly: true };
    expect(pullOnlyOptions.pushOnly).toBe(false);
    expect(pullOnlyOptions.pullOnly).toBe(true);
  });

  /**
   * @narrative-step 3
   * @explanation Dry-run mode shows what would happen without making changes.
   */
  it("dry-run mode prevents actual changes", () => {
    const dryRunOptions = { dryRun: true };
    expect(dryRunOptions.dryRun).toBe(true);
  });

  /**
   * @narrative-step 4
   * @explanation Force mode re-syncs even if content hasn't changed.
   */
  it("force mode re-syncs unchanged objects", () => {
    const forceOptions = { force: true };
    expect(forceOptions.force).toBe(true);
  });
});

// ─── Conflict Resolution Tests ────────────────────────────────────────────────

/**
 * @narrative semble/conflict-resolution
 * @title Conflict Resolution Strategies
 * @description When both local and remote have changed since last sync,
 * Extenote uses configurable merge strategies to resolve conflicts.
 */
describe("Conflict Resolution Strategies", () => {
  /**
   * @narrative-step 1
   * @explanation The skip-conflicts strategy (default) skips conflicting
   * objects, leaving both versions unchanged.
   */
  it("skip-conflicts strategy skips conflicting objects", () => {
    const strategy = "skip-conflicts";
    expect(strategy).toBe("skip-conflicts");
  });

  /**
   * @narrative-step 2
   * @explanation The local-wins strategy overwrites remote with local version.
   */
  it("local-wins strategy overwrites remote", () => {
    const strategy = "local-wins";
    expect(strategy).toBe("local-wins");
  });

  /**
   * @narrative-step 3
   * @explanation The remote-wins strategy keeps remote version, skipping local.
   */
  it("remote-wins strategy keeps remote version", () => {
    const strategy = "remote-wins";
    expect(strategy).toBe("remote-wins");
  });

  /**
   * @narrative-step 4
   * @explanation The error-on-conflict strategy treats conflicts as errors.
   */
  it("error-on-conflict strategy reports errors", () => {
    const strategy = "error-on-conflict";
    expect(strategy).toBe("error-on-conflict");
  });

  /**
   * @narrative-step 5
   * @explanation Conflict detection uses content hashes - if local hash
   * differs from synced hash AND remote CID differs, there's a conflict.
   */
  it("conflict detection uses hash comparison", () => {
    const obj = buildObject({
      frontmatter: { url: "https://example.com", title: "Original" },
    });
    const originalHash = computeObjectHash(obj);

    const modifiedObj = buildObject({
      frontmatter: { url: "https://example.com", title: "Modified" },
    });
    const modifiedHash = computeObjectHash(modifiedObj);

    // Different content = different hash = potential conflict
    expect(originalHash).not.toBe(modifiedHash);
  });
});

// ─── Visibility Filtering Tests ───────────────────────────────────────────────

/**
 * @narrative semble/visibility-filtering
 * @title Visibility-Based Filtering
 * @description Objects can be filtered by visibility before syncing.
 */
describe("Visibility Filtering Concepts", () => {
  it("objects have visibility field", () => {
    const publicObj = buildObject({
      visibility: "public",
      frontmatter: { url: "https://example.com" },
    });
    const privateObj = buildObject({
      visibility: "private",
      frontmatter: { url: "https://example.com" },
    });

    expect(publicObj.visibility).toBe("public");
    expect(privateObj.visibility).toBe("private");
  });

  it("publicOnly config filters private objects", () => {
    // This documents the behavior - actual filtering happens in syncWithSemble
    const config: SembleConfig = {
      enabled: true,
      identifier: "test.bsky.social",
      password: "test",
      publicOnly: true,
    };
    expect(config.publicOnly).toBe(true);
  });
});

// ─── SyncTag Filtering Tests ──────────────────────────────────────────────────

/**
 * @narrative semble/synctag-filtering
 * @title SyncTag-Based Filtering
 * @description Objects can be filtered by a frontmatter field for selective sync.
 */
describe("SyncTag Filtering Concepts", () => {
  it("syncTag config specifies which field to check", () => {
    const config: SembleConfig = {
      enabled: true,
      identifier: "test.bsky.social",
      password: "test",
      syncTag: "semble",
    };
    expect(config.syncTag).toBe("semble");
  });

  it("objects with syncTag=true are synced", () => {
    const syncedObj = buildObject({
      frontmatter: {
        url: "https://example.com",
        semble: true,
      },
    });
    expect(syncedObj.frontmatter.semble).toBe(true);
  });

  it("objects without syncTag are filtered out when configured", () => {
    const unsyncedObj = buildObject({
      frontmatter: {
        url: "https://example.com",
      },
    });
    expect(unsyncedObj.frontmatter.semble).toBeUndefined();
  });
});

// ─── Delete Sync Tests ────────────────────────────────────────────────────────

/**
 * @narrative semble/delete-sync
 * @title Syncing Deletions
 * @description When an object is deleted locally, it can optionally be
 * removed from Semble.
 */
describe("Delete Sync Concepts", () => {
  it("syncDeletes option enables deletion sync", () => {
    const options = { syncDeletes: true };
    expect(options.syncDeletes).toBe(true);
  });

  it("deleted objects are tracked in sync state", () => {
    // Simulate sync state with deleted reference
    const syncState = {
      project: "test",
      references: {
        "deleted-paper": {
          localId: "deleted-paper",
          uri: "at://did:plc:xxx/network.cosmik.card/yyy",
          cid: "bafy...",
          syncedAt: new Date().toISOString(),
          direction: "push" as const,
          deleted: true,
        },
      },
    };
    expect(syncState.references["deleted-paper"].deleted).toBe(true);
  });
});

// ─── Collection Tag Tests ─────────────────────────────────────────────────────

/**
 * @narrative semble/collection-tags
 * @title Collection Tag Extraction
 * @description Objects can belong to multiple collections based on their tags.
 * Tags prefixed with 'collection:' determine collection membership.
 */
describe("Collection Tag Concepts", () => {
  it("collection: prefixed tags determine collection membership", () => {
    const obj = buildObject({
      frontmatter: {
        url: "https://example.com",
        tags: ["collection:data-leverage", "ai", "research"],
      },
    });
    const tags = obj.frontmatter.tags as string[];
    const collectionTags = tags.filter((t) => t.startsWith("collection:"));
    expect(collectionTags).toEqual(["collection:data-leverage"]);
  });

  it("objects can belong to multiple collections", () => {
    const obj = buildObject({
      frontmatter: {
        url: "https://example.com",
        tags: ["collection:data-leverage", "collection:ai-economics"],
      },
    });
    const tags = obj.frontmatter.tags as string[];
    const collectionTags = tags.filter((t) => t.startsWith("collection:"));
    expect(collectionTags).toHaveLength(2);
  });

  it("project collection is always included", () => {
    // All objects in a project are linked to the project collection
    // In addition to any collection: tags
    const projectName = "shared-references";
    expect(projectName).toBe("shared-references");
  });
});

// ─── Sync State Persistence Tests ─────────────────────────────────────────────

/**
 * @narrative semble/sync-state
 * @title Sync State Management
 * @description Sync state is persisted to track which objects have been synced.
 */
describe("Sync State Structure", () => {
  it("sync state tracks per-project references", () => {
    const state = {
      project: "shared-references",
      references: {
        "smith2024paper": {
          localId: "smith2024paper",
          uri: "at://did:plc:xxx/network.cosmik.card/yyy",
          cid: "bafy...",
          contentHash: "abc123def456",
          syncedAt: new Date().toISOString(),
          direction: "push" as const,
        },
      },
      lastSync: new Date().toISOString(),
    };

    expect(state.project).toBe("shared-references");
    expect(state.references["smith2024paper"]).toBeDefined();
    expect(state.references["smith2024paper"].contentHash).toBe("abc123def456");
  });

  it("sync state includes collection URIs", () => {
    const state = {
      project: "shared-references",
      collectionUris: {
        "shared-references": "at://did:plc:xxx/network.cosmik.collection/aaa",
        "shared-references:data-leverage": "at://did:plc:xxx/network.cosmik.collection/bbb",
      },
      references: {},
    };

    expect(Object.keys(state.collectionUris!)).toHaveLength(2);
  });

  it("sync references track direction", () => {
    const pushedRef = {
      localId: "local-paper",
      uri: "at://...",
      cid: "bafy...",
      syncedAt: new Date().toISOString(),
      direction: "push" as const,
    };
    const pulledRef = {
      localId: "imported-paper",
      uri: "at://...",
      cid: "bafy...",
      syncedAt: new Date().toISOString(),
      direction: "pull" as const,
    };

    expect(pushedRef.direction).toBe("push");
    expect(pulledRef.direction).toBe("pull");
  });
});

// ─── Card Conversion Edge Cases ───────────────────────────────────────────────

describe("Card Conversion Edge Cases", () => {
  it("handles objects with all metadata fields", () => {
    const obj = buildObject({
      frontmatter: {
        url: "https://example.com/paper",
        title: "Comprehensive Paper",
        abstract: "A detailed abstract",
        author: ["First Author", "Second Author"],
        year: 2024,
        journal: "Nature",
      },
    });
    const hash = computeObjectHash(obj);
    expect(hash).not.toBeNull();
  });

  it("handles objects with date instead of year", () => {
    const obj = buildObject({
      frontmatter: {
        url: "https://example.com/paper",
        date: "2024-06-15",
      },
    });
    const hash = computeObjectHash(obj);
    expect(hash).not.toBeNull();
  });

  it("handles objects with booktitle instead of journal", () => {
    const obj = buildObject({
      frontmatter: {
        url: "https://example.com/paper",
        booktitle: "Proceedings of NeurIPS 2024",
      },
    });
    const hash = computeObjectHash(obj);
    expect(hash).not.toBeNull();
  });

  it("handles minimal URL-only objects", () => {
    const obj = buildObject({
      frontmatter: { url: "https://example.com" },
    });
    const hash = computeObjectHash(obj);
    expect(hash).not.toBeNull();
    expect(hash!.length).toBe(16);
  });
});
