/**
 * Centralized API route definitions
 * All API endpoints should be defined here to ensure consistency
 */

export const API_ROUTES = {
  // Vault operations
  VAULT: '/api/vault',
  RELOAD: '/api/reload',
  WRITE: '/api/write',
  CREATE: '/api/create',

  // Object operations
  CROSSREFS: (objectPath: string) => `/api/crossrefs/${encodeURIComponent(objectPath)}`,

  // Refcheck operations
  REFCHECK: '/api/refcheck',
  REFCHECK_STATS: '/api/refcheck/stats',
  REFCHECK_PROVIDERS: '/api/refcheck/providers',

  // Tag operations
  TAGS: '/api/tags',
  TAGS_PREVIEW: '/api/tags/preview',
  TAGS_APPLY: '/api/tags/apply',
  TAGS_TAXONOMY: '/api/tags/taxonomy',
  TAGS_TAXONOMY_FIX: '/api/tags/taxonomy/fix',

  // Graph operations
  GRAPH: (type: string) => `/api/graph?type=${type}`,
  GRAPH_PROJECT_DEPS: '/api/graph?type=project-deps',
  GRAPH_TAG_EXPLORER: '/api/graph?type=tag-explorer',
  GRAPH_TAG_TAXONOMY: '/api/graph?type=tag-taxonomy',

  // Export operations
  EXPORT: '/api/export',

  // Website operations
  WEBSITES: '/api/websites',

  // System status
  CACHE_STATUS: '/api/cache/status',
  COMPUTED_DATA: '/api/computed-data',

  // Settings
  SETTINGS: '/api/settings',
  SETTINGS_RESET: '/api/settings/reset',
} as const;
