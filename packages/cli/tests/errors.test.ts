import { describe, it, expect } from "bun:test";
import { formatError } from "../src/errors.js";

describe("errors", () => {
  describe("formatError", () => {
    it("provides suggestion for config not found error", () => {
      const result = formatError(new Error("Could not find config at /path/to/projects"));

      expect(result.message).toContain("Could not find config");
      expect(result.suggestion).toBeDefined();
      expect(result.suggestion).toContain("extenote init");
    });

    it("provides suggestion for no project config files error", () => {
      const result = formatError(new Error("No project config files found in /path/to/projects"));

      expect(result.suggestion).toContain("projects/*.yaml");
      expect(result.suggestion).toContain("extenote init");
    });

    it("provides suggestion for object not found error", () => {
      const result = formatError(new Error("Object not found: path/to/file.md"));

      expect(result.suggestion).toContain("extenote status");
      expect(result.suggestion).toContain("path/to/file.md");
    });

    it("provides suggestion for schema not found error", () => {
      const result = formatError(new Error("Schema my-schema not found"));

      expect(result.suggestion).toContain("schemas/*.yaml");
      expect(result.suggestion).toContain("my-schema");
    });

    it("provides suggestion for no discussion providers error", () => {
      const result = formatError(
        new Error("No discussion providers configured. Add 'discussion.providers' to your config.")
      );

      expect(result.suggestion).toContain("discussion");
      expect(result.suggestion).toContain("providers");
    });

    it("provides suggestion for project not found with alternatives", () => {
      const result = formatError(
        new Error('Project "my-project" not found or has no build config. Available: proj-a, proj-b')
      );

      expect(result.suggestion).toContain("Did you mean");
      expect(result.suggestion).toContain("proj-a");
      expect(result.suggestion).toContain("proj-b");
    });

    it("provides suggestion for file already exists error", () => {
      const result = formatError(new Error("File already exists: /path/to/file.md"));

      expect(result.suggestion).toContain("Delete it first");
      expect(result.suggestion).toContain("different filename");
    });

    it("provides suggestion for TTY required error", () => {
      const result = formatError(
        new Error("Interactive init requires a TTY. Run this command directly in a terminal.")
      );

      expect(result.suggestion).toContain("terminal");
      expect(result.suggestion).toContain("non-interactive");
    });

    it("provides suggestion for missing SEMBLE_APP_PASSWORD", () => {
      const result = formatError(
        new Error("No ATProto app password available. Set SEMBLE_APP_PASSWORD or ATPROTO_APP_PASSWORD.")
      );

      expect(result.suggestion).toContain("SEMBLE_APP_PASSWORD");
      expect(result.suggestion).toContain("bsky.app");
    });

    it("provides suggestion for ATProto login failure", () => {
      const result = formatError(new Error("ATProto login failed: 401 Unauthorized"));

      expect(result.suggestion).toContain("credentials");
      expect(result.suggestion).toContain("app password");
    });

    it("provides suggestion for GitHub token errors", () => {
      const result = formatError(new Error("GitHub API error: 401 Unauthorized"));

      expect(result.suggestion).toContain("GITHUB_TOKEN");
      expect(result.suggestion).toContain("github.com");
    });

    it("provides suggestion for YAML syntax errors", () => {
      const result = formatError(new Error("Invalid YAML: unexpected token"));

      expect(result.suggestion).toContain("indentation");
      expect(result.suggestion).toContain("colons");
    });

    it("provides suggestion for duplicate source id", () => {
      const result = formatError(new Error("Duplicate source id detected: my-source"));

      expect(result.suggestion).toContain("unique");
      expect(result.suggestion).toContain("id");
    });

    it("provides suggestion for source missing id", () => {
      const result = formatError(new Error("Source missing id"));

      expect(result.suggestion).toContain("id");
      expect(result.suggestion).toContain("sources:");
    });

    it("provides suggestion for rsync failure", () => {
      const result = formatError(new Error("rsync failed: No such file or directory"));

      expect(result.suggestion).toContain("rsync");
      expect(result.suggestion).toContain("installed");
    });

    it("provides suggestion for Quarto build failure", () => {
      const result = formatError(new Error("Quarto build failed: Error in render"));

      expect(result.suggestion).toContain("Quarto");
      expect(result.suggestion).toContain("quarto.org");
    });

    it("returns message without suggestion for unknown errors", () => {
      const result = formatError(new Error("Some random error"));

      expect(result.message).toBe("Some random error");
      expect(result.suggestion).toBeUndefined();
    });

    it("handles string errors", () => {
      const result = formatError("Could not find config at /path");

      expect(result.message).toBe("Could not find config at /path");
      expect(result.suggestion).toBeDefined();
    });
  });
});
