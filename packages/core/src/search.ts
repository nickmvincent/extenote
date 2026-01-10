/**
 * Full-text search indexing using MiniSearch
 *
 * Provides fast, scalable search across vault objects with:
 * - BM25 ranking with field boosting
 * - Prefix matching for autocomplete
 * - Field-specific queries (title:foo, tag:ml)
 * - Incremental updates without full rebuild
 * - Serialization for disk caching
 */

import MiniSearch, { type SearchResult as MiniSearchResult } from "minisearch";
import type { VaultObject } from "./types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SearchOptions {
  /** Maximum results to return */
  limit?: number;
  /** Filter by object type */
  type?: string;
  /** Filter by project */
  project?: string;
  /** Enable prefix matching for autocomplete */
  prefix?: boolean;
  /** Fuzzy matching tolerance (0-1) */
  fuzzy?: number;
  /** Boost specific fields (e.g., { title: 2, tags: 1.5 }) */
  boost?: Record<string, number>;
  /** Fields to return in results */
  fields?: string[];
}

export interface SearchResult {
  /** Object ID */
  id: string;
  /** Search relevance score */
  score: number;
  /** Matched terms */
  terms: string[];
  /** Which fields matched */
  match: Record<string, string[]>;
  /** Object metadata */
  object?: {
    type: string;
    title?: string;
    project: string;
    relativePath: string;
  };
}

export interface SearchIndexStats {
  /** Total documents indexed */
  documentCount: number;
  /** Total terms in index */
  termCount: number;
  /** Average document length */
  avgFieldLength: Record<string, number>;
  /** Last index update timestamp */
  lastUpdated: number;
}

export interface SearchIndexState {
  /** Serialized MiniSearch index */
  index: string;
  /** Object metadata for enriching results */
  metadata: Map<string, SearchResult["object"]>;
  /** Stats about the index */
  stats: SearchIndexStats;
}

// ─────────────────────────────────────────────────────────────────────────────
// Field Configuration
// ─────────────────────────────────────────────────────────────────────────────

/** Fields to index for full-text search */
const INDEXED_FIELDS = ["title", "body", "tags", "id"] as const;

