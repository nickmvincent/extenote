import path from "path";
import { Command } from "commander";
import pc from "picocolors";
import { loadConfig, buildProject, printResultSummary, type BuildableProject } from "@extenote/core";
import { cliContext, withAction, coloredLog, type ProjectProfile } from "./utils.js";

export function registerBuildCommand(program: Command) {
  program
    .command("build")
    .description("Build website(s) for projects")
    .argument("[projects...]", "Project name(s) (or 'all' to build all)")
    .option("--list", "List buildable projects")
    .option("--verbose", "Show detailed build output")
    .option("--dry-run", "Show what would be built without executing")
    .option("--websites-dir <dir>", "Override websites directory")
    .action(withAction(async (projectArgs: string[], options, command) => {
      const { cwd } = cliContext(command);
      const config = await loadConfig({ cwd });

      const contentRoot = process.env.EXTENOTE_CONTENT_ROOT ?? path.resolve(cwd, "../extenote-pub/content");
      const contentPublicRoot = path.dirname(contentRoot);
      const websitesDir = options.websitesDir
        ? path.resolve(cwd, options.websitesDir)
        : path.resolve(contentPublicRoot, "websites");

      const buildableProjects: BuildableProject[] = (config.projectProfiles ?? [])
        .filter((p): p is ProjectProfile & { build: NonNullable<ProjectProfile["build"]> } =>
          p.build != null && p.build.websiteDir != null
        )
        .map((p) => ({
          name: p.name,
          build: p.build,
          deploy: p.deploy
        }));

      if (options.list) {
        if (!buildableProjects.length) {
          console.log(pc.yellow("No projects with build configuration found"));
          return;
        }
        console.log(pc.bold("Buildable projects:"));
        for (const p of buildableProjects) {
          const deployInfo = p.deploy?.platform && p.deploy.platform !== "none"
            ? pc.dim(` → ${p.deploy.platform}`)
            : "";
          console.log(`  ${pc.cyan(p.name)} (${p.build.type})${deployInfo}`);
          console.log(pc.dim(`    ${p.build.websiteDir}`));
        }
        return;
      }

      if (!buildableProjects.length) {
        console.log(pc.yellow("No projects with build configuration found"));
        return;
      }

      let projectsToBuild: BuildableProject[];
      if (!projectArgs.length || projectArgs.includes("all")) {
        projectsToBuild = buildableProjects;
      } else {
        projectsToBuild = [];
        for (const projectArg of projectArgs) {
          const found = buildableProjects.find((p) => p.name === projectArg);
          if (!found) {
            const available = buildableProjects.map((p) => p.name).join(", ");
            throw new Error(`Project "${projectArg}" not found or has no build config. Available: ${available}`);
          }
          projectsToBuild.push(found);
        }
      }

      console.log(pc.bold(`Building ${projectsToBuild.length} project(s)...`));
      console.log(pc.dim(`Websites dir: ${websitesDir}`));
      console.log("");

      const results = [];
      for (const project of projectsToBuild) {
        const result = await buildProject(project, {
          cwd,
          websitesDir,
          verbose: options.verbose,
          dryRun: options.dryRun,
          log: coloredLog
        });
        results.push(result);
        console.log("");
      }

      printResultSummary(results, "Build", coloredLog);

      if (results.some((r) => !r.success)) {
        process.exitCode = 1;
      }
    }));
}
