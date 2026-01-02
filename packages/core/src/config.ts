import fs from "fs/promises";
import type { Stats } from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { pathToFileURL } from "url";
import dotenv from "dotenv";
import fg from "fast-glob";
import { load } from "js-yaml";
import type {
  ExtenoteConfig,
  ExportRecipe,
  LoadOptions,
  ProjectProfile,
  SourceConfig,
  CompatibilityDefinition,
  CompatibilityTarget,
  BuildConfig,
  DeployConfig,
  PreRenderStep,
  SembleConfig
} from "./types.js";

const DEFAULT_CONFIG_PATH = "projects";
const DEFAULT_SCHEMA_DIR = "schemas";

function loadEnvFile(filePath: string, { override = false }: { override?: boolean } = {}) {
  const result = dotenv.config({ path: filePath, override, quiet: true });
  const error = result.error as NodeJS.ErrnoException | undefined;
  if (error && error.code !== "ENOENT") {
    throw error;
  }
}

function loadEnvForProjectRoot(cwd: string) {
  const envPath = path.resolve(cwd, ".env");
  loadEnvFile(envPath);
  const localEnvPath = path.resolve(cwd, ".env.local");
  loadEnvFile(localEnvPath, { override: true });
}

function assertSources(sources: SourceConfig[]): void {
  const ids = new Set<string>();
  for (const source of sources) {
    if (!source.id) {
      throw new Error(`Source missing id: ${JSON.stringify(source)}`);
    }
    if (ids.has(source.id)) {
      throw new Error(`Duplicate source id detected: ${source.id}`);
    }
    ids.add(source.id);
  }
}

export async function loadConfig(options: LoadOptions = {}): Promise<ExtenoteConfig> {
  const cwd = options.cwd ?? process.cwd();
  loadEnvForProjectRoot(cwd);
  const configuredPath = options.configPath ?? DEFAULT_CONFIG_PATH;
  const configPath = path.resolve(cwd, configuredPath);
  let stats: Stats | undefined;

  try {
    stats = await fs.stat(configPath);
  } catch {
    throw new Error(`Could not find config at ${configPath}`);
  }

  if (stats.isDirectory()) {
    return loadConfigFromDirectory(configPath, cwd);
  }

  const imported = await importConfigModule(configPath);
  const config = (imported.default ?? imported.config) as ExtenoteConfig | undefined;

  if (!config) {
    throw new Error(`Config file ${configPath} does not export a default config object.`);
  }

  assertSources(config.sources ?? []);

  return {
    defaultVisibility: config.defaultVisibility ?? "private",
    visibilityField: config.visibilityField ?? "visibility",
    lint: config.lint ?? { rules: { "required-visibility": "warn" }, autofix: false },
    schemaDir: config.schemaDir ?? DEFAULT_SCHEMA_DIR,
    sources: config.sources ?? [],
    sites: config.sites ?? [],
    recipes: config.recipes,
    projectProfiles: config.projectProfiles ?? []
  };
}

interface ProjectDocument {
  project?: string;
  defaultVisibility?: string;
  visibilityField?: string;
  lint?: ExtenoteConfig["lint"];
  sources?: SourceConfig[];
  includes?: string[];
  recipes?: ExportRecipe[];
  compatibility?: Partial<Record<CompatibilityTarget, CompatibilityDefinition>>;
  discussion?: ExtenoteConfig["discussion"];
  build?: BuildConfig | null;
  deploy?: DeployConfig | null;
  semble?: SembleConfig | null;
  /** Project profiles defined in this file */
  projectProfiles?: Array<{
    name: string;
    sourceIds?: string[];
    defaultVisibility?: string;
    visibilityField?: string;
    skipProjectPrefix?: boolean;
  }>;
}

