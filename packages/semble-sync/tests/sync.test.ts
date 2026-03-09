import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import path from "path";
import { tmpdir } from "os";
import {
  computeObjectHash,
  listCollections,
  syncWithSemble,
  validateSembleConfig,
} from "../src/index.js";
import type {
  AtprotoSession,
  SembleConfig,
  SyncExtenoteConfig,
  SyncObject,
} from "../src/types.js";

function makeObject(overrides: Partial<SyncObject> = {}): SyncObject {
  const frontmatter = {
    type: "bibtex_entry",
    url: "https://example.com/paper",
    title: "Test Paper",
    ...(overrides.frontmatter ?? {}),
  };

  return {
    id: "obj-1",
    type: "bibtex_entry",
    title: "Test Object",
    sourceId: "shared-refs",
    project: "shared-references",
    filePath: "/tmp/test.md",
    relativePath: "shared-references/test.md",
    frontmatter,
    body: "",
    mtime: Date.now(),
    visibility: "public",
    ...overrides,
    frontmatter,
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const MOCK_SESSION: AtprotoSession = {
  did: "did:plc:test123",
  handle: "test.user",
  accessJwt: "access-token",
  refreshJwt: "refresh-token",
};

const baseConfig: SembleConfig = {
  enabled: true,
  identifier: "test.user",
  password: "test-password",
};

afterEach(async () => {
  delete process.env.SEMBLE_APP_PASSWORD;
  delete process.env.ATPROTO_APP_PASSWORD;
});

describe("computeObjectHash", () => {
  test("is stable for equivalent content", () => {
    const first = makeObject();
    const second = makeObject({
      id: "different-local-id",
      filePath: "/tmp/other.md",
      relativePath: "shared-references/other.md",
    });

    expect(computeObjectHash(first)).toBe(computeObjectHash(second));
  });

  test("returns null for objects without URL-like fields", () => {
    const hash = computeObjectHash(
      makeObject({
        frontmatter: { title: "No URL here", url: "" },
      })
    );
    expect(hash).toBeNull();
  });

  test("uses URL field priority (url > website > link > href)", () => {
    const withMany = makeObject({
      frontmatter: {
        url: "https://primary.example",
        website: "https://secondary.example",
        link: "https://tertiary.example",
      },
    });
    const withUrlOnly = makeObject({
      frontmatter: {
        url: "https://primary.example",
      },
    });
    expect(computeObjectHash(withMany)).toBe(computeObjectHash(withUrlOnly));
  });

  test("changes hash when mapped metadata changes", () => {
    const a = makeObject({
      frontmatter: {
        url: "https://example.com",
        title: "Original Title",
      },
    });
    const b = makeObject({
      frontmatter: {
        url: "https://example.com",
        title: "Updated Title",
      },
    });
    expect(computeObjectHash(a)).not.toBe(computeObjectHash(b));
  });

  test("ignores non-mapped fields in hash", () => {
    const a = makeObject({
      frontmatter: {
        url: "https://example.com",
        title: "Same",
        citation_key: "key-1",
        tags: ["a", "b"],
      },
    });
    const b = makeObject({
      frontmatter: {
        url: "https://example.com",
        title: "Same",
        citation_key: "key-2",
        tags: ["x", "y", "z"],
      },
    });
    expect(computeObjectHash(a)).toBe(computeObjectHash(b));
  });

  test("normalizes author arrays to comma-separated strings", () => {
    const withArrayAuthor = makeObject({
      frontmatter: {
        url: "https://example.com",
        author: ["Ada Lovelace", "Grace Hopper"],
      },
    });
    const withStringAuthor = makeObject({
      frontmatter: {
        url: "https://example.com",
        author: "Ada Lovelace, Grace Hopper",
      },
    });
    expect(computeObjectHash(withArrayAuthor)).toBe(computeObjectHash(withStringAuthor));
  });
});

describe("validateSembleConfig", () => {
  test("requires identifier and password", () => {
    const config: SembleConfig = {
      enabled: true,
      identifier: "",
      password: "",
    };
    const result = validateSembleConfig(config);
    expect(result.valid).toBeFalse();
    expect(result.errors).toContain("identifier is required (ATProto handle or DID)");
  });

  test("accepts direct password", () => {
    const result = validateSembleConfig(baseConfig);
    expect(result.valid).toBeTrue();
    expect(result.errors).toHaveLength(0);
  });

  test("accepts SEMBLE_APP_PASSWORD env var fallback", () => {
    process.env.SEMBLE_APP_PASSWORD = "from-env";
    const result = validateSembleConfig({
      enabled: true,
      identifier: "test.user",
    });
    expect(result.valid).toBeTrue();
  });

  test("accepts ATPROTO_APP_PASSWORD env var fallback", () => {
    process.env.ATPROTO_APP_PASSWORD = "from-atproto-env";
    const result = validateSembleConfig({
      enabled: true,
      identifier: "did:plc:abcdef123456",
    });
    expect(result.valid).toBeTrue();
  });
});

describe("listCollections", () => {
  test("returns mapped collection list", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input, init) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.endsWith("/xrpc/com.atproto.server.createSession")) {
        return jsonResponse(MOCK_SESSION);
      }
      if (url.includes("/xrpc/com.atproto.repo.listRecords")) {
        const parsed = new URL(url);
        const collection = parsed.searchParams.get("collection");
        if (collection === "network.cosmik.collection") {
          return jsonResponse({
            records: [
              {
                uri: "at://did:plc:test123/network.cosmik.collection/project",
                cid: "cid-1",
                value: {
                  $type: "network.cosmik.collection",
                  name: "shared-references",
                  description: "Project collection",
                  accessType: "OPEN",
                },
              },
            ],
          });
        }
      }
      throw new Error(`Unexpected fetch call: ${url} ${init?.method ?? "GET"}`);
    }) as typeof fetch;

    try {
      const collections = await listCollections(baseConfig);
      expect(collections).toEqual([
        {
          name: "shared-references",
          uri: "at://did:plc:test123/network.cosmik.collection/project",
          description: "Project collection",
        },
      ]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("syncWithSemble (dry-run)", () => {
  test("applies type/visibility/syncTag filters before push", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.endsWith("/xrpc/com.atproto.server.createSession")) {
        return jsonResponse(MOCK_SESSION);
      }
      if (url.includes("/xrpc/com.atproto.repo.listRecords")) {
        const parsed = new URL(url);
        const collection = parsed.searchParams.get("collection");
        if (collection === "network.cosmik.collection") {
          return jsonResponse({ records: [] });
        }
      }
      throw new Error(`Unexpected fetch call in dry-run test: ${url}`);
    }) as typeof fetch;

    const cwd = await mkdtemp(path.join(tmpdir(), "semble-sync-test-"));

    try {
      const config: SyncExtenoteConfig = {
        sources: [{ id: "main", root: "content" }],
        projectProfiles: [{ name: "shared-references", sourceIds: ["main"] }],
      };

      const objects: SyncObject[] = [
        makeObject({
          id: "push-me",
          visibility: "public",
          frontmatter: { url: "https://example.com/a", semble: true },
        }),
        makeObject({
          id: "private-skip",
          visibility: "private",
          frontmatter: { url: "https://example.com/b", semble: true },
        }),
        makeObject({
          id: "wrong-type",
          type: "note",
          visibility: "public",
          frontmatter: { url: "https://example.com/c", semble: true },
        }),
        makeObject({
          id: "no-url-skip",
          visibility: "public",
          frontmatter: { url: "", semble: true },
        }),
        makeObject({
          id: "tagged-false",
          visibility: "public",
          frontmatter: { url: "https://example.com/d", semble: false },
        }),
        makeObject({
          id: "string-true",
          visibility: "public",
          frontmatter: { url: "https://example.com/e", semble: "true" },
        }),
      ];

      const result = await syncWithSemble({
        objects,
        config,
        sembleConfig: {
          ...baseConfig,
          types: ["bibtex_entry"],
          publicOnly: true,
          syncTag: "semble",
        },
        cwd,
        project: "shared-references",
        options: {
          dryRun: true,
          pushOnly: true,
        },
      });

      expect(result.pushed).toBe(2);
      expect(result.updated).toBe(0);
      expect(result.pulled).toBe(0);
      expect(result.deleted).toBe(0);
      expect(result.skipped).toBe(1);
      expect(result.errors).toHaveLength(0);
    } finally {
      globalThis.fetch = originalFetch;
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
