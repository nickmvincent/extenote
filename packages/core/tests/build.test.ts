import { describe, expect, it } from "bun:test";
import { printResultSummary, type BuildResult, type DeployResult, type SummaryResult } from "../src/build";
import type { BuildConfig, DeployConfig } from "../src/types";

// ─── Test Fixtures ────────────────────────────────────────────────────────────

function buildBuildConfig(overrides: Partial<BuildConfig> = {}): BuildConfig {
  return {
    type: "astro",
    websiteDir: "websites/test-site",
    ...overrides,
  };
}

function buildDeployConfig(overrides: Partial<DeployConfig> = {}): DeployConfig {
  return {
    platform: "github-pages",
    ...overrides,
  };
}

function buildBuildResult(overrides: Partial<BuildResult> = {}): BuildResult {
  return {
    project: "test-project",
    success: true,
    duration: 1000,
    ...overrides,
  };
}

function buildDeployResult(overrides: Partial<DeployResult> = {}): DeployResult {
  return {
    project: "test-project",
    success: true,
    duration: 500,
    ...overrides,
  };
}

// ─── printResultSummary Tests ─────────────────────────────────────────────────

/**
 * @narrative build/result-summary
 * @title Build Result Summaries
 * @description After builds complete, a summary is displayed showing success/failure
 * counts, timing information, and any error messages. This provides quick feedback
 * on build pipeline status.
 */
describe("printResultSummary", () => {
  /**
   * @narrative-step 1
   * @explanation The summary aggregates results across all built projects, showing
   * total count, individual project timings, and overall duration.
   */
  it("prints summary for successful builds", () => {
    const messages: string[] = [];
    const log = (msg: string) => messages.push(msg);

    const results: SummaryResult[] = [
      buildBuildResult({ project: "site-a", duration: 1500 }),
      buildBuildResult({ project: "site-b", duration: 2000 }),
    ];

    printResultSummary(results, "Build", log);

    expect(messages).toContain("Build Summary");
    expect(messages.some(m => m.includes("2 built"))).toBe(true);
    expect(messages.some(m => m.includes("site-a"))).toBe(true);
    expect(messages.some(m => m.includes("site-b"))).toBe(true);
    expect(messages.some(m => m.includes("3.5s"))).toBe(true); // Total duration
  });

  it("prints summary for failed builds", () => {
    const messages: string[] = [];
    const log = (msg: string) => messages.push(msg);

    const results: SummaryResult[] = [
      buildBuildResult({ project: "site-a", success: false, error: "Build failed" }),
    ];

    printResultSummary(results, "Build", log);

    expect(messages.some(m => m.includes("1 failed"))).toBe(true);
    expect(messages.some(m => m.includes("Build failed"))).toBe(true);
  });

  it("prints mixed success and failure", () => {
    const messages: string[] = [];
    const log = (msg: string) => messages.push(msg);

    const results: SummaryResult[] = [
      buildBuildResult({ project: "site-a", success: true, duration: 1000 }),
      buildBuildResult({ project: "site-b", success: false, duration: 500, error: "Error" }),
    ];

    printResultSummary(results, "Build", log);

    expect(messages.some(m => m.includes("1 built"))).toBe(true);
    expect(messages.some(m => m.includes("1 failed"))).toBe(true);
  });

  it("uses 'deployed' for Deploy action", () => {
    const messages: string[] = [];
    const log = (msg: string) => messages.push(msg);

    const results: SummaryResult[] = [
      buildDeployResult({ project: "site-a" }),
    ];

    printResultSummary(results, "Deploy", log);

    expect(messages).toContain("Deploy Summary");
    expect(messages.some(m => m.includes("1 deployed"))).toBe(true);
  });

  it("calculates total duration correctly", () => {
    const messages: string[] = [];
    const log = (msg: string) => messages.push(msg);

    const results: SummaryResult[] = [
      buildBuildResult({ duration: 1000 }),
      buildBuildResult({ duration: 2000 }),
      buildBuildResult({ duration: 3000 }),
    ];

    printResultSummary(results, "Build", log);

    expect(messages.some(m => m.includes("Total: 6.0s"))).toBe(true);
  });

  it("handles empty results", () => {
    const messages: string[] = [];
    const log = (msg: string) => messages.push(msg);

    printResultSummary([], "Build", log);

    expect(messages).toContain("Build Summary");
    expect(messages.some(m => m.includes("Total: 0.0s"))).toBe(true);
  });

  it("formats duration with one decimal place", () => {
    const messages: string[] = [];
    const log = (msg: string) => messages.push(msg);

    const results: SummaryResult[] = [
      buildBuildResult({ project: "site-a", duration: 1234 }),
    ];

    printResultSummary(results, "Build", log);

    expect(messages.some(m => m.includes("1.2s"))).toBe(true);
  });
});

