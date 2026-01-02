import path from "path";
import { Command } from "commander";
import pc from "picocolors";
import { loadConfig, deployProject, printResultSummary, type DeployableProject } from "@extenote/core";
import { cliContext, withAction, coloredLog, type ProjectProfile } from "./utils.js";

export function registerDeployCommand(program: Command) {
  program
    .command("deploy")
    .description("Deploy website(s) to hosting platforms")
    .argument("[projects...]", "Project name(s) (or 'all' to deploy all)")
    .option("--list", "List deployable projects")
    .option("--verbose", "Show detailed deploy output")
    .option("--dry-run", "Show what would be deployed without executing")
    .option("--websites-dir <dir>", "Override websites directory")
    .action(withAction(async (projectArgs: string[], options, command) => {
      const { cwd } = cliContext(command);
      const config = await loadConfig({ cwd });

      const contentRoot = process.env.EXTENOTE_CONTENT_ROOT ?? path.resolve(cwd, "../extenote-pub/content");
      const contentPublicRoot = path.dirname(contentRoot);
      const websitesDir = options.websitesDir
        ? path.resolve(cwd, options.websitesDir)
        : path.resolve(contentPublicRoot, "websites");

      const deployableProjects: DeployableProject[] = (config.projectProfiles ?? [])
        .filter((p): p is ProjectProfile & {
          build: NonNullable<ProjectProfile["build"]>;
          deploy: NonNullable<ProjectProfile["deploy"]>
        } =>
          p.build != null &&
          p.build.websiteDir != null &&
          p.deploy != null &&
          p.deploy.platform !== "none"
        )
        .map((p) => ({
          name: p.name,
          build: p.build,
          deploy: p.deploy
        }));

      if (options.list) {
        if (!deployableProjects.length) {
          console.log(pc.yellow("No projects with deployment configuration found"));
          return;
        }
        console.log(pc.bold("Deployable projects:"));
        for (const p of deployableProjects) {
          console.log(`  ${pc.cyan(p.name)} → ${p.deploy.platform}`);
          console.log(pc.dim(`    ${p.build.websiteDir} (${p.deploy.outputDir ?? "dist"})`));
        }
        return;
      }

      if (!deployableProjects.length) {
        console.log(pc.yellow("No projects with deployment configuration found"));
        return;
      }

      let projectsToDeploy: DeployableProject[];
      if (!projectArgs.length || projectArgs.includes("all")) {
        projectsToDeploy = deployableProjects;
      } else {
        projectsToDeploy = [];
        for (const projectArg of projectArgs) {
          const found = deployableProjects.find((p) => p.name === projectArg);
          if (!found) {
            const available = deployableProjects.map((p) => p.name).join(", ");
            throw new Error(`Project "${projectArg}" not found or has no deploy config. Available: ${available}`);
          }
          projectsToDeploy.push(found);
        }
      }

      console.log(pc.bold(`Deploying ${projectsToDeploy.length} project(s)...`));
      console.log(pc.dim(`Websites dir: ${websitesDir}`));
      console.log("");

      const results = [];
      for (const project of projectsToDeploy) {
        const result = await deployProject(project, {
          websitesDir,
          verbose: options.verbose,
          dryRun: options.dryRun,
          log: coloredLog
        });
        results.push(result);
        console.log("");
      }

      printResultSummary(results, "Deploy", coloredLog);

      if (results.some((r) => !r.success)) {
        process.exitCode = 1;
      }
    }));
}
