/**
 * HTTP utilities for rate-limited, resilient API calls
 *
 * This module provides:
 * - Rate limiting per provider (token bucket)
 * - Circuit breaker for flaky APIs
 * - Exponential backoff with jitter
 * - Unified HTTP client
 */

// Types
export type {
  ProviderConfig,
  HttpRequestOptions,
  HttpResponse,
  RateLimitInfo,
  CircuitState,
  CircuitBreakerState,
} from "./types.js";

export {
  RateLimitError,
  CircuitOpenError,
  HttpTimeoutError,
  HttpError,
} from "./types.js";

// Rate Limiter
export { RateLimiter } from "./rate-limiter.js";

// Circuit Breaker
export { CircuitBreaker } from "./circuit-breaker.js";
export type { CircuitBreakerConfig } from "./circuit-breaker.js";

// Retry utilities
export {
  calculateRetryDelay,
  parseRateLimitHeaders,
  isRetryableError,
  withRetry,
} from "./retry.js";
export type { RetryOptions } from "./retry.js";

// HTTP Client
export {
  HttpClient,
  getHttpClient,
  resetHttpClient,
  createHttpClient,
  DEFAULT_PROVIDER_CONFIGS,
} from "./http-client.js";
export type { HttpClientOptions } from "./http-client.js";
