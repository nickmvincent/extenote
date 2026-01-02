import { describe, expect, it } from "bun:test";
import { parseMarkdown, stringifyMarkdown } from "../src/markdown";

// ─── parseMarkdown Tests ─────────────────────────────────────────────────────

describe("parseMarkdown", () => {
  it("parses basic frontmatter and body", () => {
    const content = `---
title: Hello World
type: note
---
This is the body content.`;

    const result = parseMarkdown(content);
    expect(result.frontmatter.title).toBe("Hello World");
    expect(result.frontmatter.type).toBe("note");
    expect(result.body).toBe("This is the body content.");
  });

  it("handles empty body", () => {
    const content = `---
title: No Body
---
`;

    const result = parseMarkdown(content);
    expect(result.frontmatter.title).toBe("No Body");
    expect(result.body).toBe("");
  });

  it("parses complex frontmatter with arrays and nested objects", () => {
    const content = `---
title: Complex
tags:
  - tag1
  - tag2
metadata:
  author: John
  year: 2024
---
Body text.`;

    const result = parseMarkdown(content);
    expect(result.frontmatter.title).toBe("Complex");
    expect(result.frontmatter.tags).toEqual(["tag1", "tag2"]);
    expect(result.frontmatter.metadata).toEqual({ author: "John", year: 2024 });
    expect(result.body).toBe("Body text.");
  });

  it("handles content with no frontmatter", () => {
    const content = "Just plain markdown content.";

    const result = parseMarkdown(content);
    expect(result.frontmatter).toEqual({});
    expect(result.body).toBe("Just plain markdown content.");
  });

  it("trims whitespace from body", () => {
    const content = `---
title: Test
---

   Indented and spaced content.

`;

    const result = parseMarkdown(content);
    expect(result.body).toBe("Indented and spaced content.");
  });

  it("handles frontmatter with special characters", () => {
    const content = `---
title: "Quotes and special chars"
count: 42
enabled: true
---
Body with [[wiki-links]] and @citations.`;

    const result = parseMarkdown(content);
    expect(result.frontmatter.title).toBe("Quotes and special chars");
    expect(result.frontmatter.count).toBe(42);
    expect(result.frontmatter.enabled).toBe(true);
    expect(result.body).toContain("[[wiki-links]]");
  });
});

// ─── stringifyMarkdown Tests ─────────────────────────────────────────────────

describe("stringifyMarkdown", () => {
  it("creates valid markdown with frontmatter and body", () => {
    const frontmatter = { title: "Test", type: "note" };
    const body = "This is content.";

    const result = stringifyMarkdown(frontmatter, body);

    expect(result).toContain("---");
    expect(result).toContain("title: Test");
    expect(result).toContain("type: note");
    expect(result).toContain("This is content.");
  });

  it("handles empty body", () => {
    const frontmatter = { title: "Empty" };
    const body = "";

    const result = stringifyMarkdown(frontmatter, body);

    expect(result).toContain("title: Empty");
    // Should still have frontmatter delimiters
    expect(result.match(/---/g)?.length).toBe(2);
  });

  it("roundtrips correctly", () => {
    const original = {
      title: "Roundtrip Test",
      tags: ["a", "b"],
      count: 42,
    };
    const body = "Original body content.";

    const stringified = stringifyMarkdown(original, body);
    const parsed = parseMarkdown(stringified);

    expect(parsed.frontmatter.title).toBe(original.title);
    expect(parsed.frontmatter.tags).toEqual(original.tags);
    expect(parsed.frontmatter.count).toBe(original.count);
    expect(parsed.body).toBe(body);
  });

  it("handles special characters in body", () => {
    const frontmatter = { title: "Special" };
    const body = "Code: ```js\nconst x = 1;\n```\n\nAnd [[wiki-links]].";

    const result = stringifyMarkdown(frontmatter, body);
    const parsed = parseMarkdown(result);

    expect(parsed.body).toContain("```js");
    expect(parsed.body).toContain("[[wiki-links]]");
  });
});
