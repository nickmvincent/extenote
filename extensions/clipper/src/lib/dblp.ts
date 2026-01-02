/**
 * DBLP API client for metadata enrichment
 * Fetches canonical metadata from DBLP and validates against local data
 */

import type { PageMetadata } from "./types";
import type { CheckLogResult } from "./openalex";
import { cachedFetch } from "./cache";

const DBLP_API = "https://dblp.org/search/publ/api";

export interface DblpHit {
  info: {
    title: string;
    authors?: { author: Array<{ text: string } | string> };
    year?: string;
    venue?: string;
    doi?: string;
    url?: string;
    key?: string;
  };
}

export interface DblpSearchResult {
  result: {
    hits?: {
      hit?: DblpHit[];
    };
  };
}

/**
 * Calculate Levenshtein edit distance
 */
function editDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Normalize title for comparison
 */
function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^\w\s]/g, "").trim();
}

/**
 * Extract last name from author string
 */
function extractLastName(author: string): string {
  // Handle "Last, First" format
  if (author.includes(",")) {
    return author.split(",")[0].trim().toLowerCase();
  }
  // Handle "First Last" format
  const parts = author.split(" ");
  return parts[parts.length - 1].toLowerCase();
}

/**
 * Search DBLP by title (with caching)
 */
async function searchByTitle(title: string): Promise<DblpHit | null> {
  try {
    const query = encodeURIComponent(title);
    const url = `${DBLP_API}?q=${query}&format=json&h=1`;

    const data = await cachedFetch<DblpSearchResult>(url, {
      headers: { "Accept": "application/json" },
    });

    if (!data) return null;

    const hits = data.result?.hits?.hit;
    if (hits && hits.length > 0) {
      return hits[0];
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Extract authors from DBLP hit
 */
function extractAuthors(hit: DblpHit): string[] {
  const authorsData = hit.info.authors?.author;
  if (!authorsData) return [];

  // Handle both array and single author cases
  const authorList = Array.isArray(authorsData) ? authorsData : [authorsData];

  return authorList.map((a) => {
    if (typeof a === "string") return a;
    return a.text || "";
  }).filter((a) => a);
}

/**
 * Fetch and validate metadata from DBLP
 */
export async function enrichWithDblp(
  metadata: PageMetadata
): Promise<{ enriched: Partial<PageMetadata>; checkLog: CheckLogResult } | null> {
  // Search by title first (DBLP's search doesn't work well with DOIs)
  let hit: DblpHit | null = null;

  if (metadata.title) {
    // Clean the title - remove venue suffixes that ACM adds
    const cleanTitle = metadata.title
      .replace(/\s*\|\s*[^|]+$/, "") // Remove " | Conference Name" suffix
      .trim();
    hit = await searchByTitle(cleanTitle);
  }

  if (!hit) {
    return null; // Signal to fall back to OpenAlex
  }

  const now = new Date().toISOString();
  const info = hit.info;

  // Extract remote data
  const remoteAuthors = extractAuthors(hit);
  const remoteVenue = info.venue;
  const remoteDoi = info.doi;
  const remoteYear = info.year;
  const remoteTitle = info.title;

  // Compare fields
  const titleMatch = normalizeTitle(metadata.title) === normalizeTitle(remoteTitle);
  const titleDistance = editDistance(
    normalizeTitle(metadata.title),
    normalizeTitle(remoteTitle)
  );

  const localYear = metadata.year || "";
  const yearMatch = localYear === remoteYear;
  const yearDiff = Math.abs(
    parseInt(localYear) - parseInt(remoteYear || "0")
  ) || 0;

  const authorCountMatch =
    (metadata.authors?.length || 0) === remoteAuthors.length;

  // Detailed author comparison
  const authorDetails = (metadata.authors || []).map((local, i) => {
    const remote = remoteAuthors[i];
    const localLast = extractLastName(local);
    const remoteLast = remote ? extractLastName(remote) : "";
    return {
      index: i,
      local,
      remote,
      first_match: local.split(" ")[0]?.toLowerCase() === remote?.split(" ")[0]?.toLowerCase(),
      last_match: localLast === remoteLast,
    };
  });

  const venueDistance = metadata.venue && remoteVenue
    ? editDistance(metadata.venue.toLowerCase(), remoteVenue.toLowerCase())
    : undefined;

  // Determine overall status
  const allMatch = titleMatch && yearMatch && authorCountMatch;
  const status: "confirmed" | "mismatch" = allMatch ? "confirmed" : "mismatch";

  // Build enriched metadata (fill in missing fields)
  const enriched: Partial<PageMetadata> = {};

  if (!metadata.year && remoteYear) {
    enriched.year = remoteYear;
  }

  if (!metadata.doi && remoteDoi) {
    enriched.doi = remoteDoi;
  }

  if (!metadata.venue && remoteVenue) {
    enriched.venue = remoteVenue;
  }

  // Replace authors if missing OR if they look like garbage (UI text, affiliations)
  const hasValidAuthors = metadata.authors?.length &&
    metadata.authors.every(a =>
      a.length > 2 &&
      !/view profile/i.test(a) &&
      !/university|college|institute/i.test(a)
    );

  if (!hasValidAuthors && remoteAuthors.length) {
    enriched.authors = remoteAuthors;
  }

  return {
    enriched,
    checkLog: {
      checked_at: now,
      checked_with: "dblp" as const,
      status,
      paper_id: info.key,
      fields: {
        title: {
          local: metadata.title,
          remote: remoteTitle,
          match: titleMatch,
          edit_distance: titleDistance,
        },
        authors: {
          local_count: metadata.authors?.length || 0,
          remote_count: remoteAuthors.length,
          count_match: authorCountMatch,
          details: authorDetails,
        },
        year: {
          local: localYear,
          remote: remoteYear || "",
          match: yearMatch,
          year_diff: yearDiff,
        },
        venue: {
          local: metadata.venue,
          remote: remoteVenue,
          match: metadata.venue?.toLowerCase() === remoteVenue?.toLowerCase(),
          edit_distance: venueDistance,
        },
      },
      remote: {
        title: remoteTitle,
        authors: remoteAuthors,
        year: parseInt(remoteYear || "0"),
        venue: remoteVenue,
        doi: remoteDoi,
      },
    },
  };
}

/**
 * Direct search result for the new API-first flow
 */
export interface DblpSearchResponse {
  paper: {
    title: string;
    authors: string[];
    year?: string;
    venue?: string;
    doi?: string;
    dblpKey?: string;
  } | null;
  source: "title";
}

/**
 * Search DBLP directly by query string
 * Returns paper metadata or null
 */
export async function searchDblp(query: string): Promise<DblpSearchResponse> {
  // Clean query - remove venue suffixes that might be appended
  const cleanQuery = query
    .replace(/\s*\|\s*[^|]+$/, "")
    .replace(/\s*-\s*[^-]+$/, "")
    .trim();

  const hit = await searchByTitle(cleanQuery);

  if (!hit) {
    return { paper: null, source: "title" };
  }

  const authors = extractAuthors(hit);

  return {
    paper: {
      title: hit.info.title,
      authors,
      year: hit.info.year,
      venue: hit.info.venue,
      doi: hit.info.doi,
      dblpKey: hit.info.key,
    },
    source: "title",
  };
}

/**
 * Get completeness score for ranking
 */
export function getDblpCompletenessScore(paper: DblpSearchResponse["paper"]): number {
  if (!paper) return 0;
  let score = 0;
  if (paper.title) score += 1;
  if (paper.authors && paper.authors.length > 0) score += 2;
  if (paper.year) score += 1;
  if (paper.venue) score += 1;
  if (paper.doi) score += 1;
  return score;
}
