/**
 * OpenAlex API client for metadata enrichment
 * Fetches canonical metadata and validates against local data
 */

import type { PageMetadata } from "./types";
import { cachedFetch } from "./cache";

const OPENALEX_API = "https://api.openalex.org";

export interface OpenAlexWork {
  id: string;
  title: string;
  publication_year: number;
  doi?: string;
  authorships: Array<{
    author: {
      display_name: string;
    };
  }>;
  primary_location?: {
    source?: {
      display_name: string;
    };
  };
  abstract_inverted_index?: Record<string, number[]>;
}

export interface CheckLogResult {
  checked_at: string;
  checked_with: "openalex" | "dblp";
  status: "confirmed" | "mismatch" | "not_found";
  paper_id?: string;
  fields: {
    title: {
      local: string;
      remote?: string;
      match: boolean;
      edit_distance?: number;
    };
    authors: {
      local_count: number;
      remote_count?: number;
      count_match: boolean;
      details?: Array<{
        index: number;
        local: string;
        remote?: string;
        first_match: boolean;
        last_match: boolean;
      }>;
    };
    year: {
      local: string;
      remote?: string;
      match: boolean;
      year_diff?: number;
    };
    venue?: {
      local?: string;
      remote?: string;
      match: boolean;
      edit_distance?: number;
    };
  };
  remote?: {
    title: string;
    authors: string[];
    year: number;
    venue?: string;
    doi?: string;
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
 * Reconstruct abstract from inverted index
 */
function reconstructAbstract(invertedIndex: Record<string, number[]>): string {
  const words: [string, number][] = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    for (const pos of positions) {
      words.push([word, pos]);
    }
  }
  words.sort((a, b) => a[1] - b[1]);
  return words.map(([word]) => word).join(" ");
}

/**
 * Search OpenAlex by DOI (with caching)
 */
async function searchByDoi(doi: string): Promise<OpenAlexWork | null> {
  try {
    const url = `${OPENALEX_API}/works/https://doi.org/${doi}`;
    return await cachedFetch<OpenAlexWork>(url, {
      headers: { "Accept": "application/json" },
    });
  } catch {
    return null;
  }
}

/**
 * Search OpenAlex by title (with caching)
 */
async function searchByTitle(title: string): Promise<OpenAlexWork | null> {
  try {
    const query = encodeURIComponent(title);
    const url = `${OPENALEX_API}/works?search=${query}&per_page=1`;

    const data = await cachedFetch<{ results: OpenAlexWork[] }>(url, {
      headers: { "Accept": "application/json" },
    });

    if (data?.results && data.results.length > 0) {
      return data.results[0];
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch and validate metadata from OpenAlex
 */
export async function enrichWithOpenAlex(
  metadata: PageMetadata
): Promise<{ enriched: Partial<PageMetadata>; checkLog: CheckLogResult }> {
  // Try DOI first, then title
  let work: OpenAlexWork | null = null;

  if (metadata.doi) {
    work = await searchByDoi(metadata.doi);
  }

  if (!work && metadata.title) {
    work = await searchByTitle(metadata.title);
  }

  const now = new Date().toISOString();

  if (!work) {
    return {
      enriched: {},
      checkLog: {
        checked_at: now,
        checked_with: "openalex",
        status: "not_found",
        fields: {
          title: { local: metadata.title, match: false },
          authors: { local_count: metadata.authors?.length || 0, count_match: false },
          year: { local: metadata.year || "", match: false },
        },
      },
    };
  }

  // Extract remote data
  const remoteAuthors = work.authorships.map((a) => a.author.display_name);
  const remoteVenue = work.primary_location?.source?.display_name;
  const remoteDoi = work.doi?.replace("https://doi.org/", "");

  // Compare fields
  const titleMatch = normalizeTitle(metadata.title) === normalizeTitle(work.title);
  const titleDistance = editDistance(
    normalizeTitle(metadata.title),
    normalizeTitle(work.title)
  );

  const localYear = metadata.year || "";
  const remoteYear = work.publication_year?.toString() || "";
  const yearMatch = localYear === remoteYear;
  const yearDiff = Math.abs(
    parseInt(localYear) - parseInt(remoteYear)
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

  if (!metadata.abstract && work.abstract_inverted_index) {
    enriched.abstract = reconstructAbstract(work.abstract_inverted_index);
  }

  return {
    enriched,
    checkLog: {
      checked_at: now,
      checked_with: "openalex",
      status,
      paper_id: work.id.replace("https://openalex.org/", ""),
      fields: {
        title: {
          local: metadata.title,
          remote: work.title,
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
          remote: remoteYear,
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
        title: work.title,
        authors: remoteAuthors,
        year: work.publication_year,
        venue: remoteVenue,
        doi: remoteDoi,
      },
    },
  };
}

/**
 * Direct search result for the new API-first flow
 */
export interface OpenAlexSearchResponse {
  paper: {
    title: string;
    authors: string[];
    year?: string;
    venue?: string;
    doi?: string;
    abstract?: string;
    openAlexId?: string;
  } | null;
  source: "doi" | "title";
}

/**
 * Search OpenAlex directly by query string
 * Supports DOIs (10.xxx) and title strings
 */
export async function searchOpenAlex(query: string): Promise<OpenAlexSearchResponse> {
  const trimmed = query.trim();

  // Check if it's a DOI
  if (/^10\.\d+\//.test(trimmed)) {
    const work = await searchByDoi(trimmed);
    if (work) {
      return {
        paper: workToPaper(work),
        source: "doi",
      };
    }
    return { paper: null, source: "doi" };
  }

  // Clean title query
  const cleanQuery = trimmed
    .replace(/\s*\|\s*[^|]+$/, "")
    .replace(/\s*-\s*[^-]+$/, "")
    .trim();

  const work = await searchByTitle(cleanQuery);

  if (!work) {
    return { paper: null, source: "title" };
  }

  return {
    paper: workToPaper(work),
    source: "title",
  };
}

/**
 * Convert OpenAlex work to paper format
 */
function workToPaper(work: OpenAlexWork): OpenAlexSearchResponse["paper"] {
  return {
    title: work.title,
    authors: work.authorships.map(a => a.author.display_name),
    year: work.publication_year?.toString(),
    venue: work.primary_location?.source?.display_name,
    doi: work.doi?.replace("https://doi.org/", ""),
    abstract: work.abstract_inverted_index ? reconstructAbstract(work.abstract_inverted_index) : undefined,
    openAlexId: work.id.replace("https://openalex.org/", ""),
  };
}

/**
 * Get completeness score for ranking
 */
export function getOpenAlexCompletenessScore(paper: OpenAlexSearchResponse["paper"]): number {
  if (!paper) return 0;
  let score = 0;
  if (paper.title) score += 1;
  if (paper.authors && paper.authors.length > 0) score += 2;
  if (paper.year) score += 1;
  if (paper.venue) score += 1;
  if (paper.doi) score += 1;
  if (paper.abstract) score += 1;
  return score;
}
