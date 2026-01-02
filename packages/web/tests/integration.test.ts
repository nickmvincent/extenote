import { describe, it, expect, beforeAll, afterAll, setDefaultTimeout } from "bun:test";
import {
  setupBrowser,
  teardownBrowser,
  takeScreenshot,
  waitForPageLoad,
  checkServerAvailability,
  BASE_URL,
  TestContext,
} from "./setup";

// Set longer timeout for integration tests (60 seconds)
setDefaultTimeout(60000);

// Check server availability before running tests
const serverAvailable = await checkServerAvailability();

let ctx: TestContext;

describe.skipIf(!serverAvailable)("Extenote Web Integration Tests", () => {
  beforeAll(async () => {
    ctx = await setupBrowser();
  });

  afterAll(async () => {
    if (ctx) {
      await teardownBrowser(ctx);
    }
  });

  describe("Dashboard Page", () => {
    it("should load the dashboard and display project stats", async () => {
      await ctx.page.goto(BASE_URL, { waitUntil: "networkidle0", timeout: 30000 });
      await waitForPageLoad(ctx.page);

      const title = await ctx.page.title();
      expect(title).toContain("Extenote");

      await takeScreenshot(ctx.page, "01-dashboard");
    });

    it("should display navigation links", async () => {
      const navExists = await ctx.page.evaluate(() => {
        const nav = document.querySelector("nav");
        return nav !== null;
      });
      expect(navExists).toBe(true);

      await takeScreenshot(ctx.page, "02-dashboard-nav");
    });
  });

  describe("Search Page", () => {
    it("should load the search page", async () => {
      await ctx.page.goto(`${BASE_URL}/search`, { waitUntil: "networkidle0", timeout: 30000 });
      await waitForPageLoad(ctx.page);
      await takeScreenshot(ctx.page, "03-search-empty");
    });

    it("should allow entering search queries", async () => {
      const searchInput = await ctx.page.$('input[type="text"], input[type="search"]');
      if (searchInput) {
        await searchInput.type("test");
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      await takeScreenshot(ctx.page, "04-search-with-query");
    });
  });

  describe("Graph Page", () => {
    it("should load the graph page with visualization", async () => {
      await ctx.page.goto(`${BASE_URL}/graph`, { waitUntil: "networkidle0", timeout: 30000 });
      await waitForPageLoad(ctx.page);
      // Extra wait for graph rendering
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await takeScreenshot(ctx.page, "05-graph-default");
    });

    it("should display graph tabs", async () => {
      const hasGraphContent = await ctx.page.evaluate(() => {
        return document.body.textContent?.includes("Graph") ||
               document.querySelector("svg") !== null ||
               document.querySelector("canvas") !== null;
      });
      expect(hasGraphContent).toBe(true);
      await takeScreenshot(ctx.page, "06-graph-tabs");
    });
  });

  describe("Tags Page", () => {
    it("should load the tags page", async () => {
      await ctx.page.goto(`${BASE_URL}/tags`, { waitUntil: "networkidle0", timeout: 30000 });
      await waitForPageLoad(ctx.page);
      await takeScreenshot(ctx.page, "07-tags");
    });

    it("should display tag tree or list", async () => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await takeScreenshot(ctx.page, "08-tags-tree");
    });
  });

  describe("Issues Page", () => {
    it("should load the issues page", async () => {
      await ctx.page.goto(`${BASE_URL}/issues`, { waitUntil: "networkidle0", timeout: 30000 });
      await waitForPageLoad(ctx.page);
      await takeScreenshot(ctx.page, "09-issues");
    });

    it("should display issue filters or list", async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await takeScreenshot(ctx.page, "10-issues-list");
    });
  });

  describe("Export Page", () => {
    it("should load the export page", async () => {
      await ctx.page.goto(`${BASE_URL}/export`, { waitUntil: "networkidle0", timeout: 30000 });
      await waitForPageLoad(ctx.page);
      await takeScreenshot(ctx.page, "11-export");
    });

    it("should display export options", async () => {
      const hasExportOptions = await ctx.page.evaluate(() => {
        const text = document.body.textContent || "";
        return (
          text.includes("JSON") ||
          text.includes("Markdown") ||
          text.includes("BibTeX") ||
          text.includes("Format") ||
          text.includes("Export")
        );
      });
      expect(hasExportOptions).toBe(true);
      await takeScreenshot(ctx.page, "12-export-options");
    });
  });

  describe("Create Form Page", () => {
    it("should load the create form page", async () => {
      await ctx.page.goto(`${BASE_URL}/create-form`, { waitUntil: "networkidle0", timeout: 30000 });
      await waitForPageLoad(ctx.page);
      await takeScreenshot(ctx.page, "13-create-form");
    });

    it("should display form fields", async () => {
      const hasFormElements = await ctx.page.evaluate(() => {
        return (
          document.querySelector("form") !== null ||
          document.querySelector("input") !== null ||
          document.querySelector("select") !== null
        );
      });
      expect(hasFormElements).toBe(true);
      await takeScreenshot(ctx.page, "14-create-form-fields");
    });
  });

  describe("Schemas Page", () => {
    it("should load the schemas reference page", async () => {
      await ctx.page.goto(`${BASE_URL}/schemas`, { waitUntil: "networkidle0", timeout: 30000 });
      await waitForPageLoad(ctx.page);
      await takeScreenshot(ctx.page, "15-schemas");
    });
  });

  describe("Refcheck Page", () => {
    it("should load the refcheck page", async () => {
      await ctx.page.goto(`${BASE_URL}/refcheck`, { waitUntil: "networkidle0", timeout: 30000 });
      await waitForPageLoad(ctx.page);
      await takeScreenshot(ctx.page, "16-refcheck");
    });

    it("should display refcheck providers or options", async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await takeScreenshot(ctx.page, "17-refcheck-options");
    });
  });

  describe("Review Page", () => {
    it("should load the review page", async () => {
      await ctx.page.goto(`${BASE_URL}/review`, { waitUntil: "networkidle0", timeout: 30000 });
      await waitForPageLoad(ctx.page);
      await takeScreenshot(ctx.page, "18-review");
    });
  });

  describe("Websites Page", () => {
    it("should load the websites page", async () => {
      await ctx.page.goto(`${BASE_URL}/websites`, { waitUntil: "networkidle0", timeout: 30000 });
      await waitForPageLoad(ctx.page);
      await takeScreenshot(ctx.page, "19-websites");
    });
  });

  describe("Theme Toggle", () => {
    it("should toggle between light and dark themes", async () => {
      await ctx.page.goto(BASE_URL, { waitUntil: "networkidle0", timeout: 30000 });
      await waitForPageLoad(ctx.page);

      await takeScreenshot(ctx.page, "20-theme-initial");

      // Look for theme toggle button and click it
      const themeToggle = await ctx.page.$(
        'button[aria-label*="theme"], button[title*="theme"], [data-theme-toggle], button:has(svg)'
      );
      if (themeToggle) {
        await themeToggle.click();
        await new Promise((resolve) => setTimeout(resolve, 500));
        await takeScreenshot(ctx.page, "21-theme-toggled");
      }
    });
  });

  describe("Navigation Flow", () => {
    it("should navigate through main sections", async () => {
      await ctx.page.goto(BASE_URL, { waitUntil: "networkidle0", timeout: 30000 });
      await waitForPageLoad(ctx.page);

      // Get hrefs to avoid stale element issues
      const hrefs = await ctx.page.$$eval("nav a", (links) =>
        links
          .map((link) => link.getAttribute("href"))
          .filter((href) => href && !href.startsWith("http"))
          .slice(0, 3)
      );

      // Navigate to first few pages
      for (const href of hrefs) {
        if (href) {
          await ctx.page.goto(`${BASE_URL}${href}`, { waitUntil: "networkidle0", timeout: 30000 });
          await waitForPageLoad(ctx.page);
        }
      }

      await takeScreenshot(ctx.page, "22-navigation-final");
    });
  });

  describe("Responsive Layout", () => {
    it("should display correctly at tablet width", async () => {
      await ctx.page.setViewport({ width: 1280, height: 800 });
      await ctx.page.goto(BASE_URL, { waitUntil: "networkidle0", timeout: 30000 });
      await waitForPageLoad(ctx.page);

      await ctx.page.setViewport({ width: 768, height: 1024 });
      await new Promise((resolve) => setTimeout(resolve, 500));
      await takeScreenshot(ctx.page, "23-responsive-tablet");
    });

    it("should display correctly at mobile width", async () => {
      await ctx.page.setViewport({ width: 375, height: 667 });
      await ctx.page.goto(BASE_URL, { waitUntil: "networkidle0", timeout: 30000 });
      await waitForPageLoad(ctx.page);

      await takeScreenshot(ctx.page, "24-responsive-mobile");

      // Reset viewport
      await ctx.page.setViewport({ width: 1280, height: 800 });
    });
  });

  describe("Error Handling", () => {
    it("should handle 404 pages gracefully", async () => {
      await ctx.page.goto(`${BASE_URL}/nonexistent-page`, { waitUntil: "networkidle0", timeout: 30000 });
      await waitForPageLoad(ctx.page);
      await takeScreenshot(ctx.page, "25-404-page");
    });
  });
});
