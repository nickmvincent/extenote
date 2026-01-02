import path from "path";
import { Command } from "commander";
import pc from "picocolors";
import { loadVault, exportContent, objectBelongsToProject, detectCitedReferences } from "@extenote/core";
import { cliContext, withAction } from "./utils.js";

export function registerExportCommand(program: Command) {
  program
    .command("export-project")
    .description("Export every object under a project")
    .argument("<project>", "Project name (top-level directory)")
    .requiredOption("-f, --format <format>", "json|markdown|html|atproto|bibtex")
    .option("-o, --output <dir>", "Output directory override")
    .option("-t, --type <type>", "Filter by object type (e.g. bibtex_entry)")
    .option("--source <sourceId>", "Filter by source ID")
    .option("--detect-citations", "For bibtex: only export references that are actually cited")
    .action(withAction(async (project, options, command) => {
      const { cwd } = cliContext(command);
      const vault = await loadVault({ cwd });
      const supported = new Set(["json", "markdown", "html", "atproto", "bibtex"]);
      if (!supported.has(options.format)) {
        throw new Error(`Unsupported format ${options.format}`);
      }

      let objects = vault.objects.filter((object) => objectBelongsToProject(object, project, vault.config));
      if (options.type) {
        objects = objects.filter((object) => object.type === options.type);
      }
      if (options.source) {
        objects = objects.filter((object) => object.sourceId === options.source);
      }

      if (options.format === "bibtex" && options.detectCitations) {
        const contentObjects = vault.objects.filter((obj) => obj.type !== "bibtex_entry");
        const citedKeys = detectCitedReferences(contentObjects);
        const beforeCount = objects.length;
        if (process.env.DEBUG) {
          console.log(pc.dim(`Citation keys found: ${[...citedKeys].slice(0, 20).join(", ")}${citedKeys.size > 20 ? "..." : ""}`));
        }
        objects = objects.filter((obj) => {
          const key = (obj.frontmatter.citation_key as string) || obj.id;
          return citedKeys.has(key);
        });
        console.log(pc.dim(`Detected ${citedKeys.size} citations, filtered ${beforeCount} → ${objects.length} references`));
      }

      if (!objects.length) {
        console.log(pc.yellow(`No objects found for project ${project}`));
        return;
      }
      const outputDir = path.resolve(cwd, options.output ?? path.join("dist/export", project, options.format));
      const result = await exportContent({
        format: options.format,
        outputDir,
        objects,
        config: vault.config,
        schemas: vault.schemas
      });
      console.log(pc.green(`✔ Exported ${objects.length} objects → ${path.relative(cwd, result.outputDir) || "."}`));
    }));
}
