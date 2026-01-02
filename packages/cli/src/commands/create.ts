import path from "path";
import { Command } from "commander";
import pc from "picocolors";
import { loadConfig, loadSchemas, createMarkdownObject, selectSchemaProject } from "@extenote/core";
import { launchCreatorWizard } from "../creatorWizard.js";
import { cliContext, withAction } from "./utils.js";

export function registerCreateCommand(program: Command) {
  program
    .command("create")
    .description("Create a markdown object from a schema")
    .argument("<schema>", "Schema name")
    .argument("[slug]", "Optional slug/filename")
    .option("--title <title>", "Title for the object")
    .option("--dir <dir>", "Override directory for file")
    .option("--visibility <level>", "public|private|unlisted")
    .option("--project <name>", "Target project when schema spans multiple projects")
    .action(withAction(async (schemaName, slugArg, options, command) => {
      const { cwd } = cliContext(command);
      const config = await loadConfig({ cwd });
      const schemas = await loadSchemas(config, cwd);
      const schema = schemas.find((entry) => entry.name === schemaName);
      if (!schema) {
        throw new Error(`Schema ${schemaName} not found`);
      }
      const project = selectSchemaProject(schema, options.project);
      const plan = await createMarkdownObject({
        config,
        schema,
        cwd,
        slug: slugArg,
        title: options.title,
        dir: options.dir,
        visibility: options.visibility,
        project
      });
      console.log(pc.green(`✔ Created ${path.relative(cwd, plan.filePath)}`));
    }));
}

export function registerCreatorCommand(program: Command) {
  program
    .command("creator")
    .description("Launch the interactive creator wizard")
    .option("--schema <name>", "Preselect a schema")
    .option("--dir <dir>", "Override directory for file")
    .action(withAction(async (options, command) => {
      const { cwd } = cliContext(command);
      const config = await loadConfig({ cwd });
      const schemas = await loadSchemas(config, cwd);
      await launchCreatorWizard({
        cwd,
        config,
        schemas,
        initialSchemaName: options.schema,
        dirOverride: options.dir
      });
    }));
}
