import puppeteer, { Browser, Page } from "puppeteer";
import { mkdir } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

export const BASE_URL = "http://localhost:3000";
export const API_URL = "http://localhost:3001";

// Get directory of this file for absolute paths
const __dirname = dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = join(__dirname, "screenshots");

export interface TestContext {
  browser: Browser;
  page: Page;
}

/**
 * Check if the web server is running.
 * Returns true if the server responds, false otherwise.
 */
export async function isServerRunning(): Promise<boolean> {
  try {
    const response = await fetch(BASE_URL, {
      method: "HEAD",
      signal: AbortSignal.timeout(2000)
    });
    return response.ok || response.status < 500;
  } catch {
    return false;
  }
}

/**
 * Cached result of server check (checked once at module load)
 */
let _serverAvailable: boolean | null = null;

export async function checkServerAvailability(): Promise<boolean> {
  if (_serverAvailable === null) {
    _serverAvailable = await isServerRunning();
    if (!_serverAvailable) {
      console.log("\n⚠️  Web server not running at", BASE_URL);
      console.log("   Start it with: bun run web");
      console.log("   Skipping integration tests.\n");
    }
  }
  return _serverAvailable;
}

export async function setupBrowser(): Promise<TestContext> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  return { browser, page };
}

export async function teardownBrowser(ctx: TestContext): Promise<void> {
  await ctx.browser.close();
}

export async function takeScreenshot(
  page: Page,
  name: string
): Promise<string> {
  // Ensure screenshots directory exists
  await mkdir(SCREENSHOTS_DIR, { recursive: true });
  const screenshotPath = join(SCREENSHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`Screenshot saved: ${screenshotPath}`);
  return screenshotPath;
}

export async function waitForPageLoad(page: Page): Promise<void> {
  await page.waitForFunction(() => document.readyState === "complete");
  // Wait for React to hydrate and any loading states to resolve
  await new Promise((resolve) => setTimeout(resolve, 2000));
}

export async function waitForSelector(
  page: Page,
  selector: string,
  timeout = 10000
): Promise<void> {
  await page.waitForSelector(selector, { timeout });
}

export async function waitForText(
  page: Page,
  text: string,
  timeout = 10000
): Promise<void> {
  await page.waitForFunction(
    (searchText) => document.body.textContent?.includes(searchText),
    { timeout },
    text
  );
}
