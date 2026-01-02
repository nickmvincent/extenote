import pc from "picocolors";

interface ErrorWithSuggestion {
  message: string;
  suggestion?: string;
  details?: string;
}

/**
 * Common error patterns and their suggestions
 */
const ERROR_PATTERNS: Array<{
  pattern: RegExp;
  suggestion: (match: RegExpMatchArray, context?: Record<string, unknown>) => string;
}> = [
  {
    pattern: /Could not find config/i,
    suggestion: () =>
      "Run 'extenote init' to create a new project, or ensure you're in the correct directory.",
  },
  {
    pattern: /No project config files found/i,
    suggestion: () => "Create a project file in projects/*.yaml or run 'extenote init'.",
  },
  {
    pattern: /Object not found: (.+)/i,
    suggestion: (match) =>
      `Check the path is correct. Use 'extenote status' to list all objects.\nSearched for: ${match[1]}`,
  },
  {
    pattern: /Schema (.+) not found/i,
    suggestion: (match) =>
      `Available schemas are defined in schemas/*.yaml. Check the schema name matches exactly.\nLooking for: ${match[1]}`,
  },
  {
    pattern: /No discussion providers configured/i,
    suggestion: () =>
      "Add discussion providers to your extenote.config.ts:\n  discussion: { providers: [{ type: 'github', ... }] }",
  },
  {
    pattern: /Project "(.+)" not found.*Available: (.+)/i,
    suggestion: (match) => `Did you mean one of these?\n  ${match[2].split(", ").join("\n  ")}`,
  },
  {
    pattern: /File already exists: (.+)/i,
    suggestion: (match) =>
      `The file ${match[1]} already exists. Either:\n  • Delete it first if you want to overwrite\n  • Choose a different filename`,
  },
  {
    pattern: /Interactive .+ requires a TTY/i,
    suggestion: () =>
      "Run this command directly in a terminal, not piped or in a non-interactive shell.\nFor non-interactive use, provide all required arguments.",
  },
  {
    pattern: /No schemas available/i,
    suggestion: () =>
      "Add schema definitions in schemas/*.yaml\nRun 'extenote init' to set up a starter schema.",
  },
  {
    pattern: /SEMBLE_APP_PASSWORD|ATPROTO_APP_PASSWORD/i,
    suggestion: () =>
      "Set the SEMBLE_APP_PASSWORD environment variable with your ATProto app password.\nYou can create an app password at: https://bsky.app/settings/app-passwords",
  },
  {
    pattern: /ATProto login failed/i,
    suggestion: () =>
      "Check your credentials:\n  • Verify SEMBLE_APP_PASSWORD is set correctly\n  • Ensure your identifier in the config is correct\n  • Try creating a new app password",
  },
  {
    pattern: /GITHUB_TOKEN|GitHub API error/i,
    suggestion: () =>
      "Set the GITHUB_TOKEN environment variable with a personal access token.\nCreate one at: https://github.com/settings/tokens",
  },
  {
    pattern: /rsync failed/i,
    suggestion: () =>
      "Ensure rsync is installed and the source/destination paths exist.\nOn macOS: rsync is built-in. On Linux: apt install rsync",
  },
  {
    pattern: /Quarto build failed/i,
    suggestion: () =>
      "Check Quarto is installed: https://quarto.org/docs/get-started/\nRun 'quarto check' to diagnose installation issues.",
  },
  {
    pattern: /npm install failed/i,
    suggestion: () =>
      "Check your package.json for errors.\nTry running 'npm install' manually to see detailed errors.",
  },
  {
    pattern: /Astro build failed/i,
    suggestion: () =>
      "Check your Astro configuration and dependencies.\nRun 'npm run build' in the website directory for detailed errors.",
  },
  {
    pattern: /Deployment failed/i,
    suggestion: () =>
      "Check your deployment configuration and credentials.\nVerify the target server is accessible.",
  },
  {
    pattern: /Invalid YAML/i,
    suggestion: () =>
      "Common YAML issues:\n  • Check indentation (use spaces, not tabs)\n  • Ensure colons have spaces after them\n  • Quote strings with special characters",
  },
  {
    pattern: /Duplicate source id/i,
    suggestion: () =>
      "Each source must have a unique 'id' field.\nCheck your project files for duplicate source IDs.",
  },
  {
    pattern: /Source missing id/i,
    suggestion: () =>
      "Each source in your project config must have an 'id' field.\nExample:\n  sources:\n    - id: my-content\n      type: local\n      root: ./content",
  },
];

/**
 * Format an error with a helpful suggestion
 */
export function formatError(error: Error | string): ErrorWithSuggestion {
  const message = error instanceof Error ? error.message : error;

  for (const { pattern, suggestion } of ERROR_PATTERNS) {
    const match = message.match(pattern);
    if (match) {
      return {
        message,
        suggestion: suggestion(match),
      };
    }
  }

  return { message };
}

/**
 * Print a formatted error to the console
 */
export function printError(error: Error | string): void {
  const formatted = formatError(error);

  console.error();
  console.error(pc.red(pc.bold("Error:")), formatted.message);

  if (formatted.suggestion) {
    console.error();
    console.error(pc.dim("Try this:"));
    for (const line of formatted.suggestion.split("\n")) {
      console.error(pc.dim(`  ${line}`));
    }
  }

  console.error();
}
