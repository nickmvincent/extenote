import path from "path";
import { Command } from "commander";
import pc from "picocolors";
import { loadVault } from "@extenote/core";
import { cliContext, withAction, printIssue } from "./utils.js";

export function registerViewCommand(program: Command) {
  program
    .command("view")
    .description("View details of a specific object")
    .argument("<path>", "Object path (relative or absolute)")
    .option("--json", "Output as JSON")
    .action(withAction(async (pathArg, options, command) => {
      const { cwd } = cliContext(command);
      const vault = await loadVault({ cwd });

      const normalizedPath = path.resolve(cwd, pathArg);
      const relativePath = path.relative(cwd, normalizedPath);

      const object = vault.objects.find((o) =>
        o.filePath === normalizedPath ||
        o.relativePath === relativePath ||
        o.relativePath === pathArg ||
        o.filePath.endsWith(pathArg)
      );

      if (!object) {
        throw new Error(`Object not found: ${pathArg}`);
      }

      if (options.json) {
        console.log(JSON.stringify(object, null, 2));
        return;
      }

      console.log(pc.bold(object.title || object.id));
      console.log(pc.dim("─".repeat(40)));
      console.log(`${pc.cyan("Type:")} ${object.type}`);
      console.log(`${pc.cyan("Project:")} ${object.project}`);
      console.log(`${pc.cyan("Visibility:")} ${object.visibility ?? "unset"}`);
      console.log(`${pc.cyan("Path:")} ${object.relativePath}`);
      console.log(`${pc.cyan("Schema:")} ${object.schema?.name ?? "none"}`);

      const skipFields = new Set(["type", "title", "visibility", object.schema ? "schema" : ""]);
      const frontmatterEntries = Object.entries(object.frontmatter).filter(([k]) => !skipFields.has(k));
      if (frontmatterEntries.length) {
        console.log(pc.dim("─".repeat(40)));
        console.log(pc.bold("Frontmatter:"));
        for (const [key, value] of frontmatterEntries) {
          const displayValue = typeof value === "object" ? JSON.stringify(value) : String(value);
          console.log(`  ${pc.cyan(key)}: ${displayValue}`);
        }
      }

      if (object.body?.trim()) {
        console.log(pc.dim("─".repeat(40)));
        console.log(pc.bold("Body:"));
        const lines = object.body.trim().split("\n").slice(0, 10);
        for (const line of lines) {
          console.log(`  ${line}`);
        }
        if (object.body.trim().split("\n").length > 10) {
          console.log(pc.dim(`  ... (${object.body.trim().split("\n").length - 10} more lines)`));
        }
      }

      const objectIssues = vault.issues.filter((i) => i.filePath === object.filePath);
      if (objectIssues.length) {
        console.log(pc.dim("─".repeat(40)));
        console.log(pc.bold(`Issues (${objectIssues.length}):`));
        for (const issue of objectIssues) {
          printIssue(issue);
        }
      }
    }));
}
