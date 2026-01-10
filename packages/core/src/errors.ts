/**
 * Domain-specific error classes for extenote
 *
 * Use these instead of plain Error objects for better error handling
 * and more informative error messages.
 */

/**
 * Base class for all extenote errors
 */
export class ExtenoteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtenoteError";
  }
}

/**
 * Configuration-related errors (missing config, invalid config, etc.)
 */
export class ConfigError extends ExtenoteError {
  constructor(
    message: string,
    public readonly configPath?: string
  ) {
    super(message);
    this.name = "ConfigError";
  }
}

/**
 * Schema/validation errors (invalid frontmatter, missing required fields, etc.)
 */
export class ValidationError extends ExtenoteError {
  constructor(
    message: string,
    public readonly objectSlug?: string,
    public readonly field?: string
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * Build process errors (Astro/Quarto failures, missing dependencies, etc.)
 */
export class BuildError extends ExtenoteError {
  constructor(
    message: string,
    public readonly step?: string,
    public readonly stderr?: string
  ) {
    super(message);
    this.name = "BuildError";
  }
}

/**
 * Reference checking errors (DBLP/OpenAlex lookup failures, etc.)
 */
export class RefcheckError extends ExtenoteError {
  constructor(
    message: string,
    public readonly provider?: string,
    public readonly citationKey?: string
  ) {
    super(message);
    this.name = "RefcheckError";
  }
}

/**
 * Source loading errors (file not found, permission denied, etc.)
 */
export class SourceError extends ExtenoteError {
  constructor(
    message: string,
    public readonly sourceId?: string,
    public readonly path?: string
  ) {
    super(message);
    this.name = "SourceError";
  }
}

/**
 * Type guard to check if an error is an ExtenoteError
 */
export function isExtenoteError(error: unknown): error is ExtenoteError {
  return error instanceof ExtenoteError;
}

/**
 * Format an error for display, with extra context for ExtenoteError subclasses
 */
export function formatError(error: unknown): string {
  if (error instanceof ConfigError && error.configPath) {
    return `${error.message} (config: ${error.configPath})`;
  }
  if (error instanceof ValidationError) {
    const parts = [error.message];
    if (error.objectSlug) parts.push(`object: ${error.objectSlug}`);
    if (error.field) parts.push(`field: ${error.field}`);
    return parts.join(" | ");
  }
  if (error instanceof BuildError) {
    const parts = [error.message];
    if (error.step) parts.push(`step: ${error.step}`);
    if (error.stderr) parts.push(`\n${error.stderr}`);
    return parts.join(" | ");
  }
  if (error instanceof RefcheckError) {
    const parts = [error.message];
    if (error.provider) parts.push(`provider: ${error.provider}`);
    if (error.citationKey) parts.push(`key: ${error.citationKey}`);
    return parts.join(" | ");
  }
  if (error instanceof SourceError) {
    const parts = [error.message];
    if (error.sourceId) parts.push(`source: ${error.sourceId}`);
    if (error.path) parts.push(`path: ${error.path}`);
    return parts.join(" | ");
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
