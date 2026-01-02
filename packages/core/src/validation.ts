import type {
  ExtenoteConfig,
  LoadedSchema,
  ValidationResult,
  VaultIssue,
  VaultObject
} from "./types.js";
import { hasValue } from "./utils.js";

export function validateObjects(
  objects: VaultObject[],
  config: ExtenoteConfig,
  schemas: LoadedSchema[]
): ValidationResult[] {
  return objects.map((object) => {
    const schema = schemas.find((item) => item.name === object.type);
    const issues: VaultIssue[] = [];

    if (!schema) {
      issues.push({
        sourceId: object.sourceId,
        filePath: object.filePath,
        message: `Unknown schema ${object.type}`,
        severity: "error"
      });
      return { object, issues };
    }

    for (const field of schema.required ?? []) {
      if (!hasValue(object.frontmatter[field])) {
        issues.push({
          sourceId: object.sourceId,
          filePath: object.filePath,
          field,
          message: `Missing required field ${field}`,
          severity: "error"
        });
      }
    }

    for (const [field, definition] of Object.entries(schema.fields ?? {})) {
      const value = object.frontmatter[field];
      if (value === undefined || value === null) {
        continue;
      }
      if (!matchesType(value, definition.type, definition.items)) {
        issues.push({
          sourceId: object.sourceId,
          filePath: object.filePath,
          field,
          message: `Field ${field} should be ${definition.type}`,
          severity: "error"
        });
      }
    }

    if (!object.frontmatter[config.visibilityField ?? "visibility"]) {
      issues.push({
        sourceId: object.sourceId,
        filePath: object.filePath,
        field: config.visibilityField ?? "visibility",
        message: "Visibility missing; run lint --fix",
        severity: "warn"
      });
    }

    return { object: { ...object, schema }, issues };
  });
}

/**
 * Validate that a string is a reasonable date format.
 * Accepts: ISO dates, year-only, year-month, common date formats with numeric components.
 * Rejects: month names alone, random strings that Date.parse() might accept.
 */
function isValidDateString(value: string): boolean {
  // Must contain at least a 4-digit year to be considered a valid date
  const hasYear = /\b(19|20)\d{2}\b/.test(value);
  if (!hasYear) {
    return false;
  }
  // If it has a year, verify Date.parse() can handle it
  return !Number.isNaN(Date.parse(value));
}

function matchesType(value: unknown, type: string, items?: string): boolean {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number";
    case "boolean":
      return typeof value === "boolean";
    case "date":
      // Accept Date objects (from YAML parsing unquoted dates)
      if (value instanceof Date) {
        return !Number.isNaN(value.getTime());
      }
      // Accept strings with valid date formats (must include a year)
      return typeof value === "string" && isValidDateString(value);
    case "array":
      if (!Array.isArray(value)) {
        return false;
      }
      if (!items) {
        return true;
      }
      return value.every((entry) => matchesType(entry, items));
    case "object":
      // Accept any plain object (nested validation is not enforced)
      return value !== null && typeof value === "object" && !Array.isArray(value);
    default:
      return true;
  }
}