async function loadConfigFromDirectory(directory: string, _cwd: string): Promise<ExtenoteConfig> {
  const entries = await fg(["**/*.yml", "**/*.yaml"], { cwd: directory });
  if (!entries.length) {
    throw new Error(`No project config files found in ${directory}`);
  }

  const aggregatedSources = new Map<string, SourceConfig>();
  const projectProfiles: ProjectProfile[] = [];
  const aggregatedRecipes: ExportRecipe[] = [];

  let defaultVisibility: ExtenoteConfig["defaultVisibility"];
  let visibilityField: ExtenoteConfig["visibilityField"];
  let fallbackLint: ExtenoteConfig["lint"] | undefined;
  let discussionConfig: ExtenoteConfig["discussion"] | undefined;

  for (const relative of entries) {
    const filePath = path.join(directory, relative);
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = (load(raw) ?? {}) as ProjectDocument & { schemas?: unknown };
    const projectName = parsed.project ?? path.basename(relative, path.extname(relative));
    const lintConfig = parsed.lint;
    const projectDefaultVisibility = parsed.defaultVisibility as ExtenoteConfig["defaultVisibility"];
    const projectVisibilityField = parsed.visibilityField;
    const sourceIds: string[] = [];

    if (parsed.sources) {
      for (const source of parsed.sources) {
        const resolved = resolveSourceEnv(source);
        const existing = aggregatedSources.get(resolved.id);
        if (existing) {
          if (!sourcesMatch(existing, resolved)) {
            throw new Error(`Conflicting source definitions for id ${resolved.id}`);
          }
        } else {
          aggregatedSources.set(resolved.id, resolved);
        }
        sourceIds.push(resolved.id);
      }
    }

    if (!fallbackLint && lintConfig) {
      fallbackLint = lintConfig;
    }
    if (!defaultVisibility && projectDefaultVisibility) {
      defaultVisibility = projectDefaultVisibility;
    }
    if (!visibilityField && projectVisibilityField) {
      visibilityField = projectVisibilityField;
    }

    if (!discussionConfig && parsed.discussion) {
      discussionConfig = resolveDiscussionEnv(parsed.discussion);
    }

    if (parsed.recipes?.length) {
      aggregatedRecipes.push(
        ...parsed.recipes.map((recipe) => ({
          ...recipe,
          sourceIds: recipe.sourceIds ?? sourceIds
        }))
      );
    }

    // Handle null explicitly (YAML null means "no config")
    // Resolve environment variables in all config sections
    const buildConfig = parsed.build === null ? undefined : resolveBuildEnv(parsed.build);
    const deployConfig = parsed.deploy === null ? undefined : resolveEnvVars(parsed.deploy);
    const sembleConfig = parsed.semble === null ? undefined : resolveEnvVars(parsed.semble);

    // Check if there's an inline projectProfile for this project (for properties like skipProjectPrefix)
    const inlineProfile = parsed.projectProfiles?.find((p) => p.name === projectName);

    projectProfiles.push({
      name: projectName,
      lint: lintConfig,
      defaultVisibility: projectDefaultVisibility,
      visibilityField: projectVisibilityField,
      sourceIds: inlineProfile?.sourceIds ?? sourceIds,
      includes: parsed.includes,
      recipes: parsed.recipes,
      compatibility: parsed.compatibility,
      build: buildConfig,
      deploy: deployConfig,
      semble: sembleConfig,
      skipProjectPrefix: inlineProfile?.skipProjectPrefix
    });
  }

  const normalized: ExtenoteConfig = {
    defaultVisibility: defaultVisibility ?? "private",
    visibilityField: visibilityField ?? "visibility",
    lint: fallbackLint ?? { rules: { "required-visibility": "warn" }, autofix: false },
    schemaDir: DEFAULT_SCHEMA_DIR,
    sources: Array.from(aggregatedSources.values()),
    sites: [],
    recipes: aggregatedRecipes,
    projectProfiles,
    discussion: discussionConfig
  };

  assertSources(normalized.sources);

  return normalized;
}

// ─── Unified Environment Variable Resolution ────────────────────────────────

/**
 * Resolve ${VAR:-default} placeholders in a string
 */
function resolvePlaceholders(value: string): string {
  const pattern = /\$\{([^}:]+)(?::-(.+?))?\}/g;
  return value.replace(pattern, (_, name: string, fallback?: string) => {
    const env = process.env[name];
    if (env && env.length > 0) {
      return env;
    }
    return fallback ?? "";
  });
}

