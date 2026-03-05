import { Command } from "commander";
import { loadVault, summarizeVault } from "@extenote/core";
import { cliContext, withAction, printSummary } from "./utils.js";

export function registerStatusCommand(program: Command) {
  program
    .command("status")
    .description("Summarize the current vault")
    .option("--json", "Output machine-readable JSON")
    .action(withAction(async (options, command) => {
      const { cwd } = cliContext(command);
      const vault = await loadVault({ cwd });
      const summary = summarizeVault(vault.objects, vault.issues);

      if (options.json) {
        console.log(JSON.stringify({ summary, issues: vault.issues }, null, 2));
        return;
      }

      printSummary(summary, vault.issues);
    }));
}
