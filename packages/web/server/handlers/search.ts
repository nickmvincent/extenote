/**
 * Search API handlers
 */

import { json } from "../utils.js";
import { loadVaultBundle, getSearchIndex, invalidateSearchIndex } from "../cache.js";
import type { SearchOptions, SearchResult } from "@extenote/core";

/**
 * Search request parameters
 */
interface SearchQuery {
  q: string;
  limit?: string;
  type?: string;
  project?: string;
  prefix?: string;
  fuzzy?: string;
}

/**
 * Parse search query parameters
 */
function parseSearchQuery(url: URL): SearchQuery & { parsedLimit: number; parsedPrefix: boolean; parsedFuzzy: number } {
  const q = url.searchParams.get("q") || "";
  const limit = url.searchParams.get("limit");
  const type = url.searchParams.get("type") || undefined;
  const project = url.searchParams.get("project") || undefined;
  const prefix = url.searchParams.get("prefix");
  const fuzzy = url.searchParams.get("fuzzy");

  return {
    q,
    limit: limit || undefined,
    type,
    project,
    prefix: prefix || undefined,
    fuzzy: fuzzy || undefined,
    parsedLimit: limit ? parseInt(limit, 10) : 50,
    parsedPrefix: prefix !== "false",
    parsedFuzzy: fuzzy ? parseFloat(fuzzy) : 0.2,
  };
}

/**
 * Handle search request
 * GET /api/search?q=<query>&limit=50&type=doc&project=main
 */
export async function handleSearch(
  cwd: string,
  url: URL,
  headers: Record<string, string>
): Promise<Response> {
  const params = parseSearchQuery(url);

  if (!params.q.trim()) {
    return json(
      {
        results: [],
        query: params.q,
        count: 0,
      },
      200,
      headers
    );
  }

  // Get or build search index
  const index = await getSearchIndex(cwd);

  // Build search options
  const options: SearchOptions = {
    limit: params.parsedLimit,
    type: params.type,
    project: params.project,
    prefix: params.parsedPrefix,
    fuzzy: params.parsedFuzzy,
  };

  // Execute search
  const results = index.search(params.q, options);

  return json(
    {
      results: results.map((r) => ({
        id: r.id,
        score: r.score,
        terms: r.terms,
        type: r.object?.type,
        title: r.object?.title,
        project: r.object?.project,
        path: r.object?.relativePath,
      })),
      query: params.q,
      count: results.length,
      options: {
        limit: options.limit,
        type: options.type,
        project: options.project,
      },
    },
    200,
    headers
  );
}

/**
 * Handle search suggestions
 * GET /api/search/suggest?q=<partial>&limit=10
 */
export async function handleSearchSuggest(
  cwd: string,
  url: URL,
  headers: Record<string, string>
): Promise<Response> {
  const partial = url.searchParams.get("q") || "";
  const limit = parseInt(url.searchParams.get("limit") || "10", 10);

  if (!partial.trim()) {
    return json({ suggestions: [] }, 200, headers);
  }

  const index = await getSearchIndex(cwd);
  const suggestions = index.suggest(partial, limit);

  return json(
    {
      suggestions,
      partial,
    },
    200,
    headers
  );
}

/**
 * Handle search index stats
 * GET /api/search/stats
 */
export async function handleSearchStats(
  cwd: string,
  headers: Record<string, string>
): Promise<Response> {
  const index = await getSearchIndex(cwd);
  const stats = index.getStats();

  return json(
    {
      indexed: true,
      documentCount: stats.documentCount,
      termCount: stats.termCount,
      lastUpdated: stats.lastUpdated,
      lastUpdatedISO: new Date(stats.lastUpdated).toISOString(),
    },
    200,
    headers
  );
}

/**
 * Handle search index rebuild
 * POST /api/search/rebuild
 */
export async function handleSearchRebuild(
  cwd: string,
  headers: Record<string, string>
): Promise<Response> {
  // Invalidate cache to force rebuild
  invalidateSearchIndex();

  // Rebuild index
  const index = await getSearchIndex(cwd);
  const stats = index.getStats();

  return json(
    {
      success: true,
      message: "Search index rebuilt",
      documentCount: stats.documentCount,
      termCount: stats.termCount,
    },
    200,
    headers
  );
}
