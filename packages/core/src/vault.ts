import type { LoadOptions, VaultState, VaultIssue, SourceSummary, VaultObject } from "./types.js";
import { loadConfig, buildSourceIdToProject } from "./config.js";
import { loadSchemas } from "./schemas.js";
import { loadSource } from "./sources/index.js";
import { validateObjects } from "./validation.js";
import { lintObjects } from "./lint.js";

export async function loadVault(options: LoadOptions = {}): Promise<VaultState> {
  const cwd = options.cwd ?? process.cwd();
  const config = await loadConfig({ ...options, cwd });
  const schemas = await loadSchemas(config, cwd);
  const sourceIdToProject = buildSourceIdToProject(config);
  const summaries: SourceSummary[] = [];
  const objects: VaultObject[] = [];
  const collectedIssues: VaultIssue[] = [];

  // Build set of known project names for directory-based assignment
  const knownProjects = new Set((config.projectProfiles ?? []).map((p) => p.name));

  for (const source of config.sources) {
    const result = await loadSource(source, {
      cwd,
      schemas,
      visibilityField: config.visibilityField ?? "visibility",
      defaultVisibility: config.defaultVisibility ?? "private",
      verbose: options.verbose
    });
    // Set project on each object - prefer directory structure, fall back to sourceId mapping
    const fallbackProject = sourceIdToProject.get(source.id) ?? "unknown";
    for (const obj of result.objects) {
      // Extract first directory component from relativePath (e.g., "data-licenses/foo.md" -> "data-licenses")
      const firstDir = obj.relativePath.split("/")[0];
      obj.project = knownProjects.has(firstDir) ? firstDir : fallbackProject;
    }
    summaries.push({ source, objectCount: result.objects.length, issues: result.issues, lastSynced: result.lastSynced });
    objects.push(...result.objects);
    collectedIssues.push(...result.issues);
  }

  const validationResults = validateObjects(objects, config, schemas);
  const validatedObjects = validationResults.map((result) => result.object);
  for (const result of validationResults) {
    collectedIssues.push(...result.issues);
  }

  const lintResult = await lintObjects(validatedObjects, config, { fix: false });
  collectedIssues.push(...lintResult.issues);

  return {
    config,
    schemas,
    objects: validatedObjects,
    issues: collectedIssues,
    summaries
  };
}
