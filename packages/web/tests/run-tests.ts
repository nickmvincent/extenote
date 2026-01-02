#!/usr/bin/env bun
/**
 * Integration test runner for Extenote web
 *
 * This script:
 * 1. Starts the API server (from vault directory)
 * 2. Starts the Vite dev server
 * 3. Waits for both to be ready
 * 4. Runs the Puppeteer integration tests
 * 5. Captures screenshots
 * 6. Cleans up servers
 */

import { spawn, type Subprocess } from "bun";
import { setTimeout } from "timers/promises";
import { resolve, dirname } from "path";

// Derive paths from script location and env vars
const SCRIPT_DIR = dirname(import.meta.path);
const WEB_PACKAGE_PATH = resolve(SCRIPT_DIR, "..");
const VAULT_PATH = process.env.EXTENOTE_CONTENT_ROOT
  ? resolve(process.env.EXTENOTE_CONTENT_ROOT, "..")
  : resolve(WEB_PACKAGE_PATH, "../../../../extenote-pub");
const API_PORT = 3001;
const DEV_PORT = 3000;

let apiServer: Subprocess | null = null;
let devServer: Subprocess | null = null;

async function waitForServer(url: string, maxAttempts = 30): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status < 500) {
        return true;
      }
    } catch (e) {
      // Server not ready yet
    }
    await setTimeout(1000);
    process.stdout.write(".");
  }
  return false;
}

async function startServers(): Promise<void> {
  console.log("Starting API server...");

  // Start API server from vault directory
  apiServer = spawn({
    cmd: ["bun", "run", `${WEB_PACKAGE_PATH}/server.ts`],
    cwd: VAULT_PATH,
    stdout: "pipe",
    stderr: "pipe",
  });

  console.log("Starting Vite dev server...");

  // Start Vite dev server
  devServer = spawn({
    cmd: ["bun", "run", "dev"],
    cwd: WEB_PACKAGE_PATH,
    stdout: "pipe",
    stderr: "pipe",
  });

  // Wait for servers to be ready
  process.stdout.write("Waiting for API server");
  const apiReady = await waitForServer(`http://127.0.0.1:${API_PORT}/api/cache/status`);
  console.log(apiReady ? " Ready!" : " Failed!");

  if (!apiReady) {
    throw new Error("API server failed to start");
  }

  process.stdout.write("Waiting for dev server");
  const devReady = await waitForServer(`http://localhost:${DEV_PORT}`);
  console.log(devReady ? " Ready!" : " Failed!");

  if (!devReady) {
    throw new Error("Dev server failed to start");
  }
}

async function stopServers(): Promise<void> {
  console.log("\nStopping servers...");

  if (apiServer) {
    apiServer.kill();
  }

  if (devServer) {
    devServer.kill();
  }

  // Give processes time to clean up
  await setTimeout(1000);
}

async function runTests(): Promise<boolean> {
  console.log("\nRunning integration tests...\n");

  const testProcess = spawn({
    cmd: ["bun", "test", "tests/integration.test.ts"],
    cwd: WEB_PACKAGE_PATH,
    stdout: "inherit",
    stderr: "inherit",
  });

  const exitCode = await testProcess.exited;
  return exitCode === 0;
}

async function main() {
  console.log("===========================================");
  console.log("   Extenote Web Integration Test Runner");
  console.log("===========================================\n");
  console.log(`Vault path: ${VAULT_PATH}`);
  console.log(`Web package: ${WEB_PACKAGE_PATH}\n`);

  try {
    await startServers();
    const success = await runTests();
    await stopServers();

    console.log("\n===========================================");
    if (success) {
      console.log("   All tests passed!");
      console.log(`   Screenshots saved to: ${WEB_PACKAGE_PATH}/tests/screenshots/`);
    } else {
      console.log("   Some tests failed!");
    }
    console.log("===========================================\n");

    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error("\nError running tests:", error);
    await stopServers();
    process.exit(1);
  }
}

// Handle cleanup on interrupt
process.on("SIGINT", async () => {
  await stopServers();
  process.exit(1);
});

main();
