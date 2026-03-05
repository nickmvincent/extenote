import type { LoadedSchema, LintFrontmatterOptions, LintFrontmatterResult } from "./types.js";
export declare function loadSchemas(schemaDir: string): Promise<LoadedSchema[]>;
export declare function lintFrontmatter(options: LintFrontmatterOptions): Promise<LintFrontmatterResult>;
export type { LoadedSchema, SchemaDefinition, LintFrontmatterOptions, LintFrontmatterResult, LintIssue, } from "./types.js";
export { hasValue, isValidDateString, matchesType, validateFrontmatterRecord, getVisibilityIssue, } from "./rules.js";
export type { RuleIssue, SchemaLike, ValidateFrontmatterRecordOptions, ValidateFrontmatterRecordResult, VisibilityIssueOptions, } from "./rules.js";
