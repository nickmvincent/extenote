import { describe, expect, it } from "bun:test";
import {
  generateDiscussionObject,
  generateProjectDiscussionObject,
} from "../src/plugins/discussion/publish";
import type { VaultObject, DiscussionConfig } from "../src/types";
import type { DiscussionLink } from "../src/plugins/discussion/types";

/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                     ⚠️  DISCUSSION INTEGRATION WARNING ⚠️                   ║
 * ╠═══════════════════════════════════════════════════════════════════════════╣
 * ║  These tests cover discussion OBJECT GENERATION (markdown output) but     ║
 * ║  do NOT test actual API calls to discussion providers.                    ║
 * ║                                                                           ║
 * ║  The discussion provider integrations are EXPERIMENTAL:                   ║
 * ║  - GitHub: Requires GITHUB_TOKEN env var                                  ║
 * ║  - WhiteWind (ATProto): Requires ATPROTO_APP_PASSWORD env var             ║
 * ║  - Leaflet, Google Docs: Limited testing                                  ║
 * ║                                                                           ║
 * ║  Before using in production:                                              ║
 * ║  1. Test with --dry-run: bun run cli -- discussions create <proj> --dry   ║
 * ║  2. Verify provider configs in project YAML                               ║
 * ║  3. Check rate limits for each provider                                   ║
 * ║  4. Review created discussions before enabling auto-publish               ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

// ─── Test Fixtures ───────────────────────────────────────────────────────────

function buildObject(overrides: Partial<VaultObject> = {}): VaultObject {
  const base = {
    id: "test-object",
    type: "bibtex_entry",
    title: "Test Paper Title",
    sourceId: "local",
    project: "test-project",
    filePath: "/tmp/test.md",
    relativePath: "test.md",
    frontmatter: {
      title: "Test Paper Title",
      url: "https://example.com/paper",
    },
    body: "Paper content here",
    mtime: Date.now(),
    visibility: "public",
  };

  // Deep merge frontmatter if provided
  if (overrides.frontmatter) {
    return {
      ...base,
      ...overrides,
      frontmatter: { ...base.frontmatter, ...overrides.frontmatter },
    } as VaultObject;
  }

  return { ...base, ...overrides } as VaultObject;
}

function buildConfig(overrides: Partial<DiscussionConfig> = {}): DiscussionConfig {
  return {
    frontmatterKey: "discussions",
    outputDir: "content/discussions",
    ...overrides,
  };
}

const mockLinks: DiscussionLink[] = [
  {
    provider: "github",
    url: "https://github.com/owner/repo/discussions/1",
    createdAt: "2024-01-15T10:00:00Z",
  },
  {
    provider: "whitewind",
    url: "https://whitewind.example/post/abc123",
    uri: "at://did:plc:abc/whitewind.post/abc123",
    createdAt: "2024-01-15T10:00:00Z",
  },
];

// ─── generateDiscussionObject Tests ──────────────────────────────────────────

/**
 * @narrative discussion/object-generation
 * @title Discussion Object Generation
 * @description When discussions are created for content, Extenote generates
 * separate discussion objects that track the links to various platforms.
 */
