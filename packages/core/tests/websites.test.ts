import { describe, expect, it } from "bun:test";
import {
  inferWebsiteUrl,
  extractGitHubUrl,
  formatProjectTitle,
  getProjectWebsites,
  getProjectWebsite,
} from "../src/websites";
import type { ExtenoteConfig, ProjectProfile } from "../src/types";

// ─── inferWebsiteUrl Tests ───────────────────────────────────────────────────

describe("inferWebsiteUrl", () => {
  it("returns null for platform: none", () => {
    const profile: ProjectProfile = {
      name: "test-project",
      deploy: { platform: "none" },
    };
    expect(inferWebsiteUrl(profile)).toBeNull();
  });

  it("returns null when no deploy config", () => {
    const profile: ProjectProfile = {
      name: "test-project",
    };
    expect(inferWebsiteUrl(profile)).toBeNull();
  });

  it("infers github-pages URL from repo", () => {
    const profile: ProjectProfile = {
      name: "my-project",
      deploy: {
        platform: "github-pages",
        repo: "https://github.com/username/my-repo.git",
      },
    };
    expect(inferWebsiteUrl(profile)).toBe("https://username.github.io/my-repo");
  });

  it("handles github-pages repo without .git suffix", () => {
    const profile: ProjectProfile = {
      name: "my-project",
      deploy: {
        platform: "github-pages",
        repo: "https://github.com/username/my-repo",
      },
    };
    expect(inferWebsiteUrl(profile)).toBe("https://username.github.io/my-repo");
  });

  it("returns null for github-pages without repo", () => {
    const profile: ProjectProfile = {
      name: "my-project",
      deploy: { platform: "github-pages" },
    };
    expect(inferWebsiteUrl(profile)).toBeNull();
  });

  it("infers cloudflare-pages URL with hyphens removed", () => {
    const profile: ProjectProfile = {
      name: "my-cool-project",
      deploy: { platform: "cloudflare-pages" },
    };
    expect(inferWebsiteUrl(profile)).toBe("https://mycoolproject.pages.dev");
  });

  it("infers vercel URL", () => {
    const profile: ProjectProfile = {
      name: "my-project",
      deploy: { platform: "vercel" },
    };
    expect(inferWebsiteUrl(profile)).toBe("https://my-project.vercel.app");
  });

  it("infers netlify URL", () => {
    const profile: ProjectProfile = {
      name: "my-project",
      deploy: { platform: "netlify" },
    };
    expect(inferWebsiteUrl(profile)).toBe("https://my-project.netlify.app");
  });
});

// ─── extractGitHubUrl Tests ──────────────────────────────────────────────────

describe("extractGitHubUrl", () => {
  it("returns null when no deploy config", () => {
    expect(extractGitHubUrl(undefined)).toBeNull();
  });

  it("returns null when no repo in deploy config", () => {
    expect(extractGitHubUrl({ platform: "github-pages" })).toBeNull();
  });

  it("removes .git suffix from repo URL", () => {
    const deploy = {
      platform: "github-pages" as const,
      repo: "https://github.com/user/repo.git",
    };
    expect(extractGitHubUrl(deploy)).toBe("https://github.com/user/repo");
  });

  it("returns repo URL unchanged if no .git suffix", () => {
    const deploy = {
      platform: "github-pages" as const,
      repo: "https://github.com/user/repo",
    };
    expect(extractGitHubUrl(deploy)).toBe("https://github.com/user/repo");
  });
});

// ─── formatProjectTitle Tests ────────────────────────────────────────────────

describe("formatProjectTitle", () => {
  it("capitalizes single word", () => {
    expect(formatProjectTitle("project")).toBe("Project");
  });

  it("converts kebab-case to Title Case", () => {
    expect(formatProjectTitle("my-cool-project")).toBe("My Cool Project");
  });

  it("handles already capitalized words", () => {
    expect(formatProjectTitle("Already-Caps")).toBe("Already Caps");
  });

  it("handles single character segments", () => {
    expect(formatProjectTitle("a-b-c")).toBe("A B C");
  });
});

// ─── getProjectWebsites Tests ────────────────────────────────────────────────

