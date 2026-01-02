import fs from "fs";
import { Command } from "commander";
import pc from "picocolors";
import { loadVault, computeCitedIn, parseMarkdown, stringifyMarkdown } from "@extenote/core";
import { cliContext, withAction } from "./utils.js";

export function registerSyncCitationsCommand(program: Command) {
  program
    .command("sync-citations")
    .description("Update cited_in field on bibtex entries based on project citations")
    .option("--dry-run", "Show what would be updated without making changes")
    .action(withAction(async (options, command) => {
      const { cwd } = cliContext(command);
      const vault = await loadVault({ cwd });

      const bibtexEntries = vault.objects.filter((o) => o.type === "bibtex_entry");
      if (!bibtexEntries.length) {
        console.log(pc.yellow("No bibtex entries found"));
        return;
      }

      console.log(pc.bold("Scanning projects for citations..."));
      const citedInMap = computeCitedIn(vault.objects, vault.config);

      for (const project of citedInMap.scannedProjects) {
        let count = 0;
        for (const projects of citedInMap.citedIn.values()) {
          if (projects.includes(project)) count++;
        }
        console.log(pc.dim(`  ${project}: ${count} unique citations`));
      }

      let updatedCount = 0;
      for (const entry of bibtexEntries) {
        const key = (entry.frontmatter.citation_key as string) || entry.id;
        const newCitedIn = citedInMap.citedIn.get(key) || [];
        const currentCitedIn = (entry.frontmatter.cited_in as string[]) || [];

        const currentSorted = [...currentCitedIn].sort();
        const needsUpdate = JSON.stringify(currentSorted) !== JSON.stringify(newCitedIn);

        if (needsUpdate && newCitedIn.length > 0) {
          if (options.dryRun) {
            console.log(`Would update ${key}: [${newCitedIn.join(", ")}]`);
          } else {
            const content = fs.readFileSync(entry.filePath, "utf-8");
            const parsed = parseMarkdown(content);

            parsed.frontmatter.cited_in = newCitedIn;

            const updated = stringifyMarkdown(parsed.frontmatter, parsed.body);
            fs.writeFileSync(entry.filePath, updated);
            console.log(pc.green(`Updated ${key}: [${newCitedIn.join(", ")}]`));
          }
          updatedCount++;
        }
      }

      if (options.dryRun) {
        console.log(pc.dim(`\n${updatedCount} entries would be updated (dry-run)`));
      } else {
        console.log(pc.green(`\n✔ Updated ${updatedCount} bibtex entries with cited_in`));
      }
    }));
}