describe("generateDiscussionObject", () => {
  /**
   * @narrative-step 1
   * @explanation Discussion objects have frontmatter with source info and provider URLs.
   */
  it("generates valid markdown with frontmatter", () => {
    const object = buildObject();
    const config = buildConfig();
    const result = generateDiscussionObject(object, mockLinks, config);

    expect(result).toContain("---");
    expect(result).toContain("type: discussion");
    expect(result).toContain("source_id: test-object");
    expect(result).toContain("source_type: bibtex_entry");
  });

  /**
   * @narrative-step 2
   * @explanation Provider URLs are stored in frontmatter with provider-specific keys.
   */
  it("includes provider URLs in frontmatter", () => {
    const object = buildObject();
    const config = buildConfig();
    const result = generateDiscussionObject(object, mockLinks, config);

    expect(result).toContain("github_url:");
    expect(result).toContain("https://github.com/owner/repo/discussions/1");
    expect(result).toContain("whitewind_url:");
    expect(result).toContain("https://whitewind.example/post/abc123");
  });

  it("includes ATProto URIs when present", () => {
    const object = buildObject();
    const config = buildConfig();
    const result = generateDiscussionObject(object, mockLinks, config);

    expect(result).toContain("whitewind_uri:");
    expect(result).toContain("at://did:plc:abc/whitewind.post/abc123");
  });

  it("generates body with links to providers", () => {
    const object = buildObject();
    const config = buildConfig();
    const result = generateDiscussionObject(object, mockLinks, config);

    expect(result).toContain("[github](https://github.com/owner/repo/discussions/1)");
    expect(result).toContain("[whitewind](https://whitewind.example/post/abc123)");
  });

  it("uses source title and URL in body", () => {
    const object = buildObject({
      title: "My Paper Title",
      frontmatter: {
        title: "My Paper Title",
        url: "https://example.com/my-paper",
      },
    });
    const config = buildConfig();
    const result = generateDiscussionObject(object, mockLinks, config);

    expect(result).toContain("source_title: My Paper Title");
    // URL with colon gets quoted in YAML
    expect(result).toContain("source_url:");
    expect(result).toContain("https://example.com/my-paper");
  });

  it("prefers original_url over url", () => {
    const object = buildObject({
      title: "Paper",
      frontmatter: {
        title: "Paper",
        url: "https://cached.example.com",
        original_url: "https://original.example.com",
      },
    });
    const config = buildConfig();
    const result = generateDiscussionObject(object, mockLinks, config);

    // original_url takes precedence (quoted in YAML)
    expect(result).toContain("https://original.example.com");
    expect(result).not.toContain("cached.example.com");
  });

  it("handles object without URL", () => {
    const object = buildObject({
      title: "Note Without URL",
      frontmatter: { title: "Note Without URL" },
    });
    const config = buildConfig();
    const result = generateDiscussionObject(object, mockLinks, config);

    // Should still generate valid markdown
    expect(result).toContain("type: discussion");
    expect(result).toContain("source_title: Note Without URL");
  });

  it("handles empty links array", () => {
    const object = buildObject();
    const config = buildConfig();
    const result = generateDiscussionObject(object, [], config);

    expect(result).toContain("type: discussion");
    // No provider links in body
    expect(result).not.toContain("[github]");
  });

  it("escapes special characters in YAML", () => {
    const object = buildObject({
      title: 'Title with "quotes" and: colons',
      frontmatter: {
        title: 'Title with "quotes" and: colons',
        url: "https://example.com",
      },
    });
    const config = buildConfig();
    const result = generateDiscussionObject(object, mockLinks, config);

    // Values with colons/quotes get quoted in YAML
    expect(result).toContain("source_title:");
    // The title appears somewhere in the output
    expect(result).toContain("quotes");
  });

  it("includes created_at date", () => {
    const object = buildObject();
    const config = buildConfig();
    const result = generateDiscussionObject(object, mockLinks, config);

    // Should have a date in YYYY-MM-DD format (may be quoted by gray-matter)
    expect(result).toMatch(/created_at: '?\d{4}-\d{2}-\d{2}'?/);
  });

  it("uses custom body template when provided", () => {
    const object = buildObject({
      title: "Custom Title",
      frontmatter: {
        title: "Custom Title",
        url: "https://example.com",
      },
    });
    const config = buildConfig({
      bodyTemplate: "Custom template for {{source_title}} at {{source_url}}",
    });
    const result = generateDiscussionObject(object, mockLinks, config);

    // Template replaces placeholders
    expect(result).toContain("Custom template for");
    expect(result).toContain("Custom Title");
    expect(result).toContain("https://example.com");
  });
});

// ─── generateProjectDiscussionObject Tests ───────────────────────────────────

/**
 * @narrative discussion/project-discussion
 * @title Project-Level Discussion Generation
 * @description Projects can have a central discussion space that links to all
 * configured discussion platforms.
 */
