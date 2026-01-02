/**
 * Background service worker for Extenote Web Clipper
 *
 * Handles:
 * - Extension installation and updates
 * - Live vault checking (shows badge if page exists in vault)
 * - Badge updates
 */

import { loadConfig } from "../lib/storage";
import type { ClipperConfig } from "../lib/types";

interface CheckLog {
  checked_at?: string;
  status?: "confirmed" | "mismatch" | "not_found" | "error";
}

interface VaultObject {
  id: string;
  relativePath: string;
  frontmatter: {
    type?: string;
    citation_key?: string;
    title?: string;
    url?: string;
    doi?: string;
    arxiv_id?: string;
    check_log?: CheckLog;
  };
}

interface BadgeState {
  text: string;
  color: string;
  title: string;
}

interface VaultCache {
  objects: VaultObject[];
  lastFetch: number;
  apiUrl: string;
}

// Cache vault data to avoid repeated API calls
let vaultCache: VaultCache | null = null;
const CACHE_TTL = 60000; // 1 minute cache

/**
 * Fetch vault objects from API
 */
async function fetchVaultObjects(apiUrl: string): Promise<VaultObject[]> {
  // Check cache
  if (vaultCache &&
      vaultCache.apiUrl === apiUrl &&
      Date.now() - vaultCache.lastFetch < CACHE_TTL) {
    return vaultCache.objects;
  }

  try {
    const response = await fetch(`${apiUrl}/api/vault`);
    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    const objects: VaultObject[] = data.vault?.objects || [];

    // Update cache
    vaultCache = {
      objects,
      lastFetch: Date.now(),
      apiUrl,
    };

    return objects;
  } catch {
    return [];
  }
}

/**
 * Extract identifiers from URL
 */
