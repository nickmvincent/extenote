/**
 * Token bucket rate limiter with sliding window
 */

import type { ProviderConfig, RateLimitInfo } from "./types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Rate Limiter State
// ─────────────────────────────────────────────────────────────────────────────

interface TokenBucket {
  tokens: number;
  lastRefill: number;
  config: ProviderConfig;
  /** Override from Retry-After header */
  retryAfter?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Rate Limiter Implementation
// ─────────────────────────────────────────────────────────────────────────────

export class RateLimiter {
  private buckets: Map<string, TokenBucket> = new Map();

  /**
   * Register a provider with its rate limit configuration.
   */
  registerProvider(config: ProviderConfig): void {
    this.buckets.set(config.name, {
      tokens: config.requestsPerWindow,
      lastRefill: Date.now(),
      config,
    });
  }

  /**
   * Get the configuration for a provider.
   */
  getConfig(provider: string): ProviderConfig | undefined {
    return this.buckets.get(provider)?.config;
  }

  /**
   * Check if a request can proceed immediately.
   */
  canProceed(provider: string): boolean {
    const bucket = this.buckets.get(provider);
    if (!bucket) return true; // Unknown provider, allow

    // Check if we're in a retry-after period
    if (bucket.retryAfter && Date.now() < bucket.retryAfter) {
      return false;
    }

    this.refillBucket(bucket);
    return bucket.tokens > 0;
  }

  /**
   * Wait until a request can proceed.
   * @returns Wait time in milliseconds (0 if no wait needed)
   */
  async waitForSlot(provider: string): Promise<number> {
    const bucket = this.buckets.get(provider);
    if (!bucket) return 0; // Unknown provider, no wait

    // Check if we're in a retry-after period
    if (bucket.retryAfter && Date.now() < bucket.retryAfter) {
      const waitTime = bucket.retryAfter - Date.now();
      await sleep(waitTime);
      bucket.retryAfter = undefined;
      return waitTime;
    }

    this.refillBucket(bucket);

    if (bucket.tokens > 0) {
      return 0;
    }

    // Calculate wait time until next token
    const tokensPerMs = bucket.config.requestsPerWindow / bucket.config.windowMs;
    const waitTime = Math.ceil(1 / tokensPerMs);
    await sleep(waitTime);
    this.refillBucket(bucket);
    return waitTime;
  }

  /**
   * Record a request (decrements available tokens).
   */
  recordRequest(provider: string): void {
    const bucket = this.buckets.get(provider);
    if (!bucket) return;

    this.refillBucket(bucket);
    bucket.tokens = Math.max(0, bucket.tokens - 1);
  }

  /**
   * Update rate limits based on response headers.
   */
  updateFromHeaders(provider: string, info: RateLimitInfo): void {
    const bucket = this.buckets.get(provider);
    if (!bucket) return;

    // Update remaining tokens if provided
    if (info.remaining !== undefined) {
      bucket.tokens = info.remaining;
    }

    // Set retry-after if rate limited
    if (info.retryAfter !== undefined) {
      bucket.retryAfter = Date.now() + info.retryAfter * 1000;
    }

    // Update from reset timestamp
    if (info.resetAt !== undefined) {
      // resetAt is Unix timestamp in seconds
      const resetMs = info.resetAt * 1000;
      if (resetMs > Date.now() && bucket.tokens === 0) {
        bucket.retryAfter = resetMs;
      }
    }
  }

  /**
   * Get current state for a provider.
   */
  getState(provider: string): {
    remaining: number;
    resetIn: number;
    limit: number;
  } | null {
    const bucket = this.buckets.get(provider);
    if (!bucket) return null;

    this.refillBucket(bucket);

    const resetIn = bucket.retryAfter
      ? bucket.retryAfter - Date.now()
      : bucket.config.windowMs - (Date.now() - bucket.lastRefill);

    return {
      remaining: bucket.tokens,
      resetIn: Math.max(0, resetIn),
      limit: bucket.config.requestsPerWindow,
    };
  }

  /**
   * Reset rate limiter state for a provider.
   */
  reset(provider: string): void {
    const bucket = this.buckets.get(provider);
    if (bucket) {
      bucket.tokens = bucket.config.requestsPerWindow;
      bucket.lastRefill = Date.now();
      bucket.retryAfter = undefined;
    }
  }

  /**
   * Reset all providers.
   */
  resetAll(): void {
    for (const provider of this.buckets.keys()) {
      this.reset(provider);
    }
  }

  /**
   * Refill tokens based on elapsed time.
   */
  private refillBucket(bucket: TokenBucket): void {
    const now = Date.now();
    const elapsed = now - bucket.lastRefill;

    if (elapsed >= bucket.config.windowMs) {
      // Full window elapsed, refill completely
      bucket.tokens = bucket.config.requestsPerWindow;
      bucket.lastRefill = now;
    } else {
      // Partial refill based on time elapsed
      const tokensToAdd =
        (elapsed / bucket.config.windowMs) * bucket.config.requestsPerWindow;
      bucket.tokens = Math.min(
        bucket.config.requestsPerWindow,
        bucket.tokens + tokensToAdd
      );
      // Update lastRefill proportionally
      if (tokensToAdd >= 1) {
        bucket.lastRefill = now;
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
