/**
 * Build script for Extenote Web Clipper extension
 * Usage: bun run build.ts [--watch]
 */

import { watch } from "fs";
import { cp, mkdir, rm } from "fs/promises";
import { join } from "path";

const isWatch = process.argv.includes("--watch");
const srcDir = "./src";
const distDir = "./dist";

interface BuildEntry {
  input: string;
  output: string;
  format: "esm" | "iife";
}

const entries: BuildEntry[] = [
  // Background runs as module
  { input: "background/service-worker.ts", output: "background/service-worker.js", format: "esm" },
  // Minimal content script (IIFE for content scripts)
  { input: "content/index.ts", output: "content/index.js", format: "iife" },
  // UI (modules are fine for popup/options)
  { input: "popup/popup.ts", output: "popup/popup.js", format: "esm" },
  { input: "options/options.ts", output: "options/options.js", format: "esm" },
];

async function build() {
  console.log("Building extension...");

  // Clean dist
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });

  // Build TypeScript files
  for (const entry of entries) {
    const inputPath = join(srcDir, entry.input);
    const outputPath = join(distDir, entry.output);

    try {
      const result = await Bun.build({
        entrypoints: [inputPath],
        outdir: join(distDir, entry.output.split("/").slice(0, -1).join("/")),
        naming: entry.output.split("/").pop(),
        target: "browser",
        format: entry.format,
        minify: !isWatch,
      });

      if (!result.success) {
        console.error(`Failed to build ${entry.input}:`, result.logs);
      }
    } catch (err) {
      // File might not exist yet during initial development
      console.warn(`Skipping ${entry.input}: file not found`);
    }
  }

  // Copy static files
  await copyStaticFiles();

  console.log("Build complete!");
}

async function copyStaticFiles() {
  // Copy manifest.json
  await cp("./manifest.json", join(distDir, "manifest.json"));

  // Copy icons
  try {
    await mkdir(join(distDir, "icons"), { recursive: true });
    await cp("./icons", join(distDir, "icons"), { recursive: true });
  } catch {
    console.warn("Icons directory not found, skipping...");
  }

  // Copy HTML and CSS files
  const staticFiles = [
    { src: "popup/popup.html", dest: "popup/popup.html" },
    { src: "popup/popup.css", dest: "popup/popup.css" },
    { src: "options/options.html", dest: "options/options.html" },
    { src: "options/options.css", dest: "options/options.css" },
  ];

  for (const file of staticFiles) {
    try {
      const srcPath = join(srcDir, file.src);
      const destPath = join(distDir, file.dest);
      await mkdir(join(distDir, file.dest.split("/").slice(0, -1).join("/")), { recursive: true });
      await cp(srcPath, destPath);
    } catch {
      // File might not exist yet
    }
  }
}

// Initial build
await build();

// Watch mode
if (isWatch) {
  console.log("Watching for changes...");

  watch(srcDir, { recursive: true }, async (event, filename) => {
    console.log(`Change detected: ${filename}`);
    await build();
  });

  watch("./manifest.json", async () => {
    console.log("Manifest changed, rebuilding...");
    await build();
  });
}
