import path from "path";
import { Command } from "commander";
import pc from "picocolors";
import {
  loadVault,
  objectBelongsToProject,
  checkBibtexEntries,
  getAvailableProviders,
  type CheckReport
} from "@extenote/core";
import { cliContext, withAction } from "./utils.js";

interface RefcheckOptions {
  listProviders?: boolean;
  file?: string;
  filter?: string;
  limit?: number;
  skip?: number;
  startFrom?: string;
  provider?: string;
  dryRun?: boolean;
  force?: boolean;
}

const runRefcheck = withAction(async (projectArg: string | undefined, options: RefcheckOptions, command: Command) => {
  const { cwd } = cliContext(command);

  if (options.listProviders) {
    const providers = getAvailableProviders();
    console.log(pc.bold("Available refcheck providers:"));
    for (const p of providers) {
      const isDefault = p === "auto" ? pc.dim(" (default - tries DBLP → Crossref → Semantic Scholar → OpenAlex)") : "";
      console.log(`  ${pc.cyan(p)}${isDefault}`);
    }
    return;
  }

  const vault = await loadVault({ cwd });

  let objects = vault.objects;

  if (projectArg) {
    objects = objects.filter((o) => objectBelongsToProject(o, projectArg, vault.config));
    if (!objects.length) {
      console.log(pc.yellow(`No objects found in project "${projectArg}"`));
      return;
    }
  }

  if (options.file) {
    const fileArg = options.file;
    const normalizedPath = path.resolve(cwd, fileArg);
    const relativePath = path.relative(cwd, normalizedPath);
    objects = objects.filter((o) =>
      o.filePath === normalizedPath ||
      o.relativePath === relativePath ||
      o.relativePath === fileArg ||
      o.filePath.endsWith(fileArg)
    );
    if (!objects.length) {
      throw new Error(`File not found: ${fileArg}`);
    }
  }

  if (options.filter) {
    const pattern = new RegExp(options.filter.replace(/\*/g, ".*"));
    objects = objects.filter((o) => pattern.test(o.relativePath));
  }

  objects = objects.filter((o) => o.type === "bibtex_entry");

  if (!objects.length) {
    console.log(pc.yellow("No bibtex entries found to refcheck"));
    return;
  }

  const providerName = options.provider || "auto";

  // Deduplicate by filePath
  const seenPaths = new Set<string>();
  const deduped: typeof objects = [];
  for (const obj of objects) {
    if (!seenPaths.has(obj.filePath)) {
      seenPaths.add(obj.filePath);
      deduped.push(obj);
    }
  }
  if (deduped.length < objects.length) {
    console.log(pc.dim(`Deduplicated ${objects.length - deduped.length} entries loaded from multiple sources`));
  }
  objects = deduped;

  if (options.startFrom) {
    const startFromArg = options.startFrom;
    const startIndex = objects.findIndex((o) =>
      o.id === startFromArg ||
      o.relativePath === startFromArg ||
      o.relativePath.endsWith(startFromArg) ||
      o.filePath.endsWith(startFromArg)
    );
    if (startIndex === -1) {
      throw new Error(`Entry not found for --start-from: ${startFromArg}`);
    }
    const skippedCount = startIndex;
    objects = objects.slice(startIndex);
    console.log(pc.dim(`Starting from "${objects[0].id}" (skipped ${skippedCount} entries)`));
  }

  if (options.skip && options.skip > 0) {
    const originalCount = objects.length;
    objects = objects.slice(options.skip);
    console.log(pc.dim(`Skipped first ${Math.min(options.skip, originalCount)} entries`));
  }

  if (options.limit && options.limit > 0) {
    const originalCount = objects.length;
    objects = objects.slice(0, options.limit);
    if (originalCount > objects.length) {
      console.log(pc.dim(`Limited to ${objects.length} of ${originalCount} remaining entries`));
    }
  }

  console.log(pc.bold(`Refchecking ${objects.length} bibtex entries with ${providerName}...`));
  if (options.dryRun) {
    console.log(pc.dim("[dry-run] Frontmatter will not be updated"));
  }
  console.log("");

  const report = await checkBibtexEntries(objects, {
    provider: providerName,
    dryRun: options.dryRun,
    force: options.force,
    onProgress: (message) => console.log(pc.dim(`  ${message}`)),
  });

  printCheckReport(report);
});

