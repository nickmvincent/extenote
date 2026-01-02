import matter from "gray-matter";

export interface ParsedMarkdown {
  frontmatter: Record<string, unknown>;
  body: string;
}

export function parseMarkdown(content: string): ParsedMarkdown {
  const parsed = matter(content);
  return {
    frontmatter: parsed.data as Record<string, unknown>,
    body: parsed.content.trim()
  };
}

export function stringifyMarkdown(frontmatter: Record<string, unknown>, body: string): string {
  return matter.stringify(body.trim() + "\n", frontmatter);
}
