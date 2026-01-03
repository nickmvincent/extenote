import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import type {
  BuildConfig,
  DeployConfig,
  PreRenderStep,
  RsyncStep,
  CliStep,
  CopyStep,
  ShellStep
} from "./types.js";
import { executeNetworkStep } from "./plugins/network/executor.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BuildableProject {
  name: string;
  build: BuildConfig;
  deploy?: DeployConfig;
}

export interface DeployableProject {
  name: string;
  build: BuildConfig;
  deploy: DeployConfig;
}

export interface BuildOptions {
  cwd: string;
  websitesDir: string;
  verbose?: boolean;
  dryRun?: boolean;
  /** Optional logger for output (defaults to console.log) */
  log?: (message: string) => void;
}

export interface DeployOptions {
  websitesDir: string;
  verbose?: boolean;
  dryRun?: boolean;
  /** Optional logger for output (defaults to console.log) */
  log?: (message: string) => void;
}

export interface BuildResult {
  project: string;
  success: boolean;
  duration: number;
  error?: string;
}

export interface DeployResult {
  project: string;
  success: boolean;
  duration: number;
  url?: string;
  error?: string;
}

// ─── Command Execution ───────────────────────────────────────────────────────

async function runCommand(
  command: string,
  args: string[],
  cwd: string,
  verbose?: boolean
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      cwd,
      stdio: verbose ? "inherit" : "pipe",
    });

    let stdout = "";
    let stderr = "";

    if (!verbose) {
      proc.stdout?.on("data", (data) => (stdout += data.toString()));
      proc.stderr?.on("data", (data) => (stderr += data.toString()));
    }

    proc.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });

    proc.on("error", (err) => {
      resolve({ code: 1, stdout, stderr: err.message });
    });
  });
}

// ─── PreRender Step Execution ────────────────────────────────────────────────

async function executeRsyncStep(
  step: RsyncStep,
  projectDir: string,
  options: BuildOptions
): Promise<void> {
  const src = path.resolve(projectDir, step.src);
  const dst = path.resolve(projectDir, step.dst);
  const log = options.log ?? console.log;

  if (options.dryRun) {
    log(`  [dry-run] rsync ${src} → ${dst}`);
    return;
  }

  await fs.mkdir(dst, { recursive: true });

  const includeArgs = step.include?.flatMap((pattern) => ["--include", pattern]) ?? [];
  const args = [
    "-av",
    "--delete",
    "--include=*/",
    ...includeArgs,
    "--exclude=*",
    `${src}/`,
    `${dst}/`,
  ];

  if (options.verbose) {
    log(`  rsync ${args.join(" ")}`);
  }

  const result = await runCommand("rsync", args, projectDir, options.verbose);
  if (result.code !== 0) {
    throw new Error(`rsync failed: ${result.stderr}`);
  }
}

async function executeCliStep(
  step: CliStep,
  projectDir: string,
  extenoteDir: string,
  options: BuildOptions
): Promise<void> {
  const outputDir = step.outputDir ? path.resolve(projectDir, step.outputDir) : projectDir;
  const log = options.log ?? console.log;

  // Build command as single string to preserve quoted arguments
  const fullCommand = `bun run cli -- ${step.command} -o "${outputDir}"`;

  if (options.dryRun) {
    log(`  [dry-run] ${fullCommand}`);
    return;
  }

  if (options.verbose) {
    log(`  ${fullCommand}`);
  }

  // Run as shell command to handle complex argument quoting
  const result = await runCommand("bash", ["-c", fullCommand], extenoteDir, options.verbose);
  if (result.code !== 0) {
    throw new Error(`cli command failed: ${result.stderr || result.stdout}`);
  }
}

async function executeCopyStep(
  step: CopyStep,
  projectDir: string,
  options: BuildOptions
): Promise<void> {
  const src = path.resolve(projectDir, step.src);
  const dst = path.resolve(projectDir, step.dst);
  const log = options.log ?? console.log;

  if (options.dryRun) {
    log(`  [dry-run] copy ${src} → ${dst}`);
    return;
  }

  await fs.mkdir(path.dirname(dst), { recursive: true });
  await fs.copyFile(src, dst);

  if (options.verbose) {
    log(`  copy ${src} → ${dst}`);
  }
}

