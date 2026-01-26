/**
 * Archive.org Wayback Machine integration
 * Saves pages to the Wayback Machine and retrieves archive URLs
 */

const WAYBACK_SAVE_URL = "https://web.archive.org/save/";
const WAYBACK_AVAILABILITY_URL = "https://archive.org/wayback/available";

export interface ArchiveResult {
  success: boolean;
  archiveUrl?: string;
  error?: string;
  timestamp?: string;
}

export interface AvailabilityResult {
  available: boolean;
  url?: string;
  timestamp?: string;
  closest?: {
    available: boolean;
    url: string;
    timestamp: string;
    status: string;
  };
}

/**
 * Save a URL to the Wayback Machine
 * Note: This makes a request to archive.org's save endpoint
 */
export async function saveToWaybackMachine(url: string): Promise<ArchiveResult> {
  try {
    // The Wayback Machine save endpoint
    const saveUrl = `${WAYBACK_SAVE_URL}${encodeURIComponent(url)}`;

    // Make a HEAD request first to initiate the save
    // The actual page is saved asynchronously
    const response = await fetch(saveUrl, {
      method: "GET",
      redirect: "follow",
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Archive.org returned ${response.status}: ${response.statusText}`,
      };
    }

    // Check the response headers for the archive URL
    const archiveUrl = response.headers.get("Content-Location") ||
                       response.headers.get("X-Archive-Orig-URL");

    // If we got redirected to the archived page, extract the URL
    const finalUrl = response.url;
    if (finalUrl.includes("web.archive.org/web/")) {
      // Extract timestamp from URL like: https://web.archive.org/web/20240115123456/https://example.com
      const match = finalUrl.match(/web\.archive\.org\/web\/(\d+)\//);
      const timestamp = match ? match[1] : undefined;

      return {
        success: true,
        archiveUrl: finalUrl,
        timestamp,
      };
    }

    // If we have an archive URL from headers
    if (archiveUrl) {
      return {
        success: true,
        archiveUrl,
      };
    }

    // Otherwise, construct the likely archive URL (it may take time to become available)
    const now = new Date();
    const timestamp = now.toISOString().replace(/[-:T]/g, "").slice(0, 14);
    const expectedUrl = `https://web.archive.org/web/${timestamp}/${url}`;

    return {
      success: true,
      archiveUrl: expectedUrl,
      timestamp,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to save to Archive.org",
    };
  }
}

/**
 * Check if a URL has an existing Wayback Machine snapshot
 */
export async function checkWaybackArchive(url: string): Promise<AvailabilityResult> {
  try {
    const apiUrl = `${WAYBACK_AVAILABILITY_URL}?url=${encodeURIComponent(url)}`;

    const response = await fetch(apiUrl);
    if (!response.ok) {
      return { available: false };
    }

    const data = await response.json();

    if (data.archived_snapshots?.closest) {
      const closest = data.archived_snapshots.closest;
      return {
        available: closest.available,
        url: closest.url,
        timestamp: closest.timestamp,
        closest,
      };
    }

    return { available: false };
  } catch {
    return { available: false };
  }
}

/**
 * Format Wayback timestamp for display
 * Input: "20240115123456"
 * Output: "2024-01-15 12:34:56"
 */
export function formatWaybackTimestamp(timestamp: string): string {
  if (timestamp.length !== 14) return timestamp;

  const year = timestamp.slice(0, 4);
  const month = timestamp.slice(4, 6);
  const day = timestamp.slice(6, 8);
  const hour = timestamp.slice(8, 10);
  const minute = timestamp.slice(10, 12);
  const second = timestamp.slice(12, 14);

  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

/**
 * Parse a Wayback Machine URL to extract the original URL and timestamp
 */
export function parseWaybackUrl(archiveUrl: string): { originalUrl: string; timestamp: string } | null {
  const match = archiveUrl.match(/web\.archive\.org\/web\/(\d+)\/(.+)$/);
  if (!match) return null;

  return {
    timestamp: match[1],
    originalUrl: match[2],
  };
}