function extractIdentifiers(url: string): { arxivId?: string; doi?: string; url: string } {
  const result: { arxivId?: string; doi?: string; url: string } = { url };

  // ArXiv ID
  const arxivMatch = url.match(/arxiv\.org\/abs\/(\d+\.\d+)/);
  if (arxivMatch) {
    result.arxivId = arxivMatch[1];
  }

  // DOI from various sources
  const doiPatterns = [
    /doi\.org\/(10\.[^/]+\/[^\s?#]+)/,
    /dl\.acm\.org\/doi\/(10\.[^/]+\/[^\s?#]+)/,
    /doi=(10\.[^&]+)/,
  ];
  for (const pattern of doiPatterns) {
    const match = url.match(pattern);
    if (match) {
      result.doi = decodeURIComponent(match[1]);
      break;
    }
  }

  return result;
}

/**
 * Check if URL matches any vault entry
 */
function findMatchingEntry(
  url: string,
  objects: VaultObject[]
): VaultObject | null {
  const identifiers = extractIdentifiers(url);
  const normalizedUrl = url.split("?")[0].split("#")[0]; // Strip query/hash

  for (const obj of objects) {
    const fm = obj.frontmatter;
    if (!fm || fm.type !== "bibtex_entry") continue;

    // Check URL match
    if (fm.url) {
      const objUrl = fm.url.split("?")[0].split("#")[0];
      if (objUrl === normalizedUrl || fm.url === url) {
        return obj;
      }
    }

    // Check ArXiv ID match
    if (identifiers.arxivId && fm.arxiv_id) {
      const normalizedLocal = fm.arxiv_id.replace(/^arxiv:/i, "");
      if (normalizedLocal === identifiers.arxivId) {
        return obj;
      }
    }

    // Check DOI match
    if (identifiers.doi && fm.doi) {
      const normalizedLocal = fm.doi.toLowerCase().replace(/^https?:\/\/doi\.org\//i, "");
      const normalizedRemote = identifiers.doi.toLowerCase();
      if (normalizedLocal === normalizedRemote) {
        return obj;
      }
    }
  }

  return null;
}

/**
 * Get badge state based on check_log status
 */
function getBadgeState(entry: VaultObject): BadgeState {
  const checkLog = entry.frontmatter.check_log;
  const citationKey = entry.frontmatter.citation_key || entry.id;

  // No check_log = unchecked (gray)
  if (!checkLog || !checkLog.status) {
    return {
      text: "?",
      color: "#888888",
      title: `Unchecked: ${citationKey}`,
    };
  }

  // Check if stale (>30 days old)
  if (checkLog.checked_at) {
    const checkedDate = new Date(checkLog.checked_at);
    const daysSince = (Date.now() - checkedDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince > 30) {
      return {
        text: "?",
        color: "#888888",
        title: `Stale check (${Math.floor(daysSince)}d): ${citationKey}`,
      };
    }
  }

  // Status-based badges
  switch (checkLog.status) {
    case "confirmed":
      return {
        text: "✓",
        color: "#28a745",
        title: `Confirmed: ${citationKey}`,
      };
    case "mismatch":
      return {
        text: "!",
        color: "#ffc107",
        title: `Mismatch: ${citationKey}`,
      };
    case "not_found":
      return {
        text: "✗",
        color: "#dc3545",
        title: `Not found: ${citationKey}`,
      };
    case "error":
      return {
        text: "✗",
        color: "#dc3545",
        title: `Error: ${citationKey}`,
      };
    default:
      return {
        text: "?",
        color: "#888888",
        title: `Unknown: ${citationKey}`,
      };
  }
}

/**
 * Update badge for a tab
 */
async function updateBadgeForTab(tabId: number, url: string) {
  // Skip non-http URLs
  if (!url.startsWith("http")) {
    await browser.action.setBadgeText({ tabId, text: "" });
    return;
  }

  try {
    const config = await loadConfig();

    // Only check if in API mode
    if (config.mode !== "api") {
      await browser.action.setBadgeText({ tabId, text: "" });
      return;
    }

    const objects = await fetchVaultObjects(config.apiUrl);
    const match = findMatchingEntry(url, objects);

    if (match) {
      // Get badge state based on check_log
      const badge = getBadgeState(match);
      await browser.action.setBadgeText({ tabId, text: badge.text });
      await browser.action.setBadgeBackgroundColor({ tabId, color: badge.color });
      await browser.action.setTitle({ tabId, title: badge.title });
    } else {
      await browser.action.setBadgeText({ tabId, text: "" });
      await browser.action.setTitle({ tabId, title: "Extenote Clipper" });
    }
  } catch (err) {
    console.warn("[Extenote] Badge update failed:", err);
    await browser.action.setBadgeText({ tabId, text: "" });
  }
}

/**
 * Handle messages from popup
 */
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_VAULT_MATCH") {
    // Popup asking if current page is in vault
    (async () => {
      try {
        const config = await loadConfig();
        if (config.mode !== "api") {
          sendResponse({ match: null });
          return;
        }

        const objects = await fetchVaultObjects(config.apiUrl);
        const match = findMatchingEntry(message.url, objects);
        sendResponse({
          match: match ? {
            citationKey: match.frontmatter.citation_key || match.id,
            path: match.relativePath,
            title: match.frontmatter.title,
          } : null
        });
      } catch {
        sendResponse({ match: null });
      }
    })();
    return true; // Will respond asynchronously
  }

  if (message.type === "INVALIDATE_CACHE") {
    // Popup telling us to refresh cache (after clipping)
    vaultCache = null;
    sendResponse({ ok: true });
    return;
  }
});

// Listen for tab updates
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) {
    updateBadgeForTab(tabId, tab.url);
  }
});

// Listen for tab activation (switching tabs)
browser.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await browser.tabs.get(activeInfo.tabId);
    if (tab.url) {
      updateBadgeForTab(activeInfo.tabId, tab.url);
    }
  } catch {
    // Tab might not exist
  }
});

// Handle extension install
browser.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    console.log("[Extenote Clipper] Extension installed");
  } else if (details.reason === "update") {
    console.log("[Extenote Clipper] Extension updated to", browser.runtime.getManifest().version);
  }
});

// Log when service worker starts
console.log("[Extenote Clipper] Service worker started");
