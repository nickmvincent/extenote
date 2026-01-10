/**
 * Circuit breaker for protecting against flaky APIs
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Failing, all requests rejected immediately
 * - HALF-OPEN: Testing if service recovered, one request allowed through
 */

import type { CircuitBreakerState } from "./types.js";
import { CircuitOpenError } from "./types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

export interface CircuitBreakerConfig {
  /** Number of failures before opening circuit (default: 5) */
  failureThreshold?: number;
  /** Time in ms before attempting recovery (default: 30000) */
  resetTimeout?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Circuit Breaker Implementation
// ─────────────────────────────────────────────────────────────────────────────

export class CircuitBreaker {
  private states: Map<string, CircuitBreakerState> = new Map();
  private configs: Map<string, CircuitBreakerConfig> = new Map();
  private defaultFailureThreshold: number;
  private defaultResetTimeout: number;

  constructor(
    defaultFailureThreshold: number = 5,
    defaultResetTimeout: number = 30000
  ) {
    this.defaultFailureThreshold = defaultFailureThreshold;
    this.defaultResetTimeout = defaultResetTimeout;
  }

  /**
   * Configure a specific provider's circuit breaker.
   */
  configure(provider: string, config: CircuitBreakerConfig): void {
    this.configs.set(provider, config);
  }

  /**
   * Get circuit breaker configuration for a provider.
   */
  private getConfig(provider: string): Required<CircuitBreakerConfig> {
    const config = this.configs.get(provider);
    return {
      failureThreshold: config?.failureThreshold ?? this.defaultFailureThreshold,
      resetTimeout: config?.resetTimeout ?? this.defaultResetTimeout,
    };
  }

  /**
   * Get or create state for a provider.
   */
  private getOrCreateState(provider: string): CircuitBreakerState {
    let state = this.states.get(provider);
    if (!state) {
      state = { state: "closed", failures: 0 };
      this.states.set(provider, state);
    }
    return state;
  }

  /**
   * Check if requests should be allowed for a provider.
   * Throws CircuitOpenError if circuit is open.
   */
  checkAllowed(provider: string): void {
    const state = this.getOrCreateState(provider);
    const config = this.getConfig(provider);

    if (state.state === "closed") {
      return; // Allow
    }

    if (state.state === "open") {
      const now = Date.now();
      const timeSinceOpen = now - (state.openedAt || 0);

      if (timeSinceOpen >= config.resetTimeout) {
        // Transition to half-open
        state.state = "half-open";
        return; // Allow one test request
      }

      // Still open, reject
      const resetAt = (state.openedAt || 0) + config.resetTimeout;
      throw new CircuitOpenError(
        `Circuit breaker open for ${provider}`,
        provider,
        resetAt
      );
    }

    // Half-open: allow (test request)
  }

  /**
   * Check if requests are allowed without throwing.
   */
  isAllowed(provider: string): boolean {
    try {
      this.checkAllowed(provider);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Record a successful request.
   */
  recordSuccess(provider: string): void {
    const state = this.getOrCreateState(provider);

    if (state.state === "half-open") {
      // Recovery successful, close circuit
      state.state = "closed";
      state.failures = 0;
    } else if (state.state === "closed") {
      // Reset failure count on success
      state.failures = 0;
    }

    state.lastSuccess = Date.now();
  }

  /**
   * Record a failed request.
   */
  recordFailure(provider: string): void {
    const state = this.getOrCreateState(provider);
    const config = this.getConfig(provider);

    state.failures++;
    state.lastFailure = Date.now();

    if (state.state === "half-open") {
      // Test request failed, re-open circuit
      state.state = "open";
      state.openedAt = Date.now();
    } else if (
      state.state === "closed" &&
      state.failures >= config.failureThreshold
    ) {
      // Threshold exceeded, open circuit
      state.state = "open";
      state.openedAt = Date.now();
    }
  }

  /**
   * Get current state for a provider.
   */
  getState(provider: string): CircuitBreakerState {
    return this.getOrCreateState(provider);
  }

  /**
   * Force reset a circuit to closed state.
   */
  reset(provider: string): void {
    this.states.set(provider, { state: "closed", failures: 0 });
  }

  /**
   * Reset all circuits.
   */
  resetAll(): void {
    this.states.clear();
  }
}
