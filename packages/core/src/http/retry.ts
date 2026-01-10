/**
 * Exponential backoff with jitter for resilient HTTP requests
 */

import type { RateLimitInfo } from "./types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

export interface RetryOptions {
  /** Maximum number of retries (default: 3) */
  maxRetries?: number;
  /** Initial delay in ms (default: 100) */
  initialDelay?: number;
  /** Maximum delay in ms (default: 10000) */
  maxDelay?: number;
  /** Custom function to determine if error is retryable */
  shouldRetry?: (error: Error, attempt: number) => boolean;
  /** Callback when a retry is about to happen */
  onRetry?: (error: Error, attempt: number, delay: number) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Delay Calculation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculate retry delay with exponential backoff and jitter.
 *
 * Formula: min(maxDelay, initialDelay * 2^attempt) * (0.5 + random(0.5))
 * The jitter prevents thundering herd when many clients retry simultaneously.
 */
export function calculateRetryDelay(
  attempt: number,
  initialDelay: number = 100,
  maxDelay: number = 10000
): number {
  const exponentialDelay = Math.min(
    maxDelay,
    initialDelay * Math.pow(2, attempt)
  );
  const jitter = 0.5 + Math.random() * 0.5; // 50-100% of calculated delay
  return Math.floor(exponentialDelay * jitter);
}

// ─────────────────────────────────────────────────────────────────────────────
// Rate Limit Header Parsing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse rate limit information from response headers.
 * Supports multiple formats used by different APIs.
 */
export function parseRateLimitHeaders(headers: Headers): RateLimitInfo {
  const info: RateLimitInfo = {};

  // Standard headers (GitHub, many APIs)
  const remaining = headers.get("X-RateLimit-Remaining");
  if (remaining !== null) {
    info.remaining = parseInt(remaining, 10);
  }

  const limit = headers.get("X-RateLimit-Limit");
  if (limit !== null) {
    info.limit = parseInt(limit, 10);
  }

  const reset = headers.get("X-RateLimit-Reset");
  if (reset !== null) {
    info.resetAt = parseInt(reset, 10);
  }

  // Retry-After (RFC 7231) - seconds or HTTP date
  const retryAfter = headers.get("Retry-After");
  if (retryAfter !== null) {
    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds)) {
      info.retryAfter = seconds;
    } else {
      // Parse HTTP date
      const date = new Date(retryAfter);
      if (!isNaN(date.getTime())) {
        info.retryAfter = Math.max(
          0,
          Math.ceil((date.getTime() - Date.now()) / 1000)
        );
      }
    }
  }

  return info;
}

// ─────────────────────────────────────────────────────────────────────────────
// Retryable Error Detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default function to determine if an HTTP error is retryable.
 * Retries on:
 * - 429 (rate limit)
 * - 503 (service unavailable)
 * - 502 (bad gateway)
 * - 504 (gateway timeout)
 * - Network errors
 */
export function isRetryableError(error: Error): boolean {
  // Check for HTTP status codes in error message or name
  const message = error.message.toLowerCase();

  // Rate limit
  if (message.includes("429") || message.includes("rate limit")) {
    return true;
  }

  // Server errors that may recover
  if (
    message.includes("502") ||
    message.includes("503") ||
    message.includes("504")
  ) {
    return true;
  }

  // Network errors
  if (
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("econnreset") ||
    message.includes("econnrefused") ||
    message.includes("fetch failed")
  ) {
    return true;
  }

  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Retry Wrapper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execute a function with retry logic.
 *
 * @returns Object with result and number of attempts used
 * @throws The last error if all retries are exhausted
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<{ result: T; attempts: number }> {
  const {
    maxRetries = 3,
    initialDelay = 100,
    maxDelay = 10000,
    shouldRetry = isRetryableError,
    onRetry,
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      return { result, attempts: attempt + 1 };
    } catch (error) {
      lastError = error as Error;

      // Don't retry if we've exhausted attempts
      if (attempt >= maxRetries) {
        break;
      }

      // Don't retry if error is not retryable
      if (!shouldRetry(lastError, attempt)) {
        break;
      }

      // Calculate delay
      const delay = calculateRetryDelay(attempt, initialDelay, maxDelay);

      // Call onRetry callback
      if (onRetry) {
        onRetry(lastError, attempt + 1, delay);
      }

      // Wait before retrying
      await sleep(delay);
    }
  }

  throw lastError;
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
