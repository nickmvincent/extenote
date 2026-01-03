import type { Stats } from "fs";

export type Visibility = "public" | "private" | "unlisted";

export type SourceType = "local";

export interface BaseSourceConfig {
  id: string;
  type: SourceType;
  visibility?: Visibility;
  disabled?: boolean;
}

export interface LocalSourceConfig extends BaseSourceConfig {
  type: "local";
  root: string;
  include?: string[];
  exclude?: string[];
}

export type SourceConfig = LocalSourceConfig;

export interface SiteConfig {
  name: string;
  description?: string;
  template: string;
  sourceIds: string[];
  outputDir: string;
  formats: ExportFormat[];
  visibility?: Visibility;
}

export interface LintRuleConfig {
  [ruleName: string]: "off" | "warn" | "error";
}

export interface LintConfig {
  rules: LintRuleConfig;
  autofix?: boolean;
}

export interface DiscussionProviderConfig {
  enabled: boolean;
  [key: string]: unknown;
}

export interface DiscussionConfig {
  createObjects?: boolean;
  outputDir?: string;
  updateSourceFrontmatter?: boolean;
  frontmatterKey?: string;
  bodyTemplate?: string;
  providers?: Record<string, DiscussionProviderConfig>;
}

export interface ExtenoteConfig {
  schemaDir: string;
  sources: SourceConfig[];
  sites: SiteConfig[];
  recipes?: ExportRecipe[];
  lint: LintConfig;
  defaultVisibility?: Visibility;
  visibilityField?: string;
  projectProfiles?: ProjectProfile[];
  discussion?: DiscussionConfig;
}

export interface SchemaFieldDefinition {
  type: "string" | "number" | "date" | "array" | "boolean";
  description?: string;
  items?: "string" | "number" | "date" | "boolean";
}

export interface SchemaDefinition {
  name: string;
  description?: string;
  subdirectory?: string;
  identityField?: string;
  required?: string[];
  fields: Record<string, SchemaFieldDefinition>;
  sourceIds?: string[];
  projects?: string[];
}

export interface LoadedSchema extends SchemaDefinition {
  filePath: string;
}

export interface VaultObject {
  id: string;
  type: string;
  title?: string;
  sourceId: string;
  project: string;
  filePath: string;
  relativePath: string;
  frontmatter: Record<string, unknown>;
  body: string;
  mtime: Stats["mtimeMs"];
  schema?: LoadedSchema;
  visibility: Visibility;
}

export type IssueSeverity = "info" | "warn" | "error";

export interface VaultIssue {
  sourceId: string;
  filePath: string;
  field?: string;
  message: string;
  severity: IssueSeverity;
  rule?: string;
}

export interface ValidationResult {
  object: VaultObject;
  issues: VaultIssue[];
}

export type ExportFormat = "json" | "markdown" | "html" | "atproto" | "bibtex";

export interface ExportOptions {
  format: ExportFormat;
  outputDir: string;
  objects: VaultObject[];
  config: ExtenoteConfig;
  schemas: LoadedSchema[];
}

export interface ExportResult {
  format: ExportFormat;
  outputDir: string;
  files: string[];
}

export interface ExportRecipeStep {
  format: ExportFormat;
  outputDir: string;
}

export interface ExportRecipe {
  name: string;
  description?: string;
  steps: ExportRecipeStep[];
  sourceIds?: string[];
}

export type CompatibilityTarget = "astro" | "quarto";

export interface CompatibilityDefinition {
  requiredFields?: string[];
  requirePublicVisibility?: boolean;
}

// ─── Build Configuration Types ───────────────────────────────────────────────

export type BuildType = "astro" | "quarto" | "custom";

// Discriminated union for type-safe preRender steps
export interface RsyncStep {
  type: "rsync";
  src: string;
  dst: string;
  include?: string[];
}

export interface CliStep {
  type: "cli";
  command: string;
  outputDir?: string;
}

export interface CopyStep {
  type: "copy";
  src: string;
  dst: string;
}

export interface ShellStep {
  type: "shell";
  command: string;
}

