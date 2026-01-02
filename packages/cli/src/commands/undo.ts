import { Command } from "commander";
import pc from "picocolors";
import { undoLastOperation, listBackups, printBackups } from "../backup.js";
import { cliContext, withAction } from "./utils.js";

export function registerUndoCommand(program: Command) {
  const undoCommand = program
    .command("undo")
    .description("Undo the last destructive operation or manage backups");

  undoCommand
    .command("last", { isDefault: true })
    .description("Undo the most recent operation")
    .action(withAction(async (_options, command) => {
      const { cwd } = cliContext(command);
      const result = await undoLastOperation(cwd);

      if (result.success) {
        console.log(pc.green(`✔ ${result.message}`));
      } else {
        console.log(pc.yellow(result.message));
      }
    }));

  undoCommand
    .command("list")
    .description("List available backups")
    .action(withAction(async (_options, command) => {
      const { cwd } = cliContext(command);
      const backups = await listBackups(cwd);
      printBackups(backups);
    }));
}