// ─── Build Configuration Tests ────────────────────────────────────────────────

/**
 * @narrative build/configuration
 * @title Build Configuration
 * @description Projects define how their websites are built through BuildConfig.
 * This includes the build tool (Astro, Quarto, custom), preRender steps for
 * content preparation, and postBuild steps for artifacts like PDFs.
 */
describe("BuildConfig structure", () => {
  /**
   * @narrative-step 1
   * @explanation Three build types are supported: Astro for modern static sites,
   * Quarto for academic documents, and custom for specialized pipelines.
   */
  it("supports astro build type", () => {
    const config = buildBuildConfig({ type: "astro" });
    expect(config.type).toBe("astro");
  });

  it("supports quarto build type", () => {
    const config = buildBuildConfig({ type: "quarto" });
    expect(config.type).toBe("quarto");
  });

  it("supports custom build type", () => {
    const config = buildBuildConfig({ type: "custom" });
    expect(config.type).toBe("custom");
  });

  it("includes preRender steps", () => {
    const config = buildBuildConfig({
      preRender: [
        { type: "rsync", src: "./content", dst: "./public/content", include: ["*.md"] },
        { type: "shell", command: "echo 'hello'" },
      ],
    });

    expect(config.preRender).toHaveLength(2);
    expect(config.preRender![0].type).toBe("rsync");
    expect(config.preRender![1].type).toBe("shell");
  });

  it("includes postBuild steps", () => {
    const config = buildBuildConfig({
      postBuild: [
        { type: "weasyprint", src: "index.html", dst: "output.pdf" },
      ],
    });

    expect(config.postBuild).toHaveLength(1);
    expect(config.postBuild![0].type).toBe("weasyprint");
  });
});

// ─── Deploy Configuration Tests ───────────────────────────────────────────────

/**
 * @narrative build/deploy-configuration
 * @title Deploy Configuration
 * @description After building, sites can be deployed to various platforms.
 * DeployConfig specifies the target platform and any platform-specific options
 * like credentials, branches, or remote paths.
 */
describe("DeployConfig structure", () => {
  /**
   * @narrative-step 1
   * @explanation Multiple deployment platforms are supported, from managed services
   * like Cloudflare Pages and Vercel to self-hosted options like FTP.
   */
  it("supports cloudflare-pages platform", () => {
    const config = buildDeployConfig({ platform: "cloudflare-pages" });
    expect(config.platform).toBe("cloudflare-pages");
  });

  it("supports github-pages platform", () => {
    const config = buildDeployConfig({
      platform: "github-pages",
      branch: "gh-pages",
      repo: "https://github.com/user/repo",
    });
    expect(config.platform).toBe("github-pages");
    expect(config.branch).toBe("gh-pages");
  });

  it("supports vercel platform", () => {
    const config = buildDeployConfig({ platform: "vercel" });
    expect(config.platform).toBe("vercel");
  });

  it("supports netlify platform", () => {
    const config = buildDeployConfig({ platform: "netlify" });
    expect(config.platform).toBe("netlify");
  });

  it("supports ftp platform", () => {
    const config = buildDeployConfig({
      platform: "ftp",
      host: "ftp.example.com",
      user: "user",
      remotePath: "/public_html",
      port: 21,
      deleteRemote: true,
    });
    expect(config.platform).toBe("ftp");
    expect(config.host).toBe("ftp.example.com");
    expect(config.deleteRemote).toBe(true);
  });

  it("supports none platform (no deployment)", () => {
    const config = buildDeployConfig({ platform: "none" });
    expect(config.platform).toBe("none");
  });

  it("includes optional outputDir", () => {
    const config = buildDeployConfig({ outputDir: "_site" });
    expect(config.outputDir).toBe("_site");
  });
});

