/**
 * HTTP utilities types for rate-limited, resilient API calls
 */

// ─────────────────────────────────────────────────────────────────────────────
// Provider Configuration
// ─────────────────────────────────────────────────────────────────────────────

export interface ProviderConfig {
  /** Provider name (e.g., "dblp", "s2", "github") */
  name: string;
  /** Requests allowed per time window */
  requestsPerWindow: number;
  /** Time window in milliseconds */
  windowMs: number;
  /** Initial retry delay in ms (default: 100) */
  initialRetryDelay?: number;
  /** Maximum retry delay in ms (default: 10000) */
  maxRetryDelay?: number;
  /** Maximum number of retries (default: 3) */
  maxRetries?: number;
  /** Circuit breaker failure threshold (default: 5) */
  failureThreshold?: number;
  /** Circuit breaker reset timeout in ms (default: 30000) */
  resetTimeout?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Request/Response
// ─────────────────────────────────────────────────────────────────────────────

export interface HttpRequestOptions {
  /** Provider name for rate limiting */
  provider: string;
  /** Request URL */
  url: string;
  /** HTTP method */
  method?: "GET" | "POST" | "PUT" | "DELETE";
  /** Request headers */
  headers?: Record<string, string>;
  /** Request body (for POST/PUT) */
  body?: string | object;
  /** Request timeout in ms */
  timeout?: number;
  /** Skip rate limiting (for urgent requests) */
  skipRateLimit?: boolean;
  /** Priority (higher = processed first in queue) */
  priority?: number;
}

export interface HttpResponse<T = unknown> {
  /** Response data */
  data: T;
  /** HTTP status code */
  status: number;
  /** Response headers */
  headers: Headers;
  /** Provider that handled the request */
  provider: string;
  /** Time taken in ms */
  durationMs: number;
  /** Number of retries used */
  retries: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Rate Limit Info
// ─────────────────────────────────────────────────────────────────────────────

export interface RateLimitInfo {
  /** Remaining requests in current window */
  remaining?: number;
  /** Total requests allowed per window */
  limit?: number;
  /** When the window resets (Unix timestamp in seconds) */
  resetAt?: number;
  /** Retry after this many seconds */
  retryAfter?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Circuit Breaker
// ─────────────────────────────────────────────────────────────────────────────

export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerState {
  state: CircuitState;
  failures: number;
  lastFailure?: number;
  lastSuccess?: number;
  openedAt?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────────────────────

export class RateLimitError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly retryAfter?: number
  ) {
    super(message);
    this.name = "RateLimitError";
  }
}

export class CircuitOpenError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly resetAt?: number
  ) {
    super(message);
    this.name = "CircuitOpenError";
  }
}

export class HttpTimeoutError extends Error {
  constructor(
    message: string,
    public readonly url: string,
    public readonly timeoutMs: number
  ) {
    super(message);
    this.name = "HttpTimeoutError";
  }
}

export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly url: string
  ) {
    super(message);
    this.name = "HttpError";
  }
}
