#!/usr/bin/env node
import { Command } from "commander";
import pc from "picocolors";
import { registerAllCommands } from "./commands/index.js";

const program = new Command();
program.name("extenote").description("Minimal Extenote CLI").option("--cwd <path>", "Working directory", process.cwd());

// Register all commands from modular command files
registerAllCommands(program);

program.parseAsync().catch((error) => {
  console.error(pc.red(error.message));
  process.exitCode = 1;
});
