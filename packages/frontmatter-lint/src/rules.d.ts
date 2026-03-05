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
    fields?: Record<string, {
        type: string;
        items?: string;
    }>;
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
    message?: string | ((ctx: {
        visibilityField: string;
        defaultVisibility: Visibility;
    }) => string);
}
export declare function hasValue(value: unknown): boolean;
export declare function isValidDateString(value: string): boolean;
export declare function matchesType(value: unknown, type: string, items?: string): boolean;
export declare function validateFrontmatterRecord<TSchema extends SchemaLike>(frontmatter: Record<string, unknown>, schemaByName: ReadonlyMap<string, TSchema>, options?: ValidateFrontmatterRecordOptions): ValidateFrontmatterRecordResult<TSchema>;
export declare function getVisibilityIssue(frontmatter: Record<string, unknown>, options?: VisibilityIssueOptions): RuleIssue | undefined;
export type { SchemaDefinition };
