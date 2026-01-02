/**
 * Crossref API client for metadata lookup
 * https://api.crossref.org/swagger-ui/index.html
 */

import { cachedFetch } from "./cache";

const CROSSREF_API = "https://api.crossref.org/works";

export interface CrossrefAuthor {
  given?: string;
  family?: string;
  name?: string;
}

export interface CrossrefWork {
  DOI: string;
  title?: string[];
  author?: CrossrefAuthor[];
  "published-print"?: { "date-parts": number[][] };
  "published-online"?: { "date-parts": number[][] };
  issued?: { "date-parts": number[][] };
  "container-title"?: string[];
  abstract?: string;
  type?: string;
}

export interface CrossrefSearchResponse {
  paper: {
    title: string;
    authors?: string[];
    year?: string;
    venue?: string;
    doi?: string;
    abstract?: string;
  } | null;
  raw?: CrossrefWork;
}

/**
 * Format author name from Crossref format
 */
function formatAuthor(author: CrossrefAuthor): string {
  if (author.name) return author.name;
  if (author.given && author.family) {
    return `${author.given} ${author.family}`;
  }
  return author.family || author.given || "";
}

/**
 * Extract year from Crossref date parts
 */
function extractYear(work: CrossrefWork): string | undefined {
  const dateParts =
    work["published-print"]?.["date-parts"]?.[0] ||
    work["published-online"]?.["date-parts"]?.[0] ||
    work.issued?.["date-parts"]?.[0];

  if (dateParts && dateParts[0]) {
    return String(dateParts[0]);
  }
  return undefined;
}

// Response types for Crossref API
interface CrossrefDoiResponse {
  message: CrossrefWork;
}

interface CrossrefSearchResultResponse {
  message: {
    items?: CrossrefWork[];
  };
}

/**
 * Search Crossref by DOI or title (with caching)
 */
export async function searchCrossref(query: string): Promise<CrossrefSearchResponse> {
  try {
    let url: string;
    let isDoi = false;

    // Check if query is a DOI
    const doiMatch = query.match(/10\.\d{4,}\/[^\s]+/i);
    if (doiMatch) {
      // Direct DOI lookup
      url = `${CROSSREF_API}/${encodeURIComponent(doiMatch[0])}`;
      isDoi = true;
    } else {
      // Title search
      url = `${CROSSREF_API}?query.title=${encodeURIComponent(query)}&rows=1`;
    }

    // Use cached fetch
    let work: CrossrefWork | undefined;

    if (isDoi) {
      const data = await cachedFetch<CrossrefDoiResponse>(url, {
        headers: {
          "User-Agent": "ExtenoteClipper/0.2.0 (https://github.com/extenote)",
        },
      });
      work = data?.message;
    } else {
      const data = await cachedFetch<CrossrefSearchResultResponse>(url, {
        headers: {
          "User-Agent": "ExtenoteClipper/0.2.0 (https://github.com/extenote)",
        },
      });
      work = data?.message?.items?.[0];
    }

    if (!work) {
      return { paper: null };
    }

    const title = work.title?.[0];
    if (!title) {
      return { paper: null };
    }

    return {
      paper: {
        title,
        authors: work.author?.map(formatAuthor).filter(Boolean),
        year: extractYear(work),
        venue: work["container-title"]?.[0],
        doi: work.DOI,
        abstract: work.abstract?.replace(/<\/?[^>]+(>|$)/g, ""), // Strip HTML
      },
      raw: work,
    };
  } catch (error) {
    console.warn("[Crossref] Search failed:", error);
    return { paper: null };
  }
}

/**
 * Calculate completeness score for ranking
 */
export function getCrossrefCompletenessScore(paper: CrossrefSearchResponse["paper"]): number {
  if (!paper) return 0;

  let score = 0;
  if (paper.title) score += 2;
  if (paper.authors?.length) score += 2;
  if (paper.year) score += 1;
  if (paper.venue) score += 1;
  if (paper.doi) score += 2;
  if (paper.abstract) score += 1;

  return score;
}
