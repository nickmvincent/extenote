import { Command } from "commander";
import { runDoctor, printDoctorResults } from "../doctor.js";
import { cliContext, withAction } from "./utils.js";

export function registerDoctorCommand(program: Command) {
  program
    .command("doctor")
    .description("Diagnose configuration and setup issues")
    .option("--verbose", "Show detailed output")
    .action(withAction(async (options, command) => {
      const { cwd } = cliContext(command);
      const results = await runDoctor({ cwd, verbose: options.verbose });
      printDoctorResults(results);

      const hasFailures = results.some(r => r.status === "fail");
      if (hasFailures) {
        process.exitCode = 1;
      }
    }));
}