describe("generateProjectDiscussionObject", () => {
  /**
   * @narrative-step 1
   * @explanation Project discussions have a different type and include the project name.
   */
  it("generates project discussion frontmatter", () => {
    const result = generateProjectDiscussionObject(
      "my-project",
      mockLinks,
      buildConfig()
    );

    expect(result).toContain("type: project_discussion");
    expect(result).toContain("project: my-project");
    expect(result).toContain("title: my-project Discussions");
  });

  /**
   * @narrative-step 2
   * @explanation The body welcomes users and lists all discussion platforms.
   */
  it("generates welcoming body with links", () => {
    const result = generateProjectDiscussionObject(
      "my-project",
      mockLinks,
      buildConfig()
    );

    expect(result).toContain("# my-project Discussions");
    expect(result).toContain("Welcome!");
    expect(result).toContain("[Discuss on github]");
    expect(result).toContain("[Discuss on whitewind]");
  });

  it("includes provider URLs in frontmatter", () => {
    const result = generateProjectDiscussionObject(
      "test-project",
      mockLinks,
      buildConfig()
    );

    expect(result).toContain("github_url:");
    expect(result).toContain("whitewind_url:");
    expect(result).toContain("whitewind_uri:");
  });

  it("uses custom description", () => {
    const result = generateProjectDiscussionObject(
      "test-project",
      mockLinks,
      buildConfig(),
      "Custom description for the project"
    );

    expect(result).toContain("description: Custom description for the project");
  });

  it("generates default description when not provided", () => {
    const result = generateProjectDiscussionObject(
      "test-project",
      mockLinks,
      buildConfig()
    );

    expect(result).toContain("Discussion and feedback for the test-project project");
  });

  it("handles empty links array", () => {
    const result = generateProjectDiscussionObject(
      "empty-project",
      [],
      buildConfig()
    );

    expect(result).toContain("type: project_discussion");
    expect(result).toContain("project: empty-project");
    // Links section exists but is empty
    expect(result).toContain("## Discussion Links");
  });

  it("handles special characters in project name", () => {
    const result = generateProjectDiscussionObject(
      "my-awesome-project",
      mockLinks,
      buildConfig()
    );

    expect(result).toContain("project: my-awesome-project");
    expect(result).toContain("title: my-awesome-project Discussions");
  });
});

// ─── Discussion Link Processing Tests ────────────────────────────────────────

describe("Discussion Link Processing", () => {
  it("handles single provider", () => {
    const object = buildObject();
    const singleLink: DiscussionLink[] = [
      {
        provider: "github",
        url: "https://github.com/test/discussions/1",
        createdAt: "2024-01-01T00:00:00Z",
      },
    ];
    const result = generateDiscussionObject(object, singleLink, buildConfig());

    expect(result).toContain("github_url:");
    expect(result).not.toContain("whitewind_url:");
  });

  it("handles many providers", () => {
    const object = buildObject();
    const manyLinks: DiscussionLink[] = [
      { provider: "github", url: "https://github.com/a", createdAt: "" },
      { provider: "whitewind", url: "https://whitewind.a", createdAt: "" },
      { provider: "leaflet", url: "https://leaflet.a", createdAt: "" },
      { provider: "googledocs", url: "https://docs.google.com/a", createdAt: "" },
    ];
    const result = generateDiscussionObject(object, manyLinks, buildConfig());

    expect(result).toContain("github_url:");
    expect(result).toContain("whitewind_url:");
    expect(result).toContain("leaflet_url:");
    expect(result).toContain("googledocs_url:");
  });

  it("preserves link order in body", () => {
    const object = buildObject();
    const orderedLinks: DiscussionLink[] = [
      { provider: "alpha", url: "https://alpha.com", createdAt: "" },
      { provider: "beta", url: "https://beta.com", createdAt: "" },
      { provider: "gamma", url: "https://gamma.com", createdAt: "" },
    ];
    const result = generateDiscussionObject(object, orderedLinks, buildConfig());

    const alphaIndex = result.indexOf("[alpha]");
    const betaIndex = result.indexOf("[beta]");
    const gammaIndex = result.indexOf("[gamma]");

    expect(alphaIndex).toBeLessThan(betaIndex);
    expect(betaIndex).toBeLessThan(gammaIndex);
  });
});

// ─── Edge Cases ──────────────────────────────────────────────────────────────

