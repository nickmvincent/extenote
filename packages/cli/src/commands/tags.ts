import { Command } from "commander";
import pc from "picocolors";
import {
  loadVault,
  objectBelongsToProject,
  getAllTags,
  buildTagTree,
  previewTagMutation,
  applyTagMutation,
  type TagMutation
} from "@extenote/core";
import { createBackup } from "../backup.js";
import { cliContext, withAction } from "./utils.js";

export function registerTagsCommand(program: Command) {
  const tagsCommand = program
    .command("tags")
    .description("Manage tags across the vault");

  tagsCommand
    .command("list")
    .description("List all tags with counts")
    .argument("[project]", "Filter by project")
    .option("--json", "Output as JSON")
    .option("--tree", "Show hierarchical tree structure")
    .action(withAction(async (projectArg, options, command) => {
      const { cwd } = cliContext(command);
      const vault = await loadVault({ cwd });

      let objects = vault.objects;
      if (projectArg) {
        objects = objects.filter((o) => objectBelongsToProject(o, projectArg, vault.config));
      }

      const filteredVault = { ...vault, objects };
      const allTags = getAllTags(filteredVault);

      if (options.json) {
        if (options.tree) {
          const tree = buildTagTree(filteredVault);
          console.log(JSON.stringify(tree, null, 2));
        } else {
          console.log(JSON.stringify(allTags, null, 2));
        }
        return;
      }

      if (options.tree) {
        const tree = buildTagTree(filteredVault);
        console.log(pc.bold(`${tree.totalTags} tags across ${tree.totalTaggedObjects} objects`));
        console.log("");
        for (const root of tree.roots) {
          if (root.children.length > 0) {
            console.log(`${pc.cyan(root.name)} ${pc.dim(`(${root.count})`)}`);
            for (const child of root.children) {
              console.log(`  ${child.name} ${pc.dim(`(${child.count})`)}`);
            }
          } else {
            console.log(`${root.name} ${pc.dim(`(${root.count})`)}`);
          }
        }
        return;
      }

      if (!allTags.length) {
        console.log(pc.dim("No tags found"));
        return;
      }

      console.log(pc.bold(`${allTags.length} tags`));
      console.log("");
      for (const { tag, count } of allTags) {
        console.log(`${tag} ${pc.dim(`(${count})`)}`);
      }
    }));

  tagsCommand
    .command("rename")
    .description("Rename a tag across all objects")
    .argument("<old-tag>", "Tag to rename")
    .argument("<new-tag>", "New tag name")
    .option("--dry-run", "Preview changes without applying")
    .action(withAction(async (oldTag, newTag, options, command) => {
      const { cwd } = cliContext(command);
      const vault = await loadVault({ cwd });

      const mutation: TagMutation = {
        type: "rename",
        oldTag,
        newTag,
      };

      const preview = previewTagMutation(vault, mutation);

      if (!preview.affectedFiles.length) {
        console.log(pc.yellow(`No objects found with tag "${oldTag}"`));
        return;
      }

      console.log(pc.bold(`Renaming "${oldTag}" → "${newTag}"`));
      console.log(pc.dim(`${preview.affectedFiles.length} files will be modified`));
      console.log("");

      for (const file of preview.affectedFiles) {
        console.log(`  ${file.relativePath}`);
        console.log(`    ${pc.red(`- ${oldTag}`)} → ${pc.green(`+ ${newTag}`)}`);
      }

      if (options.dryRun) {
        console.log("");
        console.log(pc.dim("[dry-run] No changes made"));
        return;
      }

      const filePaths = preview.affectedFiles.map((f) => f.filePath);
      await createBackup(cwd, `tag rename: ${oldTag} → ${newTag}`, filePaths);

      console.log("");
      const result = await applyTagMutation(preview);

      if (result.success) {
        console.log(pc.green(`✔ Modified ${result.filesModified} files`));
        console.log(pc.dim("  (Use 'extenote undo' to revert)"));
      } else {
        console.log(pc.red(`✖ Modified ${result.filesModified} files with ${result.errors.length} errors`));
        for (const err of result.errors) {
          console.log(pc.red(`  ${err.filePath}: ${err.error}`));
        }
      }
    }));

  tagsCommand
    .command("merge")
    .description("Merge one tag into another")
    .argument("<source-tag>", "Tag to merge (will be removed)")
    .argument("<target-tag>", "Tag to merge into (will be kept)")
    .option("--dry-run", "Preview changes without applying")
    .action(withAction(async (sourceTag, targetTag, options, command) => {
      const { cwd } = cliContext(command);
      const vault = await loadVault({ cwd });

      const mutation: TagMutation = {
        type: "merge",
        oldTag: sourceTag,
        newTag: targetTag,
      };

      const preview = previewTagMutation(vault, mutation);

      if (!preview.affectedFiles.length) {
        console.log(pc.yellow(`No objects found with tag "${sourceTag}"`));
        return;
      }

      console.log(pc.bold(`Merging "${sourceTag}" → "${targetTag}"`));
      console.log(pc.dim(`${preview.affectedFiles.length} files will be modified`));
      console.log("");

      for (const file of preview.affectedFiles) {
        const hadTarget = file.currentTags.includes(targetTag);
        console.log(`  ${file.relativePath}`);
        if (hadTarget) {
          console.log(`    ${pc.red(`- ${sourceTag}`)} ${pc.dim(`(already has ${targetTag})`)}`);
        } else {
          console.log(`    ${pc.red(`- ${sourceTag}`)} → ${pc.green(`+ ${targetTag}`)}`);
        }
      }

      if (options.dryRun) {
        console.log("");
        console.log(pc.dim("[dry-run] No changes made"));
        return;
      }

      const filePaths = preview.affectedFiles.map((f) => f.filePath);
      await createBackup(cwd, `tag merge: ${sourceTag} → ${targetTag}`, filePaths);

      console.log("");
      const result = await applyTagMutation(preview);

      if (result.success) {
        console.log(pc.green(`✔ Modified ${result.filesModified} files`));
        console.log(pc.dim("  (Use 'extenote undo' to revert)"));
      } else {
        console.log(pc.red(`✖ Modified ${result.filesModified} files with ${result.errors.length} errors`));
        for (const err of result.errors) {
          console.log(pc.red(`  ${err.filePath}: ${err.error}`));
        }
      }
    }));

  tagsCommand
    .command("delete")
    .description("Remove a tag from all objects")
    .argument("<tag>", "Tag to delete")
    .option("--dry-run", "Preview changes without applying")
    .option("-y, --yes", "Skip confirmation prompt")
    .action(withAction(async (tag, options, command) => {
      const { cwd } = cliContext(command);
      const vault = await loadVault({ cwd });

      const mutation: TagMutation = {
        type: "delete",
        oldTag: tag,
      };

      const preview = previewTagMutation(vault, mutation);

      if (!preview.affectedFiles.length) {
        console.log(pc.yellow(`No objects found with tag "${tag}"`));
        return;
      }

      console.log(pc.bold(`Deleting tag "${tag}"`));
      console.log(pc.dim(`${preview.affectedFiles.length} files will be modified`));
      console.log("");

      for (const file of preview.affectedFiles) {
        console.log(`  ${file.relativePath}`);
        console.log(`    ${pc.red(`- ${tag}`)}`);
      }

      if (options.dryRun) {
        console.log("");
        console.log(pc.dim("[dry-run] No changes made"));
        return;
      }

      if (!options.yes) {
        console.log("");
        console.log(pc.yellow(`This will remove "${tag}" from ${preview.affectedFiles.length} files.`));
        console.log(pc.dim("Use --yes to skip this prompt, or --dry-run to preview."));
        console.log(pc.dim("Run with --yes to confirm deletion."));
        return;
      }

      const filePaths = preview.affectedFiles.map((f) => f.filePath);
      await createBackup(cwd, `tag delete: ${tag}`, filePaths);

      console.log("");
      const result = await applyTagMutation(preview);

      if (result.success) {
        console.log(pc.green(`✔ Modified ${result.filesModified} files`));
        console.log(pc.dim("  (Use 'extenote undo' to revert)"));
      } else {
        console.log(pc.red(`✖ Modified ${result.filesModified} files with ${result.errors.length} errors`));
        for (const err of result.errors) {
          console.log(pc.red(`  ${err.filePath}: ${err.error}`));
        }
      }
    }));
}
