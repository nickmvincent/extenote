/**
 * Tests for Archive.org Wayback Machine integration
 */

import { describe, it, expect } from "bun:test";
import { formatWaybackTimestamp, parseWaybackUrl } from "../src/lib/archive";

describe("Archive.org Integration", () => {
  describe("formatWaybackTimestamp", () => {
    it("should format a valid 14-digit timestamp", () => {
      const result = formatWaybackTimestamp("20240115123456");
      expect(result).toBe("2024-01-15 12:34:56");
    });

    it("should return original if not 14 digits", () => {
      expect(formatWaybackTimestamp("2024")).toBe("2024");
      expect(formatWaybackTimestamp("202401151234567")).toBe("202401151234567");
    });

    it("should handle midnight correctly", () => {
      const result = formatWaybackTimestamp("20240115000000");
      expect(result).toBe("2024-01-15 00:00:00");
    });

    it("should handle end of day correctly", () => {
      const result = formatWaybackTimestamp("20241231235959");
      expect(result).toBe("2024-12-31 23:59:59");
    });
  });

  describe("parseWaybackUrl", () => {
    it("should parse a valid Wayback URL", () => {
      const url = "https://web.archive.org/web/20240115123456/https://example.com/page";
      const result = parseWaybackUrl(url);

      expect(result).not.toBeNull();
      expect(result!.timestamp).toBe("20240115123456");
      expect(result!.originalUrl).toBe("https://example.com/page");
    });

    it("should parse URL with query params", () => {
      const url = "https://web.archive.org/web/20240115123456/https://example.com/page?foo=bar";
      const result = parseWaybackUrl(url);

      expect(result).not.toBeNull();
      expect(result!.originalUrl).toBe("https://example.com/page?foo=bar");
    });

    it("should parse URL with complex path", () => {
      const url = "https://web.archive.org/web/20240115123456/https://example.com/a/b/c/page.html";
      const result = parseWaybackUrl(url);

      expect(result).not.toBeNull();
      expect(result!.originalUrl).toBe("https://example.com/a/b/c/page.html");
    });

    it("should return null for non-Wayback URLs", () => {
      expect(parseWaybackUrl("https://example.com/page")).toBeNull();
      expect(parseWaybackUrl("https://archive.org/other")).toBeNull();
    });

    it("should return null for invalid Wayback URLs", () => {
      expect(parseWaybackUrl("https://web.archive.org/save/")).toBeNull();
      expect(parseWaybackUrl("https://web.archive.org/web/")).toBeNull();
    });
  });

  // Note: saveToWaybackMachine and checkWaybackArchive require network
  // and are tested manually or with integration tests
});