async function executeShellStep(
  step: ShellStep,
  projectDir: string,
  options: BuildOptions
): Promise<void> {
  const log = options.log ?? console.log;

  if (options.dryRun) {
    log(`  [dry-run] ${step.command}`);
    return;
  }

  if (options.verbose) {
    log(`  ${step.command}`);
  }

  const result = await runCommand("bash", ["-c", step.command], projectDir, options.verbose);
  if (result.code !== 0) {
    throw new Error(`shell command failed: ${result.stderr}`);
  }
}

async function executePreRenderStep(
  step: PreRenderStep,
  projectDir: string,
  extenoteDir: string,
  projectName: string,
  options: BuildOptions
): Promise<void> {
  // Discriminated union - TypeScript narrows the type based on step.type
  switch (step.type) {
    case "rsync":
      return executeRsyncStep(step, projectDir, options);
    case "cli":
      return executeCliStep(step, projectDir, extenoteDir, options);
    case "copy":
      return executeCopyStep(step, projectDir, options);
    case "shell":
      return executeShellStep(step, projectDir, options);
    case "network":
      return executeNetworkStep(step, projectDir, projectName, extenoteDir, options);
  }
}

// ─── Build ───────────────────────────────────────────────────────────────────

export async function buildProject(
  project: BuildableProject,
  options: BuildOptions
): Promise<BuildResult> {
  const start = Date.now();
  const { cwd, websitesDir, verbose, dryRun } = options;
  const { build } = project;
  const log = options.log ?? console.log;

  const projectDir = path.resolve(websitesDir, build.websiteDir);
  const extenoteDir = cwd;

  try {
    // Check if project directory exists
    try {
      await fs.access(projectDir);
    } catch {
      throw new Error(`Website directory not found: ${projectDir}`);
    }

    log(`Building ${project.name} (${build.type})`);

    // Execute pre-render steps
    if (build.preRender?.length) {
      log("  Pre-render steps:");
      for (const step of build.preRender) {
        await executePreRenderStep(step, projectDir, extenoteDir, project.name, options);
      }
    }

    // Run the main build
    if (dryRun) {
      log(`  [dry-run] ${build.type} build`);
    } else {
      switch (build.type) {
        case "quarto": {
          if (verbose) {
            log("  quarto render");
          }
          const result = await runCommand("quarto", ["render"], projectDir, verbose);
          if (result.code !== 0) {
            throw new Error(`Quarto build failed: ${result.stderr || result.stdout}`);
          }
          break;
        }

        case "astro": {
          // Check if node_modules exists
          const nodeModulesPath = path.join(projectDir, "node_modules");
          try {
            await fs.access(nodeModulesPath);
          } catch {
            log("  Installing dependencies...");
            const installResult = await runCommand("npm", ["install"], projectDir, verbose);
            if (installResult.code !== 0) {
              throw new Error(`npm install failed: ${installResult.stderr}`);
            }
          }

          if (verbose) {
            log("  npm run build");
          }
          const result = await runCommand("npm", ["run", "build"], projectDir, verbose);
          if (result.code !== 0) {
            throw new Error(`Astro build failed: ${result.stderr || result.stdout}`);
          }
          break;
        }

        case "custom": {
          // Custom builds should define their steps in preRender
          log("  Custom build (preRender steps only)");
          break;
        }
      }
    }

    // Run post-build steps (e.g., weasyprint PDF generation)
    if (build.postBuild?.length) {
      log("  Post-build steps:");
      const buildOutputDir = path.resolve(projectDir, "dist");

      for (const step of build.postBuild) {
        switch (step.type) {
          case "weasyprint": {
            const srcPath = path.resolve(buildOutputDir, step.src);
            const dstPath = path.resolve(buildOutputDir, step.dst);

            if (verbose) {
              log(`  weasyprint ${srcPath} ${dstPath}`);
            }

            const result = await runCommand(
              "weasyprint",
              [srcPath, dstPath],
              projectDir,
              verbose
            );

            if (result.code !== 0) {
              throw new Error(`weasyprint failed: ${result.stderr || result.stdout}`);
            }
            log(`  Generated PDF: ${step.dst}`);
            break;
          }

          case "shell": {
            if (verbose) {
              log(`  ${step.command}`);
            }
            const result = await runCommand("sh", ["-c", step.command], buildOutputDir, verbose);
            if (result.code !== 0) {
              throw new Error(`Shell command failed: ${result.stderr || result.stdout}`);
            }
            break;
          }
        }
      }
    }

    const duration = Date.now() - start;
    log(`  ✔ Built in ${(duration / 1000).toFixed(1)}s`);

    return { project: project.name, success: true, duration };
  } catch (error) {
    const duration = Date.now() - start;
    const message = error instanceof Error ? error.message : String(error);
    log(`  ✖ Failed: ${message}`);
    return { project: project.name, success: false, duration, error: message };
  }
}

