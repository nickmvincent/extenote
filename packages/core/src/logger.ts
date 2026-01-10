/**
 * Structured logging infrastructure for extenote
 *
 * Features:
 * - Log levels: debug, info, warn, error
 * - JSON format for production, pretty format for development
 * - Child loggers with inherited context
 * - Performance timing with time() and timeAsync()
 * - Request ID propagation support
 */

import pc from "picocolors";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  /** Request ID for web server tracing */
  requestId?: string;
  /** Operation name (e.g., "loadVault", "buildProject") */
  operation?: string;
  /** Project being operated on */
  project?: string;
  /** Duration in milliseconds (auto-added by time/timeAsync) */
  duration?: number;
  /** Additional context fields */
  [key: string]: unknown;
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, error?: Error, context?: LogContext): void;

  /** Create a child logger with inherited context */
  child(context: LogContext): Logger;

  /** Time an operation, returns a function to call when done */
  time(operation: string): () => void;

  /** Time an async operation */
  timeAsync<T>(operation: string, fn: () => Promise<T>): Promise<T>;

  /** Get current log level */
  getLevel(): LogLevel;

  /** Check if a level would be logged */
  isLevelEnabled(level: LogLevel): boolean;
}

export interface LoggerConfig {
  /** Minimum log level to output */
  level: LogLevel;
  /** JSON for production, pretty for development */
  format: "json" | "pretty";
  /** Include timestamps in pretty format */
  timestamps?: boolean;
  /** Custom write function (defaults to console) */
  write?: (entry: LogEntry) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LEVEL_COLORS: Record<LogLevel, (s: string) => string> = {
  debug: pc.dim,
  info: pc.blue,
  warn: pc.yellow,
  error: pc.red,
};

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

function getConfigFromEnv(): LoggerConfig {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase();
  const level: LogLevel =
    envLevel && envLevel in LOG_LEVELS ? (envLevel as LogLevel) : "info";

  const format: "json" | "pretty" =
    process.env.NODE_ENV === "production" ? "json" : "pretty";

  return {
    level,
    format,
    timestamps: format === "json",
  };
}

class LoggerImpl implements Logger {
  private config: LoggerConfig;
  private context: LogContext;

  constructor(config: LoggerConfig, context: LogContext = {}) {
    this.config = config;
    this.context = context;
  }

  getLevel(): LogLevel {
    return this.config.level;
  }

  isLevelEnabled(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.config.level];
  }

  private shouldLog(level: LogLevel): boolean {
    return this.isLevelEnabled(level);
  }

  private formatPretty(entry: LogEntry): string {
    const levelStr = entry.level.toUpperCase().padEnd(5);
    const prefix = LEVEL_COLORS[entry.level](levelStr);

    const parts: string[] = [];

    if (this.config.timestamps) {
      parts.push(pc.dim(entry.timestamp));
    }

    parts.push(prefix);

    if (entry.context?.operation) {
      parts.push(pc.dim(`[${entry.context.operation}]`));
    }

    parts.push(entry.message);

    if (entry.context?.duration !== undefined) {
      parts.push(pc.dim(`(${entry.context.duration}ms)`));
    }

    let output = parts.join(" ");

    if (entry.error?.stack && this.config.level === "debug") {
      output += "\n" + pc.dim(entry.error.stack);
    }

    return output;
  }

  private formatEntry(entry: LogEntry): string {
    if (this.config.format === "json") {
      return JSON.stringify(entry);
    }
    return this.formatPretty(entry);
  }

  private log(
    level: LogLevel,
    message: string,
    error?: Error,
    context?: LogContext
  ): void {
    if (!this.shouldLog(level)) return;

    const mergedContext = { ...this.context, ...context };
    // Remove undefined values from context
    const cleanContext = Object.fromEntries(
      Object.entries(mergedContext).filter(([, v]) => v !== undefined)
    );

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...(Object.keys(cleanContext).length > 0 && { context: cleanContext }),
    };

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    const output = this.formatEntry(entry);

    if (this.config.write) {
      this.config.write(entry);
    } else {
      const writer = level === "error" ? console.error : console.log;
      writer(output);
    }
  }

  debug(message: string, context?: LogContext): void {
    this.log("debug", message, undefined, context);
  }

  info(message: string, context?: LogContext): void {
    this.log("info", message, undefined, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log("warn", message, undefined, context);
  }

  error(message: string, error?: Error, context?: LogContext): void {
    this.log("error", message, error, context);
  }

  child(context: LogContext): Logger {
    return new LoggerImpl(this.config, { ...this.context, ...context });
  }

  time(operation: string): () => void {
    const start = performance.now();
    this.debug(`Starting ${operation}`, { operation });

    return () => {
      const duration = Math.round(performance.now() - start);
      this.info(`Completed ${operation}`, { operation, duration });
    };
  }

  async timeAsync<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    this.debug(`Starting ${operation}`, { operation });

    try {
      const result = await fn();
      const duration = Math.round(performance.now() - start);
      this.info(`Completed ${operation}`, { operation, duration });
      return result;
    } catch (error) {
      const duration = Math.round(performance.now() - start);
      this.error(`Failed ${operation}`, error as Error, { operation, duration });
      throw error;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Global Logger
// ─────────────────────────────────────────────────────────────────────────────

let globalLogger: Logger | null = null;
let globalConfig: LoggerConfig | null = null;

/**
 * Configure the global logger. Call once at application startup.
 */
export function configureLogger(config: Partial<LoggerConfig>): void {
  globalConfig = { ...getConfigFromEnv(), ...config };
  globalLogger = new LoggerImpl(globalConfig);
}

/**
 * Get the global logger instance. Creates one with default config if needed.
 */
export function getLogger(): Logger {
  if (!globalLogger) {
    globalConfig = getConfigFromEnv();
    globalLogger = new LoggerImpl(globalConfig);
  }
  return globalLogger;
}

/**
 * Create a new logger instance with custom configuration.
 * Use this for isolated logging (e.g., tests) instead of the global logger.
 */
export function createLogger(config?: Partial<LoggerConfig>): Logger {
  const fullConfig = { ...getConfigFromEnv(), ...config };
  return new LoggerImpl(fullConfig);
}

/**
 * Reset the global logger (useful for testing)
 */
export function resetLogger(): void {
  globalLogger = null;
  globalConfig = null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility: Generate Request ID
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a short random request ID for tracing
 */
export function generateRequestId(): string {
  return Math.random().toString(36).substring(2, 10);
}
