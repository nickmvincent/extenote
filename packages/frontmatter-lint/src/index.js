import fs from "fs/promises";
import path from "path";
import fg from "fast-glob";
import matter from "gray-matter";
import { load } from "js-yaml";
import { getVisibilityIssue, validateFrontmatterRecord } from "./rules.js";
const DEFAULT_INCLUDE = ["**/*.md", "**/*.markdown", "**/*.mdx", "**/*.qmd"];
const DEFAULT_EXCLUDE = ["**/node_modules/**", "**/.git/**"];
export async function loadSchemas(schemaDir) {
    const files = await fg(["**/*.yml", "**/*.yaml"], { cwd: schemaDir });
    const loaded = [];
    const seen = new Map();
    for (const relative of files) {
        const filePath = path.join(schemaDir, relative);
        const raw = await fs.readFile(filePath, "utf8");
        const parsed = (load(raw) ?? {});
        for (const schema of parsed.schemas ?? []) {
            const existing = seen.get(schema.name);
            if (existing) {
                throw new Error(`Duplicate schema name "${schema.name}" in ${filePath} (already in ${existing})`);
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
function countBySeverity(issues) {
    let error = 0;
    let warn = 0;
    for (const issue of issues) {
        if (issue.severity === "error")
            error += 1;
        if (issue.severity === "warn")
            warn += 1;
    }
    return { error, warn };
}
export async function lintFrontmatter(options) {
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
    const issues = [];
    const updatedFiles = [];
    const filesWithIssues = new Set();
    for (const filePath of files) {
        const raw = await fs.readFile(filePath, "utf8");
        const parsed = matter(raw);
        const frontmatter = parsed.data;
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
export { hasValue, isValidDateString, matchesType, validateFrontmatterRecord, getVisibilityIssue, } from "./rules.js";
