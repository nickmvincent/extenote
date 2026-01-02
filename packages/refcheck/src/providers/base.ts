/**
 * Provider Base Interface and Registry
 */

import type { Provider, LookupResult, EntryMetadata } from "../types.js";

/**
 * Registry of available providers
 */
const providerRegistry = new Map<string, Provider>();

/**
 * Register a provider
 */
export function registerProvider(provider: Provider): void {
  providerRegistry.set(provider.name, provider);
}

/**
 * Get a provider by name
 */
export function getProvider(name: string): Provider | undefined {
  return providerRegistry.get(name);
}

/**
 * Get all registered provider names
 */
export function getAvailableProviders(): string[] {
  return Array.from(providerRegistry.keys());
}

/**
 * Check if a provider is registered
 */
export function hasProvider(name: string): boolean {
  return providerRegistry.has(name);
}

/**
 * Abstract base class for providers
 */
export abstract class BaseProvider implements Provider {
  abstract readonly name: string;

  abstract lookup(entry: EntryMetadata): Promise<LookupResult>;

  /**
   * Create a "not found" result
   */
  protected notFound(): LookupResult {
    return {
      found: false,
      provider: this.name,
    };
  }

  /**
   * Create an error result
   */
  protected error(message: string): LookupResult {
    return {
      found: false,
      error: message,
      provider: this.name,
    };
  }

  /**
   * Create a success result
   */
  protected found(paper: LookupResult["paper"]): LookupResult {
    return {
      found: true,
      paper,
      provider: this.name,
    };
  }

  /**
   * Delay for rate limiting
   */
  protected async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Auto provider that tries multiple providers in sequence
 */
export class AutoProvider implements Provider {
  readonly name = "auto";
  private providers: string[];

  constructor(providerOrder: string[] = ["dblp", "crossref", "s2", "openalex"]) {
    this.providers = providerOrder;
  }

  async lookup(entry: EntryMetadata): Promise<LookupResult> {
    for (const providerName of this.providers) {
      const provider = getProvider(providerName);
      if (!provider) continue;

      try {
        const result = await provider.lookup(entry);
        if (result.found) {
          return {
            ...result,
            provider: `auto:${result.provider}`,
          };
        }
      } catch (err) {
        // Try next provider on error
        continue;
      }
    }

    return {
      found: false,
      provider: "auto",
    };
  }
}

// Register auto provider by default
registerProvider(new AutoProvider());
