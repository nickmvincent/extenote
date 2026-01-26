/**
 * web-ext configuration for Firefox extension signing
 *
 * Usage:
 *   # Build the extension first
 *   bun run build
 *
 *   # Sign for self-distribution (unlisted)
 *   web-ext sign --api-key=<YOUR_API_KEY> --api-secret=<YOUR_API_SECRET>
 *
 *   # Or run locally for testing
 *   web-ext run
 *
 * To get API credentials:
 * 1. Go to https://addons.mozilla.org/developers/addon/api/key/
 * 2. Generate a new key
 * 3. Set environment variables:
 *    export WEB_EXT_API_KEY="your_key"
 *    export WEB_EXT_API_SECRET="your_secret"
 */

module.exports = {
  // Source directory (built extension)
  sourceDir: "./dist",

  // Artifacts output directory
  artifactsDir: "./web-ext-artifacts",

  // Ignore patterns
  ignoreFiles: [
    "*.map",
    "*.ts",
    ".git",
    "node_modules",
    "tests",
  ],

  // Build settings
  build: {
    overwriteDest: true,
  },

  // Run settings (for local testing)
  run: {
    firefox: "firefox",
    browserConsole: true,
    startUrl: [
      "https://arxiv.org/abs/2301.12345",
    ],
  },

  // Sign settings (for AMO submission)
  sign: {
    // Set to "unlisted" for self-distribution
    channel: "unlisted",
  },
};