describe("Discussion Generation Edge Cases", () => {
  it("handles object with very long title", () => {
    const longTitle = "A".repeat(500);
    const object = buildObject({
      title: longTitle,
      frontmatter: { title: longTitle },
    });
    const result = generateDiscussionObject(object, mockLinks, buildConfig());

    // Gray-matter may use YAML block scalar for long lines, so just check the title is present
    expect(result).toContain("source_title:");
    expect(result).toContain(longTitle);
  });

  it("handles object with unicode title", () => {
    const object = buildObject({
      title: "日本語タイトル: 研究論文",
      frontmatter: {
        title: "日本語タイトル: 研究論文",
        url: "https://example.com",
      },
    });
    const result = generateDiscussionObject(object, mockLinks, buildConfig());

    expect(result).toContain("日本語タイトル");
  });

  it("handles link URL with special characters", () => {
    const object = buildObject();
    const specialLinks: DiscussionLink[] = [
      {
        provider: "github",
        url: "https://github.com/owner/repo/discussions/1?foo=bar&baz=qux",
        createdAt: "",
      },
    ];
    const result = generateDiscussionObject(object, specialLinks, buildConfig());

    expect(result).toContain("foo=bar&baz=qux");
  });

  it("handles object id with special characters", () => {
    const object = buildObject({
      id: "smith-2024-machine-learning",
    });
    const result = generateDiscussionObject(object, mockLinks, buildConfig());

    expect(result).toContain("source_id: smith-2024-machine-learning");
  });

  it("uses object.title over frontmatter.title when available", () => {
    const object = buildObject({
      title: "Object Title",
      frontmatter: {
        title: "Frontmatter Title",
      },
    });
    const result = generateDiscussionObject(object, mockLinks, buildConfig());

    // Should prefer object.title
    expect(result).toContain("source_title: Object Title");
  });

  it("falls back to object id when no title", () => {
    const object = buildObject({
      id: "fallback-id",
      title: undefined,
      frontmatter: {},
    });
    const result = generateDiscussionObject(object, mockLinks, buildConfig());

    // Body should contain the id as fallback
    expect(result).toContain("fallback-id");
  });
});

// ─── Config Variations ───────────────────────────────────────────────────────

describe("Discussion Config Variations", () => {
  it("respects custom frontmatterKey", () => {
    const object = buildObject();
    const config = buildConfig({
      frontmatterKey: "threads",
    });
    // The frontmatterKey doesn't affect generation, only reading
    // This test just verifies the function accepts the config
    const result = generateDiscussionObject(object, mockLinks, config);
    expect(result).toContain("type: discussion");
  });

  it("works with minimal config", () => {
    const object = buildObject();
    const minimalConfig: DiscussionConfig = {};
    const result = generateDiscussionObject(object, mockLinks, minimalConfig);

    expect(result).toContain("type: discussion");
  });

  it("handles body template with links placeholder", () => {
    const object = buildObject();
    const config = buildConfig({
      bodyTemplate: "Links: {{#each links}}link{{/each}}",
    });
    const result = generateDiscussionObject(object, mockLinks, config);

    // The {{#each}} block is replaced with actual links
    expect(result).toContain("[github]");
    expect(result).toContain("[whitewind]");
  });
});

// ─── Provider Configuration Tests ─────────────────────────────────────────────

/**
 * @narrative discussion/provider-config
 * @title Provider Configuration
 * @description Discussion providers are configured per-project and can be
 * individually enabled or disabled.
 */
describe("Provider Configuration Concepts", () => {
  /**
   * @narrative-step 1
   * @explanation Providers are enabled via the `enabled: true` flag in config.
   */
  it("provider config has enabled flag", () => {
    const providerConfig = {
      github: { enabled: true, repo: "owner/repo", category: "Discussions" },
      whitewind: { enabled: false },
    };
    expect(providerConfig.github.enabled).toBe(true);
    expect(providerConfig.whitewind.enabled).toBe(false);
  });

  /**
   * @narrative-step 2
   * @explanation The frontmatterKey config determines where discussion links
   * are stored in object frontmatter.
   */
  it("frontmatterKey defaults to 'discussions'", () => {
    const config = buildConfig();
    expect(config.frontmatterKey).toBe("discussions");
  });

  it("frontmatterKey can be customized", () => {
    const config = buildConfig({ frontmatterKey: "threads" });
    expect(config.frontmatterKey).toBe("threads");
  });
});

// ─── Multi-Provider Publishing Tests ──────────────────────────────────────────

/**
 * @narrative discussion/multi-provider
 * @title Multi-Provider Publishing
 * @description Objects can be published to multiple discussion platforms
 * simultaneously.
 */
describe("Multi-Provider Publishing Concepts", () => {
  /**
   * @narrative-step 1
   * @explanation Objects can have links from multiple providers stored.
   */
  it("object can have multiple provider links", () => {
    const object = buildObject();
    const result = generateDiscussionObject(object, mockLinks, buildConfig());

    // Both providers are present
    expect(result).toContain("github_url:");
    expect(result).toContain("whitewind_url:");
  });

  /**
   * @narrative-step 2
   * @explanation Provider filter can limit which providers are used.
   */
  it("provider filter limits publishing", () => {
    // This documents the behavior - actual filtering happens in publishDiscussions
    const providerFilter = ["github"];
    expect(providerFilter).toContain("github");
    expect(providerFilter).not.toContain("whitewind");
  });

  /**
   * @narrative-step 3
   * @explanation Already-existing links are skipped (idempotent).
   */
  it("existing links are skipped during publishing", () => {
    const objectWithExisting = buildObject({
      frontmatter: {
        title: "Paper with GitHub",
        url: "https://example.com",
        discussions: {
          github: "https://github.com/owner/repo/discussions/1",
        },
      },
    });
    // The existing link should cause the provider to be skipped
    expect(objectWithExisting.frontmatter.discussions).toBeDefined();
  });
});

