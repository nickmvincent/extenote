import { describe, it, expect } from "bun:test";
import {
  calculateRetryDelay,
  parseRateLimitHeaders,
  isRetryableError,
  withRetry,
} from "../../src/http/retry.js";

describe("calculateRetryDelay", () => {
  it("returns initial delay for first attempt", () => {
    const delay = calculateRetryDelay(0, 100, 10000);
    // With jitter, should be between 50 and 100
    expect(delay).toBeGreaterThanOrEqual(50);
    expect(delay).toBeLessThanOrEqual(100);
  });

  it("doubles delay for each attempt", () => {
    // Run multiple times to account for jitter
    const delays = Array.from({ length: 10 }, () =>
      calculateRetryDelay(2, 100, 10000)
    );
    const avgDelay = delays.reduce((a, b) => a + b, 0) / delays.length;
    // 100 * 2^2 = 400, with jitter expect ~300
    expect(avgDelay).toBeGreaterThan(200);
    expect(avgDelay).toBeLessThan(400);
  });

  it("caps delay at maxDelay", () => {
    const delay = calculateRetryDelay(10, 100, 1000);
    expect(delay).toBeLessThanOrEqual(1000);
  });

  it("applies jitter between 50-100%", () => {
    const delays = Array.from({ length: 100 }, () =>
      calculateRetryDelay(0, 100, 10000)
    );
    const min = Math.min(...delays);
    const max = Math.max(...delays);
    expect(min).toBeGreaterThanOrEqual(50);
    expect(max).toBeLessThanOrEqual(100);
  });
});

describe("parseRateLimitHeaders", () => {
  it("parses standard rate limit headers", () => {
    const headers = new Headers({
      "X-RateLimit-Remaining": "42",
      "X-RateLimit-Limit": "100",
      "X-RateLimit-Reset": "1704067200",
    });

    const info = parseRateLimitHeaders(headers);

    expect(info.remaining).toBe(42);
    expect(info.limit).toBe(100);
    expect(info.resetAt).toBe(1704067200);
  });

  it("parses Retry-After as seconds", () => {
    const headers = new Headers({
      "Retry-After": "60",
    });

    const info = parseRateLimitHeaders(headers);

    expect(info.retryAfter).toBe(60);
  });

  it("parses Retry-After as HTTP date", () => {
    const futureDate = new Date(Date.now() + 120000); // 2 minutes from now
    const headers = new Headers({
      "Retry-After": futureDate.toUTCString(),
    });

    const info = parseRateLimitHeaders(headers);

    expect(info.retryAfter).toBeGreaterThan(100);
    expect(info.retryAfter).toBeLessThan(130);
  });

  it("returns empty object for missing headers", () => {
    const headers = new Headers();
    const info = parseRateLimitHeaders(headers);

    expect(info.remaining).toBeUndefined();
    expect(info.limit).toBeUndefined();
    expect(info.resetAt).toBeUndefined();
    expect(info.retryAfter).toBeUndefined();
  });
});

describe("isRetryableError", () => {
  it("returns true for 429 errors", () => {
    expect(isRetryableError(new Error("HTTP 429: Too Many Requests"))).toBe(
      true
    );
  });

  it("returns true for rate limit errors", () => {
    expect(isRetryableError(new Error("rate limit exceeded"))).toBe(true);
  });

  it("returns true for 503 errors", () => {
    expect(isRetryableError(new Error("HTTP 503: Service Unavailable"))).toBe(
      true
    );
  });

  it("returns true for 502 errors", () => {
    expect(isRetryableError(new Error("HTTP 502: Bad Gateway"))).toBe(true);
  });

  it("returns true for 504 errors", () => {
    expect(isRetryableError(new Error("HTTP 504: Gateway Timeout"))).toBe(true);
  });

  it("returns true for network errors", () => {
    expect(isRetryableError(new Error("network error"))).toBe(true);
    expect(isRetryableError(new Error("ECONNRESET"))).toBe(true);
    expect(isRetryableError(new Error("ECONNREFUSED"))).toBe(true);
    expect(isRetryableError(new Error("fetch failed"))).toBe(true);
  });

  it("returns true for timeout errors", () => {
    expect(isRetryableError(new Error("request timeout"))).toBe(true);
  });

  it("returns false for 4xx client errors", () => {
    expect(isRetryableError(new Error("HTTP 400: Bad Request"))).toBe(false);
    expect(isRetryableError(new Error("HTTP 404: Not Found"))).toBe(false);
    expect(isRetryableError(new Error("HTTP 401: Unauthorized"))).toBe(false);
  });

  it("returns false for generic errors", () => {
    expect(isRetryableError(new Error("Something went wrong"))).toBe(false);
  });
});

describe("withRetry", () => {
  it("returns result on first success", async () => {
    let calls = 0;
    const { result, attempts } = await withRetry(async () => {
      calls++;
      return "success";
    });

    expect(result).toBe("success");
    expect(attempts).toBe(1);
    expect(calls).toBe(1);
  });

  it("retries on retryable error", async () => {
    let calls = 0;
    const { result, attempts } = await withRetry(
      async () => {
        calls++;
        if (calls < 3) {
          throw new Error("HTTP 503: Service Unavailable");
        }
        return "success";
      },
      { maxRetries: 3, initialDelay: 1, maxDelay: 10 }
    );

    expect(result).toBe("success");
    expect(attempts).toBe(3);
    expect(calls).toBe(3);
  });

  it("does not retry on non-retryable error", async () => {
    let calls = 0;

    await expect(
      withRetry(
        async () => {
          calls++;
          throw new Error("HTTP 400: Bad Request");
        },
        { maxRetries: 3 }
      )
    ).rejects.toThrow("HTTP 400: Bad Request");

    expect(calls).toBe(1);
  });

  it("throws after max retries", async () => {
    let calls = 0;

    await expect(
      withRetry(
        async () => {
          calls++;
          throw new Error("HTTP 503: Service Unavailable");
        },
        { maxRetries: 2, initialDelay: 1, maxDelay: 10 }
      )
    ).rejects.toThrow("HTTP 503");

    expect(calls).toBe(3); // Initial + 2 retries
  });

  it("calls onRetry callback", async () => {
    const retries: { attempt: number; delay: number }[] = [];

    await withRetry(
      async () => {
        if (retries.length < 2) {
          throw new Error("HTTP 503");
        }
        return "success";
      },
      {
        maxRetries: 3,
        initialDelay: 1,
        maxDelay: 10,
        onRetry: (_, attempt, delay) => {
          retries.push({ attempt, delay });
        },
      }
    );

    expect(retries.length).toBe(2);
    expect(retries[0].attempt).toBe(1);
    expect(retries[1].attempt).toBe(2);
  });

  it("respects custom shouldRetry function", async () => {
    let calls = 0;
    const customError = new Error("CUSTOM_ERROR");

    await expect(
      withRetry(
        async () => {
          calls++;
          throw customError;
        },
        {
          maxRetries: 3,
          initialDelay: 1,
          shouldRetry: (error) => error.message === "RETRY_ME",
        }
      )
    ).rejects.toThrow("CUSTOM_ERROR");

    expect(calls).toBe(1); // No retries since shouldRetry returned false
  });
});
