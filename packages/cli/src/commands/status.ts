import { Command } from "commander";
import { loadVault, summarizeVault } from "@extenote/core";
import { cliContext, withAction, printSummary } from "./utils.js";

export function registerStatusCommand(program: Command) {
  program
    .command("status")
    .description("Summarize the current vault")
    .action(withAction(async (_options, command) => {
      const { cwd } = cliContext(command);
      const vault = await loadVault({ cwd });
      const summary = summarizeVault(vault.objects, vault.issues);
      printSummary(summary, vault.issues);
    }));
}
