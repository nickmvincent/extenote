import { describe, it, expect, beforeEach } from "bun:test";
import { CircuitBreaker } from "../../src/http/circuit-breaker.js";
import { CircuitOpenError } from "../../src/http/types.js";

describe("CircuitBreaker", () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker(3, 100); // 3 failures, 100ms reset
  });

  describe("initial state", () => {
    it("starts in closed state", () => {
      const state = breaker.getState("test");
      expect(state.state).toBe("closed");
      expect(state.failures).toBe(0);
    });

    it("allows requests in closed state", () => {
      expect(breaker.isAllowed("test")).toBe(true);
      expect(() => breaker.checkAllowed("test")).not.toThrow();
    });
  });

  describe("failure tracking", () => {
    it("increments failure count", () => {
      breaker.recordFailure("test");
      expect(breaker.getState("test").failures).toBe(1);

      breaker.recordFailure("test");
      expect(breaker.getState("test").failures).toBe(2);
    });

    it("opens circuit after threshold failures", () => {
      breaker.recordFailure("test");
      breaker.recordFailure("test");
      breaker.recordFailure("test");

      expect(breaker.getState("test").state).toBe("open");
    });

    it("throws CircuitOpenError when open", () => {
      breaker.recordFailure("test");
      breaker.recordFailure("test");
      breaker.recordFailure("test");

      expect(() => breaker.checkAllowed("test")).toThrow(CircuitOpenError);
      expect(breaker.isAllowed("test")).toBe(false);
    });
  });

  describe("success handling", () => {
    it("resets failure count on success", () => {
      breaker.recordFailure("test");
      breaker.recordFailure("test");
      expect(breaker.getState("test").failures).toBe(2);

      breaker.recordSuccess("test");
      expect(breaker.getState("test").failures).toBe(0);
    });

    it("keeps circuit closed on success", () => {
      breaker.recordSuccess("test");
      expect(breaker.getState("test").state).toBe("closed");
    });
  });

  describe("half-open state", () => {
    it("transitions to half-open after reset timeout", async () => {
      // Open the circuit
      breaker.recordFailure("test");
      breaker.recordFailure("test");
      breaker.recordFailure("test");
      expect(breaker.getState("test").state).toBe("open");

      // Wait for reset timeout
      await new Promise((r) => setTimeout(r, 150));

      // Check should transition to half-open
      expect(() => breaker.checkAllowed("test")).not.toThrow();
      expect(breaker.getState("test").state).toBe("half-open");
    });

    it("closes circuit on success in half-open", async () => {
      breaker.recordFailure("test");
      breaker.recordFailure("test");
      breaker.recordFailure("test");

      await new Promise((r) => setTimeout(r, 150));
      breaker.checkAllowed("test"); // Transition to half-open

      breaker.recordSuccess("test");
      expect(breaker.getState("test").state).toBe("closed");
      expect(breaker.getState("test").failures).toBe(0);
    });

    it("re-opens circuit on failure in half-open", async () => {
      breaker.recordFailure("test");
      breaker.recordFailure("test");
      breaker.recordFailure("test");

      await new Promise((r) => setTimeout(r, 150));
      breaker.checkAllowed("test"); // Transition to half-open

      breaker.recordFailure("test");
      expect(breaker.getState("test").state).toBe("open");
    });
  });

  describe("reset", () => {
    it("resets to closed state", () => {
      breaker.recordFailure("test");
      breaker.recordFailure("test");
      breaker.recordFailure("test");
      expect(breaker.getState("test").state).toBe("open");

      breaker.reset("test");
      expect(breaker.getState("test").state).toBe("closed");
      expect(breaker.getState("test").failures).toBe(0);
    });
  });

  describe("resetAll", () => {
    it("resets all circuits", () => {
      breaker.recordFailure("test1");
      breaker.recordFailure("test1");
      breaker.recordFailure("test1");
      breaker.recordFailure("test2");
      breaker.recordFailure("test2");
      breaker.recordFailure("test2");

      breaker.resetAll();

      expect(breaker.getState("test1").state).toBe("closed");
      expect(breaker.getState("test2").state).toBe("closed");
    });
  });

  describe("configure", () => {
    it("allows custom threshold per provider", () => {
      breaker.configure("custom", { failureThreshold: 5 });

      for (let i = 0; i < 4; i++) {
        breaker.recordFailure("custom");
      }
      expect(breaker.getState("custom").state).toBe("closed");

      breaker.recordFailure("custom");
      expect(breaker.getState("custom").state).toBe("open");
    });

    it("allows custom reset timeout per provider", async () => {
      breaker.configure("custom", { resetTimeout: 50 });

      for (let i = 0; i < 3; i++) {
        breaker.recordFailure("custom");
      }

      await new Promise((r) => setTimeout(r, 60));
      expect(() => breaker.checkAllowed("custom")).not.toThrow();
    });
  });

  describe("multiple providers", () => {
    it("tracks providers independently", () => {
      breaker.recordFailure("provider1");
      breaker.recordFailure("provider1");
      breaker.recordFailure("provider1");

      breaker.recordFailure("provider2");

      expect(breaker.getState("provider1").state).toBe("open");
      expect(breaker.getState("provider2").state).toBe("closed");
    });
  });

  describe("CircuitOpenError", () => {
    it("includes provider name", () => {
      breaker.recordFailure("myapi");
      breaker.recordFailure("myapi");
      breaker.recordFailure("myapi");

      try {
        breaker.checkAllowed("myapi");
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(CircuitOpenError);
        expect((error as CircuitOpenError).provider).toBe("myapi");
      }
    });

    it("includes reset timestamp", () => {
      breaker.recordFailure("myapi");
      breaker.recordFailure("myapi");
      breaker.recordFailure("myapi");

      try {
        breaker.checkAllowed("myapi");
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect((error as CircuitOpenError).resetAt).toBeDefined();
        expect((error as CircuitOpenError).resetAt).toBeGreaterThan(Date.now());
      }
    });
  });
});
