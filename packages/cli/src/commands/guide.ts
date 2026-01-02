import path from "path";
import { Command } from "commander";
import pc from "picocolors";
import { loadConfig, loadSchemas } from "@extenote/core";
import {
  cliContext,
  withAction,
  groupSchemasByProject,
  resolveProjectBaseDir,
  suggestDir,
  resolveProjectRecipes
} from "./utils.js";

export function registerGuideCommand(program: Command) {
  program
    .command("guide")
    .description("Suggest ready-to-run create/export commands")
    .option("--project <name>", "Only show a single project")
    .action(withAction(async (options, command) => {
      const { cwd } = cliContext(command);
      const config = await loadConfig({ cwd });
      const schemas = await loadSchemas(config, cwd);
      const grouped = groupSchemasByProject(schemas);
      const targets = options.project ? [options.project] : Array.from(grouped.keys()).sort();

      for (const project of targets) {
        const projectSchemas = grouped.get(project);
        if (!projectSchemas?.length) {
          console.log(pc.yellow(`⚠ No schemas found for project ${project}`));
          continue;
        }
        const profile = config.projectProfiles?.find((entry) => entry.name === project);
        const defaultVisibility = profile?.defaultVisibility ?? config.defaultVisibility ?? "private";
        const baseDir = resolveProjectBaseDir(config, profile, cwd);
        console.log(pc.bold(`Project: ${project}`));
        console.log(pc.cyan("Create commands:"));
        for (const schema of projectSchemas) {
          const dirHint = suggestDir(baseDir, schema, cwd, project);
          const projectFlag = schema.projects && schema.projects.length > 1 ? ` --project ${project}` : "";
          const suggestion = `bun run cli -- create ${schema.name} <slug> --title "${schema.name} title" --dir ${dirHint} --visibility ${defaultVisibility}${projectFlag}`;
          console.log(`  ${suggestion}`);
        }

        console.log(pc.cyan("Export commands:"));
        const recipes = resolveProjectRecipes(config, profile);
        if (recipes.length) {
          for (const recipe of recipes) {
            for (const step of recipe.steps) {
              const cmd = `bun run cli -- export-project ${project} --format ${step.format} --output ${step.outputDir}`;
              console.log(`  ${cmd}${recipe.description ? `  # ${recipe.description}` : ""}`);
            }
          }
        } else {
          const defaultOutput = path.join("dist/export", project, "json");
          console.log(`  bun run cli -- export-project ${project} --format json --output ${defaultOutput}`);
        }
        console.log("");
      }
    }));
}
