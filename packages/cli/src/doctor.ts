import fs from "fs/promises";
import path from "path";
import { load } from "js-yaml";
import pc from "picocolors";

interface DiagnosticResult {
  category: string;
  check: string;
  status: "pass" | "warn" | "fail";
  message: string;
  suggestion?: string;
}

interface DoctorOptions {
  cwd: string;
  verbose?: boolean;
}

export async function runDoctor(options: DoctorOptions): Promise<DiagnosticResult[]> {
  const { cwd } = options;
  // Note: verbose option reserved for future detailed output
  const results: DiagnosticResult[] = [];

  // ─── Directory Structure ───────────────────────────────────────────────────
  results.push(...(await checkDirectoryStructure(cwd)));

  // ─── Configuration Files ───────────────────────────────────────────────────
  results.push(...(await checkConfigFiles(cwd)));

  // ─── Environment Variables ─────────────────────────────────────────────────
  results.push(...checkEnvironmentVariables());

  // ─── Content Sources ───────────────────────────────────────────────────────
  results.push(...(await checkContentSources(cwd)));

  // ─── Dependencies ──────────────────────────────────────────────────────────
  results.push(...(await checkDependencies(cwd)));

  return results;
}

async function checkDirectoryStructure(cwd: string): Promise<DiagnosticResult[]> {
  const results: DiagnosticResult[] = [];

  // Check projects directory
  const projectsDir = path.join(cwd, "projects");
  try {
    const stats = await fs.stat(projectsDir);
    if (stats.isDirectory()) {
      const files = await fs.readdir(projectsDir);
      const yamlFiles = files.filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
      if (yamlFiles.length > 0) {
        results.push({
          category: "Structure",
          check: "Projects directory",
          status: "pass",
          message: `Found ${yamlFiles.length} project configuration(s)`,
        });
      } else {
        results.push({
          category: "Structure",
          check: "Projects directory",
          status: "warn",
          message: "Projects directory exists but has no YAML files",
          suggestion: "Run 'extenote init' to create a project",
        });
      }
    }
  } catch {
    results.push({
      category: "Structure",
      check: "Projects directory",
      status: "fail",
      message: "No projects/ directory found",
      suggestion: "Run 'extenote init' to set up your first project",
    });
  }

  // Check schemas directory
  const schemasDir = path.join(cwd, "schemas");
  try {
    const stats = await fs.stat(schemasDir);
    if (stats.isDirectory()) {
      const files = await fs.readdir(schemasDir);
      const yamlFiles = files.filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
      if (yamlFiles.length > 0) {
        results.push({
          category: "Structure",
          check: "Schemas directory",
          status: "pass",
          message: `Found ${yamlFiles.length} schema file(s)`,
        });
      } else {
        results.push({
          category: "Structure",
          check: "Schemas directory",
          status: "warn",
          message: "Schemas directory exists but has no YAML files",
          suggestion: "Add schema definitions in schemas/*.yaml",
        });
      }
    }
  } catch {
    results.push({
      category: "Structure",
      check: "Schemas directory",
      status: "warn",
      message: "No schemas/ directory found",
      suggestion: "Schemas are optional but recommended for validation",
    });
  }

  return results;
}