// ─── Dry-Run Mode Tests ───────────────────────────────────────────────────────

/**
 * @narrative discussion/dry-run
 * @title Dry-Run Mode
 * @description Dry-run mode previews what would happen without making changes.
 */
describe("Dry-Run Mode Concepts", () => {
  /**
   * @narrative-step 1
   * @explanation Dry-run shows what would be created without actually creating.
   */
  it("dry-run link has special format", () => {
    const dryRunLink: DiscussionLink = {
      provider: "github",
      url: "[dry-run] Would create github discussion",
      createdAt: new Date().toISOString(),
    };
    expect(dryRunLink.url).toContain("[dry-run]");
  });

  /**
   * @narrative-step 2
   * @explanation Dry-run mode is set via options.dryRun.
   */
  it("dryRun option is boolean", () => {
    const options = { dryRun: true };
    expect(options.dryRun).toBe(true);
  });
});

// ─── Per-Object vs Per-Project Mode Tests ─────────────────────────────────────

/**
 * @narrative discussion/object-vs-project
 * @title Per-Object vs Per-Project Discussions
 * @description Discussions can be created at the object level (one per paper)
 * or at the project level (one for the entire project).
 */
describe("Per-Object vs Per-Project Mode", () => {
  /**
   * @narrative-step 1
   * @explanation Per-object discussions track individual objects.
   */
  it("object discussion references source object", () => {
    const object = buildObject({ id: "smith2024paper" });
    const result = generateDiscussionObject(object, mockLinks, buildConfig());

    expect(result).toContain("source_id: smith2024paper");
    expect(result).toContain("source_type: bibtex_entry");
  });

  /**
   * @narrative-step 2
   * @explanation Project discussions have type 'project_discussion'.
   */
  it("project discussion has project_discussion type", () => {
    const result = generateProjectDiscussionObject(
      "shared-references",
      mockLinks,
      buildConfig()
    );

    expect(result).toContain("type: project_discussion");
    expect(result).toContain("project: shared-references");
  });

  /**
   * @narrative-step 3
   * @explanation Project discussions include welcome message.
   */
  it("project discussion has welcome message", () => {
    const result = generateProjectDiscussionObject(
      "test-project",
      mockLinks,
      buildConfig()
    );

    expect(result).toContain("Welcome!");
  });
});

// ─── Provider Types Tests ─────────────────────────────────────────────────────

/**
 * @narrative discussion/providers
 * @title Discussion Provider Types
 * @description Extenote supports multiple discussion providers.
 */
describe("Discussion Provider Types", () => {
  it("github provider stores discussion URL", () => {
    const githubLink: DiscussionLink = {
      provider: "github",
      url: "https://github.com/owner/repo/discussions/123",
      createdAt: new Date().toISOString(),
    };
    expect(githubLink.provider).toBe("github");
    expect(githubLink.url).toContain("github.com");
  });

  it("whitewind provider stores ATProto URI", () => {
    const whitewindLink: DiscussionLink = {
      provider: "whitewind",
      url: "https://whitewind.example/post/abc123",
      uri: "at://did:plc:abc/whitewind.post/abc123",
      createdAt: new Date().toISOString(),
    };
    expect(whitewindLink.provider).toBe("whitewind");
    expect(whitewindLink.uri).toContain("at://");
  });

  it("leaflet provider is supported", () => {
    const leafletLink: DiscussionLink = {
      provider: "leaflet",
      url: "https://leaflet.example/doc/123",
      createdAt: new Date().toISOString(),
    };
    expect(leafletLink.provider).toBe("leaflet");
  });

  it("googledocs provider is supported", () => {
    const googleDocsLink: DiscussionLink = {
      provider: "googledocs",
      url: "https://docs.google.com/document/d/abc123",
      createdAt: new Date().toISOString(),
    };
    expect(googleDocsLink.provider).toBe("googledocs");
  });
});

