/**
 * Shared constants and configuration defaults for Extenote.
 *
 * Environment variables:
 * - EXTENOTE_CONTENT_ROOT: Root directory for content files
 * - EXTENOTE_PRIVATE_ROOT: Root directory for private content files
 * - EXTENOTE_PROJECT_ROOT: Root directory for the extenote project
 * - EXTENOTE_API_PORT: API server port (default: 3001)
 * - EXTENOTE_API_HOST: API server host (default: 127.0.0.1)
 * - EXTENOTE_WEB_ORIGIN: Allowed CORS origins (comma-separated)
 * - EXTENOTE_CACHE_TTL: Web server cache TTL in ms (default: 30000)
 * - EXTENOTE_CACHE_ENABLED: Enable/disable web caching (default: true)
 * - DEBUG: Enable debug logging
 *
 * Integration credentials (set as environment variables):
 * - GITHUB_TOKEN: GitHub API token for discussions
 * - SEMBLE_APP_PASSWORD: ATProto password for Semble sync
 * - ATPROTO_APP_PASSWORD: Generic ATProto password
 * - WHITEWIND_APP_PASSWORD: Whitewind-specific ATProto password
 * - LEAFLET_APP_PASSWORD: Leaflet-specific ATProto password
 * - GOOGLE_APPLICATION_CREDENTIALS: Google Docs service account
 * - GOOGLE_ACCESS_TOKEN: Google Docs access token
 */

// ─────────────────────────────────────────────────────────────────────────────
// Server Defaults
// ─────────────────────────────────────────────────────────────────────────────

/** Default API server port */
export const DEFAULT_API_PORT = 3001

/** Default API server host */
export const DEFAULT_API_HOST = '127.0.0.1'

/** Default web app port */
export const DEFAULT_WEB_PORT = 3000

/** Default cache TTL in milliseconds (30 seconds) */
export const DEFAULT_CACHE_TTL = 30000

/** Default allowed CORS origins */
export const DEFAULT_WEB_ORIGINS = 'http://localhost:3000,http://127.0.0.1:3000'

// ─────────────────────────────────────────────────────────────────────────────
// API Rate Limiting
// ─────────────────────────────────────────────────────────────────────────────

/** Default delay between API requests in milliseconds */
export const DEFAULT_RATE_LIMIT_DELAY = 250

/** Maximum results to request from external APIs */
export const DEFAULT_API_MAX_RESULTS = 5

// ─────────────────────────────────────────────────────────────────────────────
// Paths and Directories
// ─────────────────────────────────────────────────────────────────────────────

/** Default project configs directory name */
export const DEFAULT_PROJECTS_DIR = 'projects'

/** Default schema files directory name */
export const DEFAULT_SCHEMAS_DIR = 'schemas'

/** Default export output directory */
export const DEFAULT_EXPORT_DIR = 'dist/export'

// ─────────────────────────────────────────────────────────────────────────────
// Lint Rules
// ─────────────────────────────────────────────────────────────────────────────

/** Default lint rule severity for required-visibility */
export const DEFAULT_LINT_VISIBILITY_RULE: 'off' | 'warn' | 'error' = 'warn'

/** Default lint autofix setting */
export const DEFAULT_LINT_AUTOFIX = false

// ─────────────────────────────────────────────────────────────────────────────
// Display Limits
// ─────────────────────────────────────────────────────────────────────────────

/** Default limit for list/search results */
export const DEFAULT_LIST_LIMIT = 20

/** Default limit for issue display */
export const DEFAULT_ISSUES_LIMIT = 20

/** Default limit for validation queue */
export const DEFAULT_VALIDATION_QUEUE_LIMIT = 50

// ─────────────────────────────────────────────────────────────────────────────
// Test Timeouts
// ─────────────────────────────────────────────────────────────────────────────

/** Default test timeout in milliseconds */
export const DEFAULT_TEST_TIMEOUT = 30000

// ─────────────────────────────────────────────────────────────────────────────
// Editor
// ─────────────────────────────────────────────────────────────────────────────

/** Default editor command when EDITOR env var is not set */
export const DEFAULT_EDITOR = 'code'

// ─────────────────────────────────────────────────────────────────────────────
// Content Processing
// ─────────────────────────────────────────────────────────────────────────────

/** Context window size for cross-reference extraction (characters before/after) */
export const CROSSREF_CONTEXT_LENGTH = 30

/** Default maximum length for URL slugs */
export const DEFAULT_SLUG_LENGTH = 50

/** Default length for short content previews (e.g. logs) */
export const DEFAULT_SHORT_PREVIEW_LENGTH = 50

// ─────────────────────────────────────────────────────────────────────────────
// Network / Deployment
// ─────────────────────────────────────────────────────────────────────────────

/** Git HTTP post buffer size (500MB) to prevent push errors */
export const GIT_POST_BUFFER_SIZE = "524288000"

/** Default FTP connection timeout in seconds */
export const DEFAULT_FTP_TIMEOUT = 30

/** Default number of parallel FTP upload threads */
export const DEFAULT_FTP_PARALLEL = 4
