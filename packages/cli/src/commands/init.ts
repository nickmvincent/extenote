import { Command } from "commander";
import { launchInitWizard, quickInit } from "../initWizard.js";
import { cliContext, withAction } from "./utils.js";

export function registerInitCommand(program: Command) {
  program
    .command("init")
    .description("Initialize a new Extenote project")
    .argument("[name]", "Project name (prompts if not provided)")
    .option("--type <type>", "Schema type: notes, references, blog, custom", "notes")
    .option("--quick", "Skip interactive prompts, use defaults")
    .action(withAction(async (nameArg, options, command) => {
      const { cwd } = cliContext(command);

      if (options.quick && nameArg) {
        await quickInit({
          cwd,
          name: nameArg,
          type: options.type as "notes" | "references" | "blog" | "custom",
        });
      } else if (nameArg && !process.stdin.isTTY) {
        await quickInit({
          cwd,
          name: nameArg,
          type: options.type as "notes" | "references" | "blog" | "custom",
        });
      } else {
        await launchInitWizard({ cwd });
      }
    }));
}
