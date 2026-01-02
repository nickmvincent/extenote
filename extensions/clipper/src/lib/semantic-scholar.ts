/**
 * Semantic Scholar API client for metadata lookup
 * https://api.semanticscholar.org/
 */

import type { PageMetadata } from "./types";
import { cachedFetch } from "./cache";

const S2_API = "https://api.semanticscholar.org/graph/v1";
const FIELDS = "title,authors,year,venue,abstract,externalIds,citationCount";

export interface S2Author {
  authorId: string;
  name: string;
}

export interface S2ExternalIds {
  DOI?: string;
  ArXiv?: string;
  DBLP?: string;
  PubMed?: string;
}

export interface S2Paper {
  paperId: string;
  title: string;
  authors?: S2Author[];
  year?: number;
  venue?: string;
  abstract?: string;
  externalIds?: S2ExternalIds;
  citationCount?: number;
}

export interface S2SearchResult {
  total: number;
  data: S2Paper[];
}

export interface S2SearchResponse {
  paper: S2Paper | null;
  source: "doi" | "arxiv" | "s2id" | "title";
}

/**
 * Search by DOI (with caching)
 */
async function searchByDoi(doi: string): Promise<S2Paper | null> {
  try {
    const url = `${S2_API}/paper/DOI:${encodeURIComponent(doi)}?fields=${FIELDS}`;
    return await cachedFetch<S2Paper>(url);
  } catch {
    return null;
  }
}

/**
 * Search by ArXiv ID (with caching)
 */
async function searchByArxiv(arxivId: string): Promise<S2Paper | null> {
  try {
    // Normalize arxiv ID (remove version suffix if present)
    const normalized = arxivId.replace(/v\d+$/, "");
    const url = `${S2_API}/paper/arXiv:${encodeURIComponent(normalized)}?fields=${FIELDS}`;
    return await cachedFetch<S2Paper>(url);
  } catch {
    return null;
  }
}

/**
 * Search by Semantic Scholar paper ID (with caching)
 */
async function searchByS2Id(s2Id: string): Promise<S2Paper | null> {
  try {
    const url = `${S2_API}/paper/${encodeURIComponent(s2Id)}?fields=${FIELDS}`;
    return await cachedFetch<S2Paper>(url);
  } catch {
    return null;
  }
}

/**
 * Search by title (with caching)
 */
async function searchByTitle(title: string): Promise<S2Paper | null> {
  try {
    const query = encodeURIComponent(title);
    const url = `${S2_API}/paper/search?query=${query}&limit=1&fields=${FIELDS}`;

    const data = await cachedFetch<S2SearchResult>(url);
    if (data?.data && data.data.length > 0) {
      return data.data[0];
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Detect query type and search appropriately
 */
export async function searchSemanticScholar(query: string): Promise<S2SearchResponse> {
  const trimmed = query.trim();

  // Check if it's a DOI (starts with 10.)
  if (/^10\.\d+\//.test(trimmed)) {
    const paper = await searchByDoi(trimmed);
    return { paper, source: "doi" };
  }

  // Check if it's an arXiv ID (e.g., 2301.12345 or arXiv:2301.12345)
  const arxivMatch = trimmed.match(/^(?:arXiv:)?(\d{4}\.\d{4,5}(?:v\d+)?)$/i);
  if (arxivMatch) {
    const paper = await searchByArxiv(arxivMatch[1]);
    return { paper, source: "arxiv" };
  }

  // Check if it looks like an S2 paper ID (40-char hex)
  if (/^[a-f0-9]{40}$/i.test(trimmed)) {
    const paper = await searchByS2Id(trimmed);
    return { paper, source: "s2id" };
  }

  // Fall back to title search
  const paper = await searchByTitle(trimmed);
  return { paper, source: "title" };
}

/**
 * Convert S2 paper to PageMetadata format
 */
export function s2PaperToMetadata(paper: S2Paper, sourceUrl: string): PageMetadata {
  return {
    url: sourceUrl,
    title: paper.title,
    authors: paper.authors?.map(a => a.name) || [],
    year: paper.year?.toString(),
    venue: paper.venue || undefined,
    abstract: paper.abstract || undefined,
    doi: paper.externalIds?.DOI,
    arxivId: paper.externalIds?.ArXiv,
  };
}

/**
 * Get completeness score for ranking results
 * Higher score = more complete metadata
 */
export function getCompletenessScore(paper: S2Paper): number {
  let score = 0;
  if (paper.title) score += 1;
  if (paper.authors && paper.authors.length > 0) score += 2;
  if (paper.year) score += 1;
  if (paper.venue) score += 1;
  if (paper.abstract) score += 1;
  if (paper.externalIds?.DOI) score += 1;
  return score;
}
