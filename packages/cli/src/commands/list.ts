import { Command } from "commander";
import pc from "picocolors";
import { loadVault, objectBelongsToProject } from "@extenote/core";
import { cliContext, withAction } from "./utils.js";

export function registerListCommand(program: Command) {
  program
    .command("list")
    .description("List objects in a project")
    .argument("<project>", "Project name")
    .option("--type <type>", "Filter by object type")
    .option("--visibility <level>", "Filter by visibility (public|private|unlisted)")
    .option("--limit <n>", "Maximum objects to show", (v) => parseInt(v, 10), 20)
    .option("--json", "Output as JSON")
    .action(withAction(async (project, options, command) => {
      const { cwd } = cliContext(command);
      const vault = await loadVault({ cwd });

      let objects = vault.objects.filter((o) => objectBelongsToProject(o, project, vault.config));

      if (!objects.length) {
        console.log(pc.yellow(`No objects found in project "${project}"`));
        return;
      }

      if (options.type) {
        objects = objects.filter((o) => o.type === options.type);
      }
      if (options.visibility) {
        objects = objects.filter((o) => o.visibility === options.visibility);
      }

      if (options.json) {
        const output = objects.slice(0, options.limit).map((o) => ({
          id: o.id,
          title: o.title,
          type: o.type,
          visibility: o.visibility,
          path: o.relativePath
        }));
        console.log(JSON.stringify(output, null, 2));
        return;
      }

      console.log(pc.bold(`${project}: ${objects.length} objects`));
      console.log(pc.dim("─".repeat(50)));

      const displayed = objects.slice(0, options.limit);
      for (const obj of displayed) {
        const visibility = obj.visibility ? pc.dim(`[${obj.visibility}]`) : "";
        const typeTag = pc.cyan(`[${obj.type}]`);
        const title = obj.title || obj.id;
        console.log(`${typeTag} ${title} ${visibility}`);
        console.log(pc.dim(`  ${obj.relativePath}`));
      }

      if (objects.length > options.limit) {
        console.log(pc.dim(`\n... and ${objects.length - options.limit} more (use --limit to see more)`));
      }
    }));
}
