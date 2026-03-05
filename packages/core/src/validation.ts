import type {
  ExtenoteConfig,
  LoadedSchema,
  ValidationResult,
  VaultIssue,
  VaultObject
} from "./types.js";
import { getVisibilityIssue, validateFrontmatterRecord } from "@extenote/frontmatter-lint";

export function validateObjects(
  objects: VaultObject[],
  config: ExtenoteConfig,
  schemas: LoadedSchema[]
): ValidationResult[] {
  const schemaByName = new Map(schemas.map((schema) => [schema.name, schema]));

  return objects.map((object) => {
    const issues: VaultIssue[] = [];
    const schemaValidation = validateFrontmatterRecord(object.frontmatter, schemaByName);

    for (const issue of schemaValidation.issues) {
      issues.push({
        sourceId: object.sourceId,
        filePath: object.filePath,
        field: issue.field,
        message: issue.message,
        severity: issue.severity,
        rule: issue.rule,
      });
    }

    const visibilityIssue = getVisibilityIssue(object.frontmatter, {
      visibilityField: config.visibilityField ?? "visibility",
      defaultVisibility: config.defaultVisibility ?? "private",
      severity: "warn",
      message: "Visibility missing; run lint --fix",
    });
    if (visibilityIssue) {
      issues.push({
        sourceId: object.sourceId,
        filePath: object.filePath,
        field: visibilityIssue.field,
        message: visibilityIssue.message,
        severity: visibilityIssue.severity,
        rule: visibilityIssue.rule,
      });
    }

    if (!schemaValidation.schema) {
      return { object, issues };
    }

    return { object: { ...object, schema: schemaValidation.schema }, issues };
  });
}