async function checkConfigFiles(cwd: string): Promise<DiagnosticResult[]> {
  const results: DiagnosticResult[] = [];

  // Check project files for valid YAML
  const projectsDir = path.join(cwd, "projects");
  try {
    const files = await fs.readdir(projectsDir);
    for (const file of files.filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))) {
      const filePath = path.join(projectsDir, file);
      try {
        const content = await fs.readFile(filePath, "utf8");
        const parsed = load(content) as Record<string, unknown>;

        // Check for required fields
        const issues: string[] = [];
        if (!parsed.project) {
          issues.push("missing 'project' field");
        }
        if (!parsed.sources || !Array.isArray(parsed.sources) || parsed.sources.length === 0) {
          issues.push("missing or empty 'sources' field");
        }

        if (issues.length > 0) {
          results.push({
            category: "Config",
            check: `Project: ${file}`,
            status: "warn",
            message: issues.join(", "),
            suggestion: "See docs/CONFIGURATION.md for required fields",
          });
        } else {
          results.push({
            category: "Config",
            check: `Project: ${file}`,
            status: "pass",
            message: `Valid project configuration for "${parsed.project}"`,
          });
        }
      } catch (err) {
        results.push({
          category: "Config",
          check: `Project: ${file}`,
          status: "fail",
          message: `Invalid YAML: ${err instanceof Error ? err.message : "parse error"}`,
          suggestion: "Check YAML syntax (indentation, colons, quotes)",
        });
      }
    }
  } catch {
    // projects dir doesn't exist, already handled
  }

  // Check schema files
  const schemasDir = path.join(cwd, "schemas");
  try {
    const files = await fs.readdir(schemasDir);
    for (const file of files.filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))) {
      const filePath = path.join(schemasDir, file);
      try {
        const content = await fs.readFile(filePath, "utf8");
        const parsed = load(content) as Record<string, unknown>;

        if (!parsed.schemas || !Array.isArray(parsed.schemas)) {
          results.push({
            category: "Config",
            check: `Schema: ${file}`,
            status: "warn",
            message: "File should have a 'schemas' array",
            suggestion: "See docs/CONFIGURATION.md for schema format",
          });
        } else {
          results.push({
            category: "Config",
            check: `Schema: ${file}`,
            status: "pass",
            message: `Found ${parsed.schemas.length} schema(s)`,
          });
        }
      } catch (err) {
        results.push({
          category: "Config",
          check: `Schema: ${file}`,
          status: "fail",
          message: `Invalid YAML: ${err instanceof Error ? err.message : "parse error"}`,
          suggestion: "Check YAML syntax",
        });
      }
    }
  } catch {
    // schemas dir doesn't exist, already handled
  }

  return results;
}

function checkEnvironmentVariables(): DiagnosticResult[] {
  const results: DiagnosticResult[] = [];

  // Check for .env file awareness
  const commonEnvVars = [
    { name: "EXTENOTE_CONTENT_ROOT", description: "Content root directory" },
    { name: "SEMBLE_APP_PASSWORD", description: "Semble sync (optional)" },
    { name: "GITHUB_TOKEN", description: "GitHub API access (optional)" },
  ];

  let envVarsSet = 0;
  for (const envVar of commonEnvVars) {
    if (process.env[envVar.name]) {
      envVarsSet++;
    }
  }

  if (envVarsSet === 0) {
    results.push({
      category: "Environment",
      check: "Environment variables",
      status: "pass",
      message: "No special environment variables required for basic operation",
    });
  } else {
    results.push({
      category: "Environment",
      check: "Environment variables",
      status: "pass",
      message: `${envVarsSet} environment variable(s) configured`,
    });
  }

  // Specific checks for optional integrations
  if (process.env.SEMBLE_APP_PASSWORD) {
    results.push({
      category: "Environment",
      check: "Semble credentials",
      status: "pass",
      message: "SEMBLE_APP_PASSWORD is set",
    });
  }

  if (process.env.GITHUB_TOKEN) {
    results.push({
      category: "Environment",
      check: "GitHub token",
      status: "pass",
      message: "GITHUB_TOKEN is set",
    });
  }

  return results;
}

