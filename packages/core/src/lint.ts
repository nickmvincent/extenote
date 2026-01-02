import fs from "fs/promises";
import type {
  CompatibilityDefinition,
  ExtenoteConfig,
  ProjectProfile,
  VaultIssue,
  VaultObject
} from "./types.js";
import { stringifyMarkdown } from "./markdown.js";
import { hasValue } from "./utils.js";

export interface LintOptions {
  fix?: boolean;
}

export interface LintResult {
  issues: VaultIssue[];
  updatedFiles: string[];
}

export async function lintObjects(
  objects: VaultObject[],
  config: ExtenoteConfig,
  options: LintOptions = {}
): Promise<LintResult> {
  const issues: VaultIssue[] = [];
  const updatedFiles: string[] = [];

  for (const object of objects) {
    const profile = resolveProjectProfile(object, config.projectProfiles);
    const lintConfig = profile?.lint ?? config.lint;
    const visibilityRule = lintConfig?.rules?.["required-visibility"] ?? "off";
    const visibilityField = profile?.visibilityField ?? config.visibilityField ?? "visibility";
    if (visibilityRule !== "off") {
      const currentValue = object.frontmatter[visibilityField];
      if (currentValue !== "public" && currentValue !== "private" && currentValue !== "unlisted") {
        const defaultVisibility = profile?.defaultVisibility ?? config.defaultVisibility ?? "private";

        issues.push({
          sourceId: object.sourceId,
          filePath: object.filePath,
          field: visibilityField,
          message: `Missing ${visibilityField}; defaulting to ${defaultVisibility}`,
          severity: visibilityRule === "error" ? "error" : "warn",
          rule: "required-visibility"
        });

        if (options.fix) {
          object.frontmatter[visibilityField] = defaultVisibility;
          object.visibility = defaultVisibility;
          const next = stringifyMarkdown(object.frontmatter, object.body);
          await fs.writeFile(object.filePath, next, "utf8");
          updatedFiles.push(object.filePath);
        }
      }
    }

    const compatibilityTargets = profile?.compatibility;
    if (compatibilityTargets) {
      for (const [target, definition] of Object.entries(compatibilityTargets)) {
        if (!definition) {
          continue;
        }
        const ruleKey = `compatibility:${target}`;
        const ruleSetting = lintConfig?.rules?.[ruleKey];
        if (!ruleSetting || ruleSetting === "off") {
          continue;
        }
        const severity = ruleSetting === "error" ? "error" : "warn";
        const compatibilityIssues = evaluateCompatibility(object, definition, visibilityField, target, severity);
        issues.push(...compatibilityIssues);
      }
    }
  }

  return { issues, updatedFiles };
}

function resolveProjectProfile(object: VaultObject, profiles: ProjectProfile[] | undefined): ProjectProfile | undefined {
  if (!profiles?.length) {
    return undefined;
  }
  const projectName = deriveProjectName(object);
  if (!projectName) {
    return undefined;
  }
  return profiles.find((profile) => profile.name === projectName);
}

function deriveProjectName(object: VaultObject): string | undefined {
  const [project] = object.relativePath.split(/[\\/]/);
  if (project) {
    return project;
  }
  const schemaProject = object.schema?.projects?.[0];
  return schemaProject || undefined;
}

function evaluateCompatibility(
  object: VaultObject,
  definition: CompatibilityDefinition,
  visibilityField: string,
  target: string,
  severity: VaultIssue["severity"]
): VaultIssue[] {
  const issues: VaultIssue[] = [];
  for (const field of definition.requiredFields ?? []) {
    const value = object.frontmatter[field];
    if (!hasValue(value)) {
      issues.push({
        sourceId: object.sourceId,
        filePath: object.filePath,
        field,
        rule: `compatibility:${target}`,
        severity,
        message: `${field} is required for ${target} compatibility`
      });
    }
  }

  if (definition.requirePublicVisibility && object.visibility !== "public") {
    issues.push({
      sourceId: object.sourceId,
      filePath: object.filePath,
      field: visibilityField,
      rule: `compatibility:${target}`,
      severity,
      message: `Visibility must be public for ${target} compatibility`
    });
  }

  return issues;
}