// ─── PreRender Step Types ─────────────────────────────────────────────────────

/**
 * @narrative build/prerender-steps
 * @title PreRender Pipeline Steps
 * @description Before the main build runs, preRender steps prepare content.
 * Steps include rsync for copying files, CLI commands for exports, shell
 * commands for custom scripts, and network generation for relationship data.
 */
describe("PreRender step types", () => {
  /**
   * @narrative-step 1
   * @explanation Each step type has specific required fields. rsync copies files
   * with include patterns, CLI runs extenote commands, shell runs arbitrary commands.
   */
  it("rsync step has required fields", () => {
    const step = { type: "rsync" as const, src: "./src", dst: "./dst", include: ["*.md"] };
    expect(step.type).toBe("rsync");
    expect(step.src).toBe("./src");
    expect(step.dst).toBe("./dst");
    expect(step.include).toContain("*.md");
  });

  it("cli step has required fields", () => {
    const step = { type: "cli" as const, command: "export-project research", outputDir: "./out" };
    expect(step.type).toBe("cli");
    expect(step.command).toBe("export-project research");
    expect(step.outputDir).toBe("./out");
  });

  it("copy step has required fields", () => {
    const step = { type: "copy" as const, src: "./file.txt", dst: "./dest/file.txt" };
    expect(step.type).toBe("copy");
    expect(step.src).toBe("./file.txt");
    expect(step.dst).toBe("./dest/file.txt");
  });

  it("shell step has required fields", () => {
    const step = { type: "shell" as const, command: "npm run generate" };
    expect(step.type).toBe("shell");
    expect(step.command).toBe("npm run generate");
  });

  it("network step has required fields", () => {
    const step = { type: "network" as const, format: "astro" as const, outputDir: "./public/data" };
    expect(step.type).toBe("network");
    expect(step.format).toBe("astro");
    expect(step.outputDir).toBe("./public/data");
  });
});

// ─── Build/Deploy Result Structure ────────────────────────────────────────────

/**
 * @narrative build/result-structure
 * @title Build and Deploy Results
 * @description Build and deploy operations return result objects containing
 * success status, timing, and error information. These are aggregated for
 * the final summary display.
 */
describe("BuildResult structure", () => {
  /**
   * @narrative-step 1
   * @explanation Results always include project name, success flag, and duration.
   * On failure, an error message explains what went wrong.
   */
  it("includes all required fields on success", () => {
    const result = buildBuildResult({
      project: "my-site",
      success: true,
      duration: 5000,
    });

    expect(result.project).toBe("my-site");
    expect(result.success).toBe(true);
    expect(result.duration).toBe(5000);
    expect(result.error).toBeUndefined();
  });

  it("includes error message on failure", () => {
    const result = buildBuildResult({
      project: "my-site",
      success: false,
      duration: 100,
      error: "Command failed with exit code 1",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Command failed with exit code 1");
  });
});

/**
 * @narrative build/deploy-result
 * @title Deploy Result Details
 * @description Deploy results extend build results with deployment-specific
 * information like the live URL where the site is accessible.
 */
describe("DeployResult structure", () => {
  /**
   * @narrative-step 1
   * @explanation Successful deploys often include the URL where the site is live.
   * Failed deploys include the error message explaining the failure.
   */
  it("includes optional url on success", () => {
    const result = buildDeployResult({
      project: "my-site",
      success: true,
      duration: 3000,
      url: "https://my-site.pages.dev",
    });

    expect(result.url).toBe("https://my-site.pages.dev");
  });

  it("includes error message on failure", () => {
    const result = buildDeployResult({
      project: "my-site",
      success: false,
      duration: 500,
      error: "Authentication failed",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Authentication failed");
  });
});
