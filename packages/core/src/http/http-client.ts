/**
 * Unified HTTP client with rate limiting, circuit breaker, and retry logic
 */

import type {
  ProviderConfig,
  HttpRequestOptions,
  HttpResponse,
} from "./types.js";
import { HttpError, HttpTimeoutError, RateLimitError } from "./types.js";
import { RateLimiter } from "./rate-limiter.js";
import { CircuitBreaker } from "./circuit-breaker.js";
import { withRetry, parseRateLimitHeaders, isRetryableError } from "./retry.js";
import { getLogger } from "../logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// Default Provider Configurations
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_PROVIDER_CONFIGS: ProviderConfig[] = [
  // DBLP: ~1 req/sec is polite
  { name: "dblp", requestsPerWindow: 10, windowMs: 10_000 },
  // Semantic Scholar: 100 requests per 5 minutes without API key
  { name: "s2", requestsPerWindow: 100, windowMs: 300_000, maxRetries: 5 },
  // OpenAlex: 100k/day, ~10/sec is fine
  { name: "openalex", requestsPerWindow: 100, windowMs: 10_000 },
  // Crossref: 50 requests per second with polite pool
  { name: "crossref", requestsPerWindow: 50, windowMs: 1_000 },
  // GitHub GraphQL: 5000/hour with token
  { name: "github", requestsPerWindow: 5000, windowMs: 3_600_000 },
  // ATProto (Bluesky): ~30 req/sec typical
  { name: "atproto", requestsPerWindow: 30, windowMs: 1_000 },
];

// ─────────────────────────────────────────────────────────────────────────────
// HTTP Client Configuration
// ─────────────────────────────────────────────────────────────────────────────

export interface HttpClientOptions {
  /** Custom provider configurations */
  providers?: ProviderConfig[];
  /** Default request timeout in ms (default: 30000) */
  defaultTimeout?: number;
  /** Default number of retries (default: 3) */
  defaultRetries?: number;
  /** Circuit breaker failure threshold (default: 5) */
  circuitFailureThreshold?: number;
  /** Circuit breaker reset timeout in ms (default: 30000) */
  circuitResetTimeout?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP Client Implementation
// ─────────────────────────────────────────────────────────────────────────────

export class HttpClient {
  private rateLimiter: RateLimiter;
  private circuitBreaker: CircuitBreaker;
  private defaultTimeout: number;
  private defaultRetries: number;
  private providerConfigs: Map<string, ProviderConfig>;

  constructor(options: HttpClientOptions = {}) {
    this.defaultTimeout = options.defaultTimeout ?? 30000;
    this.defaultRetries = options.defaultRetries ?? 3;
    this.providerConfigs = new Map();

    // Initialize rate limiter
    this.rateLimiter = new RateLimiter();

    // Initialize circuit breaker
    this.circuitBreaker = new CircuitBreaker(
      options.circuitFailureThreshold ?? 5,
      options.circuitResetTimeout ?? 30000
    );

    // Register default providers
    for (const config of DEFAULT_PROVIDER_CONFIGS) {
      this.registerProvider(config);
    }

    // Register custom providers
    if (options.providers) {
      for (const config of options.providers) {
        this.registerProvider(config);
      }
    }
  }

  /**
   * Register a provider configuration.
   */
  registerProvider(config: ProviderConfig): void {
    this.providerConfigs.set(config.name, config);
    this.rateLimiter.registerProvider(config);

    if (config.failureThreshold || config.resetTimeout) {
      this.circuitBreaker.configure(config.name, {
        failureThreshold: config.failureThreshold,
        resetTimeout: config.resetTimeout,
      });
    }
  }

