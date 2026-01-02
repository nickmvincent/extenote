import { Command } from "commander";
import pc from "picocolors";
import { loadConfig, getProjectWebsites } from "@extenote/core";
import { cliContext, withAction, formatPlatformLabel } from "./utils.js";

export function registerWebsitesCommand(program: Command) {
  program
    .command("websites")
    .description("List all public websites linked to projects")
    .option("--json", "Output as JSON")
    .option("--urls-only", "Output only URLs (one per line)")
    .action(withAction(async (options, command) => {
      const { cwd } = cliContext(command);
      const config = await loadConfig({ cwd });
      const websites = getProjectWebsites(config);

      if (!websites.length) {
        if (options.json) {
          console.log(JSON.stringify([]));
        } else if (!options.urlsOnly) {
          console.log(pc.yellow("No projects with deploy configuration found"));
          console.log(pc.dim("Add 'deploy' config to your project YAML to enable deployment"));
        }
        return;
      }

      if (options.json) {
        console.log(JSON.stringify(websites, null, 2));
        return;
      }

      if (options.urlsOnly) {
        for (const site of websites) {
          if (site.url) {
            console.log(site.url);
          }
        }
        return;
      }

      console.log(pc.bold("Public Websites"));
      console.log("");

      for (const site of websites) {
        const platformLabel = formatPlatformLabel(site.platform);
        const urlDisplay = site.url ? pc.cyan(site.url) : pc.dim("(URL not available)");

        console.log(`${pc.bold(site.title)} ${pc.dim(`(${site.name})`)}`);
        console.log(`  ${urlDisplay}`);
        if (site.domain && site.platformUrl) {
          console.log(`  ${pc.dim(`Platform URL: ${site.platformUrl}`)}`);
        }
        console.log(`  ${pc.dim(`Platform: ${platformLabel}`)}`);
        if (site.github) {
          console.log(`  ${pc.dim(`GitHub: ${site.github}`)}`);
        }
        if (site.buildType) {
          console.log(`  ${pc.dim(`Build: ${site.buildType}`)}`);
        }
        console.log("");
      }

      console.log(pc.dim(`${websites.length} website(s) total`));
    }));
}
