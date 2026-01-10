import { describe, it, expect, beforeEach } from "bun:test";
import {
  createLogger,
  resetLogger,
  getLogger,
  configureLogger,
  generateRequestId,
  type LogEntry,
  type Logger,
  type LogLevel,
} from "../src/logger.js";

describe("Logger", () => {
  let entries: LogEntry[];
  let logger: Logger;

  beforeEach(() => {
    entries = [];
    resetLogger();
    logger = createLogger({
      level: "debug",
      format: "json",
      write: (entry) => entries.push(entry),
    });
  });

  describe("log levels", () => {
    it("logs at all levels when level is debug", () => {
      logger.debug("debug message");
      logger.info("info message");
      logger.warn("warn message");
      logger.error("error message");

      expect(entries).toHaveLength(4);
      expect(entries.map((e) => e.level)).toEqual([
        "debug",
        "info",
        "warn",
        "error",
      ]);
    });

    it("respects info level filtering", () => {
      const infoLogger = createLogger({
        level: "info",
        format: "json",
        write: (entry) => entries.push(entry),
      });

      infoLogger.debug("ignored");
      infoLogger.info("shown");
      infoLogger.warn("shown");
      infoLogger.error("shown");

      expect(entries).toHaveLength(3);
      expect(entries.map((e) => e.level)).toEqual(["info", "warn", "error"]);
    });

    it("respects warn level filtering", () => {
      const warnLogger = createLogger({
        level: "warn",
        format: "json",
        write: (entry) => entries.push(entry),
      });

      warnLogger.debug("ignored");
      warnLogger.info("ignored");
      warnLogger.warn("shown");
      warnLogger.error("shown");

      expect(entries).toHaveLength(2);
    });

    it("respects error level filtering", () => {
      const errorLogger = createLogger({
        level: "error",
        format: "json",
        write: (entry) => entries.push(entry),
      });

      errorLogger.debug("ignored");
      errorLogger.info("ignored");
      errorLogger.warn("ignored");
      errorLogger.error("shown");

      expect(entries).toHaveLength(1);
    });
  });

  describe("message content", () => {
    it("includes message in log entry", () => {
      logger.info("test message");

      expect(entries[0].message).toBe("test message");
    });

    it("includes timestamp in ISO format", () => {
      logger.info("test");

      expect(entries[0].timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
      );
    });

    it("includes context when provided", () => {
      logger.info("test", { project: "shared-references", operation: "build" });

      expect(entries[0].context?.project).toBe("shared-references");
      expect(entries[0].context?.operation).toBe("build");
    });

    it("omits context when not provided", () => {
      logger.info("test");

      expect(entries[0].context).toBeUndefined();
    });
  });

  describe("error handling", () => {
    it("includes error details in log entry", () => {
      const err = new Error("something failed");
      logger.error("operation failed", err);

      expect(entries[0].error?.name).toBe("Error");
      expect(entries[0].error?.message).toBe("something failed");
      expect(entries[0].error?.stack).toBeDefined();
    });

    it("works without error object", () => {
      logger.error("just a message");

      expect(entries[0].message).toBe("just a message");
      expect(entries[0].error).toBeUndefined();
    });

    it("includes context with error", () => {
      const err = new Error("test");
      logger.error("failed", err, { operation: "validate" });

      expect(entries[0].error?.message).toBe("test");
      expect(entries[0].context?.operation).toBe("validate");
    });
  });

  describe("child logger", () => {
    it("inherits parent context", () => {
      const child = logger.child({ requestId: "abc123" });
      child.info("test");

      expect(entries[0].context?.requestId).toBe("abc123");
    });

    it("can add additional context", () => {
      const child = logger.child({ requestId: "abc123" });
      child.info("test", { operation: "build" });

      expect(entries[0].context?.requestId).toBe("abc123");
      expect(entries[0].context?.operation).toBe("build");
    });

    it("child context overrides parent context", () => {
      const parent = logger.child({ operation: "parent" });
      const child = parent.child({ operation: "child" });
      child.info("test");

      expect(entries[0].context?.operation).toBe("child");
    });

    it("nested children accumulate context", () => {
      const child1 = logger.child({ requestId: "req1" });
      const child2 = child1.child({ operation: "build" });
      const child3 = child2.child({ project: "test" });
      child3.info("message");

      expect(entries[0].context).toEqual({
        requestId: "req1",
        operation: "build",
        project: "test",
      });
    });
  });

  describe("time()", () => {
    it("logs start and completion", async () => {
      const done = logger.time("operation");
      await new Promise((r) => setTimeout(r, 10));
      done();

      expect(entries).toHaveLength(2);
      expect(entries[0].level).toBe("debug");
      expect(entries[0].message).toContain("Starting");
      expect(entries[1].level).toBe("info");
      expect(entries[1].message).toContain("Completed");
    });

    it("includes duration in completion log", async () => {
      const done = logger.time("operation");
      await new Promise((r) => setTimeout(r, 10));
      done();

      expect(entries[1].context?.duration).toBeGreaterThanOrEqual(10);
    });

    it("includes operation name in context", () => {
      const done = logger.time("myOperation");
      done();

      expect(entries[0].context?.operation).toBe("myOperation");
      expect(entries[1].context?.operation).toBe("myOperation");
    });
  });

  describe("timeAsync()", () => {
    it("returns the result of the async function", async () => {
      const result = await logger.timeAsync("fetch", async () => {
        return { data: "test" };
      });

      expect(result).toEqual({ data: "test" });
    });

    it("logs start and completion", async () => {
      await logger.timeAsync("operation", async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      expect(entries).toHaveLength(2);
      expect(entries[0].message).toContain("Starting");
      expect(entries[1].message).toContain("Completed");
    });

    it("logs error on failure", async () => {
      await expect(
        logger.timeAsync("failing", async () => {
          throw new Error("test error");
        })
      ).rejects.toThrow("test error");

      expect(entries).toHaveLength(2);
      expect(entries[1].level).toBe("error");
      expect(entries[1].message).toContain("Failed");
      expect(entries[1].error?.message).toBe("test error");
    });

    it("includes duration even on failure", async () => {
      await expect(
        logger.timeAsync("failing", async () => {
          await new Promise((r) => setTimeout(r, 10));
          throw new Error("fail");
        })
      ).rejects.toThrow();

      expect(entries[1].context?.duration).toBeGreaterThanOrEqual(10);
    });
  });

  describe("getLevel() and isLevelEnabled()", () => {
    it("returns configured level", () => {
      const warnLogger = createLogger({ level: "warn", format: "json" });
      expect(warnLogger.getLevel()).toBe("warn");
    });

    it("isLevelEnabled returns true for enabled levels", () => {
      const infoLogger = createLogger({ level: "info", format: "json" });

      expect(infoLogger.isLevelEnabled("debug")).toBe(false);
      expect(infoLogger.isLevelEnabled("info")).toBe(true);
      expect(infoLogger.isLevelEnabled("warn")).toBe(true);
      expect(infoLogger.isLevelEnabled("error")).toBe(true);
    });
  });
});

describe("Global Logger", () => {
  beforeEach(() => {
    resetLogger();
  });

  it("getLogger returns same instance", () => {
    const logger1 = getLogger();
    const logger2 = getLogger();

    expect(logger1).toBe(logger2);
  });

  it("configureLogger updates global logger", () => {
    const entries: LogEntry[] = [];

    configureLogger({
      level: "warn",
      format: "json",
      write: (entry) => entries.push(entry),
    });

    const logger = getLogger();
    logger.info("ignored");
    logger.warn("shown");

    expect(entries).toHaveLength(1);
    expect(entries[0].level).toBe("warn");
  });

  it("resetLogger clears global logger", () => {
    const logger1 = getLogger();
    resetLogger();
    const logger2 = getLogger();

    expect(logger1).not.toBe(logger2);
  });
});

describe("generateRequestId", () => {
  it("generates string of correct length", () => {
    const id = generateRequestId();

    expect(typeof id).toBe("string");
    expect(id.length).toBe(8);
  });

  it("generates unique IDs", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateRequestId());
    }

    expect(ids.size).toBe(100);
  });

  it("contains only alphanumeric characters", () => {
    const id = generateRequestId();

    expect(id).toMatch(/^[a-z0-9]+$/);
  });
});

describe("JSON format", () => {
  it("produces valid JSON", () => {
    let output = "";
    const logger = createLogger({
      level: "info",
      format: "json",
      write: (entry) => {
        output = JSON.stringify(entry);
      },
    });

    logger.info("test message", { foo: "bar" });

    expect(() => JSON.parse(output)).not.toThrow();
    const parsed = JSON.parse(output);
    expect(parsed.message).toBe("test message");
    expect(parsed.context.foo).toBe("bar");
  });
});

describe("Pretty format", () => {
  it("does not throw when formatting", () => {
    const logger = createLogger({
      level: "debug",
      format: "pretty",
      timestamps: true,
      write: () => {},
    });

    expect(() => {
      logger.debug("debug");
      logger.info("info");
      logger.warn("warn");
      logger.error("error", new Error("test"));
    }).not.toThrow();
  });
});