  /**
   * Make a rate-limited, resilient HTTP request.
   */
  async request<T>(options: HttpRequestOptions): Promise<HttpResponse<T>> {
    const {
      provider,
      url,
      method = "GET",
      headers = {},
      body,
      timeout = this.defaultTimeout,
      skipRateLimit = false,
    } = options;

    const config = this.providerConfigs.get(provider);
    const maxRetries = config?.maxRetries ?? this.defaultRetries;
    const initialRetryDelay = config?.initialRetryDelay ?? 100;
    const maxRetryDelay = config?.maxRetryDelay ?? 10000;

    const logger = getLogger().child({ provider, url: this.truncateUrl(url) });

    // Check circuit breaker
    this.circuitBreaker.checkAllowed(provider);

    // Wait for rate limit slot
    if (!skipRateLimit) {
      const waitTime = await this.rateLimiter.waitForSlot(provider);
      if (waitTime > 0) {
        logger.debug(`Rate limited, waited ${waitTime}ms`);
      }
    }

    const start = performance.now();
    let retryCount = 0;

    try {
      const { result } = await withRetry(
        async () => {
          // Record request for rate limiting
          if (!skipRateLimit) {
            this.rateLimiter.recordRequest(provider);
          }

          // Make the request
          const response = await this.fetchWithTimeout(
            url,
            {
              method,
              headers: {
                "Content-Type": "application/json",
                ...headers,
              },
              body: body
                ? typeof body === "string"
                  ? body
                  : JSON.stringify(body)
                : undefined,
            },
            timeout
          );

          // Parse rate limit headers
          const rateLimitInfo = parseRateLimitHeaders(response.headers);
          this.rateLimiter.updateFromHeaders(provider, rateLimitInfo);

          // Check for rate limit response
          if (response.status === 429) {
            const retryAfter = rateLimitInfo.retryAfter ?? 60;
            throw new RateLimitError(
              `Rate limited by ${provider}`,
              provider,
              retryAfter
            );
          }

          // Check for error responses
          if (!response.ok) {
            throw new HttpError(
              `HTTP ${response.status}: ${response.statusText}`,
              response.status,
              url
            );
          }

          // Parse response
          const data = await response.json();

          return {
            data: data as T,
            status: response.status,
            headers: response.headers,
          };
        },
        {
          maxRetries,
          initialDelay: initialRetryDelay,
          maxDelay: maxRetryDelay,
          shouldRetry: (error, attempt) => {
            retryCount = attempt;

            // Don't retry if circuit is now open
            if (!this.circuitBreaker.isAllowed(provider)) {
              return false;
            }

            return isRetryableError(error);
          },
          onRetry: (error, attempt, delay) => {
            logger.debug(`Retry ${attempt}/${maxRetries} in ${delay}ms`, {
              error: error.message,
            });
          },
        }
      );

      const durationMs = Math.round(performance.now() - start);

      // Record success
      this.circuitBreaker.recordSuccess(provider);

      logger.debug(`Request completed`, { status: result.status, durationMs });

      return {
        data: result.data,
        status: result.status,
        headers: result.headers,
        provider,
        durationMs,
        retries: retryCount,
      };
    } catch (error) {
      const durationMs = Math.round(performance.now() - start);

      // Record failure for circuit breaker
      this.circuitBreaker.recordFailure(provider);

      logger.debug(`Request failed`, {
        error: (error as Error).message,
        durationMs,
        retries: retryCount,
      });

      throw error;
    }
  }

  /**
   * Convenience method for GET requests.
   */
  async get<T>(
    url: string,
    provider: string,
    headers?: Record<string, string>
  ): Promise<HttpResponse<T>> {
    return this.request<T>({
      provider,
      url,
      method: "GET",
      headers,
    });
  }

  /**
   * Convenience method for POST requests.
   */
  async post<T>(
    url: string,
    provider: string,
    body: object,
    headers?: Record<string, string>
  ): Promise<HttpResponse<T>> {
    return this.request<T>({
      provider,
      url,
      method: "POST",
      body,
      headers,
    });
  }

  /**
   * Get status of all providers.
   */
  getStatus(): Map<
    string,
    {
      rateLimit: { remaining: number; resetIn: number; limit: number } | null;
      circuit: { state: string; failures: number };
    }
  > {
    const status = new Map<
      string,
      {
        rateLimit: { remaining: number; resetIn: number; limit: number } | null;
        circuit: { state: string; failures: number };
      }
    >();

    for (const provider of this.providerConfigs.keys()) {
      const circuitState = this.circuitBreaker.getState(provider);
      status.set(provider, {
        rateLimit: this.rateLimiter.getState(provider),
        circuit: {
          state: circuitState.state,
          failures: circuitState.failures,
        },
      });
    }

    return status;
  }

  /**
   * Reset rate limiter and circuit breaker for a provider.
   */
  reset(provider: string): void {
    this.rateLimiter.reset(provider);
    this.circuitBreaker.reset(provider);
  }

  /**
   * Reset all providers.
   */
  resetAll(): void {
    this.rateLimiter.resetAll();
    this.circuitBreaker.resetAll();
  }

  /**
   * Fetch with timeout support.
   */
  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeout: number
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
      return response;
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        throw new HttpTimeoutError(`Request timed out after ${timeout}ms`, url, timeout);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Truncate URL for logging (remove query params).
   */
  private truncateUrl(url: string): string {
    try {
      const parsed = new URL(url);
      return `${parsed.origin}${parsed.pathname}`;
    } catch {
      return url.substring(0, 50);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton Access
// ─────────────────────────────────────────────────────────────────────────────

let defaultClient: HttpClient | null = null;

/**
 * Get the default HTTP client instance.
 */
export function getHttpClient(): HttpClient {
  if (!defaultClient) {
    defaultClient = new HttpClient();
  }
  return defaultClient;
}

/**
 * Reset the default HTTP client (useful for testing).
 */
export function resetHttpClient(): void {
  defaultClient = null;
}

/**
 * Create a new HTTP client with custom options.
 */
export function createHttpClient(options?: HttpClientOptions): HttpClient {
  return new HttpClient(options);
}
