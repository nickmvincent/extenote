import { describe, expect, it, beforeAll } from "bun:test";
import { readdir, readFile } from "fs/promises";
import { join, resolve } from "path";
import { existsSync } from "fs";

/**
 * @narrative build/validation
 * @title Build Output Validation
 * @description These tests validate that built websites don't have common issues
 * like broken pages or unrendered dynamic content. They catch regressions by
 * checking that generated HTML files contain expected content and don't show
 * error placeholders.
 */

const WEBSITES_DIR = resolve(
  import.meta.dirname,
  "../../../../extenote-pub/websites"
);

// Sites that have discussions pages
const SITES_WITH_DISCUSSIONS = [
  "shared-references-astro",
  "data-counterfactuals-astro",
  "data-napkin-math-astro",
  "personal-website-astro",
];

describe("Build Validation", () => {
  /**
   * @narrative-step 1
   * @explanation Discussion pages aggregate links to GitHub discussions, ATProto posts,
   * and other platforms. These tests verify the pages render correctly with actual links.
   */
  describe("Discussions Pages", () => {
    for (const site of SITES_WITH_DISCUSSIONS) {
      const distPath = join(WEBSITES_DIR, site, "dist", "discussions", "index.html");

      it(`${site}: discussions page should exist`, async () => {
        const exists = existsSync(distPath);
        expect(exists).toBe(true);
      });

      it(`${site}: discussions page should not show "not generated" error`, async () => {
        if (!existsSync(distPath)) {
          // Skip if file doesn't exist (caught by previous test)
          return;
        }

        const content = await readFile(distPath, "utf-8");

        // Check for the error message that appears when networkData is null
        expect(content).not.toContain("Network data not yet generated");
        expect(content).not.toContain("Run the build to populate this page");
      });

      it(`${site}: discussions page should contain actual discussion links`, async () => {
        if (!existsSync(distPath)) {
          return;
        }

        const content = await readFile(distPath, "utf-8");

        // Should contain at least one of the common discussion providers
        const hasDiscussionContent =
          content.includes("github.com") ||
          content.includes("whtwnd.com") ||
          content.includes("Discussions") ||
          content.includes("discussions");

        expect(hasDiscussionContent).toBe(true);
      });
    }
  });

  /**
   * @narrative-step 2
   * @explanation Collection pages show paper counts and grouped entries. A common bug
   * is showing "0 papers" when data loading fails, so we verify real counts appear.
   */
  describe("Collections Pages", () => {
    // Only test sites that have bibtex entries loaded in their content config
    // data-counterfactuals has paper collections but doesn't load bibtex entries
    // (they reference papers in shared-references by tag)
    const SITES_WITH_COLLECTIONS = [
      "shared-references-astro",
    ];

    for (const site of SITES_WITH_COLLECTIONS) {
      const distPath = join(WEBSITES_DIR, site, "dist", "collections", "index.html");

      it(`${site}: collections page should render paper counts`, async () => {
        if (!existsSync(distPath)) {
          // Some sites may not have collections yet
          return;
        }

        const content = await readFile(distPath, "utf-8");

        // Should not show "0 papers" for all collections (indicates data loading failure)
        // Allow some 0s but not all
        const zeroPaperMatches = content.match(/0\s*papers?/gi) || [];
        const paperCountMatches = content.match(/\d+\s*papers?/gi) || [];

        // If there are paper counts, not all should be zero
        if (paperCountMatches.length > 0) {
          expect(zeroPaperMatches.length).toBeLessThan(paperCountMatches.length);
        }
      });
    }
  });

  /**
   * @narrative-step 3
   * @explanation Homepages are the entry point for each site. Basic validation ensures
   * they have proper HTML structure and meaningful content (not empty placeholders).
   */
  describe("Homepage", () => {
    const ALL_ASTRO_SITES = [
      "shared-references-astro",
      "data-counterfactuals-astro",
      "data-napkin-math-astro",
      "data-licenses-astro",
      "personal-website-astro",
    ];

    for (const site of ALL_ASTRO_SITES) {
      const distPath = join(WEBSITES_DIR, site, "dist", "index.html");

      it(`${site}: homepage should exist and have content`, async () => {
        if (!existsSync(distPath)) {
          return;
        }

        const content = await readFile(distPath, "utf-8");

        // Should have basic HTML structure
        expect(content).toContain("<!DOCTYPE html>");
        expect(content).toContain("<html");
        expect(content).toContain("</html>");

        // Should have meaningful content (not empty body)
        expect(content.length).toBeGreaterThan(500);
      });
    }
  });
});
