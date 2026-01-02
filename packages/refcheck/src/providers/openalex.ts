/**
 * OpenAlex Provider
 *
 * Searches OpenAlex for paper metadata.
 * Broad coverage across all academic fields.
 */

import type { EntryMetadata, PaperMetadata, LookupResult } from "../types.js";
import { BaseProvider, registerProvider } from "./base.js";
import { extractDoi, jaccardSimilarity, parseYear } from "../normalize.js";

const OPENALEX_API = "https://api.openalex.org/works";
const POLITE_EMAIL = "extenote-refcheck@example.com";

interface OpenAlexWork {
  id: string;
  title: string;
  authorships?: Array<{
    author: {
      display_name: string;
    };
  }>;
  publication_year?: number;
  primary_location?: {
    source?: {
      display_name?: string;
    };
  };
  doi?: string;
  abstract_inverted_index?: Record<string, number[]>;
}

interface OpenAlexResponse {
  results: OpenAlexWork[];
  meta: {
    count: number;
  };
}

export class OpenAlexProvider extends BaseProvider {
  readonly name = "openalex";

  async lookup(entry: EntryMetadata): Promise<LookupResult> {
    try {
      // Try DOI lookup first
      const doi = entry.doi || extractDoi(entry.url || "");
      if (doi) {
        const result = await this.lookupByDoi(doi);
        if (result.found) return result;
      }

      // Fall back to title search
      return await this.searchByTitle(entry);
    } catch (err) {
      return this.error(err instanceof Error ? err.message : "Unknown error");
    }
  }

  private async lookupByDoi(doi: string): Promise<LookupResult> {
    const url = new URL(OPENALEX_API);
    url.searchParams.set("filter", `doi:${doi}`);
    url.searchParams.set("mailto", POLITE_EMAIL);

    const response = await fetch(url.toString());
    if (!response.ok) {
      return this.error(`OpenAlex API error: ${response.status}`);
    }

    const data: OpenAlexResponse = await response.json();

    if (!data.results || data.results.length === 0) {
      return this.notFound();
    }

    return this.found(this.toPaperMetadata(data.results[0]));
  }

  private async searchByTitle(entry: EntryMetadata): Promise<LookupResult> {
    if (!entry.title) {
      return this.notFound();
    }

    const url = new URL(OPENALEX_API);
    url.searchParams.set("search", entry.title);
    url.searchParams.set("mailto", POLITE_EMAIL);
    url.searchParams.set("per_page", "5");

    const year = parseYear(entry.year);
    if (year) {
      url.searchParams.set("filter", `publication_year:${year}`);
    }

    const response = await fetch(url.toString());
    if (!response.ok) {
      return this.error(`OpenAlex API error: ${response.status}`);
    }

    const data: OpenAlexResponse = await response.json();

    if (!data.results || data.results.length === 0) {
      return this.notFound();
    }

    // Find best match
    const bestMatch = this.findBestMatch(entry, data.results);
    if (!bestMatch) {
      return this.notFound();
    }

    return this.found(this.toPaperMetadata(bestMatch));
  }

  private findBestMatch(
    entry: EntryMetadata,
    works: OpenAlexWork[]
  ): OpenAlexWork | null {
    let bestWork: OpenAlexWork | null = null;
    let bestScore = 0;

    for (const work of works) {
      const similarity = jaccardSimilarity(entry.title, work.title || "");

      if (similarity > bestScore && similarity > 0.7) {
        bestScore = similarity;
        bestWork = work;
      }
    }

    return bestWork;
  }

  private toPaperMetadata(work: OpenAlexWork): PaperMetadata {
    // Reconstruct abstract from inverted index
    let abstract: string | undefined;
    if (work.abstract_inverted_index) {
      abstract = this.reconstructAbstract(work.abstract_inverted_index);
    }

    // Extract DOI without URL prefix
    let doi = work.doi;
    if (doi?.startsWith("https://doi.org/")) {
      doi = doi.slice(16);
    }

    return {
      id: work.id,
      title: work.title,
      authors: work.authorships?.map((a) => a.author.display_name),
      year: work.publication_year,
      venue: work.primary_location?.source?.display_name,
      doi,
      abstract,
    };
  }

  private reconstructAbstract(
    invertedIndex: Record<string, number[]>
  ): string {
    const words: Array<[string, number]> = [];

    for (const [word, positions] of Object.entries(invertedIndex)) {
      for (const pos of positions) {
        words.push([word, pos]);
      }
    }

    words.sort((a, b) => a[1] - b[1]);
    return words.map(([word]) => word).join(" ");
  }
}

// Register the provider
registerProvider(new OpenAlexProvider());

// Export for direct use
export const openalex = new OpenAlexProvider();
