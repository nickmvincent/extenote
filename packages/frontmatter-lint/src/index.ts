import fs from "fs/promises";
import path from "path";
import fg from "fast-glob";
import matter from "gray-matter";
import { load } from "js-yaml";
import type {
  LoadedSchema,
  SchemaDefinition,
  LintFrontmatterOptions,
  LintFrontmatterResult,
  LintIssue,
} from "./types.js";
import { getVisibilityIssue, validateFrontmatterRecord } from "./rules.js";

const DEFAULT_INCLUDE = ["**/*.md", "**/*.markdown", "**/*.mdx", "**/*.qmd"];
const DEFAULT_EXCLUDE = ["**/node_modules/**", "**/.git/**"];

interface ParsedSchemaFile {
  schemas?: SchemaDefinition[];
}

export async function loadSchemas(schemaDir: string): Promise<LoadedSchema[]> {
  const files = await fg(["**/*.yml", "**/*.yaml"], { cwd: schemaDir });
  const loaded: LoadedSchema[] = [];
  const seen = new Map<string, string>();

  for (const relative of files) {
    const filePath = path.join(schemaDir, relative);
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = (load(raw) ?? {}) as ParsedSchemaFile;

    for (const schema of parsed.schemas ?? []) {
      const existing = seen.get(schema.name);
      if (existing) {
        throw new Error(
          `Duplicate schema name "${schema.name}" in ${filePath} (already in ${existing})`
        );
      }
      seen.set(schema.name, filePath);
      loaded.push({
        ...schema,
        required: schema.required ?? [],
        fields: schema.fields ?? {},
        filePath,
      });
    }
  }

  return loaded;
}

function countBySeverity(issues: LintIssue[]): { error: number; warn: number } {
  let error = 0;
  let warn = 0;
  for (const issue of issues) {
    if (issue.severity === "error") error += 1;
    if (issue.severity === "warn") warn += 1;
  }
  return { error, warn };
}

export async function lintFrontmatter(options: LintFrontmatterOptions): Promise<LintFrontmatterResult> {
  const include = options.include?.length ? options.include : DEFAULT_INCLUDE;
  const exclude = [...DEFAULT_EXCLUDE, ...(options.exclude ?? [])];
  const visibilityField = options.visibilityField ?? "visibility";
  const requireVisibility = options.requireVisibility ?? true;
  const defaultVisibility = options.defaultVisibility ?? "private";

  const schemas = await loadSchemas(options.schemaDir);
  const schemaByName = new Map(schemas.map((schema) => [schema.name, schema]));

  const files = await fg(include, {
    cwd: options.contentDir,
    ignore: exclude,
    onlyFiles: true,
    absolute: true,
  });

  const issues: LintIssue[] = [];
  const updatedFiles: string[] = [];
  const filesWithIssues = new Set<string>();

  for (const filePath of files) {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = matter(raw);
    const frontmatter = parsed.data as Record<string, unknown>;
    const body = parsed.content;

    const schemaValidation = validateFrontmatterRecord(frontmatter, schemaByName);
    for (const issue of schemaValidation.issues) {
      issues.push({ ...issue, filePath });
      filesWithIssues.add(filePath);
    }

    if (!schemaValidation.schema) {
      continue;
    }

    if (requireVisibility) {
      const visibilityIssue = getVisibilityIssue(frontmatter, {
        visibilityField,
        defaultVisibility,
        severity: "warn",
      });
      if (visibilityIssue) {
        issues.push({ ...visibilityIssue, filePath });
        filesWithIssues.add(filePath);

        if (options.fix && visibilityIssue.field) {
          frontmatter[visibilityIssue.field] = defaultVisibility;
          const next = matter.stringify(body.trim() + "\n", frontmatter);
          await fs.writeFile(filePath, next, "utf8");
          updatedFiles.push(filePath);
        }
      }
    }
  }

  const issueCounts = countBySeverity(issues);
  return {
    filesScanned: files.length,
    filesWithIssues: filesWithIssues.size,
    issues,
    updatedFiles,
    issueCounts,
    success: issueCounts.error === 0,
  };
}

export type {
  LoadedSchema,
  SchemaDefinition,
  LintFrontmatterOptions,
  LintFrontmatterResult,
  LintIssue,
} from "./types.js";
export {
  hasValue,
  isValidDateString,
  matchesType,
  validateFrontmatterRecord,
  getVisibilityIssue,
} from "./rules.js";
export type {
  RuleIssue,
  SchemaLike,
  ValidateFrontmatterRecordOptions,
  ValidateFrontmatterRecordResult,
  VisibilityIssueOptions,
} from "./rules.js";
