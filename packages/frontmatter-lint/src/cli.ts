#!/usr/bin/env node
import path from "path";
import { Command } from "commander";
import pc from "picocolors";
import { lintFrontmatter } from "./index.js";

type Collectable = string[];

function collect(value: string, previous: Collectable): Collectable {
  return [...previous, value];
}

const program = new Command();
program
  .name("frontmatter-lint")
  .description("Validate markdown frontmatter against YAML schemas");

program
  .command("check")
  .description("Check markdown files against schemas")
  .argument("<contentDir>", "Content directory to scan")
  .option("--schema-dir <dir>", "Schema directory", "schemas")
  .option("--include <glob>", "Include glob (repeatable)", collect, [])
  .option("--exclude <glob>", "Exclude glob (repeatable)", collect, [])
  .option("--visibility-field <field>", "Visibility field name", "visibility")
  .option("--default-visibility <value>", "Default visibility when --fix is enabled", "private")
  .option("--no-require-visibility", "Disable visibility warnings")
  .option("--fix", "Apply auto-fixes for visibility")
  .option("--json", "Output machine-readable JSON")
  .action(async (contentDir, options) => {
    const cwd = process.cwd();
    const resolvedContentDir = path.resolve(cwd, contentDir);
    const resolvedSchemaDir = path.resolve(cwd, options.schemaDir);

    const result = await lintFrontmatter({
      contentDir: resolvedContentDir,
      schemaDir: resolvedSchemaDir,
      include: options.include,
      exclude: options.exclude,
      visibilityField: options.visibilityField,
      defaultVisibility: options.defaultVisibility,
      requireVisibility: options.requireVisibility,
      fix: options.fix,
    });

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      if (!result.success) process.exitCode = 1;
      return;
    }

    console.log(pc.bold(`Scanned ${result.filesScanned} files`));
    if (result.updatedFiles.length > 0) {
      console.log(pc.green(`✔ Updated ${result.updatedFiles.length} files`));
    }

    if (result.issues.length === 0) {
      console.log(pc.green("✔ No issues"));
      return;
    }

    console.log(pc.yellow(`${result.issues.length} issue(s)`));
    for (const issue of result.issues.slice(0, 50)) {
      const severityColor = issue.severity === "error" ? pc.red : pc.yellow;
      const location = issue.field ? `${issue.filePath} (${issue.field})` : issue.filePath;
      console.log(`${severityColor(issue.severity.toUpperCase())} ${location} - ${issue.message}`);
    }
    if (result.issues.length > 50) {
      console.log(pc.dim(`... and ${result.issues.length - 50} more`));
    }

    if (!result.success) {
      process.exitCode = 1;
    }
  });

program.parseAsync().catch((error) => {
  console.error(pc.red(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});
