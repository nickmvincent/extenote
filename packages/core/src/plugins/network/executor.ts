import type { NetworkStep } from "../../types.js";
import type { BuildOptions } from "../../build.js";
import { loadVault } from "../../vault.js";
import { generateNetworkData } from "./generate.js";
import { writeQuartoOutput } from "./quarto.js";
import { writeAstroOutput } from "./astro.js";

/**
 * Execute a network preRender step
 */
export async function executeNetworkStep(
  step: NetworkStep,
  projectDir: string,
  projectName: string,
  extenoteDir: string,
  options: BuildOptions
): Promise<void> {
  const log = options.log ?? console.log;
  const format = step.outputFormat ?? "quarto";

  if (options.dryRun) {
    log(`  [dry-run] network generate (${format}) for ${projectName}`);
    return;
  }

  log(`  Generating network data for ${projectName}...`);

  // Load vault to access project config and discussion objects
  const vault = await loadVault({ cwd: extenoteDir });

  // Generate network data
  const data = await generateNetworkData({
    projectName,
    config: vault.config,
    objects: vault.objects,
    relatedProjects: step.relatedProjects,
    excludeProjects: step.excludeProjects,
  });

  // Write outputs based on format
  if (format === "quarto" || format === "both") {
    await writeQuartoOutput(
      data,
      projectDir,
      step.addToNavbar ?? true,
      step.includeProjectLinks ?? true
    );
    log(`  Wrote discussions.qmd`);
  }

  if (format === "astro" || format === "both") {
    await writeAstroOutput(data, projectDir);
    log(`  Wrote src/data/network.json`);
  }

  // Log summary
  const summary = [
    `${data.discussions.length} discussion(s)`,
    `${data.relatedProjects.length} related project(s)`,
  ].join(", ");
  log(`  Network: ${summary}`);
}
