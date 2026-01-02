/**
 * Shared types for Extenote Web Clipper
 */

export interface PageMetadata {
  url: string;
  title: string;
  authors?: string[];
  year?: string;
  venue?: string;
  abstract?: string;
  doi?: string;
  arxivId?: string;
  tags?: string[];
  entryType?: string;
  externalBibtex?: string;
}

export interface ClipperConfig {
  // V1 settings
  defaultSchema: string;
  defaultTags: string[];
  filenamePattern: string;
  downloadSubdir: string;

  // V2 settings
  mode: "download" | "api";
  apiUrl: string;
  defaultProject: string;
}

export const DEFAULT_CONFIG: ClipperConfig = {
  // V1 defaults
  defaultSchema: "bibtex_entry",
  defaultTags: ["clipped"],
  filenamePattern: "{citation_key}.md",
  downloadSubdir: "shared-references/",

  // V2 defaults
  mode: "download",
  apiUrl: "http://localhost:3001",
  defaultProject: "",
};

export interface ClipRequest {
  metadata: PageMetadata;
  citationKey: string;
  tags: string[];
  schema: string;
  project?: string;
}

export interface ClipResponse {
  success: boolean;
  filename?: string;
  filePath?: string;
  error?: string;
}

// Extenote API types
export interface ExtenoteSchema {
  name: string;
  projects: string[];
  fields: Record<string, unknown>;
}

export interface ExtenoteVaultInfo {
  schemas: ExtenoteSchema[];
  projects: string[];
}

export interface ExtenoteCreateRequest {
  schema: string;
  slug: string;
  title?: string;
  visibility?: string;
  project?: string;
}

export interface ExtenoteCreateResponse {
  filePath: string;
}

export type MessageType =
  | { type: "GET_METADATA" }
  | { type: "METADATA_RESULT"; metadata: PageMetadata }
  | { type: "CLIP_PAGE"; request: ClipRequest }
  | { type: "CLIP_RESULT"; response: ClipResponse }
  | { type: "CHECK_API" }
  | { type: "API_STATUS"; connected: boolean; info?: ExtenoteVaultInfo };

// Vault object types for validation
export interface CheckLog {
  checked_at: string;
  checked_with: string;
  status: "confirmed" | "mismatch" | "not_found" | "error";
  fields?: Record<string, { match: boolean; vault?: unknown; api?: unknown }>;
}

export interface VaultObject {
  id: string;
  filePath: string;
  relativePath: string;
  project: string;
  type: string;
  title: string;
  frontmatter: Record<string, unknown>;
  body: string;
}

export interface ValidationQueueEntry {
  id: string;
  title: string;
  filePath: string;
  url?: string;
  doi?: string;
  lastChecked: string | null;
}

export interface ValidationQueueResponse {
  total: number;
  validated: number;
  pending: number;
  entries: ValidationQueueEntry[];
}

export type ValidationStatus = "confirmed" | "mismatch" | "stale" | "unchecked" | "not_found" | "error";