// ─── Deploy ──────────────────────────────────────────────────────────────────

export async function deployProject(
  project: DeployableProject,
  options: DeployOptions
): Promise<DeployResult> {
  const start = Date.now();
  const { websitesDir, verbose, dryRun } = options;
  const { build, deploy } = project;
  const log = options.log ?? console.log;

  const projectDir = path.resolve(websitesDir, build.websiteDir);
  const outputDir = deploy.outputDir ?? "dist";

  try {
    log(`Deploying ${project.name} → ${deploy.platform}`);

    switch (deploy.platform) {
      case "cloudflare-pages": {
        // Read project name from wrangler.toml if available
        let projectName = project.name;
        if (deploy.configFile) {
          const configPath = path.join(projectDir, deploy.configFile);
          try {
            const content = await fs.readFile(configPath, "utf8");
            const match = content.match(/^name\s*=\s*"([^"]+)"/m);
            if (match) {
              projectName = match[1];
            }
          } catch {
            // Use default project name
          }
        }

        const deployDir = path.resolve(projectDir, outputDir);

        if (dryRun) {
          log(`  [dry-run] wrangler pages deploy ${deployDir} --project-name=${projectName}`);
        } else {
          if (verbose) {
            log(`  wrangler pages deploy ${deployDir} --project-name=${projectName}`);
          }

          const result = await runCommand(
            "wrangler",
            ["pages", "deploy", deployDir, `--project-name=${projectName}`],
            projectDir,
            verbose
          );

          if (result.code !== 0) {
            throw new Error(`Deployment failed: ${result.stderr || result.stdout}`);
          }

          // Try to extract URL from output
          const urlMatch = result.stdout.match(/https:\/\/[^\s]+\.pages\.dev/);
          if (urlMatch) {
            log(`  URL: ${urlMatch[0]}`);
          }
        }
        break;
      }

      case "github-pages": {
        const deployDir = path.resolve(projectDir, outputDir);
        const branch = deploy.branch ?? "gh-pages";

        // Ensure .nojekyll exists to prevent Jekyll processing
        const nojekyllPath = path.join(deployDir, ".nojekyll");
        try {
          await fs.access(nojekyllPath);
        } catch {
          await fs.writeFile(nojekyllPath, "");
          if (verbose) {
            log("  Created .nojekyll file");
          }
        }

        // Increase git http buffer to handle large pushes (prevents HTTP 400 errors)
        await runCommand("git", ["config", "--global", "http.postBuffer", "524288000"], projectDir, false);

        // Build gh-pages args
        const ghPagesArgs = ["-d", deployDir, "-b", branch];
        if (deploy.repo) {
          ghPagesArgs.push("-r", deploy.repo);
        }

        const cmdPreview = `npx gh-pages ${ghPagesArgs.join(" ")}`;

        if (dryRun) {
          log(`  [dry-run] ${cmdPreview}`);
        } else {
          if (verbose) {
            log(`  ${cmdPreview}`);
          }

          const result = await runCommand(
            "npx",
            ["gh-pages", ...ghPagesArgs],
            projectDir,
            verbose
          );

          if (result.code !== 0) {
            throw new Error(`Deployment failed: ${result.stderr || result.stdout}`);
          }

          log(`  Published to ${branch} branch`);
        }
        break;
      }

      case "vercel": {
        if (dryRun) {
          log("  [dry-run] vercel deploy --prod");
        } else {
          const result = await runCommand("vercel", ["deploy", "--prod"], projectDir, verbose);
          if (result.code !== 0) {
            throw new Error(`Deployment failed: ${result.stderr}`);
          }
        }
        break;
      }

      case "netlify": {
        if (dryRun) {
          log("  [dry-run] netlify deploy --prod");
        } else {
          const result = await runCommand("netlify", ["deploy", "--prod"], projectDir, verbose);
          if (result.code !== 0) {
            throw new Error(`Deployment failed: ${result.stderr}`);
          }
        }
        break;
      }

      case "ftp": {
        // FTP/SFTP deployment using lftp
        const { host, user, remotePath, port, deleteRemote } = deploy;

        if (!host || !user) {
          throw new Error("FTP deployment requires host and user in deploy config");
        }

        const deployDir = path.resolve(projectDir, outputDir);
        const ftpPort = port ?? 21;
        const remoteDir = remotePath ?? "/";
        const deleteFlag = deleteRemote ? "--delete" : "";
        const deleteSuffix = deleteRemote ? " (with delete)" : " (preserving existing remote files)";

        const cmdPreview = `lftp -e "mirror -R ${deleteFlag} ${deployDir} ${remoteDir}" ftp://${user}@${host}:${ftpPort}`;

        if (dryRun) {
          log(`  [dry-run] ${cmdPreview}${deleteSuffix}`);
        } else {
          // Check for password in environment variable (only when actually deploying)
          const password = process.env.FTP_PASSWORD || process.env.EXTENOTE_FTP_PASSWORD;
          if (!password) {
            throw new Error(
              "FTP deployment requires FTP_PASSWORD or EXTENOTE_FTP_PASSWORD environment variable"
            );
          }

          if (verbose) {
            log(`  ${cmdPreview}`);
          }

          // Build lftp command
          // mirror -R: reverse mirror (upload local to remote)
          // --delete: delete remote files not in local (only if deleteRemote is true)
          // --verbose: show progress
          // --parallel=4: upload 4 files in parallel
          const mirrorArgs = deleteRemote
            ? `mirror -R --delete --verbose --parallel=4 ${deployDir} ${remoteDir}`
            : `mirror -R --verbose --parallel=4 ${deployDir} ${remoteDir}`;

          const lftpScript = [
            `set ftp:ssl-allow no`,  // Some hosts don't support SSL
            `set net:timeout 30`,
            `open -u ${user},${password} ftp://${host}:${ftpPort}`,
            mirrorArgs,
            `quit`
          ].join("; ");

          const result = await runCommand("lftp", ["-e", lftpScript], projectDir, verbose);

          if (result.code !== 0) {
            throw new Error(`FTP deployment failed: ${result.stderr || result.stdout}`);
          }

          log(`  Synced to ${user}@${host}:${remoteDir}${deleteSuffix}`);
          if (deploy.url) {
            log(`  URL: ${deploy.url}`);
          }
        }
        break;
      }

      case "none": {
        log("  No deployment configured");
        break;
      }
    }

    const duration = Date.now() - start;
    log(`  ✔ Deployed in ${(duration / 1000).toFixed(1)}s`);

    return { project: project.name, success: true, duration };
  } catch (error) {
    const duration = Date.now() - start;
    const message = error instanceof Error ? error.message : String(error);
    log(`  ✖ Failed: ${message}`);
    return { project: project.name, success: false, duration, error: message };
  }
}

// ─── Summary Printing ────────────────────────────────────────────────────────

export interface SummaryResult {
  project: string;
  success: boolean;
  duration: number;
  error?: string;
}

/**
 * Unified summary printer for build/deploy results
 */
export function printResultSummary(
  results: SummaryResult[],
  action: "Build" | "Deploy",
  log: (message: string) => void = console.log
): void {
  const successes = results.filter((r) => r.success);
  const failures = results.filter((r) => !r.success);
  const pastTense = action === "Build" ? "built" : "deployed";

  log("");
  log(`${action} Summary`);
  log("─".repeat(40));

  if (successes.length) {
    log(`✔ ${successes.length} ${pastTense}:`);
    for (const r of successes) {
      log(`  ${r.project} (${(r.duration / 1000).toFixed(1)}s)`);
    }
  }

  if (failures.length) {
    log(`✖ ${failures.length} failed:`);
    for (const r of failures) {
      log(`  ${r.project}: ${r.error}`);
    }
  }

  const total = results.reduce((sum, r) => sum + r.duration, 0);
  log(`\nTotal: ${(total / 1000).toFixed(1)}s`);
}