async function checkContentSources(cwd: string): Promise<DiagnosticResult[]> {
  const results: DiagnosticResult[] = [];

  // Parse project files to find content sources
  const projectsDir = path.join(cwd, "projects");
  try {
    const files = await fs.readdir(projectsDir);
    for (const file of files.filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))) {
      const filePath = path.join(projectsDir, file);
      try {
        const content = await fs.readFile(filePath, "utf8");
        const parsed = load(content) as Record<string, unknown>;

        const sources = parsed.sources as Array<{ id: string; type: string; root?: string }> | undefined;
        if (sources && Array.isArray(sources)) {
          for (const source of sources) {
            if (source.type === "local" && source.root) {
              // Resolve environment variables in path
              let resolvedRoot = source.root.replace(/\$\{([^}]+)\}/g, (_, expr) => {
                const [varName, defaultVal] = expr.split(":-");
                return process.env[varName] ?? defaultVal ?? "";
              });
              resolvedRoot = path.resolve(cwd, resolvedRoot);

              try {
                const stats = await fs.stat(resolvedRoot);
                if (stats.isDirectory()) {
                  const mdFiles = await countMarkdownFiles(resolvedRoot);
                  results.push({
                    category: "Content",
                    check: `Source: ${source.id}`,
                    status: "pass",
                    message: `Found ${mdFiles} markdown file(s) in ${source.root}`,
                  });
                } else {
                  results.push({
                    category: "Content",
                    check: `Source: ${source.id}`,
                    status: "fail",
                    message: `Path is not a directory: ${source.root}`,
                    suggestion: "Check the 'root' path in your project config",
                  });
                }
              } catch {
                results.push({
                  category: "Content",
                  check: `Source: ${source.id}`,
                  status: "fail",
                  message: `Content directory not found: ${source.root}`,
                  suggestion: `Create the directory or update the source config`,
                });
              }
            }
          }
        }
      } catch {
        // Already handled in config check
      }
    }
  } catch {
    // projects dir doesn't exist
  }

  return results;
}

async function countMarkdownFiles(dir: string): Promise<number> {
  let count = 0;

  async function walk(d: string) {
    const entries = await fs.readdir(d, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(d, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith(".")) {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        count++;
      }
    }
  }

  try {
    await walk(dir);
  } catch {
    // Ignore errors
  }
  return count;
}

async function checkDependencies(cwd: string): Promise<DiagnosticResult[]> {
  const results: DiagnosticResult[] = [];

  // Check if bun is available
  try {
    const packageJsonPath = path.join(cwd, "package.json");
    await fs.stat(packageJsonPath);
    results.push({
      category: "Dependencies",
      check: "package.json",
      status: "pass",
      message: "Found package.json",
    });
  } catch {
    results.push({
      category: "Dependencies",
      check: "package.json",
      status: "warn",
      message: "No package.json found in current directory",
      suggestion: "Run 'bun init' if starting a new project",
    });
  }

  return results;
}

export function printDoctorResults(results: DiagnosticResult[]): void {
  const grouped = new Map<string, DiagnosticResult[]>();
  for (const result of results) {
    const group = grouped.get(result.category) ?? [];
    group.push(result);
    grouped.set(result.category, group);
  }

  let hasFailures = false;
  let hasWarnings = false;

  for (const [category, categoryResults] of grouped) {
    console.log(pc.bold(`\n${category}`));
    console.log(pc.dim("─".repeat(40)));

    for (const result of categoryResults) {
      const icon =
        result.status === "pass"
          ? pc.green("✔")
          : result.status === "warn"
          ? pc.yellow("⚠")
          : pc.red("✖");
      const statusColor =
        result.status === "pass"
          ? pc.green
          : result.status === "warn"
          ? pc.yellow
          : pc.red;

      console.log(`${icon} ${result.check}`);
      console.log(`  ${statusColor(result.message)}`);

      if (result.suggestion) {
        console.log(`  ${pc.dim(`→ ${result.suggestion}`)}`);
      }

      if (result.status === "fail") hasFailures = true;
      if (result.status === "warn") hasWarnings = true;
    }
  }

  // Summary
  console.log(pc.bold("\n─────────────────────────────────────────"));
  const passCount = results.filter((r) => r.status === "pass").length;
  const warnCount = results.filter((r) => r.status === "warn").length;
  const failCount = results.filter((r) => r.status === "fail").length;

  if (failCount > 0) {
    console.log(pc.red(`${failCount} issue(s) need attention`));
  }
  if (warnCount > 0) {
    console.log(pc.yellow(`${warnCount} warning(s)`));
  }
  if (passCount > 0 && failCount === 0) {
    console.log(pc.green(`${passCount} check(s) passed`));
  }

  if (!hasFailures && !hasWarnings) {
    console.log(pc.green("\nAll checks passed! Your project looks healthy."));
  } else if (hasFailures) {
    console.log(pc.dim("\nRun 'extenote init' to set up a new project."));
    console.log(pc.dim("See docs/CONFIGURATION.md for configuration help."));
  }
}
