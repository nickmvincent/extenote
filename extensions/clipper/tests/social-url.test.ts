/**
 * Tests for social URL parsing
 */

import { describe, it, expect } from "bun:test";
import { parseSocialUrl, isPdfUrl, extractArxivIdFromPdf } from "../src/lib/search-hint";

describe("Social URL Parsing", () => {
  describe("parseSocialUrl", () => {
    describe("Twitter/X URLs", () => {
      it("should parse x.com user profile", () => {
        const result = parseSocialUrl("https://x.com/username");
        expect(result.platform).toBe("twitter");
        expect(result.username).toBe("username");
        expect(result.isPost).toBe(false);
      });

      it("should parse x.com post URL", () => {
        const result = parseSocialUrl("https://x.com/username/status/1234567890123456789");
        expect(result.platform).toBe("twitter");
        expect(result.username).toBe("username");
        expect(result.postId).toBe("1234567890123456789");
        expect(result.isPost).toBe(true);
      });

      it("should parse twitter.com URLs", () => {
        const result = parseSocialUrl("https://twitter.com/user123/status/987654321");
        expect(result.platform).toBe("twitter");
        expect(result.username).toBe("user123");
        expect(result.postId).toBe("987654321");
        expect(result.isPost).toBe(true);
      });

      it("should not parse special Twitter pages as users", () => {
        const home = parseSocialUrl("https://x.com/home");
        expect(home.username).toBeUndefined();

        const explore = parseSocialUrl("https://x.com/explore");
        expect(explore.username).toBeUndefined();
      });
    });

    describe("Bluesky URLs", () => {
      it("should parse bsky.app profile URL", () => {
        const result = parseSocialUrl("https://bsky.app/profile/user.bsky.social");
        expect(result.platform).toBe("bluesky");
        expect(result.username).toBe("user.bsky.social");
        expect(result.isPost).toBe(false);
      });

      it("should parse bsky.app post URL", () => {
        const result = parseSocialUrl("https://bsky.app/profile/user.bsky.social/post/3abc123xyz");
        expect(result.platform).toBe("bluesky");
        expect(result.username).toBe("user.bsky.social");
        expect(result.postId).toBe("3abc123xyz");
        expect(result.isPost).toBe(true);
      });

      it("should handle custom domain handles", () => {
        const result = parseSocialUrl("https://bsky.app/profile/example.com");
        expect(result.platform).toBe("bluesky");
        expect(result.username).toBe("example.com");
      });
    });

    describe("Mastodon URLs", () => {
      it("should parse mastodon.social profile URL", () => {
        const result = parseSocialUrl("https://mastodon.social/@username");
        expect(result.platform).toBe("mastodon");
        expect(result.username).toBe("username");
        expect(result.isPost).toBe(false);
      });

      it("should parse mastodon.social post URL", () => {
        const result = parseSocialUrl("https://mastodon.social/@username/109876543210");
        expect(result.platform).toBe("mastodon");
        expect(result.username).toBe("username");
        expect(result.postId).toBe("109876543210");
        expect(result.isPost).toBe(true);
      });
    });

    describe("Threads URLs", () => {
      it("should parse threads.net profile URL", () => {
        const result = parseSocialUrl("https://threads.net/@username");
        expect(result.platform).toBe("threads");
        expect(result.username).toBe("username");
        expect(result.isPost).toBe(false);
      });

      it("should parse threads.net post URL", () => {
        const result = parseSocialUrl("https://www.threads.net/@username/post/abc123");
        expect(result.platform).toBe("threads");
        expect(result.username).toBe("username");
        expect(result.postId).toBe("abc123");
        expect(result.isPost).toBe(true);
      });
    });

    describe("LinkedIn URLs", () => {
      it("should parse linkedin.com profile URL", () => {
        const result = parseSocialUrl("https://www.linkedin.com/in/username");
        expect(result.platform).toBe("linkedin");
        expect(result.username).toBe("username");
        expect(result.isPost).toBe(false);
      });

      it("should parse linkedin.com post URL", () => {
        const result = parseSocialUrl("https://linkedin.com/posts/activity-123456");
        expect(result.platform).toBe("linkedin");
        expect(result.postId).toBe("activity-123456");
        expect(result.isPost).toBe(true);
      });
    });

    describe("Edge Cases", () => {
      it("should return unknown for non-social URLs", () => {
        const result = parseSocialUrl("https://example.com/page");
        expect(result.platform).toBe("unknown");
        expect(result.username).toBeUndefined();
        expect(result.isPost).toBe(false);
      });

      it("should handle invalid URLs gracefully", () => {
        const result = parseSocialUrl("not-a-url");
        expect(result.platform).toBe("unknown");
        expect(result.isPost).toBe(false);
      });

      it("should handle empty string", () => {
        const result = parseSocialUrl("");
        expect(result.platform).toBe("unknown");
      });
    });
  });

  describe("isPdfUrl", () => {
    it("should detect direct PDF links", () => {
      expect(isPdfUrl("https://example.com/paper.pdf")).toBe(true);
      expect(isPdfUrl("https://arxiv.org/pdf/2301.12345.pdf")).toBe(true);
    });

    it("should detect arXiv PDF pages", () => {
      expect(isPdfUrl("https://arxiv.org/pdf/2301.12345")).toBe(true);
      expect(isPdfUrl("https://arxiv.org/pdf/cs/0101010")).toBe(true);
    });

    it("should not detect non-PDF URLs", () => {
      expect(isPdfUrl("https://arxiv.org/abs/2301.12345")).toBe(false);
      expect(isPdfUrl("https://example.com/page")).toBe(false);
    });

    it("should handle invalid URLs", () => {
      expect(isPdfUrl("not-a-url")).toBe(false);
    });
  });

  describe("extractArxivIdFromPdf", () => {
    it("should extract arXiv ID from PDF URL", () => {
      expect(extractArxivIdFromPdf("https://arxiv.org/pdf/2301.12345")).toBe("2301.12345");
      expect(extractArxivIdFromPdf("https://arxiv.org/pdf/2301.12345v2")).toBe("2301.12345v2");
    });

    it("should extract old format arXiv IDs", () => {
      expect(extractArxivIdFromPdf("https://arxiv.org/pdf/cs/0101010")).toBe("cs/0101010");
    });

    it("should return null for non-arXiv URLs", () => {
      expect(extractArxivIdFromPdf("https://example.com/paper.pdf")).toBeNull();
    });

    it("should return null for arXiv abstract pages", () => {
      expect(extractArxivIdFromPdf("https://arxiv.org/abs/2301.12345")).toBeNull();
    });
  });
});