function printCheckReport(report: CheckReport): void {
  for (const result of report.results) {
    const isMajor = result.status === "mismatch" && result.mismatchSeverity === "major";
    const isMinor = result.status === "mismatch" && result.mismatchSeverity === "minor";

    const icon = result.status === "confirmed" ? pc.green("✔")
      : isMajor ? pc.red("⚠")
      : isMinor ? pc.yellow("⚠")
      : result.status === "mismatch" ? pc.yellow("⚠")
      : result.status === "not_found" ? pc.red("✖")
      : result.status === "error" ? pc.red("✖")
      : pc.dim("⊘");

    const statusColor = result.status === "confirmed" ? pc.green
      : isMajor ? pc.red
      : isMinor ? pc.yellow
      : result.status === "mismatch" ? pc.yellow
      : result.status === "skipped" ? pc.dim
      : pc.red;

    const statusLabel = result.status === "mismatch" && result.mismatchSeverity
      ? `mismatch:${result.mismatchSeverity}`
      : result.status;

    console.log(`${icon} ${statusColor(`[${statusLabel}]`)} ${result.objectId}`);

    for (const check of result.fieldChecks) {
      if (check.match) {
        if (check.field === "authors" && check.authorDetails) {
          const count = check.authorDetails.length;
          console.log(pc.green(`  ✓ ${check.field}: ${count} authors match`));
        } else {
          console.log(pc.green(`  ✓ ${check.field}`));
        }
      } else {
        if (check.field === "title" && check.charDiff !== undefined) {
          console.log(pc.yellow(`  ✗ ${check.field}: ${check.charDiff} chars different`));
          console.log(pc.dim(`      local:  "${check.local}"`));
          console.log(pc.dim(`      remote: "${check.remote}"`));
        } else if (check.field === "authors") {
          const localCount = check.local?.split(";").length ?? 0;
          const remoteCount = check.remote?.split(";").length ?? 0;
          const mismatchedAuthors = check.authorDetails?.filter(d => !d.firstMatch || !d.lastMatch) ?? [];

          if (!check.authorCountMatch) {
            console.log(pc.yellow(`  ✗ ${check.field}: count mismatch (local: ${localCount}, remote: ${remoteCount})`));
          } else if (mismatchedAuthors.length > 0) {
            console.log(pc.yellow(`  ✗ ${check.field}: ${mismatchedAuthors.length}/${localCount} authors differ`));
          } else {
            console.log(pc.yellow(`  ✗ ${check.field}`));
          }

          if (check.authorDetails) {
            for (const detail of check.authorDetails) {
              if (!detail.firstMatch || !detail.lastMatch) {
                const issues = [];
                if (!detail.firstMatch) issues.push("first");
                if (!detail.lastMatch) issues.push("last");
                console.log(pc.yellow(`      [${detail.index}] ${issues.join("+")} name differs`));
                console.log(pc.dim(`          local:  "${detail.localName}"`));
                console.log(pc.dim(`          remote: "${detail.remoteName}"`));
              }
            }
          }
        } else if (check.field === "year" && check.yearDiff !== undefined) {
          const sign = check.yearDiff > 0 ? "+" : "";
          console.log(pc.yellow(`  ✗ ${check.field}: ${check.local} vs ${check.remote} (${sign}${check.yearDiff})`));
        } else if (check.field === "venue" && check.charDiff !== undefined) {
          console.log(pc.yellow(`  ✗ ${check.field}: ${check.charDiff} chars different`));
          console.log(pc.dim(`      local:  "${check.local}"`));
          console.log(pc.dim(`      remote: "${check.remote}"`));
        } else if (check.field === "doi") {
          console.log(pc.yellow(`  ✗ ${check.field}: exact mismatch`));
          console.log(pc.dim(`      local:  "${check.local}"`));
          console.log(pc.dim(`      remote: "${check.remote}"`));
        } else {
          console.log(pc.yellow(`  ✗ ${check.field}`));
          console.log(pc.dim(`      local:  "${check.local}"`));
          console.log(pc.dim(`      remote: "${check.remote}"`));
        }
      }
    }

    if ((result.status === "not_found" || result.status === "error") && result.message) {
      console.log(pc.dim(`  ${result.message}`));
    }

    if (result.status === "skipped" && result.message) {
      console.log(pc.dim(`  ${result.message}`));
    }
  }

  console.log("");
  console.log(pc.dim("─".repeat(50)));
  console.log(pc.bold(`Summary (${report.provider}):`));
  if (report.confirmed > 0) {
    console.log(pc.green(`  Confirmed: ${report.confirmed}`));
  }
  if (report.mismatches > 0) {
    const mismatchColor = report.mismatchesMajor > 0 ? pc.red : pc.yellow;
    let mismatchLine = `  Mismatches: ${report.mismatches}`;
    if (report.mismatchesMinor > 0 || report.mismatchesMajor > 0) {
      const breakdown = [];
      if (report.mismatchesMinor > 0) breakdown.push(`${report.mismatchesMinor} minor`);
      if (report.mismatchesMajor > 0) breakdown.push(`${report.mismatchesMajor} major`);
      mismatchLine += ` (${breakdown.join(", ")})`;
    }
    console.log(mismatchColor(mismatchLine));
  }
  if (report.notFound > 0) {
    console.log(pc.red(`  Not found: ${report.notFound}`));
  }
  if (report.errors > 0) {
    console.log(pc.red(`  Errors: ${report.errors}`));
  }
  if (report.skipped > 0) {
    console.log(pc.dim(`  Skipped: ${report.skipped}`));
  }
}

export function registerRefcheckCommand(program: Command) {
  program
    .command("refcheck")
    .description("Refcheck bibliographic references against external APIs")
    .argument("[project]", "Project name")
    .option("--provider <name>", "API provider to use (default: auto = DBLP → Crossref → S2 → OpenAlex)")
    .option("--dry-run", "Show report without updating frontmatter")
    .option("--force", "Re-check entries that already have check_log")
    .option("--limit <n>", "Limit number of entries to refcheck", (v) => parseInt(v, 10))
    .option("--skip <n>", "Skip first N entries (for resuming)", (v) => parseInt(v, 10))
    .option("--start-from <id>", "Start from entry with given ID or path (for resuming)")
    .option("--filter <pattern>", "Only refcheck entries matching path pattern")
    .option("--file <path>", "Refcheck a single file")
    .option("--list-providers", "List available refcheck providers")
    .action(runRefcheck);
}
