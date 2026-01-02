import { Command } from "commander";
import pc from "picocolors";
import {
  loadVault,
  objectBelongsToProject,
  syncWithSemble,
  validateSembleConfig,
  listCollections,
  type SembleConfig
} from "@extenote/core";
import { cliContext, withAction, type ProjectProfile } from "./utils.js";

export function registerSyncCommand(program: Command) {
  program
    .command("sync")
    .description("Sync references with Semble (ATProto)")
    .argument("[project]", "Project name")
    .option("--push-only", "Only push local objects to Semble")
    .option("--pull-only", "Only pull cards from Semble")
    .option("--dry-run", "Show what would be synced without making changes")
    .option("--force", "Force sync even if already synced")
    .option("--merge-strategy <strategy>", "Conflict resolution: local-wins|remote-wins|skip-conflicts|error-on-conflict", "skip-conflicts")
    .option("--sync-deletes", "Sync deletions to remote")
    .option("--relink-collection", "Re-link existing synced cards to project collection")
    .option("--limit <n>", "Limit number of objects to sync (for testing)", (v) => parseInt(v, 10))
    .option("--filter <pattern>", "Only sync objects matching path pattern")
    .option("--type <type>", "Only sync objects of this type (e.g., bibtex_entry)")
    .option("--source <sourceId>", "Only sync objects from this source")
    .option("--owned-only", "Only sync objects directly owned by project (exclude includes)")
    .option("--list", "List projects with Semble configuration")
    .option("--list-collections", "List Semble collections")
    .option("--validate", "Validate Semble configuration without syncing")
    .action(withAction(async (projectArg, options, command) => {
      const { cwd } = cliContext(command);
      const vault = await loadVault({ cwd });

      const sembleProjects = (vault.config.projectProfiles ?? [])
        .filter((p): p is ProjectProfile & { semble: SembleConfig } =>
          p.semble != null && p.semble.enabled
        );

      if (options.list) {
        if (!sembleProjects.length) {
          console.log(pc.yellow("No projects with Semble configuration found"));
          console.log(pc.dim("Add 'semble' config to your project YAML to enable sync"));
          return;
        }
        console.log(pc.bold("Projects with Semble sync:"));
        for (const p of sembleProjects) {
          const status = p.semble.publicOnly ? "(public only)" : "";
          console.log(`  ${pc.cyan(p.name)} → ${p.semble.identifier} ${pc.dim(status)}`);
        }
        return;
      }

      if (options.validate) {
        if (!sembleProjects.length) {
          console.log(pc.yellow("No projects with Semble configuration found"));
          return;
        }
        for (const p of sembleProjects) {
          const result = validateSembleConfig(p.semble);
          if (result.valid) {
            console.log(pc.green(`✔ ${p.name}: Configuration valid`));
          } else {
            console.log(pc.red(`✖ ${p.name}: ${result.errors.join(", ")}`));
          }
        }
        return;
      }

      if (options.listCollections) {
        if (!sembleProjects.length) {
          console.log(pc.yellow("No projects with Semble configuration found"));
          return;
        }
        const config = sembleProjects[0].semble;
        console.log(pc.dim(`Fetching collections for ${config.identifier}...`));
        const collections = await listCollections(config);
        if (!collections.length) {
          console.log(pc.yellow("No collections found"));
          return;
        }
        console.log(pc.bold(`Found ${collections.length} collection(s):`));
        for (const col of collections) {
          console.log(`  ${pc.cyan(col.name)}`);
          console.log(pc.dim(`    ${col.uri}`));
          if (col.description) {
            console.log(pc.dim(`    ${col.description}`));
          }
        }
        return;
      }

      if (!sembleProjects.length) {
        console.log(pc.yellow("No projects with Semble configuration found"));
        console.log(pc.dim("Add 'semble' config to your project YAML:"));
        console.log(pc.dim(`
semble:
  enabled: true
  identifier: your.handle.com
  # password: or set SEMBLE_APP_PASSWORD env var
`));
        return;
      }

      let projectsToSync: Array<ProjectProfile & { semble: SembleConfig }>;
      if (projectArg) {
        const found = sembleProjects.find((p) => p.name === projectArg);
        if (!found) {
          const available = sembleProjects.map((p) => p.name).join(", ");
          throw new Error(`Project "${projectArg}" not found or has no Semble config. Available: ${available}`);
        }
        projectsToSync = [found];
      } else if (sembleProjects.length === 1) {
        projectsToSync = sembleProjects;
      } else {
        throw new Error(`Multiple Semble projects found. Specify one: ${sembleProjects.map((p) => p.name).join(", ")}`);
      }

      for (const project of projectsToSync) {
        console.log(pc.bold(`Syncing ${project.name}...`));

        const validation = validateSembleConfig(project.semble);
        if (!validation.valid) {
          console.log(pc.red(`✖ Invalid config: ${validation.errors.join(", ")}`));
          continue;
        }

        let objects: typeof vault.objects;

        if (options.ownedOnly) {
          objects = vault.objects.filter((o) => o.project === project.name);
        } else {
          objects = vault.objects.filter((o) =>
            objectBelongsToProject(o, project.name, vault.config)
          );
        }

        if (process.env.DEBUG) {
          const projectCounts = new Map<string, number>();
          for (const o of objects) {
            projectCounts.set(o.project, (projectCounts.get(o.project) ?? 0) + 1);
          }
          console.log(pc.dim(`Objects by project: ${[...projectCounts.entries()].map(([k, v]) => `${k}:${v}`).join(", ")}`));
        }

        if (options.source) {
          objects = objects.filter((o) => o.sourceId === options.source);
        }

        if (options.type) {
          objects = objects.filter((o) => o.type === options.type);
        }

        if (options.filter) {
          const pattern = new RegExp(options.filter.replace(/\*/g, ".*"));
          objects = objects.filter((o) => pattern.test(o.relativePath));
        }

        if (options.limit && options.limit > 0) {
          const originalCount = objects.length;
          objects = objects.slice(0, options.limit);
          console.log(pc.dim(`Limited to ${objects.length} of ${originalCount} objects`));
        }

        const result = await syncWithSemble({
          objects,
          config: vault.config,
          sembleConfig: project.semble,
          cwd,
          project: project.name,
          options: {
            pushOnly: options.pushOnly,
            pullOnly: options.pullOnly,
            dryRun: options.dryRun,
            force: options.force,
            mergeStrategy: options.mergeStrategy,
            syncDeletes: options.syncDeletes,
            relinkCollection: options.relinkCollection,
            onProgress: (message) => console.log(pc.dim(message))
          }
        });

        console.log("");
        if (result.pushed > 0) {
          console.log(pc.green(`✔ Pushed ${result.pushed} new objects to Semble`));
        }
        if (result.updated > 0) {
          console.log(pc.green(`✔ Updated ${result.updated} existing cards on Semble`));
        }
        if (result.deleted > 0) {
          console.log(pc.green(`✔ Deleted ${result.deleted} cards from Semble`));
        }
        if (result.pulled > 0) {
          console.log(pc.green(`✔ Pulled ${result.pulled} cards from Semble`));
        }
        if (result.conflicts.length > 0) {
          console.log(pc.yellow(`⚠ ${result.conflicts.length} conflicts detected:`));
          for (const conflict of result.conflicts) {
            console.log(pc.yellow(`  ${conflict.id}: local changed, remote CID ${conflict.remoteCid}`));
          }
        }
        if (result.skipped > 0) {
          console.log(pc.dim(`⊘ Skipped ${result.skipped} (unchanged or no URL)`));
        }
        if (result.errors.length > 0) {
          console.log(pc.red(`✖ ${result.errors.length} errors:`));
          for (const err of result.errors) {
            console.log(pc.red(`  ${err.id}: ${err.error}`));
          }
        }
        if (result.pushed === 0 && result.updated === 0 && result.deleted === 0 && result.pulled === 0 && result.errors.length === 0) {
          console.log(pc.dim("Nothing to sync"));
        }
      }
    }));
}
