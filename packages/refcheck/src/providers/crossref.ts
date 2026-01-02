/**
 * Crossref Provider
 *
 * Searches Crossref for paper metadata.
 * Official DOI registry, authoritative for DOI metadata.
 */

import type { EntryMetadata, PaperMetadata, LookupResult } from "../types.js";
import { BaseProvider, registerProvider } from "./base.js";
import { extractDoi, jaccardSimilarity, parseYear } from "../normalize.js";

const CROSSREF_API = "https://api.crossref.org/works";
const USER_AGENT = "Extenote-Refcheck/1.0 (https://github.com/nickmvincent/extenote; mailto:extenote@example.com)";

interface CrossrefAuthor {
  given?: string;
  family?: string;
  name?: string;
}

interface CrossrefWork {
  DOI: string;
  title?: string[];
  author?: CrossrefAuthor[];
  published?: {
    "date-parts"?: number[][];
  };
  "published-print"?: {
    "date-parts"?: number[][];
  };
  "published-online"?: {
    "date-parts"?: number[][];
  };
  "container-title"?: string[];
  abstract?: string;
  URL?: string;
}

interface CrossrefResponse {
  status: string;
  message: CrossrefWork | {
    items: CrossrefWork[];
    "total-results": number;
  };
}

export class CrossrefProvider extends BaseProvider {
  readonly name = "crossref";

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
    const url = `${CROSSREF_API}/${encodeURIComponent(doi)}`;

    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
    });

    if (!response.ok) {
      if (response.status === 404) return this.notFound();
      return this.error(`Crossref API error: ${response.status}`);
    }

    const data: CrossrefResponse = await response.json();
    const work = data.message as CrossrefWork;

    return this.found(this.toPaperMetadata(work));
  }

  private async searchByTitle(entry: EntryMetadata): Promise<LookupResult> {
    if (!entry.title) {
      return this.notFound();
    }

    const url = new URL(CROSSREF_API);
    url.searchParams.set("query.title", entry.title);
    url.searchParams.set("rows", "5");

    const year = parseYear(entry.year);
    if (year) {
      url.searchParams.set("filter", `from-pub-date:${year},until-pub-date:${year}`);
    }

    const response = await fetch(url.toString(), {
      headers: { "User-Agent": USER_AGENT },
    });

    if (!response.ok) {
      return this.error(`Crossref API error: ${response.status}`);
    }

    const data: CrossrefResponse = await response.json();
    const message = data.message as { items: CrossrefWork[]; "total-results": number };

    if (!message.items || message.items.length === 0) {
      return this.notFound();
    }

    // Find best match
    const bestMatch = this.findBestMatch(entry, message.items);
    if (!bestMatch) {
      return this.notFound();
    }

    return this.found(this.toPaperMetadata(bestMatch));
  }

  private findBestMatch(
    entry: EntryMetadata,
    works: CrossrefWork[]
  ): CrossrefWork | null {
    let bestWork: CrossrefWork | null = null;
    let bestScore = 0;

    for (const work of works) {
      const title = work.title?.[0] || "";
      const similarity = jaccardSimilarity(entry.title, title);

      if (similarity > bestScore && similarity > 0.7) {
        bestScore = similarity;
        bestWork = work;
      }
    }

    return bestWork;
  }

  private toPaperMetadata(work: CrossrefWork): PaperMetadata {
    return {
      id: work.DOI,
      title: work.title?.[0] || "",
      authors: this.parseAuthors(work.author),
      year: this.extractYear(work),
      venue: work["container-title"]?.[0],
      doi: work.DOI,
      abstract: work.abstract ? this.cleanAbstract(work.abstract) : undefined,
      url: work.URL,
    };
  }

  private parseAuthors(authors?: CrossrefAuthor[]): string[] | undefined {
    if (!authors) return undefined;

    return authors.map((a) => {
      if (a.name) return a.name;
      const parts = [a.given, a.family].filter(Boolean);
      return parts.join(" ");
    });
  }

  private extractYear(work: CrossrefWork): number | undefined {
    // Try various date fields
    const dateFields = [
      work.published,
      work["published-print"],
      work["published-online"],
    ];

    for (const field of dateFields) {
      const parts = field?.["date-parts"]?.[0];
      if (parts && parts[0]) {
        return parts[0];
      }
    }

    return undefined;
  }

  private cleanAbstract(abstract: string): string {
    // Remove JATS XML tags
    return abstract
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }
}

// Register the provider
registerProvider(new CrossrefProvider());

// Export for direct use
export const crossref = new CrossrefProvider();
