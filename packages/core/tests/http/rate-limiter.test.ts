import { describe, it, expect, beforeEach } from "bun:test";
import { RateLimiter } from "../../src/http/rate-limiter.js";

describe("RateLimiter", () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter();
  });

  describe("registerProvider", () => {
    it("registers a provider configuration", () => {
      limiter.registerProvider({
        name: "test",
        requestsPerWindow: 10,
        windowMs: 1000,
      });

      const config = limiter.getConfig("test");
      expect(config?.name).toBe("test");
      expect(config?.requestsPerWindow).toBe(10);
      expect(config?.windowMs).toBe(1000);
    });
  });

  describe("canProceed", () => {
    it("returns true for unknown provider", () => {
      expect(limiter.canProceed("unknown")).toBe(true);
    });

    it("returns true when tokens available", () => {
      limiter.registerProvider({
        name: "test",
        requestsPerWindow: 5,
        windowMs: 1000,
      });

      expect(limiter.canProceed("test")).toBe(true);
    });

    it("returns false when no tokens available", () => {
      limiter.registerProvider({
        name: "test",
        requestsPerWindow: 2,
        windowMs: 10000,
      });

      limiter.recordRequest("test");
      limiter.recordRequest("test");

      expect(limiter.canProceed("test")).toBe(false);
    });
  });

  describe("recordRequest", () => {
    it("decrements available tokens", () => {
      limiter.registerProvider({
        name: "test",
        requestsPerWindow: 5,
        windowMs: 10000,
      });

      let state = limiter.getState("test");
      expect(state?.remaining).toBe(5);

      limiter.recordRequest("test");
      state = limiter.getState("test");
      expect(state?.remaining).toBe(4);
    });

    it("does not go below zero", () => {
      limiter.registerProvider({
        name: "test",
        requestsPerWindow: 1,
        windowMs: 10000,
      });

      limiter.recordRequest("test");
      limiter.recordRequest("test");
      limiter.recordRequest("test");

      const state = limiter.getState("test");
      expect(state?.remaining).toBe(0);
    });
  });

  describe("updateFromHeaders", () => {
    it("updates remaining tokens from header", () => {
      limiter.registerProvider({
        name: "test",
        requestsPerWindow: 100,
        windowMs: 10000,
      });

      limiter.updateFromHeaders("test", { remaining: 42 });

      const state = limiter.getState("test");
      expect(state?.remaining).toBe(42);
    });

    it("sets retry-after from header", async () => {
      limiter.registerProvider({
        name: "test",
        requestsPerWindow: 100,
        windowMs: 10000,
      });

      limiter.updateFromHeaders("test", { retryAfter: 1 }); // 1 second

      expect(limiter.canProceed("test")).toBe(false);

      // Wait for retry-after to expire
      await new Promise((r) => setTimeout(r, 1100));
      expect(limiter.canProceed("test")).toBe(true);
    });
  });

  describe("waitForSlot", () => {
    it("returns 0 when tokens available", async () => {
      limiter.registerProvider({
        name: "test",
        requestsPerWindow: 10,
        windowMs: 1000,
      });

      const waitTime = await limiter.waitForSlot("test");
      expect(waitTime).toBe(0);
    });

    it("returns 0 for unknown provider", async () => {
      const waitTime = await limiter.waitForSlot("unknown");
      expect(waitTime).toBe(0);
    });
  });

  describe("getState", () => {
    it("returns null for unknown provider", () => {
      expect(limiter.getState("unknown")).toBeNull();
    });

    it("returns current state for registered provider", () => {
      limiter.registerProvider({
        name: "test",
        requestsPerWindow: 10,
        windowMs: 1000,
      });

      const state = limiter.getState("test");
      expect(state).not.toBeNull();
      expect(state?.remaining).toBe(10);
      expect(state?.limit).toBe(10);
      expect(state?.resetIn).toBeGreaterThanOrEqual(0);
    });
  });

  describe("reset", () => {
    it("resets tokens to full", () => {
      limiter.registerProvider({
        name: "test",
        requestsPerWindow: 10,
        windowMs: 10000,
      });

      limiter.recordRequest("test");
      limiter.recordRequest("test");
      expect(limiter.getState("test")?.remaining).toBe(8);

      limiter.reset("test");
      expect(limiter.getState("test")?.remaining).toBe(10);
    });
  });

  describe("token refill", () => {
    it("refills tokens over time", async () => {
      limiter.registerProvider({
        name: "test",
        requestsPerWindow: 10,
        windowMs: 100, // 100ms window for fast testing
      });

      // Use all tokens
      for (let i = 0; i < 10; i++) {
        limiter.recordRequest("test");
      }
      expect(limiter.getState("test")?.remaining).toBe(0);

      // Wait for window to pass
      await new Promise((r) => setTimeout(r, 150));

      // Should have refilled
      expect(limiter.getState("test")?.remaining).toBe(10);
    });
  });

  describe("multiple providers", () => {
    it("tracks providers independently", () => {
      limiter.registerProvider({
        name: "provider1",
        requestsPerWindow: 10,
        windowMs: 1000,
      });
      limiter.registerProvider({
        name: "provider2",
        requestsPerWindow: 5,
        windowMs: 1000,
      });

      limiter.recordRequest("provider1");
      limiter.recordRequest("provider1");
      limiter.recordRequest("provider2");

      expect(limiter.getState("provider1")?.remaining).toBe(8);
      expect(limiter.getState("provider2")?.remaining).toBe(4);
    });
  });
});
