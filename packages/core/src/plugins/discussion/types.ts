import type { VaultObject } from "../../types.js";

export interface DiscussionLink {
  provider: string;
  url: string;
  uri?: string;
  createdAt: string;
}

export interface DiscussionPluginConfig {
  enabled: boolean;
  [key: string]: unknown;
}

export interface CreateDiscussionOptions {
  object: VaultObject;
  config: DiscussionPluginConfig;
  dryRun?: boolean;
}

export interface CreateDiscussionResult {
  success: boolean;
  link?: DiscussionLink;
  error?: string;
  skipped?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

export interface DiscussionPlugin {
  /** Unique provider name */
  name: string;

  /** Human-readable display name */
  displayName: string;

  /** Check if plugin is properly configured */
  validate(config: DiscussionPluginConfig): Promise<ValidationResult>;

  /** Check if discussion already exists for this object */
  exists(object: VaultObject, config: DiscussionPluginConfig): Promise<DiscussionLink | null>;

  /** Create a new discussion thread */
  create(options: CreateDiscussionOptions): Promise<CreateDiscussionResult>;

  /** Optional: Delete/archive a discussion */
  delete?(link: DiscussionLink, config: DiscussionPluginConfig): Promise<boolean>;
}

// Provider-specific configs

export interface GitHubDiscussionConfig extends DiscussionPluginConfig {
  enabled: boolean;
  repo: string;
  category: string;
  token?: string;
}

export interface LeafletConfig extends DiscussionPluginConfig {
  enabled: boolean;
  pds?: string;
  identifier: string;
  password?: string;
}

export interface GoogleDocsConfig extends DiscussionPluginConfig {
  enabled: boolean;
  folderId?: string;
  access: "view" | "comment" | "edit";
  credentialsPath?: string;
}

// Discussion config in ExtenoteConfig

export interface DiscussionProvidersConfig {
  github?: GitHubDiscussionConfig;
  leaflet?: LeafletConfig;
  googledocs?: GoogleDocsConfig;
  [key: string]: DiscussionPluginConfig | undefined;
}

export interface DiscussionConfig {
  createObjects?: boolean;
  outputDir?: string;
  updateSourceFrontmatter?: boolean;
  frontmatterKey?: string;
  bodyTemplate?: string;
  providers?: DiscussionProvidersConfig;
}

// Result types for publishDiscussions

export interface DiscussionProgressEvent {
  type: "start" | "progress" | "complete" | "error";
  object?: VaultObject;
  provider?: string;
  message?: string;
}

export interface PublishDiscussionsOptions {
  objects: VaultObject[];
  discussionConfig: DiscussionConfig;
  providers?: string[];
  dryRun?: boolean;
  onProgress?: (event: DiscussionProgressEvent) => void;
}

export interface PublishDiscussionEntry {
  object: VaultObject;
  links: DiscussionLink[];
}

export interface PublishDiscussionError {
  object: VaultObject;
  provider: string;
  error: string;
}

export interface PublishDiscussionSkip {
  object: VaultObject;
  reason: string;
}

export interface PublishDiscussionsResult {
  created: PublishDiscussionEntry[];
  skipped: PublishDiscussionSkip[];
  errors: PublishDiscussionError[];
}
