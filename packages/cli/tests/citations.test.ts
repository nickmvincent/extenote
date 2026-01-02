import { describe, expect, it } from "bun:test";
import { detectCitedReferences } from "../src/citations";

describe("detectCitedReferences", () => {
  it("finds citations across multiple objects", () => {
    const cited = detectCitedReferences([
      { body: "See [@alpha] for details.", frontmatter: {}, filePath: "one.md" },
      { body: "Follow-up in [@beta; @gamma].", frontmatter: {}, filePath: "two.md" }
    ]);

    expect(cited.has("alpha")).toBe(true);
    expect(cited.has("beta")).toBe(true);
    expect(cited.has("gamma")).toBe(true);
  });

  it("handles single citation", () => {
    const cited = detectCitedReferences([
      { body: "As noted by [@smith2024].", frontmatter: {}, filePath: "doc.md" }
    ]);

    expect(cited.has("smith2024")).toBe(true);
    expect(cited.size).toBe(1);
  });

  it("handles semicolon-separated citations", () => {
    const cited = detectCitedReferences([
      { body: "Multiple sources [@a; @b; @c] support this.", frontmatter: {}, filePath: "doc.md" }
    ]);

    expect(cited.has("a")).toBe(true);
    expect(cited.has("b")).toBe(true);
    expect(cited.has("c")).toBe(true);
  });

  it("extracts from frontmatter references array", () => {
    const cited = detectCitedReferences([
      { body: "", frontmatter: { references: ["ref1", "ref2"] }, filePath: "doc.md" }
    ]);

    expect(cited.has("ref1")).toBe(true);
    expect(cited.has("ref2")).toBe(true);
  });

  it("extracts from frontmatter citations array", () => {
    const cited = detectCitedReferences([
      { body: "", frontmatter: { citations: ["cit1", "cit2"] }, filePath: "doc.md" }
    ]);

    expect(cited.has("cit1")).toBe(true);
    expect(cited.has("cit2")).toBe(true);
  });

  it("extracts from frontmatter string value", () => {
    const cited = detectCitedReferences([
      { body: "", frontmatter: { references: "single-ref" }, filePath: "doc.md" }
    ]);

    expect(cited.has("single-ref")).toBe(true);
  });

  it("skips mailto links", () => {
    const cited = detectCitedReferences([
      { body: "Contact [mailto:user@example.com] for info.", frontmatter: {}, filePath: "doc.md" }
    ]);

    expect(cited.size).toBe(0);
  });

  it("handles citation keys with special characters", () => {
    const cited = detectCitedReferences([
      { body: "See [@author:2024] and [@name_2023] and [@key.ref].", frontmatter: {}, filePath: "doc.md" }
    ]);

    expect(cited.has("author:2024")).toBe(true);
    expect(cited.has("name_2023")).toBe(true);
    expect(cited.has("key.ref")).toBe(true);
  });

  it("returns empty set for object with no citations", () => {
    const cited = detectCitedReferences([
      { body: "Just plain text without any citations.", frontmatter: {}, filePath: "doc.md" }
    ]);

    expect(cited.size).toBe(0);
  });

  it("handles empty body", () => {
    const cited = detectCitedReferences([
      { body: "", frontmatter: {}, filePath: "doc.md" }
    ]);

    expect(cited.size).toBe(0);
  });

  it("deduplicates citations across objects", () => {
    const cited = detectCitedReferences([
      { body: "See [@shared].", frontmatter: {}, filePath: "one.md" },
      { body: "Also see [@shared].", frontmatter: {}, filePath: "two.md" }
    ]);

    expect(cited.has("shared")).toBe(true);
    expect(cited.size).toBe(1);
  });

  it("combines body and frontmatter citations", () => {
    const cited = detectCitedReferences([
      { body: "See [@body-ref].", frontmatter: { references: ["fm-ref"] }, filePath: "doc.md" }
    ]);

    expect(cited.has("body-ref")).toBe(true);
    expect(cited.has("fm-ref")).toBe(true);
  });
});
