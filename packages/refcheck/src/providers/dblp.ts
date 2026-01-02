/**
 * DBLP Provider
 *
 * Searches DBLP (Computer Science Bibliography) for paper metadata.
 * Best for computer science papers, provides authoritative BibTeX.
 */

import type { EntryMetadata, PaperMetadata, LookupResult } from "../types.js";
import { BaseProvider, registerProvider } from "./base.js";
import { jaccardSimilarity, parseYear } from "../normalize.js";

const DBLP_SEARCH_API = "https://dblp.org/search/publ/api";
const DBLP_BIBTEX_BASE = "https://dblp.org/rec";

interface DblpHit {
  "@id": string;
  info: {
    title: string;
    authors?: { author: string | string[] | { text: string }[] };
    year?: string;
    venue?: string;
    doi?: string;
    url?: string;
    key?: string;
  };
}

interface DblpSearchResponse {
  result: {
    hits?: {
      "@total": string;
      hit?: DblpHit | DblpHit[];
    };
  };
}

export class DblpProvider extends BaseProvider {
  readonly name = "dblp";

  async lookup(entry: EntryMetadata): Promise<LookupResult> {
    try {
      // Build search query
      const query = this.buildQuery(entry);
      if (!query) {
        return this.notFound();
      }

      // Search DBLP
      const url = new URL(DBLP_SEARCH_API);
      url.searchParams.set("q", query);
      url.searchParams.set("format", "json");
      url.searchParams.set("h", "5"); // Get top 5 results

      const response = await fetch(url.toString());
      if (!response.ok) {
        return this.error(`DBLP API error: ${response.status}`);
      }

      const data: DblpSearchResponse = await response.json();

      // Parse results
      const hits = this.parseHits(data);
      if (hits.length === 0) {
        return this.notFound();
      }

      // Find best match
      const bestMatch = this.findBestMatch(entry, hits);
      if (!bestMatch) {
        return this.notFound();
      }

      // Convert to paper metadata
      const paper = this.hitToPaper(bestMatch);

      // Optionally fetch BibTeX
      if (bestMatch.info.key) {
        const bibtex = await this.fetchBibtex(bestMatch.info.key, entry.id);
        if (bibtex) {
          paper.bibtex = bibtex;
        }
      }

      return this.found(paper);
    } catch (err) {
      return this.error(err instanceof Error ? err.message : "Unknown error");
    }
  }

  private buildQuery(entry: EntryMetadata): string | null {
    const parts: string[] = [];

    // Add title words (required)
    if (entry.title) {
      // Extract meaningful words
      const words = entry.title
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3)
        .slice(0, 6);
      parts.push(...words);
    }

    if (parts.length === 0) {
      return null;
    }

    // Add year if available (improves accuracy)
    const year = parseYear(entry.year);
    if (year) {
      parts.push(`year:${year}`);
    }

    return parts.join(" ");
  }

  private parseHits(data: DblpSearchResponse): DblpHit[] {
    const hits = data.result?.hits?.hit;
    if (!hits) return [];
    return Array.isArray(hits) ? hits : [hits];
  }

  private findBestMatch(entry: EntryMetadata, hits: DblpHit[]): DblpHit | null {
    let bestHit: DblpHit | null = null;
    let bestScore = 0;

    for (const hit of hits) {
      const hitTitle = hit.info?.title || "";
      const similarity = jaccardSimilarity(entry.title, hitTitle);

      if (similarity > bestScore && similarity > 0.7) {
        bestScore = similarity;
        bestHit = hit;
      }
    }

    return bestHit;
  }

  private hitToPaper(hit: DblpHit): PaperMetadata {
    const info = hit.info;

    return {
      id: info.key || hit["@id"],
      title: info.title || "",
      authors: this.parseAuthors(info.authors),
      year: info.year ? parseInt(info.year, 10) : undefined,
      venue: info.venue,
      doi: info.doi,
      url: info.url,
    };
  }

  private parseAuthors(
    authorsData: DblpHit["info"]["authors"]
  ): string[] | undefined {
    if (!authorsData) return undefined;

    const authorList = authorsData.author;
    if (!authorList) return undefined;

    if (typeof authorList === "string") {
      return [authorList];
    }

    if (Array.isArray(authorList)) {
      return authorList.map((a) => (typeof a === "string" ? a : a.text));
    }

    return undefined;
  }

  private async fetchBibtex(
    key: string,
    citationKey?: string
  ): Promise<string | null> {
    try {
      const url = `${DBLP_BIBTEX_BASE}/${key}.bib`;
      const response = await fetch(url);

      if (!response.ok) {
        return null;
      }

      let bibtex = await response.text();

      // Replace DBLP key with user's citation key if provided
      if (citationKey) {
        bibtex = bibtex.replace(
          /^(@\w+{)DBLP:[^,]+/m,
          `$1${citationKey}`
        );
      }

      return bibtex;
    } catch {
      return null;
    }
  }
}

// Register the provider
registerProvider(new DblpProvider());

// Export for direct use
export const dblp = new DblpProvider();
