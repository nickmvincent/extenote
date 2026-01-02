import path from "path";
import { Command } from "commander";
import pc from "picocolors";
import type { VaultIssue, VaultSummary, ExtenoteConfig, LoadedSchema, ExportRecipe } from "@extenote/core";
import { printError } from "../errors.js";

export type ProjectProfile = NonNullable<ExtenoteConfig["projectProfiles"]>[number];

export function cliContext(command: Command) {
  let root = command;
  while (root.parent) {
    root = root.parent;
  }
  const cwd = root.opts().cwd as string;
  return { cwd };
}

export function withAction<T extends unknown[]>(fn: (...args: T) => Promise<void>) {
  return (...args: T) => {
    fn(...args).catch((error) => {
      printError(error);
      if (process.env.DEBUG) {
        console.error(error.stack);
      }
      process.exitCode = 1;
    });
  };
}

export function severityWeight(value: VaultIssue["severity"]): number {
  switch (value) {
    case "error":
      return 3;
    case "warn":
      return 2;
    default:
      return 1;
  }
}

export function printSummary(summary: VaultSummary, issues: VaultIssue[]) {
  console.log(pc.bold(`${summary.totalObjects} objects • ${summary.totalIssues} issues`));
  const visibility = Object.entries(summary.visibilityCounts)
    .map(([key, value]) => `${key}:${value}`)
    .join(" · ");
  console.log(pc.dim(`visibility ${visibility || "—"}`));
  console.log(pc.dim(`types ${Object.keys(summary.typeCounts).length}`));
  if (issues.length) {
    console.log(pc.bold("Top issues"));
    issues
      .slice(0, 5)
      .sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity))
      .forEach(printIssue);
  }
}

export function printIssue(issue: VaultIssue) {
  const color = issue.severity === "error" ? pc.red : issue.severity === "warn" ? pc.yellow : pc.blue;
  console.log(`${color(issue.severity.toUpperCase())} ${path.basename(issue.filePath)} – ${issue.message}`);
}

export function coloredLog(message: string): void {
  if (message.startsWith("  ✔")) {
    console.log(pc.green(message));
  } else if (message.startsWith("  ✖")) {
    console.log(pc.red(message));
  } else if (message.startsWith("✔")) {
    console.log(pc.green(message));
  } else if (message.startsWith("✖")) {
    console.log(pc.red(message));
  } else if (message.startsWith("  [dry-run]") || message.startsWith("  ")) {
    console.log(pc.dim(message));
  } else if (message.includes("Summary") || message.startsWith("─")) {
    console.log(pc.bold(message));
  } else if (message.startsWith("Building") || message.startsWith("Deploying")) {
    const [action, rest] = message.split(" (");
    console.log(pc.bold(action) + (rest ? pc.dim(` (${rest}`) : ""));
  } else {
    console.log(message);
  }
}

export function groupSchemasByProject(schemas: LoadedSchema[]): Map<string, LoadedSchema[]> {
  const map = new Map<string, LoadedSchema[]>();
  for (const schema of schemas) {
    const projects = schema.projects?.length ? schema.projects : ["unknown"];
    for (const project of projects) {
      if (!map.has(project)) {
        map.set(project, []);
      }
      map.get(project)!.push(schema);
    }
  }
  return map;
}

export function resolveProjectBaseDir(config: ExtenoteConfig, profile: ProjectProfile | undefined, cwd: string): string | undefined {
  const preferredSourceIds = profile?.sourceIds;
  const orderedSources = preferredSourceIds?.length
    ? config.sources.filter((source) => preferredSourceIds.includes(source.id))
    : config.sources;
  for (const source of orderedSources) {
    if (source.type === "local" && "root" in source && typeof source.root === "string") {
      return path.resolve(cwd, source.root);
    }
  }
  return undefined;
}

export function suggestDir(baseDir: string | undefined, schema: LoadedSchema, cwd: string, project: string): string {
  const subdirIsRoot = schema.subdirectory === ".";
  const relativeDir = schema.subdirectory && !subdirIsRoot ? schema.subdirectory : schema.name;
  if (!baseDir) {
    return `<source-root>/${project}/${relativeDir}`;
  }
  const baseDirName = path.basename(baseDir);
  const sourceIncludesProject = baseDirName === project;
  const targetDir = sourceIncludesProject
    ? (subdirIsRoot ? "" : relativeDir)
    : path.join(project, relativeDir);
  const target = path.join(baseDir, targetDir);
  const relative = path.relative(cwd, target);
  return relative || ".";
}

export function resolveProjectRecipes(config: ExtenoteConfig, profile?: ProjectProfile): ExportRecipe[] {
  if (profile?.recipes?.length) {
    return profile.recipes;
  }
  if (!config.recipes?.length) {
    return [];
  }
  if (!profile?.sourceIds?.length) {
    return config.recipes;
  }
  return config.recipes.filter((recipe) => {
    if (!recipe.sourceIds?.length) {
      return true;
    }
    return recipe.sourceIds.some((id) => profile.sourceIds!.includes(id));
  });
}

export function formatPlatformLabel(platform: string): string {
  switch (platform) {
    case "cloudflare-pages": return "Cloudflare Pages";
    case "github-pages": return "GitHub Pages";
    case "vercel": return "Vercel";
    case "netlify": return "Netlify";
    default: return platform;
  }
}
