import fs from "fs/promises";
import path from "path";
import fg from "fast-glob";
import type { LocalSourceConfig, VaultIssue, VaultObject, Visibility } from "../types.js";
import { parseMarkdown } from "../markdown.js";
import type { SourceLoadContext, SourceLoadResult } from "./index.js";

const DEFAULT_INCLUDE = ["**/*.md", "**/*.markdown", "**/*.mdx"];
const DEFAULT_EXCLUDE = ["**/node_modules/**", "**/.git/**"];

export async function loadLocalSource(
  source: LocalSourceConfig,
  context: SourceLoadContext
): Promise<SourceLoadResult> {
  const root = path.resolve(context.cwd, source.root);
  const issues: VaultIssue[] = [];

  try {
    const stats = await fs.stat(root);
    if (!stats.isDirectory()) {
      issues.push({
        sourceId: source.id,
        filePath: root,
        message: `Configured root is not a directory: ${root}`,
        severity: "error"
      });
      return { sourceId: source.id, objects: [], issues };
    }
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    const reason = err?.code === "ENOENT" ? "not found" : "inaccessible";
    issues.push({
      sourceId: source.id,
      filePath: root,
      message: `Configured root ${reason}: ${root}`,
      severity: "error"
    });
    return { sourceId: source.id, objects: [], issues };
  }

  const includePatterns = source.include ?? DEFAULT_INCLUDE;
  const excludePatterns = [...DEFAULT_EXCLUDE, ...(source.exclude ?? [])];
  const files = await fg(includePatterns, { cwd: root, ignore: excludePatterns });

  const objects: VaultObject[] = [];

  for (const relativePath of files) {
    const filePath = path.join(root, relativePath);
    try {
      const stat = await fs.stat(filePath);
      const raw = await fs.readFile(filePath, "utf8");
      const parsed = parseMarkdown(raw);
      const candidateType = parsed.frontmatter.type ?? parsed.frontmatter.schema;
      const type = typeof candidateType === "string" ? candidateType : "";

      if (!type) {
        issues.push({
          field: "type",
          filePath,
          message: "Missing type in frontmatter",
          severity: "error",
          sourceId: source.id
        });
        continue;
      }

      const schema = context.schemas.find((schemaDef) => schemaDef.name === type);
      const identityField = schema?.identityField ?? "slug";
      const identityValue = parsed.frontmatter[identityField];
      const id =
        typeof identityValue === "string" && identityValue.length > 0
          ? identityValue
          : path.basename(relativePath, path.extname(relativePath));

      const visibility = resolveVisibility(parsed.frontmatter, source.visibility, context);

      objects.push({
        id,
        type,
        title: typeof parsed.frontmatter.title === "string" ? parsed.frontmatter.title : undefined,
        sourceId: source.id,
        project: "", // Set by vault.ts based on source ownership
        filePath,
        relativePath,
        frontmatter: parsed.frontmatter,
        body: parsed.body,
        mtime: stat.mtimeMs,
        schema,
        visibility
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      issues.push({
        sourceId: source.id,
        filePath,
        message: `Failed to load markdown: ${message}`,
        severity: "error"
      });
    }
  }

  return { sourceId: source.id, objects, issues, lastSynced: Date.now() };
}

function resolveVisibility(
  frontmatter: Record<string, unknown>,
  fallback: Visibility | undefined,
  context: SourceLoadContext
): Visibility {
  const value = frontmatter[context.visibilityField];
  if (value === "public" || value === "private" || value === "unlisted") {
    return value;
  }

  return fallback ?? context.defaultVisibility;
}