export interface WeasyprintStep {
  type: "weasyprint";
  /** Source HTML file path (relative to outputDir, e.g., "cv/index.html") */
  src: string;
  /** Output PDF file path (relative to outputDir, e.g., "cv/cv.pdf") */
  dst: string;
}

export interface NetworkStep {
  type: "network";
  /** Additional related projects (beyond auto-discovered includes) */
  relatedProjects?: string[];
  /** Exclude specific projects from auto-discovery */
  excludeProjects?: string[];
  /** Output format: quarto generates .qmd, astro generates .json */
  outputFormat?: "quarto" | "astro" | "both";
  /** For quarto: add to navbar (default: true) */
  addToNavbar?: boolean;
  /** For quarto: include project links section (default: true) */
  includeProjectLinks?: boolean;
}

export type PreRenderStep = RsyncStep | CliStep | CopyStep | ShellStep | NetworkStep;

export type PostBuildStep = WeasyprintStep | ShellStep;

// ─── Network Data Types ──────────────────────────────────────────────────────

export interface NetworkData {
  projectName: string;
  projectTitle?: string;
  links: {
    github?: string;
    website?: string;
  };
  relatedProjects: Array<{
    name: string;
    title?: string;
    description?: string;
    website?: string;
  }>;
  discussions: Array<{
    provider: string;
    url: string;
    title?: string;
  }>;
  generatedAt: string;
}

export interface BuildConfig {
  websiteDir: string;
  type: BuildType;
  preRender?: PreRenderStep[];
  postBuild?: PostBuildStep[];
  note?: string;
}

export type DeployPlatform = "cloudflare-pages" | "github-pages" | "vercel" | "netlify" | "ftp" | "none";

export interface DeployConfig {
  platform: DeployPlatform;
  configFile?: string;
  outputDir?: string;
  // GitHub Pages options
  repo?: string;      // e.g., "https://github.com/user/repo.git"
  branch?: string;    // default: "gh-pages"
  // FTP/SFTP options
  /** FTP/SFTP host (e.g., "ftp.example.com") */
  host?: string;
  /** FTP/SFTP username */
  user?: string;
  /** Remote path on the server (e.g., "/public_html") */
  remotePath?: string;
  /** FTP/SFTP port (default: 21 for FTP) */
  port?: number;
  /** FTP connection timeout in seconds (default: 30) */
  timeout?: number;
  /** Parallel upload threads (default: 4) */
  parallel?: number;
  /** Delete remote files not in local (default: false for safety) */
  deleteRemote?: boolean;
  // URL configuration
  /** The actual deployed URL (overrides auto-inference) */
  url?: string;
  /** Custom domain (e.g., "datalicenses.org") - displayed as primary URL */
  domain?: string;
}

// ─── Semble Sync Configuration ───────────────────────────────────────────────

export interface SembleConfig {
  enabled: boolean;
  /** ATProto PDS URL (default: https://bsky.social) */
  pds?: string;
  /** ATProto identifier (handle or DID) */
  identifier: string;
  /** App password (or use SEMBLE_APP_PASSWORD env var) */
  password?: string;
  /** Collection name to sync with (optional) */
  collection?: string;
  /** Only sync objects matching these types (default: bibtex_entry) */
  types?: string[];
  /** Only sync public objects */
  publicOnly?: boolean;
}

export interface ProjectProfile {
  name: string;
  lint?: LintConfig;
  defaultVisibility?: Visibility;
  visibilityField?: string;
  sourceIds?: string[];
  includes?: string[];
  recipes?: ExportRecipe[];
  compatibility?: Partial<Record<CompatibilityTarget, CompatibilityDefinition>>;
  build?: BuildConfig;
  deploy?: DeployConfig;
  semble?: SembleConfig;
  /** Skip adding project name as directory prefix when creating objects */
  skipProjectPrefix?: boolean;
}

export interface SourceSummary {
  source: SourceConfig;
  objectCount: number;
  issues: VaultIssue[];
  lastSynced?: number;
}

export interface VaultState {
  config: ExtenoteConfig;
  schemas: LoadedSchema[];
  objects: VaultObject[];
  issues: VaultIssue[];
  summaries: SourceSummary[];
}

export interface LoadOptions {
  cwd?: string;
  configPath?: string;
  verbose?: boolean;
}
