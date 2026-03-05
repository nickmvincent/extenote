export type FieldType = "string" | "number" | "date" | "array" | "boolean" | "object";

export interface SchemaFieldDefinition {
  type: FieldType;
  description?: string;
  items?: "string" | "number" | "date" | "boolean" | "object";
}

export interface SchemaDefinition {
  name: string;
  description?: string;
  required?: string[];
  fields?: Record<string, SchemaFieldDefinition>;
}

export interface LoadedSchema extends SchemaDefinition {
  filePath: string;
}

export type IssueSeverity = "error" | "warn";

export interface LintIssue {
  filePath: string;
  field?: string;
  message: string;
  severity: IssueSeverity;
  rule?: string;
}

export interface LintFrontmatterOptions {
  contentDir: string;
  schemaDir: string;
  include?: string[];
  exclude?: string[];
  visibilityField?: string;
  requireVisibility?: boolean;
  defaultVisibility?: "public" | "private" | "unlisted";
  fix?: boolean;
}

export interface LintFrontmatterResult {
  filesScanned: number;
  filesWithIssues: number;
  issues: LintIssue[];
  updatedFiles: string[];
  issueCounts: {
    error: number;
    warn: number;
  };
  success: boolean;
}
