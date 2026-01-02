/**
 * Options page script for Extenote Web Clipper
 */

import { loadConfig, saveConfig, resetConfig } from "../lib/storage";
import { createApiClient } from "../lib/api";
import { DEFAULT_CONFIG } from "../lib/types";

// DOM elements
const modeRadios = document.querySelectorAll('input[name="mode"]') as NodeListOf<HTMLInputElement>;
const downloadSettingsEl = document.getElementById("download-settings")!;
const apiSettingsEl = document.getElementById("api-settings")!;
const downloadInstructionsEl = document.getElementById("download-instructions")!;
const apiInstructionsEl = document.getElementById("api-instructions")!;

const defaultSchemaInput = document.getElementById("default-schema") as HTMLInputElement;
const defaultTagsInput = document.getElementById("default-tags") as HTMLInputElement;
const filenamePatternInput = document.getElementById("filename-pattern") as HTMLInputElement;
const downloadSubdirInput = document.getElementById("download-subdir") as HTMLInputElement;
const apiUrlInput = document.getElementById("api-url") as HTMLInputElement;
const defaultProjectInput = document.getElementById("default-project") as HTMLInputElement;

const saveBtn = document.getElementById("save-btn") as HTMLButtonElement;
const resetBtn = document.getElementById("reset-btn") as HTMLButtonElement;
const testApiBtn = document.getElementById("test-api") as HTMLButtonElement;
const apiTestResultEl = document.getElementById("api-test-result")!;
const statusEl = document.getElementById("status")!;

/**
 * Show status message
 */
function showStatus(message: string, type: "success" | "error") {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
  statusEl.classList.remove("hidden");

  // Auto-hide after 3 seconds
  setTimeout(() => {
    statusEl.classList.add("hidden");
  }, 3000);
}

/**
 * Update UI based on selected mode
 */
function updateModeUI(mode: "download" | "api") {
  downloadSettingsEl.classList.toggle("hidden", mode !== "download");
  apiSettingsEl.classList.toggle("hidden", mode !== "api");
  downloadInstructionsEl.classList.toggle("hidden", mode !== "download");
  apiInstructionsEl.classList.toggle("hidden", mode !== "api");
}

/**
 * Get selected mode
 */
function getSelectedMode(): "download" | "api" {
  const checked = document.querySelector('input[name="mode"]:checked') as HTMLInputElement;
  return (checked?.value as "download" | "api") || "download";
}

/**
 * Load and display current config
 */
async function loadAndDisplay() {
  try {
    const config = await loadConfig();

    // Set mode
    const modeRadio = document.querySelector(`input[name="mode"][value="${config.mode}"]`) as HTMLInputElement;
    if (modeRadio) {
      modeRadio.checked = true;
    }
    updateModeUI(config.mode);

    // Set values
    defaultSchemaInput.value = config.defaultSchema;
    defaultTagsInput.value = config.defaultTags.join(", ");
    filenamePatternInput.value = config.filenamePattern;
    downloadSubdirInput.value = config.downloadSubdir;
    apiUrlInput.value = config.apiUrl;
    defaultProjectInput.value = config.defaultProject;
  } catch (err) {
    console.error("Failed to load config:", err);
    showStatus("Failed to load settings", "error");
  }
}

/**
 * Save current form values
 */
async function save() {
  try {
    const config = {
      mode: getSelectedMode(),
      defaultSchema: defaultSchemaInput.value.trim() || DEFAULT_CONFIG.defaultSchema,
      defaultTags: defaultTagsInput.value
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0),
      filenamePattern: filenamePatternInput.value.trim() || DEFAULT_CONFIG.filenamePattern,
      downloadSubdir: downloadSubdirInput.value.trim(),
      apiUrl: apiUrlInput.value.trim() || DEFAULT_CONFIG.apiUrl,
      defaultProject: defaultProjectInput.value.trim(),
    };

    await saveConfig(config);
    showStatus("Settings saved!", "success");
  } catch (err) {
    console.error("Failed to save config:", err);
    showStatus("Failed to save settings", "error");
  }
}

/**
 * Reset to defaults
 */
async function reset() {
  if (!confirm("Reset all settings to defaults?")) {
    return;
  }

  try {
    await resetConfig();
    await loadAndDisplay();
    showStatus("Settings reset to defaults", "success");
  } catch (err) {
    console.error("Failed to reset config:", err);
    showStatus("Failed to reset settings", "error");
  }
}

/**
 * Test API connection
 */
async function testApi() {
  testApiBtn.disabled = true;
  apiTestResultEl.textContent = "Testing...";
  apiTestResultEl.className = "test-result";

  try {
    const apiClient = createApiClient(apiUrlInput.value.trim());
    const result = await apiClient.checkConnection();

    if (result.connected) {
      const projectCount = result.info?.projects.length || 0;
      const schemaCount = result.info?.schemas.length || 0;
      apiTestResultEl.textContent = `Connected! Found ${projectCount} projects, ${schemaCount} schemas`;
      apiTestResultEl.className = "test-result success";
    } else {
      apiTestResultEl.textContent = "Connection failed";
      apiTestResultEl.className = "test-result error";
    }
  } catch (err) {
    console.error("API test failed:", err);
    apiTestResultEl.textContent = "Error: " + (err instanceof Error ? err.message : "Unknown error");
    apiTestResultEl.className = "test-result error";
  } finally {
    testApiBtn.disabled = false;
  }
}

// Event listeners
saveBtn.addEventListener("click", save);
resetBtn.addEventListener("click", reset);
testApiBtn.addEventListener("click", testApi);

// Mode change handlers
modeRadios.forEach((radio) => {
  radio.addEventListener("change", () => {
    updateModeUI(getSelectedMode());
  });
});

// Load on init
loadAndDisplay();