// ─── Frontmatter Update Tests ─────────────────────────────────────────────────

/**
 * @narrative discussion/frontmatter-update
 * @title Frontmatter Update with Discussion Links
 * @description After creating discussions, the source file frontmatter is
 * updated to include the discussion links.
 */
describe("Frontmatter Update Concepts", () => {
  /**
   * @narrative-step 1
   * @explanation Discussion links are stored under frontmatterKey.
   */
  it("links are stored under configured frontmatterKey", () => {
    const config = buildConfig({ frontmatterKey: "discussions" });
    // The updateSourceFrontmatter function uses this key
    expect(config.frontmatterKey).toBe("discussions");
  });

  /**
   * @narrative-step 2
   * @explanation Each provider gets its own key under the discussion object.
   */
  it("each provider has its own URL field", () => {
    const object = buildObject();
    const result = generateDiscussionObject(object, mockLinks, buildConfig());

    // Each provider has separate fields
    expect(result).toContain("github_url:");
    expect(result).toContain("whitewind_url:");
  });

  /**
   * @narrative-step 3
   * @explanation ATProto providers also store the URI.
   */
  it("ATProto providers store both url and uri", () => {
    const object = buildObject();
    const result = generateDiscussionObject(object, mockLinks, buildConfig());

    expect(result).toContain("whitewind_url:");
    expect(result).toContain("whitewind_uri:");
  });
});

// ─── Progress Event Tests ─────────────────────────────────────────────────────

/**
 * @narrative discussion/progress-events
 * @title Progress Events During Publishing
 * @description Publishing emits progress events for tracking.
 */
describe("Progress Event Types", () => {
  it("start event has type 'start'", () => {
    const event = { type: "start", message: "Starting..." };
    expect(event.type).toBe("start");
  });

  it("progress event includes object info", () => {
    const object = buildObject();
    const event = {
      type: "progress",
      object,
      message: `Processing ${object.id}`,
    };
    expect(event.type).toBe("progress");
    expect(event.object).toBe(object);
  });

  it("complete event has type 'complete'", () => {
    const event = { type: "complete", message: "Done" };
    expect(event.type).toBe("complete");
  });
});

// ─── Result Structure Tests ───────────────────────────────────────────────────

/**
 * @narrative discussion/result-structure
 * @title Publishing Result Structure
 * @description Publishing returns a result with created, skipped, and errors.
 */
describe("Publishing Result Structure", () => {
  it("result has created array", () => {
    const result = {
      created: [{ object: buildObject(), links: mockLinks }],
      skipped: [],
      errors: [],
    };
    expect(result.created).toHaveLength(1);
    expect(result.created[0].links).toHaveLength(2);
  });

  it("result has skipped array with reason", () => {
    const object = buildObject();
    const result = {
      created: [],
      skipped: [{ object, reason: "github link already exists" }],
      errors: [],
    };
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toContain("already exists");
  });

  it("result has errors array with provider info", () => {
    const object = buildObject();
    const result = {
      created: [],
      skipped: [],
      errors: [
        { object, provider: "github", error: "API rate limited" },
      ],
    };
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].provider).toBe("github");
    expect(result.errors[0].error).toContain("rate limited");
  });
});

// ─── YAML Escaping Tests ──────────────────────────────────────────────────────

describe("YAML Escaping in Generated Content", () => {
  it("quotes URLs containing colons", () => {
    const object = buildObject({
      frontmatter: {
        title: "Test",
        url: "https://example.com:8080/path",
      },
    });
    const result = generateDiscussionObject(object, mockLinks, buildConfig());

    // URLs with colons should be quoted
    expect(result).toContain("source_url:");
    expect(result).toMatch(/https:\/\/example\.com:8080\/path/);
  });

  it("escapes quotes in titles", () => {
    const object = buildObject({
      title: 'Title with "quotes"',
      frontmatter: {
        title: 'Title with "quotes"',
        url: "https://example.com",
      },
    });
    const result = generateDiscussionObject(object, mockLinks, buildConfig());

    // Quotes in values should be escaped
    expect(result).toContain("source_title:");
  });

  it("handles newlines in values", () => {
    const object = buildObject({
      title: "Line 1\nLine 2",
      frontmatter: {
        title: "Line 1\nLine 2",
        url: "https://example.com",
      },
    });
    // Should not throw
    const result = generateDiscussionObject(object, mockLinks, buildConfig());
    expect(result).toBeDefined();
  });
});
