import path from "path";
import { Command } from "commander";
import pc from "picocolors";
import { loadVault, lintObjects } from "@extenote/core";
import { createBackup } from "../backup.js";
import { cliContext, withAction, printIssue } from "./utils.js";

export function registerLintCommand(program: Command) {
  program
    .command("lint")
    .description("Lint objects and optionally fix issues")
    .option("--fix", "Automatically fix fixable issues")
    .action(withAction(async (options, command) => {
      const { cwd } = cliContext(command);
      const vault = await loadVault({ cwd });

      if (options.fix) {
        const preview = await lintObjects(vault.objects, vault.config, { fix: false });
        const filesToFix = [...new Set(preview.issues.map((i) => i.filePath))];

        if (filesToFix.length > 0) {
          await createBackup(cwd, `lint fix: ${filesToFix.length} files`, filesToFix);
        }
      }

      const result = await lintObjects(vault.objects, vault.config, { fix: options.fix });
      if (result.updatedFiles.length) {
        console.log(pc.green(`✔ Fixed ${result.updatedFiles.length} files`));
        for (const file of result.updatedFiles.slice(0, 10)) {
          console.log(pc.dim(`  ${path.relative(cwd, file)}`));
        }
        if (result.updatedFiles.length > 10) {
          console.log(pc.dim(`  … and ${result.updatedFiles.length - 10} more`));
        }
        console.log(pc.dim("  (Use 'extenote undo' to revert)"));
      }
      if (result.issues.length && !options.fix) {
        console.log(pc.yellow(`${result.issues.length} lint issues found. Run with --fix to auto-fix.`));
        result.issues.slice(0, 10).forEach(printIssue);
        if (result.issues.length > 10) {
          console.log(pc.dim(`… ${result.issues.length - 10} more`));
        }
      } else if (!result.issues.length && !result.updatedFiles.length) {
        console.log(pc.green("✔ No lint issues"));
      }
    }));
}