/** Default field boost weights */
const DEFAULT_BOOST = {
  title: 10,
  tags: 5,
  id: 2,
  body: 1,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Search Index Class
// ─────────────────────────────────────────────────────────────────────────────

export class SearchIndex {
  private miniSearch: MiniSearch;
  private metadata: Map<string, SearchResult["object"]>;
  private lastUpdated: number;

  constructor() {
    this.miniSearch = new MiniSearch({
      fields: [...INDEXED_FIELDS],
      storeFields: ["type", "project"],
      idField: "id",
      tokenize: (text) => text.toLowerCase().split(/[\s\-_/.:,;!?'"()[\]{}]+/),
      processTerm: (term) => (term.length > 1 ? term : null),
    });
    this.metadata = new Map();
    this.lastUpdated = 0;
  }

  /**
   * Index a vault object
   */
  addObject(obj: VaultObject): void {
    const doc = this.objectToDocument(obj);
    this.miniSearch.add(doc);
    this.metadata.set(obj.id, {
      type: obj.type,
      title: obj.title,
      project: obj.project,
      relativePath: obj.relativePath,
    });
    this.lastUpdated = Date.now();
  }

  /**
   * Update an existing object in the index
   */
  updateObject(obj: VaultObject): void {
    if (this.metadata.has(obj.id)) {
      this.miniSearch.discard(obj.id);
    }
    this.addObject(obj);
  }

  /**
   * Remove an object from the index
   */
  removeObject(id: string): boolean {
    if (this.metadata.has(id)) {
      this.miniSearch.discard(id);
      this.metadata.delete(id);
      this.lastUpdated = Date.now();
      return true;
    }
    return false;
  }

  /**
   * Index all objects from a vault
   */
  indexAll(objects: VaultObject[]): void {
    // Clear existing index
    this.miniSearch = new MiniSearch({
      fields: [...INDEXED_FIELDS],
      storeFields: ["type", "project"],
      idField: "id",
      tokenize: (text) => text.toLowerCase().split(/[\s\-_/.:,;!?'"()[\]{}]+/),
      processTerm: (term) => (term.length > 1 ? term : null),
    });
    this.metadata.clear();

    // Add all objects
    const docs = objects.map((obj) => this.objectToDocument(obj));
    this.miniSearch.addAll(docs);

    // Store metadata
    for (const obj of objects) {
      this.metadata.set(obj.id, {
        type: obj.type,
        title: obj.title,
        project: obj.project,
        relativePath: obj.relativePath,
      });
    }

    this.lastUpdated = Date.now();
  }

  /**
   * Search the index
   */
  search(query: string, options: SearchOptions = {}): SearchResult[] {
    const { limit = 50, type, project, prefix = true, fuzzy = 0.2, boost = DEFAULT_BOOST } = options;

    // Parse field-specific queries (e.g., "title:foo tag:ml")
    const { parsedQuery, fieldFilters } = this.parseQuery(query);

    if (!parsedQuery.trim()) {
      return [];
    }

    // Build MiniSearch options
    const searchOptions: Parameters<MiniSearch["search"]>[1] = {
      prefix,
      fuzzy,
      boost,
      combineWith: "AND",
    };

    // Apply field filters from query syntax
    if (Object.keys(fieldFilters).length > 0) {
      searchOptions.filter = (result: MiniSearchResult) => {
        for (const [field, value] of Object.entries(fieldFilters)) {
          if (field === "type" && result.type !== value) return false;
          if (field === "project" && result.project !== value) return false;
        }
        return true;
      };
    }

    // Execute search
    let results = this.miniSearch.search(parsedQuery, searchOptions);

    // Apply additional filters
    if (type) {
      results = results.filter((r: MiniSearchResult) => r.type === type);
    }
    if (project) {
      results = results.filter((r: MiniSearchResult) => r.project === project);
    }

    // Convert to SearchResult format and limit
    return results.slice(0, limit).map((r: MiniSearchResult) => ({
      id: r.id,
      score: r.score,
      terms: r.terms,
      match: r.match,
      object: this.metadata.get(r.id),
    }));
  }

  /**
   * Suggest completions for a partial query
   */
  suggest(partial: string, limit = 10): string[] {
    if (!partial.trim()) return [];

    const results = this.miniSearch.autoSuggest(partial, {
      prefix: true,
      fuzzy: 0.2,
    });

    return results.slice(0, limit).map((r) => r.suggestion);
  }

  /**
   * Get index statistics
   */
  getStats(): SearchIndexStats {
    return {
      documentCount: this.miniSearch.documentCount,
      termCount: this.miniSearch.termCount,
      avgFieldLength: {}, // MiniSearch doesn't expose this directly
      lastUpdated: this.lastUpdated,
    };
  }

  /**
   * Serialize the index for caching
   */
  serialize(): string {
    const state: SearchIndexState = {
      index: JSON.stringify(this.miniSearch),
      metadata: this.metadata,
      stats: this.getStats(),
    };
    return JSON.stringify(state, (_key, value) => {
      // Handle Map serialization
      if (value instanceof Map) {
        return { __type: "Map", entries: Array.from(value.entries()) };
      }
      return value;
    });
  }

  /**
   * Load a serialized index
   */
  static deserialize(data: string): SearchIndex {
    const state = JSON.parse(data, (_key, value) => {
      // Handle Map deserialization
      if (value && value.__type === "Map") {
        return new Map(value.entries);
      }
      return value;
    }) as SearchIndexState;

    const index = new SearchIndex();
    index.miniSearch = MiniSearch.loadJSON(state.index, {
      fields: [...INDEXED_FIELDS],
      storeFields: ["type", "project"],
      idField: "id",
      tokenize: (text) => text.toLowerCase().split(/[\s\-_/.:,;!?'"()[\]{}]+/),
      processTerm: (term) => (term.length > 1 ? term : null),
    });
    index.metadata = state.metadata;
    index.lastUpdated = state.stats.lastUpdated;

    return index;
  }

  /**
   * Check if the index has any documents
   */
  isEmpty(): boolean {
    return this.miniSearch.documentCount === 0;
  }

  /**
   * Get document count
   */
  get documentCount(): number {
    return this.miniSearch.documentCount;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private Methods
  // ─────────────────────────────────────────────────────────────────────────

  private objectToDocument(obj: VaultObject): Record<string, unknown> {
    // Extract tags from frontmatter
    const tags = this.extractTags(obj.frontmatter);

    return {
      id: obj.id,
      title: obj.title || "",
      body: obj.body || "",
      tags: tags.join(" "),
      type: obj.type,
      project: obj.project,
    };
  }

  private extractTags(frontmatter: Record<string, unknown>): string[] {
    const tags = frontmatter.tags;
    if (Array.isArray(tags)) {
      return tags.filter((t): t is string => typeof t === "string");
    }
    if (typeof tags === "string") {
      return [tags];
    }
    return [];
  }

  private parseQuery(query: string): {
    parsedQuery: string;
    fieldFilters: Record<string, string>;
  } {
    const fieldFilters: Record<string, string> = {};
    const parts: string[] = [];

    // Match field:value patterns
    const fieldPattern = /(\w+):(\S+)/g;
    let match: RegExpExecArray | null;
    let lastIndex = 0;

    while ((match = fieldPattern.exec(query)) !== null) {
      // Add text before the match
      const before = query.slice(lastIndex, match.index).trim();
      if (before) parts.push(before);

      const [, field, value] = match;

      // Handle special field mappings
      if (field === "type" || field === "project") {
        fieldFilters[field] = value;
      } else if (field === "tag" || field === "tags") {
        // Search in tags field
        parts.push(value);
      } else {
        // Treat as regular search term
        parts.push(`${field}:${value}`);
      }

      lastIndex = fieldPattern.lastIndex;
    }

    // Add remaining text
    const remaining = query.slice(lastIndex).trim();
    if (remaining) parts.push(remaining);

    return {
      parsedQuery: parts.join(" "),
      fieldFilters,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory Function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a new search index from vault objects
 */
export function createSearchIndex(objects: VaultObject[]): SearchIndex {
  const index = new SearchIndex();
  index.indexAll(objects);
  return index;
}

/**
 * Create an empty search index
 */
export function createEmptySearchIndex(): SearchIndex {
  return new SearchIndex();
}
