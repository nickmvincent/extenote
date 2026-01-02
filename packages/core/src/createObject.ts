import fs from "fs/promises";
import path from "path";
import { stringifyMarkdown } from "./markdown.js";
import type { ExtenoteConfig, LoadedSchema, SourceConfig } from "./types.js";

type ProjectProfile = NonNullable<ExtenoteConfig["projectProfiles"]>[number];

export interface CreateObjectOptions {
  config: ExtenoteConfig;
  schema: LoadedSchema;
  cwd: string;
  slug?: string;
  title?: string;
  dir?: string;
  visibility?: string;
  project?: string;
}

export interface CreatePlan {
  baseDir: string;
  targetDir: string;
  filePath: string;
  slug: string;
  title: string;
  visibilityField: string;
  visibility: string;
  project?: string;
}

export async function createMarkdownObject(options: CreateObjectOptions, plan?: CreatePlan): Promise<CreatePlan> {
  const finalPlan = plan ?? buildCreatePlan(options);
  const fileExists = await fs
    .stat(finalPlan.filePath)
    .then(() => true)
    .catch((error: NodeJS.ErrnoException) => {
      if (error?.code === "ENOENT") {
        return false;
      }
      throw error;
    });
  if (fileExists) {
    throw new Error(`File already exists: ${finalPlan.filePath}`);
  }
  await fs.mkdir(finalPlan.targetDir, { recursive: true });
  const frontmatter: Record<string, unknown> = {
    type: options.schema.name,
    title: finalPlan.title,
    [finalPlan.visibilityField]: finalPlan.visibility
  };
  for (const field of options.schema.required ?? []) {
    if (frontmatter[field] === undefined) {
      frontmatter[field] = placeholderForField(options.schema, field);
    }
  }
  const body = finalPlan.title ? `# ${finalPlan.title}\n\n` : "";
  await fs.writeFile(finalPlan.filePath, stringifyMarkdown(frontmatter, body), "utf8");
  return finalPlan;
}

export function buildCreatePlan(options: CreateObjectOptions): CreatePlan {
  const { config, schema, cwd } = options;
  const project = selectSchemaProject(schema, options.project);
  const baseDir = determineBaseDir(config, schema, project, options.dir, cwd);
  const slug = options.slug ?? slugify(options.title ?? schema.name);
  const subdirIsRoot = schema.subdirectory === ".";
  const subdir = schema.subdirectory && !subdirIsRoot ? schema.subdirectory : schema.name;

  // Check if project profile has skipProjectPrefix set
  const profile = config.projectProfiles?.find((p) => p.name === project);
  const shouldSkipPrefix = profile?.skipProjectPrefix === true;

  const projectPrefixedDir = options.dir || shouldSkipPrefix
    ? subdir
    : applyProjectPrefix(subdir, project ?? schema.projects?.[0], baseDir, subdirIsRoot);
  const targetDir = path.join(baseDir, projectPrefixedDir);
  const filePath = path.join(targetDir, `${slug}.md`);
  const { visibilityField, defaultVisibility } = resolveVisibilityDefaults(config, schema, project);
  const title = options.title ?? slug;
  const visibility = options.visibility ?? defaultVisibility;
  return {
    baseDir,
    targetDir,
    filePath,
    slug,
    title,
    visibilityField,
    visibility,
    project
  };
}

export function determineBaseDir(
  config: ExtenoteConfig,
  schema: LoadedSchema,
  project: string | undefined,
  override: string | undefined,
  cwd: string
) {
  if (override) {
    return path.resolve(cwd, override);
  }
  const localSource = findPreferredLocalSource(config, schema, project);
  if (localSource) {
    return path.resolve(cwd, localSource.root);
  }
  const fallback = config.sources.find((source) => source.type === "local");
  if (fallback) {
    return path.resolve(cwd, fallback.root);
  }
  return path.resolve(cwd, "content");
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function resolveVisibilityDefaults(config: ExtenoteConfig, schema: LoadedSchema, project?: string) {
  const profile = locateProjectProfile(config, schema, project);
  return {
    visibilityField: profile?.visibilityField ?? config.visibilityField ?? "visibility",
    defaultVisibility: profile?.defaultVisibility ?? config.defaultVisibility ?? "private"
  };
}

function placeholderForField(schema: LoadedSchema, field: string): unknown {
  const definition = schema.fields?.[field];
  switch (definition?.type) {
    case "number":
      return 0;
    case "boolean":
      return false;
    case "array":
      return [];
    case "date":
      return new Date().toISOString();
    default:
      return "";
  }
}

function locateProjectProfile(
  config: ExtenoteConfig,
  schema: LoadedSchema,
  projectOverride?: string
): ProjectProfile | undefined {
  const projectName = projectOverride ?? schema.projects?.[0];
  if (!projectName) {
    return undefined;
  }
  return config.projectProfiles?.find((profile) => profile.name === projectName);
}

function applyProjectPrefix(subdir: string, project?: string, baseDir?: string, subdirIsRoot?: boolean): string {
  if (!project) {
    return subdir;
  }
  const normalizedSubdir = subdir.replace(/^[\\/]+/, "");
  const normalizedProject = project.replace(/^[\\/]+/, "");

  // If the base directory already ends with the project name, don't add prefix
  // This handles cases where source.root already includes the project path
  if (baseDir) {
    const baseDirName = path.basename(baseDir);
    if (baseDirName === normalizedProject) {
      // If subdirectory is "." and source includes project, files go in root
      return subdirIsRoot ? "" : normalizedSubdir;
    }
  }

  if (
    normalizedSubdir === normalizedProject ||
    normalizedSubdir.startsWith(`${normalizedProject}/`) ||
    normalizedSubdir.startsWith(`${normalizedProject}\\`)
  ) {
    return normalizedSubdir;
  }
  return path.join(normalizedProject, normalizedSubdir);
}

function findPreferredLocalSource(
  config: ExtenoteConfig,
  schema: LoadedSchema,
  projectOverride?: string
): SourceConfig | undefined {
  for (const sourceId of schema.sourceIds ?? []) {
    const match = config.sources.find(
      (source): source is SourceConfig => source.id === sourceId && source.type === "local"
    );
    if (match) {
      return match;
    }
  }

  const projectCandidates = projectOverride ? [projectOverride] : schema.projects ?? [];
  if (projectCandidates.length) {
    for (const projectName of projectCandidates) {
      const profile = config.projectProfiles?.find((entry) => entry.name === projectName);
      if (!profile?.sourceIds?.length) {
        continue;
      }
      for (const sourceId of profile.sourceIds) {
        const match = config.sources.find(
          (source): source is SourceConfig => source.id === sourceId && source.type === "local"
        );
        if (match) {
          return match;
        }
      }
    }
  }

  return undefined;
}

export function selectSchemaProject(schema: LoadedSchema, requested?: string): string | undefined {
  const projects = schema.projects ?? [];
  if (!projects.length) {
    return requested;
  }
  if (requested) {
    if (!projects.includes(requested)) {
      throw new Error(
        `Project ${requested} is not associated with schema ${schema.name}. Valid projects: ${projects.join(", ")}`
      );
    }
    return requested;
  }
  if (projects.length === 1) {
    return projects[0];
  }
  throw new Error(
    `Schema ${schema.name} is available in multiple projects (${projects.join(
      ", "
    )}). Pass --project <name> to choose one.`
  );
}
