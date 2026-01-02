import path from "path";
import { Command } from "commander";
import pc from "picocolors";
import {
  loadVault,
  loadConfig,
  publishDiscussions,
  publishProjectDiscussion,
  writeDiscussionObjects,
  writeProjectDiscussionObject,
  updateSourceFrontmatter,
  DiscussionPluginRegistry
} from "@extenote/core";
import { cliContext, withAction } from "./utils.js";

export function registerDiscussionsCommand(program: Command) {
  const discussionsCmd = program
    .command("discussions")
    .description("Manage discussion threads for content objects");

  discussionsCmd
    .command("create")
    .description("Create discussion threads (project-level by default)")
    .argument("[project]", "Project name (defaults to first project with discussion config)")
    .option("--dry-run", "Show what would be created without making changes")
    .option("--provider <name>", "Only use specified provider(s)", (val, prev: string[]) => prev.concat(val), [])
    .option("--per-object [pattern]", "Create per-object discussions instead of project-level (optional filter pattern)")
    .option("--no-write-objects", "Skip writing discussion objects to outputDir (writes by default)")
    .option("--update-frontmatter", "Update source file frontmatter with links (per-object only)")
    .action(withAction(async (projectArg, options, command) => {
      const { cwd } = cliContext(command);
      const vault = await loadVault({ cwd });

      if (!vault.config.discussion?.providers) {
        throw new Error("No discussion providers configured. Add 'discussion.providers' to your config.");
      }

      // Per-object mode
      if (options.perObject !== undefined) {
        const pathPattern = typeof options.perObject === "string" ? options.perObject : undefined;
        let objects = vault.objects;
        if (pathPattern) {
          const pattern = new RegExp(pathPattern.replace(/\*/g, ".*"));
          objects = objects.filter((o) => pattern.test(o.relativePath));
        }

        if (!objects.length) {
          console.log(pc.yellow("No objects found to create discussions for"));
          return;
        }

        console.log(pc.dim(`Processing ${objects.length} objects...`));

        const result = await publishDiscussions({
          objects,
          discussionConfig: vault.config.discussion,
          providers: options.provider.length ? options.provider : undefined,
          dryRun: options.dryRun,
          onProgress: (event) => {
            if (event.type === "progress" && event.message) {
              console.log(pc.dim(`  ${event.message}`));
            }
          },
        });

        if (options.writeObjects && result.created.length > 0 && !options.dryRun) {
          const files = await writeDiscussionObjects(result.created, vault.config.discussion, cwd);
          console.log(pc.green(`✔ Wrote ${files.length} discussion objects`));
        }

        if (options.updateFrontmatter && result.created.length > 0 && !options.dryRun) {
          await updateSourceFrontmatter(result.created, vault.config.discussion);
          console.log(pc.green(`✔ Updated frontmatter for ${result.created.length} files`));
        }

        if (result.created.length) {
          console.log(pc.green(`✔ Created ${result.created.length} discussions`));
          for (const entry of result.created) {
            const links = entry.links.map((l) => `${l.provider}: ${l.url}`).join(", ");
            console.log(pc.dim(`  ${entry.object.id}: ${links}`));
          }
        }

        if (result.skipped.length) {
          console.log(pc.yellow(`⊘ Skipped ${result.skipped.length} (already exist)`));
        }

        if (result.errors.length) {
          console.log(pc.red(`✖ ${result.errors.length} errors:`));
          for (const err of result.errors) {
            console.log(pc.red(`  ${err.object.id} (${err.provider}): ${err.error}`));
          }
        }
        return;
      }

      // Project-level mode
      const projectName = projectArg ?? vault.config.projectProfiles?.[0]?.name ?? "project";
      const projectProfile = vault.config.projectProfiles?.find((p) => p.name === projectName);

      console.log(pc.dim(`Creating project-level discussion for "${projectName}"...`));

      const result = await publishProjectDiscussion({
        projectName,
        projectDescription: projectProfile ? `Discussion for the ${projectName} project` : undefined,
        discussionConfig: vault.config.discussion,
        providers: options.provider.length ? options.provider : undefined,
        dryRun: options.dryRun,
        onProgress: (event) => {
          if (event.message) {
            console.log(pc.dim(`  ${event.message}`));
          }
        },
      });

      if (options.writeObjects && result.links.length > 0 && !options.dryRun) {
        const filePath = await writeProjectDiscussionObject(
          projectName,
          result.links,
          vault.config.discussion,
          cwd
        );
        console.log(pc.green(`✔ Wrote discussion object: ${path.relative(cwd, filePath)}`));
      }

      if (result.links.length) {
        console.log(pc.green(`✔ Created discussion for "${projectName}":`));
        for (const link of result.links) {
          console.log(pc.dim(`  ${link.provider}: ${link.url}`));
        }
      }

      if (result.errors.length) {
        console.log(pc.red(`✖ ${result.errors.length} errors:`));
        for (const err of result.errors) {
          console.log(pc.red(`  ${err.provider}: ${err.error}`));
        }
      }
    }));

  discussionsCmd
    .command("list")
    .description("List existing discussion links for content objects")
    .argument("[path]", "Optional glob pattern to filter objects")
    .action(withAction(async (pathPattern, _options, command) => {
      const { cwd } = cliContext(command);
      const vault = await loadVault({ cwd });
      const frontmatterKey = vault.config.discussion?.frontmatterKey ?? "discussions";

      let objects = vault.objects;
      if (pathPattern) {
        const pattern = new RegExp(pathPattern.replace(/\*/g, ".*"));
        objects = objects.filter((o) => pattern.test(o.relativePath));
      }

      let count = 0;
      for (const object of objects) {
        const discussions = object.frontmatter[frontmatterKey] as Record<string, string> | undefined;
        if (discussions && Object.keys(discussions).length > 0) {
          count++;
          console.log(pc.bold(object.id));
          for (const [provider, url] of Object.entries(discussions)) {
            console.log(pc.dim(`  ${provider}: ${url}`));
          }
        }
      }

      if (count === 0) {
        console.log(pc.yellow("No discussion links found"));
      } else {
        console.log(pc.dim(`\n${count} objects with discussion links`));
      }
    }));

  discussionsCmd
    .command("validate")
    .description("Validate discussion provider configurations")
    .action(withAction(async (_options, command) => {
      const { cwd } = cliContext(command);
      const config = await loadConfig({ cwd });

      if (!config.discussion?.providers) {
        console.log(pc.yellow("No discussion providers configured"));
        return;
      }

      const registry = new DiscussionPluginRegistry();

      for (const [name, providerConfig] of Object.entries(config.discussion.providers)) {
        if (!providerConfig?.enabled) {
          console.log(pc.dim(`⊘ ${name}: Disabled`));
          continue;
        }

        const plugin = registry.get(name);
        if (!plugin) {
          console.log(pc.red(`✖ ${name}: Unknown provider`));
          continue;
        }

        const result = await plugin.validate(providerConfig);
        if (result.valid) {
          console.log(pc.green(`✔ ${name}: Configuration valid`));
        } else {
          console.log(pc.red(`✖ ${name}: ${result.errors?.join(", ")}`));
        }
      }
    }));
}
