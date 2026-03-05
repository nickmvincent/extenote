import { Command } from "commander";
import pc from "picocolors";
import { loadVault, objectBelongsToProject, createSearchIndex } from "@extenote/core";
import { cliContext, withAction } from "../utils.js";

export function registerSearchCommand(program: Command) {
  program
    .command("search")
    .description("Search for objects by title or content")
    .argument("<query>", "Search query")
    .option("--project <name>", "Filter by project")
    .option("--type <type>", "Filter by object type")
    .option("--limit <n>", "Maximum results to show", (v) => parseInt(v, 10), 20)
    .option("--json", "Output machine-readable JSON")
    .action(withAction(async (query, options, command) => {
      const { cwd } = cliContext(command);
      const vault = await loadVault({ cwd });
      // SearchIndex requires unique IDs, but content can legitimately repeat short IDs (e.g. "readme").
      // Build synthetic search IDs and keep a mapping back to original objects.
      const searchIdToObject = new Map<string, (typeof vault.objects)[number]>();
      const searchObjects = vault.objects.map((obj) => {
        const searchId = `${obj.project}::${obj.sourceId}::${obj.relativePath}::${obj.id}`;
        searchIdToObject.set(searchId, obj);
        return { ...obj, id: searchId };
      });
      const index = createSearchIndex(searchObjects);
      const queryLower = query.toLowerCase();
      const resultLimit = Math.max(1, options.limit || 20);
      const searchLimit = Math.max(resultLimit * 5, 100);

      let results = index.search(query, {
        limit: searchLimit,
        type: options.type,
      });

      if (options.project) {
        results = results.filter((r) => {
          const original = searchIdToObject.get(r.id);
          const project = original?.project ?? r.object?.project;
          if (!project) return false;
          return objectBelongsToProject({ project }, options.project, vault.config);
        });
      }

      if (!results.length) {
        if (options.json) {
          console.log(JSON.stringify([], null, 2));
        } else {
          console.log(pc.yellow(`No results found for "${query}"`));
        }
        return;
      }

      const displayed = results.slice(0, resultLimit);

      if (options.json) {
        const output = displayed.map((r) => ({
          id: searchIdToObject.get(r.id)?.id ?? r.id,
          score: r.score,
          title: searchIdToObject.get(r.id)?.title ?? r.object?.title ?? r.id,
          type: searchIdToObject.get(r.id)?.type ?? r.object?.type,
          project: searchIdToObject.get(r.id)?.project ?? r.object?.project,
          path: searchIdToObject.get(r.id)?.relativePath ?? r.object?.relativePath,
          terms: r.terms,
        }));
        console.log(JSON.stringify(output, null, 2));
        return;
      }

      console.log(pc.bold(`Found ${results.length} results for "${query}"`));
      console.log(pc.dim("─".repeat(50)));

      for (const match of displayed) {
        const obj = searchIdToObject.get(match.id);
        const typeTag = pc.cyan(`[${match.object?.type ?? obj?.type ?? "unknown"}]`);
        const title = match.object?.title || obj?.title || match.id;
        const relPath = match.object?.relativePath || obj?.relativePath || match.id;

        let context = "";
        if (obj?.body) {
          const bodyLower = obj.body.toLowerCase();
          const matchIndex = bodyLower.indexOf(queryLower);
          if (matchIndex !== -1) {
            const start = Math.max(0, matchIndex - 20);
            const end = Math.min(obj.body.length, matchIndex + query.length + 30);
            const snippet = obj.body.slice(start, end).replace(/\n/g, " ");
            context = pc.dim(`  ...${snippet}...`);
          }
        }

        console.log(`${typeTag} ${title} ${pc.dim(`(score ${match.score.toFixed(2)})`)}`);
        console.log(pc.dim(`  ${relPath}`));
        if (context) console.log(context);
      }

      if (results.length > resultLimit) {
        console.log(pc.dim(`\n... and ${results.length - resultLimit} more (use --limit to see more)`));
      }
    }));
}
