import { describe, expect, test } from "bun:test";
import {
  SembleClient,
  computeObjectHash,
  validateSembleConfig,
  syncWithSemble,
} from "../src/plugins/semble/index.js";
import type { VaultObject } from "../src/types";

function makeObject(overrides: Partial<VaultObject> = {}): VaultObject {
  return {
    id: "obj-1",
    type: "bibtex_entry",
    sourceId: "main",
    project: "shared-references",
    filePath: "/tmp/ref.md",
    relativePath: "shared-references/ref.md",
    frontmatter: {
      type: "bibtex_entry",
      url: "https://example.com/paper",
      title: "Paper",
    },
    body: "",
    mtime: Date.now(),
    visibility: "public",
    ...overrides,
  };
}

describe("core Semble adapter exports", () => {
  test("re-exported sync functions exist", () => {
    expect(typeof syncWithSemble).toBe("function");
    expect(typeof computeObjectHash).toBe("function");
    expect(typeof validateSembleConfig).toBe("function");
  });

  test("re-exported SembleClient behaves as expected", () => {
    const client = new SembleClient({
      enabled: true,
      identifier: "test.user",
      password: "pw",
    });
    expect(client.pds).toBe("https://bsky.social");
  });

  test("computeObjectHash works via core re-export", () => {
    const hash = computeObjectHash(makeObject());
    expect(hash).not.toBeNull();
    expect(typeof hash).toBe("string");
    expect(hash!.length).toBe(16);
  });

  test("validateSembleConfig works via core re-export", () => {
    const invalid = validateSembleConfig({
      enabled: true,
      identifier: "",
      password: "",
    });
    expect(invalid.valid).toBeFalse();
    expect(invalid.errors.length).toBeGreaterThan(0);

    const valid = validateSembleConfig({
      enabled: true,
      identifier: "test.user",
      password: "pw",
    });
    expect(valid.valid).toBeTrue();
  });
});
