export * from "./types.js";
export * from "./constants.js";
export * from "./settings.js";
export { loadConfig, buildSourceIdToProject, BuildConfigError } from "./config.js";
export { loadSchemas } from "./schemas.js";
export { loadVault } from "./vault.js";
export { exportContent } from "./exporters/index.js";
export { lintObjects } from "./lint.js";
export { parseMarkdown, stringifyMarkdown } from "./markdown.js";
export { hasValue, objectBelongsToProject, summarizeVault, type VaultSummary } from "./utils.js";

// Semble sync exports
export {
  SembleClient,
  syncWithSemble,
  validateSembleConfig,
  listCollections,
  type SyncInput,
  type SyncResult,
  type SyncOptions,
  type SyncState,
  type SyncedReference,
} from "./plugins/semble/index.js";

// Build & Deploy exports
export {
  buildProject,
  deployProject,
  printResultSummary,
  type BuildableProject,
  type DeployableProject,
  type BuildOptions,
  type DeployOptions,
  type BuildResult,
  type DeployResult,
  type SummaryResult,
} from "./build.js";

// Discussion plugin exports
export {
  publishDiscussions,
  publishProjectDiscussion,
  writeDiscussionObjects,
  writeProjectDiscussionObject,
  updateSourceFrontmatter,
  generateDiscussionObject,
  generateProjectDiscussionObject,
  DiscussionPluginRegistry,
} from "./plugins/discussion/index.js";
export type {
  DiscussionPlugin,
  DiscussionLink,
  DiscussionConfig,
  DiscussionPluginConfig,
  PublishDiscussionsOptions,
  PublishDiscussionsResult,
  PublishProjectDiscussionOptions,
  ProjectDiscussionResult,
} from "./plugins/discussion/index.js";

// Network plugin exports
export {
  generateNetworkData,
  generateQuartoDiscussionsPage,
  generateAstroNetworkJson,
  writeQuartoOutput,
  writeAstroOutput,
  executeNetworkStep,
} from "./plugins/network/index.js";
export type { GenerateNetworkOptions } from "./plugins/network/index.js";

// Cross-reference exports
export {
  parseWikiLinks,
  buildObjectIndex,
  getObjectCrossRefs,
  buildObjectGraph,
  computeAllCrossRefs,
  buildProjectDependencyGraph,
} from "./crossref.js";
export type {
  ObjectLink,
  ObjectCrossRefs,
  GraphNode,
  GraphEdge,
  ObjectGraph,
  ProjectGraphNode,
  ProjectGraph,
  GraphType,
} from "./crossref.js";

// Website exports
export {
  getProjectWebsites,
  getProjectWebsite,
  inferWebsiteUrl,
  extractGitHubUrl,
  formatProjectTitle,
} from "./websites.js";
export type { ProjectWebsite } from "./websites.js";

// Refcheck plugin exports
export {
  checkBibtexEntries,
  getAvailableProviders,
} from "./plugins/refcheck/index.js";
export type {
  CheckStatus,
  FieldCheck,
  CheckResult,
  CheckReport,
  CheckLog,
  CheckOptions,
} from "./plugins/refcheck/index.js";

// Tag management exports
export {
  buildTagTree,
  getAllTags,
  getObjectTags,
  previewTagMutation,
  applyTagMutation,
  renameTag,
  deleteTag,
  mergeTags,
  // Taxonomy validation
  loadTaxonomy,
  buildReverseIndex,
  validateTaxonomy,
  fixTaxonomyViolation,
  // Tag Explorer
  buildTagExplorerTree,
  // Tag Taxonomy Graph
  buildTagTaxonomyGraph,
} from "./tags.js";
export type {
  TagNode,
  TagTree,
  TagMutation,
  TagMutationPreview,
  TagMutationResult,
  // Taxonomy types
  Taxonomy,
  TaxonomyBroadTag,
  TaxonomyViolation,
  TaxonomyValidationResult,
  // Tag Explorer types
  TagExplorerNode,
  TagExplorerObject,
  TagExplorerTree,
  // Tag Taxonomy Graph types
  TagTaxonomyNode,
  TagTaxonomyEdge,
  TagTaxonomyGraph,
} from "./tags.js";

// Citation tracking exports
export {
  detectCitedReferences,
  computeCitedIn,
  getCitedIn,
} from "./citations.js";
export type { CitationScanObject, CitedInMap } from "./citations.js";

// Object creation exports
export {
  createMarkdownObject,
  buildCreatePlan,
  selectSchemaProject,
  slugify,
  determineBaseDir,
  resolveVisibilityDefaults,
} from "./createObject.js";
export type { CreateObjectOptions, CreatePlan } from "./createObject.js";
