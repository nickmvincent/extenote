/**
 * Tests for platform-based tag suggestions
 */

import { describe, it, expect } from "bun:test";
import { getPlatformTags, PLATFORM_TAGS } from "../src/lib/tags";

describe("Platform Tags", () => {
  describe("getPlatformTags", () => {
    describe("Social Platforms", () => {
      it("should return twitter tags for x.com URLs", () => {
        const tags = getPlatformTags("https://x.com/user/status/123");
        expect(tags).toContain("social");
        expect(tags).toContain("twitter");
      });

      it("should return twitter tags for twitter.com URLs", () => {
        const tags = getPlatformTags("https://twitter.com/user/status/123");
        expect(tags).toContain("social");
        expect(tags).toContain("twitter");
      });

      it("should return bluesky tags for bsky.app URLs", () => {
        const tags = getPlatformTags("https://bsky.app/profile/user/post/abc");
        expect(tags).toContain("social");
        expect(tags).toContain("bluesky");
      });

      it("should return mastodon tags for mastodon.social URLs", () => {
        const tags = getPlatformTags("https://mastodon.social/@user/123");
        expect(tags).toContain("social");
        expect(tags).toContain("mastodon");
      });

      it("should return linkedin tags for linkedin.com URLs", () => {
        const tags = getPlatformTags("https://www.linkedin.com/posts/user-123");
        expect(tags).toContain("social");
        expect(tags).toContain("linkedin");
      });
    });

    describe("Academic Platforms", () => {
      it("should return arxiv tags for arxiv.org URLs", () => {
        const tags = getPlatformTags("https://arxiv.org/abs/2301.12345");
        expect(tags).toContain("preprint");
        expect(tags).toContain("arxiv");
      });

      it("should return openreview tags for openreview.net URLs", () => {
        const tags = getPlatformTags("https://openreview.net/forum?id=abc123");
        expect(tags).toContain("preprint");
        expect(tags).toContain("peer-review");
      });

      it("should return acm tags for dl.acm.org URLs", () => {
        const tags = getPlatformTags("https://dl.acm.org/doi/10.1145/123456");
        expect(tags).toContain("published");
        expect(tags).toContain("acm");
      });

      it("should return ieee tags for ieeexplore.ieee.org URLs", () => {
        const tags = getPlatformTags("https://ieeexplore.ieee.org/document/123");
        expect(tags).toContain("published");
        expect(tags).toContain("ieee");
      });
    });

    describe("Code/Tech Platforms", () => {
      it("should return github tags for github.com URLs", () => {
        const tags = getPlatformTags("https://github.com/user/repo");
        expect(tags).toContain("code");
        expect(tags).toContain("github");
      });

      it("should return huggingface tags for huggingface.co URLs", () => {
        const tags = getPlatformTags("https://huggingface.co/models/bert");
        expect(tags).toContain("ml-models");
        expect(tags).toContain("huggingface");
      });

      it("should return stackoverflow tags", () => {
        const tags = getPlatformTags("https://stackoverflow.com/questions/123");
        expect(tags).toContain("q-and-a");
        expect(tags).toContain("stackoverflow");
      });
    });

    describe("Media Platforms", () => {
      it("should return youtube tags for youtube.com URLs", () => {
        const tags = getPlatformTags("https://www.youtube.com/watch?v=abc");
        expect(tags).toContain("video");
        expect(tags).toContain("youtube");
      });

      it("should return blog tags for medium.com URLs", () => {
        const tags = getPlatformTags("https://medium.com/@user/post");
        expect(tags).toContain("blog");
      });

      it("should return newsletter tags for substack.com URLs", () => {
        const tags = getPlatformTags("https://user.substack.com/p/post");
        expect(tags).toContain("newsletter");
      });
    });

    describe("Edge Cases", () => {
      it("should handle www prefix", () => {
        const tags = getPlatformTags("https://www.github.com/user/repo");
        expect(tags).toContain("code");
        expect(tags).toContain("github");
      });

      it("should return empty array for unknown domains", () => {
        const tags = getPlatformTags("https://unknown-site.com/page");
        expect(tags).toEqual([]);
      });

      it("should handle invalid URLs gracefully", () => {
        const tags = getPlatformTags("not-a-url");
        expect(tags).toEqual([]);
      });

      it("should handle empty URL", () => {
        const tags = getPlatformTags("");
        expect(tags).toEqual([]);
      });
    });
  });

  describe("PLATFORM_TAGS constant", () => {
    it("should have entries for major social platforms", () => {
      expect(PLATFORM_TAGS["x.com"]).toBeDefined();
      expect(PLATFORM_TAGS["twitter.com"]).toBeDefined();
      expect(PLATFORM_TAGS["bsky.app"]).toBeDefined();
    });

    it("should have entries for major academic platforms", () => {
      expect(PLATFORM_TAGS["arxiv.org"]).toBeDefined();
      expect(PLATFORM_TAGS["openreview.net"]).toBeDefined();
      expect(PLATFORM_TAGS["dl.acm.org"]).toBeDefined();
    });

    it("should have entries for code platforms", () => {
      expect(PLATFORM_TAGS["github.com"]).toBeDefined();
      expect(PLATFORM_TAGS["huggingface.co"]).toBeDefined();
    });
  });
});
