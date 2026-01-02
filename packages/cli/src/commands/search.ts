import { Command } from "commander";
import pc from "picocolors";
import { loadVault, objectBelongsToProject } from "@extenote/core";
import { cliContext, withAction } from "./utils.js";

export function registerSearchCommand(program: Command) {
  program
    .command("search")
    .description("Search for objects by title or content")
    .argument("<query>", "Search query")
    .option("--project <name>", "Filter by project")
    .option("--type <type>", "Filter by object type")
    .option("--limit <n>", "Maximum results to show", (v) => parseInt(v, 10), 20)
    .option("--json", "Output as JSON")
    .action(withAction(async (query, options, command) => {
      const { cwd } = cliContext(command);
      const vault = await loadVault({ cwd });

      const queryLower = query.toLowerCase();

      let results = vault.objects.filter((o) => {
        const titleMatch = o.title?.toLowerCase().includes(queryLower);
        const bodyMatch = o.body?.toLowerCase().includes(queryLower);
        const idMatch = o.id.toLowerCase().includes(queryLower);
        const pathMatch = o.relativePath.toLowerCase().includes(queryLower);
        return titleMatch || bodyMatch || idMatch || pathMatch;
      });

      if (options.project) {
        results = results.filter((o) => objectBelongsToProject(o, options.project, vault.config));
      }
      if (options.type) {
        results = results.filter((o) => o.type === options.type);
      }

      if (!results.length) {
        console.log(pc.yellow(`No results found for "${query}"`));
        return;
      }

      if (options.json) {
        const output = results.slice(0, options.limit).map((o) => ({
          id: o.id,
          title: o.title,
          type: o.type,
          project: o.project,
          path: o.relativePath
        }));
        console.log(JSON.stringify(output, null, 2));
        return;
      }

      console.log(pc.bold(`Found ${results.length} results for "${query}"`));
      console.log(pc.dim("─".repeat(50)));

      const displayed = results.slice(0, options.limit);
      for (const obj of displayed) {
        const typeTag = pc.cyan(`[${obj.type}]`);
        const title = obj.title || obj.id;

        let context = "";
        if (obj.body) {
          const bodyLower = obj.body.toLowerCase();
          const matchIndex = bodyLower.indexOf(queryLower);
          if (matchIndex !== -1) {
            const start = Math.max(0, matchIndex - 20);
            const end = Math.min(obj.body.length, matchIndex + query.length + 30);
            const snippet = obj.body.slice(start, end).replace(/\n/g, " ");
            context = pc.dim(`  ...${snippet}...`);
          }
        }

        console.log(`${typeTag} ${title}`);
        console.log(pc.dim(`  ${obj.relativePath}`));
        if (context) console.log(context);
      }

      if (results.length > options.limit) {
        console.log(pc.dim(`\n... and ${results.length - options.limit} more (use --limit to see more)`));
      }
    }));
}
