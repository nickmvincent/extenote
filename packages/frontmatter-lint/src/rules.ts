import type { IssueSeverity, SchemaDefinition } from "./types.js";

export type Visibility = "public" | "private" | "unlisted";

export interface RuleIssue {
  field?: string;
  message: string;
  severity: IssueSeverity;
  rule?: string;
}

export interface SchemaLike {
  name: string;
  required?: string[];
  fields?: Record<string, { type: string; items?: string }>;
}

export interface ValidateFrontmatterRecordOptions {
  typeFields?: string[];
}

export interface ValidateFrontmatterRecordResult<TSchema extends SchemaLike> {
  type: string;
  schema?: TSchema;
  issues: RuleIssue[];
}

export interface VisibilityIssueOptions {
  visibilityField?: string;
  defaultVisibility?: Visibility;
  severity?: IssueSeverity | "off";
  message?: string | ((ctx: { visibilityField: string; defaultVisibility: Visibility }) => string);
}

export function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export function isValidDateString(value: string): boolean {
  const hasYear = /\b(19|20)\d{2}\b/.test(value);
  if (!hasYear) return false;
  return !Number.isNaN(Date.parse(value));
}

export function matchesType(value: unknown, type: string, items?: string): boolean {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number";
    case "boolean":
      return typeof value === "boolean";
    case "date":
      if (value instanceof Date) {
        return !Number.isNaN(value.getTime());
      }
      return typeof value === "string" && isValidDateString(value);
    case "array":
      if (!Array.isArray(value)) return false;
      if (!items) return true;
      return value.every((entry) => matchesType(entry, items));
    case "object":
      return value !== null && typeof value === "object" && !Array.isArray(value);
    default:
      return true;
  }
}

function resolveType(frontmatter: Record<string, unknown>, typeFields: string[]): string {
  for (const field of typeFields) {
    const candidate = frontmatter[field];
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate;
    }
  }
  return "";
}

export function validateFrontmatterRecord<TSchema extends SchemaLike>(
  frontmatter: Record<string, unknown>,
  schemaByName: ReadonlyMap<string, TSchema>,
  options: ValidateFrontmatterRecordOptions = {}
): ValidateFrontmatterRecordResult<TSchema> {
  const typeFields = options.typeFields ?? ["type", "schema"];
  const issues: RuleIssue[] = [];
  const type = resolveType(frontmatter, typeFields);

  if (!type) {
    issues.push({
      field: "type",
      message: "Missing type in frontmatter",
      severity: "error",
    });
    return { type, issues };
  }

  const schema = schemaByName.get(type);
  if (!schema) {
    issues.push({
      field: "type",
      message: `Unknown schema ${type}`,
      severity: "error",
    });
    return { type, issues };
  }

  for (const field of schema.required ?? []) {
    if (!hasValue(frontmatter[field])) {
      issues.push({
        field,
        message: `Missing required field ${field}`,
        severity: "error",
        rule: "required-field",
      });
    }
  }

  for (const [field, definition] of Object.entries(schema.fields ?? {})) {
    const value = frontmatter[field];
    if (value === undefined || value === null) continue;
    if (!matchesType(value, definition.type, definition.items)) {
      issues.push({
        field,
        message: `Field ${field} should be ${definition.type}`,
        severity: "error",
        rule: "field-type",
      });
    }
  }

  return { type, schema, issues };
}

export function getVisibilityIssue(
  frontmatter: Record<string, unknown>,
  options: VisibilityIssueOptions = {}
): RuleIssue | undefined {
  const visibilityField = options.visibilityField ?? "visibility";
  const defaultVisibility = options.defaultVisibility ?? "private";
  const severity = options.severity ?? "warn";

  if (severity === "off") {
    return undefined;
  }

  const visibility = frontmatter[visibilityField];
  if (visibility === "public" || visibility === "private" || visibility === "unlisted") {
    return undefined;
  }

  const message =
    typeof options.message === "function"
      ? options.message({ visibilityField, defaultVisibility })
      : options.message ?? `Missing ${visibilityField}; defaulting to ${defaultVisibility}`;

  return {
    field: visibilityField,
    message,
    severity,
    rule: "required-visibility",
  };
}

export type { SchemaDefinition };