/**
 * Recursively resolve environment variables in any object/array/string
 */
function resolveEnvVars<T>(value: T): T {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === "string") {
    return resolvePlaceholders(value) as T;
  }
  if (Array.isArray(value)) {
    return value.map(resolveEnvVars) as T;
  }
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = resolveEnvVars(val);
    }
    return result as T;
  }
  return value;
}

function resolveSourceEnv(source: SourceConfig): SourceConfig {
  return resolveEnvVars(source);
}

function resolveBuildEnv(build: BuildConfig | undefined): BuildConfig | undefined {
  if (!build) return undefined;
  const resolved = resolveEnvVars(build);
  validateBuildConfig(resolved);
  return resolved;
}

function resolveDiscussionEnv(discussion: ExtenoteConfig["discussion"]): ExtenoteConfig["discussion"] {
  return resolveEnvVars(discussion);
}

// ─── Build Config Validation ─────────────────────────────────────────────────

export class BuildConfigError extends Error {
  constructor(
    public readonly project: string,
    public readonly field: string,
    message: string
  ) {
    super(`Build config error in ${project}: ${message}`);
    this.name = "BuildConfigError";
  }
}

function validateBuildConfig(build: BuildConfig, projectName = "unknown"): void {
  if (!build.websiteDir) {
    throw new BuildConfigError(projectName, "websiteDir", "websiteDir is required");
  }
  if (!build.type) {
    throw new BuildConfigError(projectName, "type", "type is required (astro | quarto | custom)");
  }
  if (!["astro", "quarto", "custom"].includes(build.type)) {
    throw new BuildConfigError(projectName, "type", `invalid build type: ${build.type}`);
  }

  // Validate preRender steps
  if (build.preRender) {
    for (let i = 0; i < build.preRender.length; i++) {
      validatePreRenderStep(build.preRender[i], projectName, i);
    }
  }
}

function validatePreRenderStep(step: PreRenderStep, project: string, index: number): void {
  const prefix = `preRender[${index}]`;

  switch (step.type) {
    case "rsync":
      if (!step.src) throw new BuildConfigError(project, `${prefix}.src`, "rsync step requires src");
      if (!step.dst) throw new BuildConfigError(project, `${prefix}.dst`, "rsync step requires dst");
      break;
    case "cli":
      if (!step.command) throw new BuildConfigError(project, `${prefix}.command`, "cli step requires command");
      break;
    case "copy":
      if (!step.src) throw new BuildConfigError(project, `${prefix}.src`, "copy step requires src");
      if (!step.dst) throw new BuildConfigError(project, `${prefix}.dst`, "copy step requires dst");
      break;
    case "shell":
      if (!step.command) throw new BuildConfigError(project, `${prefix}.command`, "shell step requires command");
      break;
    case "network":
      // Network step has no required fields (all optional)
      break;
    default:
      throw new BuildConfigError(project, `${prefix}.type`, `unknown step type: ${(step as { type: string }).type}`);
  }
}

function sourcesMatch(a: SourceConfig, b: SourceConfig): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function importConfigModule(configPath: string): Promise<Record<string, unknown>> {
  if (configPath.endsWith(".ts")) {
    const source = await fs.readFile(configPath, "utf8");
    const ts = await import("typescript");
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022
      },
      fileName: configPath
    });
    const hash = crypto.createHash("sha1").update(configPath + source).digest("hex");
    const tmpFile = path.join(os.tmpdir(), `extenote-config-${hash}.mjs`);
    await fs.writeFile(tmpFile, outputText, "utf8");
    return import(pathToFileURL(tmpFile).href);
  }
  return import(pathToFileURL(configPath).href);
}

/**
 * Build a mapping from source ID to project name.
 * Each source belongs to the first project that defines it.
 */
export function buildSourceIdToProject(config: ExtenoteConfig): Map<string, string> {
  const map = new Map<string, string>();
  for (const profile of config.projectProfiles ?? []) {
    for (const sourceId of profile.sourceIds ?? []) {
      if (!map.has(sourceId)) {
        map.set(sourceId, profile.name);
      }
    }
  }
  return map;
}
