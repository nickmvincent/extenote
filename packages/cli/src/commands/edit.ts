import path from "path";
import { Command } from "commander";
import pc from "picocolors";
import { loadVault, DEFAULT_EDITOR } from "@extenote/core";
import { cliContext, withAction } from "./utils.js";

export function registerEditCommand(program: Command) {
  program
    .command("edit")
    .description("Open an object in $EDITOR")
    .argument("<path>", "Object path (relative or absolute)")
    .option("--wait", "Wait for editor to close")
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

      const editor = process.env.EDITOR || process.env.VISUAL || DEFAULT_EDITOR;
      console.log(pc.dim(`Opening ${object.relativePath} in ${editor}...`));

      const { spawn } = await import("child_process");

      if (options.wait) {
        const child = spawn(editor, [object.filePath], { stdio: "inherit" });
        await new Promise<void>((resolve, reject) => {
          child.on("close", (code) => {
            if (code === 0) {
              console.log(pc.green("✔ Editor closed"));
              resolve();
            } else {
              reject(new Error(`Editor exited with code ${code}`));
            }
          });
          child.on("error", reject);
        });
      } else {
        spawn(editor, [object.filePath], { detached: true, stdio: "ignore" }).unref();
      }
    }));
}
