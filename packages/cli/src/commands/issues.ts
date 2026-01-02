import { Command } from "commander";
import pc from "picocolors";
import { loadVault } from "@extenote/core";
import { cliContext, withAction, severityWeight, printIssue } from "./utils.js";

export function registerIssuesCommand(program: Command) {
  program
    .command("issues")
    .description("Show the issue inbox")
    .option("--limit <n>", "Maximum issues to print", (value) => Number(value), 20)
    .action(withAction(async (options, command) => {
      const { cwd } = cliContext(command);
      const vault = await loadVault({ cwd });
      const issues = [...vault.issues].sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity));
      const limit = Math.max(1, Number(options.limit) || 20);
      if (!issues.length) {
        console.log(pc.green("✔ No issues"));
        return;
      }
      issues.slice(0, limit).forEach(printIssue);
      if (issues.length > limit) {
        console.log(pc.dim(`… ${issues.length - limit} more`));
      }
    }));
}
