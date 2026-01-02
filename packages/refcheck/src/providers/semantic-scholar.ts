/**
 * Semantic Scholar Provider
 *
 * Searches Semantic Scholar for paper metadata.
 * Good coverage across fields, provides abstracts.
 */

import type { EntryMetadata, PaperMetadata, LookupResult } from "../types.js";
import { BaseProvider, registerProvider } from "./base.js";
import { extractDoi, extractArxivId, jaccardSimilarity, parseYear } from "../normalize.js";

const S2_API_BASE = "https://api.semanticscholar.org/graph/v1";
const S2_FIELDS = "title,authors,year,venue,externalIds,abstract,url";

interface S2Author {
  name: string;
  authorId?: string;
}

interface S2Paper {
  paperId: string;
  title: string;
  authors?: S2Author[];
  year?: number;
  venue?: string;
  abstract?: string;
  url?: string;
  externalIds?: {
    DOI?: string;
    ArXiv?: string;
    CorpusId?: string;
  };
}

interface S2SearchResponse {
  total: number;
  data: S2Paper[];
}

export class SemanticScholarProvider extends BaseProvider {
  readonly name = "s2";

  async lookup(entry: EntryMetadata): Promise<LookupResult> {
    try {
      // Try DOI lookup first (most reliable)
      const doi = entry.doi || extractDoi(entry.url || "");
      if (doi) {
        const result = await this.lookupByDoi(doi);
        if (result.found) return result;
      }

      // Try arXiv ID
      const arxivId = extractArxivId(entry.url || "");
      if (arxivId) {
        const result = await this.lookupByArxiv(arxivId);
        if (result.found) return result;
      }

      // Fall back to title search
      return await this.searchByTitle(entry);
    } catch (err) {
      return this.error(err instanceof Error ? err.message : "Unknown error");
    }
  }

  private async lookupByDoi(doi: string): Promise<LookupResult> {
    const url = `${S2_API_BASE}/paper/DOI:${encodeURIComponent(doi)}?fields=${S2_FIELDS}`;

    const response = await fetch(url);
    if (!response.ok) {
      if (response.status === 404) return this.notFound();
      return this.error(`S2 API error: ${response.status}`);
    }

    const paper: S2Paper = await response.json();
    return this.found(this.toPaperMetadata(paper));
  }

  private async lookupByArxiv(arxivId: string): Promise<LookupResult> {
    const url = `${S2_API_BASE}/paper/arXiv:${encodeURIComponent(arxivId)}?fields=${S2_FIELDS}`;

    const response = await fetch(url);
    if (!response.ok) {
      if (response.status === 404) return this.notFound();
      return this.error(`S2 API error: ${response.status}`);
    }

    const paper: S2Paper = await response.json();
    return this.found(this.toPaperMetadata(paper));
  }

  private async searchByTitle(entry: EntryMetadata): Promise<LookupResult> {
    if (!entry.title) {
      return this.notFound();
    }

    // Build search query
    let query = entry.title;
    const year = parseYear(entry.year);
    if (year) {
      query += ` ${year}`;
    }

    const url = new URL(`${S2_API_BASE}/paper/search`);
    url.searchParams.set("query", query);
    url.searchParams.set("fields", S2_FIELDS);
    url.searchParams.set("limit", "5");

    const response = await fetch(url.toString());
    if (!response.ok) {
      return this.error(`S2 API error: ${response.status}`);
    }

    const data: S2SearchResponse = await response.json();

    if (!data.data || data.data.length === 0) {
      return this.notFound();
    }

    // Find best match
    const bestMatch = this.findBestMatch(entry, data.data);
    if (!bestMatch) {
      return this.notFound();
    }

    return this.found(this.toPaperMetadata(bestMatch));
  }

  private findBestMatch(entry: EntryMetadata, papers: S2Paper[]): S2Paper | null {
    let bestPaper: S2Paper | null = null;
    let bestScore = 0;

    for (const paper of papers) {
      const similarity = jaccardSimilarity(entry.title, paper.title || "");

      if (similarity > bestScore && similarity > 0.7) {
        bestScore = similarity;
        bestPaper = paper;
      }
    }

    return bestPaper;
  }

  private toPaperMetadata(paper: S2Paper): PaperMetadata {
    return {
      id: paper.paperId,
      title: paper.title,
      authors: paper.authors?.map((a) => a.name),
      year: paper.year,
      venue: paper.venue,
      doi: paper.externalIds?.DOI,
      abstract: paper.abstract,
      url: paper.url,
    };
  }
}

// Register the provider
registerProvider(new SemanticScholarProvider());

// Export for direct use
export const semanticScholar = new SemanticScholarProvider();