describe("getProjectWebsites", () => {
  const baseConfig: ExtenoteConfig = {
    schemaDir: "schemas",
    sources: [],
    sites: [],
    lint: { rules: {} },
  };

  it("returns empty array when no project profiles", () => {
    const websites = getProjectWebsites(baseConfig);
    expect(websites).toEqual([]);
  });

  it("returns empty array when all projects have platform: none", () => {
    const config: ExtenoteConfig = {
      ...baseConfig,
      projectProfiles: [
        { name: "project-a", deploy: { platform: "none" } },
      ],
    };
    const websites = getProjectWebsites(config);
    expect(websites).toEqual([]);
  });

  it("returns websites for deployable projects", () => {
    const config: ExtenoteConfig = {
      ...baseConfig,
      projectProfiles: [
        {
          name: "my-project",
          deploy: { platform: "vercel" },
        },
      ],
    };
    const websites = getProjectWebsites(config);

    expect(websites.length).toBe(1);
    expect(websites[0].name).toBe("my-project");
    expect(websites[0].title).toBe("My Project");
    expect(websites[0].platform).toBe("vercel");
    expect(websites[0].url).toBe("https://my-project.vercel.app");
  });

  it("uses custom domain as primary URL when set", () => {
    const config: ExtenoteConfig = {
      ...baseConfig,
      projectProfiles: [
        {
          name: "my-project",
          deploy: {
            platform: "vercel",
            domain: "myproject.com",
          },
        },
      ],
    };
    const websites = getProjectWebsites(config);

    expect(websites[0].url).toBe("https://myproject.com");
    expect(websites[0].domain).toBe("myproject.com");
    expect(websites[0].platformUrl).toBe("https://my-project.vercel.app");
  });

  it("sorts websites by name", () => {
    const config: ExtenoteConfig = {
      ...baseConfig,
      projectProfiles: [
        { name: "zebra", deploy: { platform: "vercel" } },
        { name: "alpha", deploy: { platform: "netlify" } },
        { name: "beta", deploy: { platform: "cloudflare-pages" } },
      ],
    };
    const websites = getProjectWebsites(config);

    expect(websites.map(w => w.name)).toEqual(["alpha", "beta", "zebra"]);
  });

  it("includes build info when available", () => {
    const config: ExtenoteConfig = {
      ...baseConfig,
      projectProfiles: [
        {
          name: "my-project",
          build: { websiteDir: "websites/my-project", type: "astro" },
          deploy: { platform: "vercel" },
        },
      ],
    };
    const websites = getProjectWebsites(config);

    expect(websites[0].websiteDir).toBe("websites/my-project");
    expect(websites[0].buildType).toBe("astro");
  });

  it("extracts github URL from deploy config", () => {
    const config: ExtenoteConfig = {
      ...baseConfig,
      projectProfiles: [
        {
          name: "my-project",
          deploy: {
            platform: "github-pages",
            repo: "https://github.com/user/repo.git",
          },
        },
      ],
    };
    const websites = getProjectWebsites(config);

    expect(websites[0].github).toBe("https://github.com/user/repo");
  });
});

// ─── getProjectWebsite Tests ─────────────────────────────────────────────────

describe("getProjectWebsite", () => {
  const baseConfig: ExtenoteConfig = {
    schemaDir: "schemas",
    sources: [],
    sites: [],
    lint: { rules: {} },
  };

  it("returns null when project not found", () => {
    const config: ExtenoteConfig = {
      ...baseConfig,
      projectProfiles: [
        { name: "other-project", deploy: { platform: "vercel" } },
      ],
    };
    expect(getProjectWebsite(config, "my-project")).toBeNull();
  });

  it("returns null when project has no deploy config", () => {
    const config: ExtenoteConfig = {
      ...baseConfig,
      projectProfiles: [{ name: "my-project" }],
    };
    expect(getProjectWebsite(config, "my-project")).toBeNull();
  });

  it("returns null when project has platform: none", () => {
    const config: ExtenoteConfig = {
      ...baseConfig,
      projectProfiles: [
        { name: "my-project", deploy: { platform: "none" } },
      ],
    };
    expect(getProjectWebsite(config, "my-project")).toBeNull();
  });

  it("returns website info for valid project", () => {
    const config: ExtenoteConfig = {
      ...baseConfig,
      projectProfiles: [
        {
          name: "my-project",
          deploy: { platform: "netlify" },
        },
      ],
    };
    const website = getProjectWebsite(config, "my-project");

    expect(website).not.toBeNull();
    expect(website!.name).toBe("my-project");
    expect(website!.title).toBe("My Project");
    expect(website!.platform).toBe("netlify");
    expect(website!.url).toBe("https://my-project.netlify.app");
  });
});
