/**
 * Extenote Clipper Popup - API-First Architecture
 *
 * Flow:
 * 1. Extract search hint from URL (DOI, arXiv ID, or title)
 * 2. User clicks Search
 * 3. Query DBLP, OpenAlex, Semantic Scholar in parallel
 * 4. Display results, auto-select best
 * 5. User edits if needed, then saves
 */

import { extractSearchHint, type SearchHint } from "../lib/search-hint";
import { searchDblp, getDblpCompletenessScore, type DblpSearchResponse } from "../lib/dblp";
import { searchOpenAlex, getOpenAlexCompletenessScore, type OpenAlexSearchResponse } from "../lib/openalex";
import { searchSemanticScholar, getCompletenessScore as getS2CompletenessScore, type S2SearchResponse } from "../lib/semantic-scholar";
import { searchCrossref, getCrossrefCompletenessScore, type CrossrefSearchResponse } from "../lib/crossref";
import { generateMarkdown, generateCitationKey } from "../lib/markdown";
import { loadConfig } from "../lib/storage";
import { suggestTags } from "../lib/tags";
import { createApiClient, type ExtenoteApi } from "../lib/api";
import { matchPageToVault, getValidationStatus, compareFields, createCheckLog, type VaultEntry, type MatchResult } from "../lib/vault";
import type { PageMetadata, ClipperConfig, VaultObject, CheckLog } from "../lib/types";

// DOM Elements
const searchQueryEl = document.getElementById("search-query") as HTMLInputElement;
const searchBtnEl = document.getElementById("search-btn") as HTMLButtonElement;
const searchHintEl = document.getElementById("search-hint") as HTMLDivElement;
const sourcesSectionEl = document.getElementById("sources-section") as HTMLDivElement;
const editorSectionEl = document.getElementById("editor-section") as HTMLDivElement;

// Source card elements
const sourcePageEl = document.getElementById("source-page") as HTMLDivElement;
const sourceDblpEl = document.getElementById("source-dblp") as HTMLDivElement;
const sourceS2El = document.getElementById("source-s2") as HTMLDivElement;
const sourceOpenalexEl = document.getElementById("source-openalex") as HTMLDivElement;
const sourceCrossrefEl = document.getElementById("source-crossref") as HTMLDivElement;

// Extra source checkboxes
const includeOpenalexEl = document.getElementById("include-openalex") as HTMLInputElement;
const includeCrossrefEl = document.getElementById("include-crossref") as HTMLInputElement;

// Editor fields
const titleEl = document.getElementById("title") as HTMLInputElement;
const citationKeyEl = document.getElementById("citation-key") as HTMLInputElement;
const authorsEl = document.getElementById("authors") as HTMLInputElement;
const yearEl = document.getElementById("year") as HTMLInputElement;
const venueEl = document.getElementById("venue") as HTMLInputElement;
const doiEl = document.getElementById("doi") as HTMLInputElement;
const tagsEl = document.getElementById("tags") as HTMLInputElement;
const abstractEl = document.getElementById("abstract") as HTMLTextAreaElement;
const projectEl = document.getElementById("project") as HTMLSelectElement;
const projectFieldEl = document.getElementById("project-field") as HTMLDivElement;
const clipBtnEl = document.getElementById("clip-btn") as HTMLButtonElement;

// Other UI elements
const tagSuggestionsEl = document.getElementById("tag-suggestions") as HTMLDivElement;
const tagChipsEl = document.getElementById("tag-chips") as HTMLDivElement;
const duplicateWarningEl = document.getElementById("duplicate-warning") as HTMLDivElement;
const successEl = document.getElementById("success") as HTMLDivElement;
const errorEl = document.getElementById("error") as HTMLDivElement;
const savedFilenameEl = document.getElementById("saved-filename") as HTMLElement;
const errorMessageEl = document.getElementById("error-message") as HTMLElement;
const apiStatusEl = document.getElementById("api-status") as HTMLDivElement;
const modeIndicatorEl = document.getElementById("mode-indicator") as HTMLSpanElement;
const attemptsSectionEl = document.getElementById("attempts-section") as HTMLDivElement;
const attemptsListEl = document.getElementById("attempts-list") as HTMLDivElement;

// Validation UI elements
const validationSectionEl = document.getElementById("validation-section") as HTMLDivElement;
const validationStatusBadgeEl = document.getElementById("validation-status-badge") as HTMLSpanElement;
const validationEntryTitleEl = document.getElementById("validation-entry-title") as HTMLElement;
const validationEntryPathEl = document.getElementById("validation-entry-path") as HTMLSpanElement;
const comparisonFieldsEl = document.getElementById("comparison-fields") as HTMLDivElement;
const updateChecklogBtnEl = document.getElementById("update-checklog-btn") as HTMLButtonElement;
const fixMismatchesBtnEl = document.getElementById("fix-mismatches-btn") as HTMLButtonElement;
const openInEditorBtnEl = document.getElementById("open-in-editor-btn") as HTMLButtonElement;
const clipAsNewBtnEl = document.getElementById("clip-as-new-btn") as HTMLButtonElement;

// Queue UI elements
const queueSectionEl = document.getElementById("queue-section") as HTMLDivElement;
const queueLinkEl = document.getElementById("queue-link") as HTMLAnchorElement;
const queueSeparatorEl = document.getElementById("queue-separator") as HTMLSpanElement;
const queueListEl = document.getElementById("queue-list") as HTMLDivElement;
const queuePendingEl = document.getElementById("queue-pending") as HTMLSpanElement;
const queueValidatedEl = document.getElementById("queue-validated") as HTMLSpanElement;
const closeQueueBtnEl = document.getElementById("close-queue-btn") as HTMLButtonElement;
const refreshQueueBtnEl = document.getElementById("refresh-queue-btn") as HTMLButtonElement;

// Bookmark UI elements
const tabReferenceEl = document.getElementById("tab-reference") as HTMLButtonElement;
const tabBookmarkEl = document.getElementById("tab-bookmark") as HTMLButtonElement;
const bookmarkSectionEl = document.getElementById("bookmark-section") as HTMLDivElement;
const bookmarkUrlEl = document.getElementById("bookmark-url") as HTMLDivElement;
const bookmarkTitleEl = document.getElementById("bookmark-title") as HTMLInputElement;
const bookmarkTagsEl = document.getElementById("bookmark-tags") as HTMLInputElement;
const bookmarkNotesEl = document.getElementById("bookmark-notes") as HTMLTextAreaElement;
const bookmarkSaveBtnEl = document.getElementById("bookmark-save-btn") as HTMLButtonElement;
const bookmarkDuplicateWarningEl = document.getElementById("bookmark-duplicate-warning") as HTMLDivElement;
const bookmarkDuplicatePathEl = document.getElementById("bookmark-duplicate-path") as HTMLSpanElement;

// State
let currentUrl = "";
let currentTabId: number | null = null;
let currentHint: SearchHint | null = null;
let config: ClipperConfig;
let apiClient: ExtenoteApi | null = null;
type SourceKey = "page" | "dblp" | "s2" | "openalex" | "crossref";
let searchResults: {
  page: PageMetadata | null;
  dblp: DblpSearchResponse | null;
  s2: S2SearchResponse | null;
  openalex: OpenAlexSearchResponse | null;
  crossref: CrossrefSearchResponse | null;
} = { page: null, dblp: null, s2: null, openalex: null, crossref: null };
let selectedSource: SourceKey | null = null;

// Validation state
let matchedEntry: MatchResult | null = null;
let fullVaultObject: VaultObject | null = null;
let validationApiResult: {
  title?: string;
  authors?: string[];
  year?: string;
  venue?: string;
  doi?: string;
} | null = null;
let comparisonResult: ReturnType<typeof compareFields> | null = null;
type PopupMode = "search" | "validate";
let currentMode: PopupMode = "search";
type TabMode = "reference" | "bookmark";
let currentTabMode: TabMode = "reference";
let existingBookmarkPath: string | null = null;

/**
 * Initialize popup
 */
async function init() {
  config = await loadConfig();

  // Set up API if in API mode
  if (config.mode === "api") {
    apiClient = createApiClient(config.apiUrl);
    modeIndicatorEl.textContent = "API mode";
    await checkApiConnection();
  } else {
    projectFieldEl.classList.add("hidden");
  }

  // Get current tab info
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || !tab?.id) {
    showError("Cannot access this page");
    return;
  }

  currentUrl = tab.url;
  currentTabId = tab.id;
  let pageTitle = "";

  // Request page info from content script
  try {
    const response = await browser.tabs.sendMessage(tab.id, { type: "GET_PAGE_INFO" });
    if (response?.title) {
      pageTitle = response.title;
      // Extract search hint from URL + title
      currentHint = extractSearchHint(currentUrl, response.title);
      searchQueryEl.value = currentHint.displayValue;
      showHintType(currentHint);
      // Pre-fill bookmark title
      if (bookmarkTitleEl) bookmarkTitleEl.value = response.title;
    }
  } catch (e) {
    // Content script might not be loaded, use URL-only hint
    currentHint = extractSearchHint(currentUrl, "");
    searchQueryEl.value = currentHint.displayValue;
    showHintType(currentHint);
    // Use tab title for bookmark
    if (bookmarkTitleEl && tab.title) bookmarkTitleEl.value = tab.title;
  }

  // Check if page matches a vault entry (API mode only)
  if (config.mode === "api" && apiClient) {
    await checkVaultMatch(pageTitle);
  }

  // Set up event listeners
  searchBtnEl.addEventListener("click", handleSearch);
  searchQueryEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleSearch();
  });

  clipBtnEl.addEventListener("click", handleSave);

  // Source selection
  document.querySelectorAll('input[name="source"]').forEach((radio) => {
    radio.addEventListener("change", handleSourceChange);
  });

  // Tag input
  tagsEl.addEventListener("input", updateTagSuggestions);

  // Abstract toggle
  const abstractCollapseBtn = document.querySelector('.collapse-btn[data-target="abstract"]');
  if (abstractCollapseBtn) {
    abstractCollapseBtn.addEventListener("click", () => {
      abstractEl.classList.toggle("hidden");
      abstractCollapseBtn.textContent = abstractEl.classList.contains("hidden") ? "Show" : "Hide";
    });
  }

  // Validation button handlers
  updateChecklogBtnEl?.addEventListener("click", handleUpdateChecklog);
  fixMismatchesBtnEl?.addEventListener("click", handleFixMismatches);
  openInEditorBtnEl?.addEventListener("click", handleOpenInEditor);
  clipAsNewBtnEl?.addEventListener("click", switchToSearchMode);

  // Queue button handlers
  queueLinkEl?.addEventListener("click", (e) => {
    e.preventDefault();
    showQueue();
  });
  closeQueueBtnEl?.addEventListener("click", hideQueue);
  refreshQueueBtnEl?.addEventListener("click", loadQueue);

  // Show queue link in API mode
  if (config.mode === "api") {
    queueLinkEl?.classList.remove("hidden");
    queueSeparatorEl?.classList.remove("hidden");
  }

  // Options link
  document.getElementById("options-link")?.addEventListener("click", (e) => {
    e.preventDefault();
    browser.runtime.openOptionsPage();
  });

  // Close/retry buttons
  document.getElementById("close-btn")?.addEventListener("click", () => window.close());
  document.getElementById("retry-btn")?.addEventListener("click", () => location.reload());

  // Bookmark tab listeners
  setupBookmarkListeners();
}

/**
 * Show hint type indicator
 */
function showHintType(hint: SearchHint) {
  const typeLabels: Record<string, string> = {
    doi: "DOI detected",
    arxiv: "arXiv ID detected",
    s2: "Semantic Scholar ID detected",
    openreview: "OpenReview ID detected",
    title: "Using page title",
  };
  searchHintEl.innerHTML = `<span class="hint-type">${typeLabels[hint.type]}</span>`;
}

type AttemptStatus = "pending" | "success" | "not-found" | "error" | "skipped";

interface AttemptRow {
  row: HTMLDivElement;
  statusEl: HTMLSpanElement;
  detailEl: HTMLDivElement;
}

function resetAttemptLog() {
  attemptsListEl.innerHTML = "";
  attemptsSectionEl.classList.add("hidden");
}

function addAttemptRow(label: string, status: AttemptStatus = "pending"): AttemptRow {
  attemptsSectionEl.classList.remove("hidden");

  const row = document.createElement("div");
  row.className = `attempt-row ${status}`;

  const main = document.createElement("div");
  main.className = "attempt-main";

  const labelEl = document.createElement("span");
  labelEl.className = "attempt-label";
  labelEl.textContent = label;

  const statusEl = document.createElement("span");
  statusEl.className = "attempt-status";
  statusEl.textContent = getAttemptStatusLabel(status);

  const detailEl = document.createElement("div");
  detailEl.className = "attempt-detail";

  main.appendChild(labelEl);
  main.appendChild(statusEl);
  row.appendChild(main);
  row.appendChild(detailEl);
  attemptsListEl.appendChild(row);

  if (status !== "pending") {
    setAttemptStatus({ row, statusEl, detailEl }, status);
  }

  return { row, statusEl, detailEl };
}

function setAttemptStatus(attempt: AttemptRow, status: AttemptStatus, detail?: string) {
  attempt.row.className = `attempt-row ${status}`;
  attempt.statusEl.textContent = getAttemptStatusLabel(status);
  if (detail) {
    attempt.detailEl.textContent = detail;
    attempt.detailEl.classList.remove("hidden");
  } else {
    attempt.detailEl.textContent = "";
    attempt.detailEl.classList.add("hidden");
  }
}

function getAttemptStatusLabel(status: AttemptStatus): string {
  switch (status) {
    case "success":
      return "Found";
    case "not-found":
      return "No result";
    case "error":
      return "Error";
    case "skipped":
      return "Skipped";
    default:
      return "Trying";
  }
}

function summarizeMetadata(metadata: PageMetadata, fields?: string[]): string {
  const presentFields = fields?.length ? fields : listPresentFields(metadata);
  if (presentFields.length === 0) return "No structured fields";
  if (presentFields.length === 1 && presentFields[0] === "title") return "Title only";
  return `Fields: ${presentFields.join(", ")}`;
}

function listPresentFields(metadata: PageMetadata): string[] {
  const fields: string[] = [];
  if (metadata.title) fields.push("title");
  if (metadata.authors && metadata.authors.length > 0) fields.push("authors");
  if (metadata.year) fields.push("year");
  if (metadata.venue) fields.push("venue");
  if (metadata.doi) fields.push("doi");
  if (metadata.abstract) fields.push("abstract");
  return fields;
}

function truncateText(text: string, maxLength = 72): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}

type PageParseResponse = {
  metadata: PageMetadata | null;
  parser: string;
  fields?: string[];
  error?: string;
};

async function fetchPageMetadata(): Promise<PageParseResponse | null> {
  if (!currentTabId) {
    return { metadata: null, parser: "content script", error: "No active tab" };
  }

  try {
    const response = await browser.tabs.sendMessage(currentTabId, { type: "PARSE_PAGE_METADATA" });
    if (response?.type === "PAGE_METADATA_RESULT") {
      return response as PageParseResponse;
    }
    return response as PageParseResponse;
  } catch (error) {
    return {
      metadata: null,
      parser: "content script",
      error: error instanceof Error ? error.message : "Failed to read page metadata",
    };
  }
}

/**
 * Check API connection
 */
async function checkApiConnection() {
  if (!apiClient) return;

  try {
    const result = await apiClient.checkConnection();
    if (result.connected && result.info) {
      apiStatusEl.classList.remove("hidden", "disconnected");
      apiStatusEl.classList.add("connected");

      // Populate projects dropdown
      if (result.info.projects?.length) {
        projectFieldEl.classList.remove("hidden");
        result.info.projects.forEach((project: string) => {
          const option = document.createElement("option");
          option.value = project;
          option.textContent = project;
          if (project === config.defaultProject) option.selected = true;
          projectEl.appendChild(option);
        });
      }
    } else {
      apiStatusEl.classList.remove("hidden", "connected");
      apiStatusEl.classList.add("disconnected");
    }
  } catch {
    apiStatusEl.classList.remove("hidden", "connected");
    apiStatusEl.classList.add("disconnected");
  }
}

/**
 * Handle search button click
 */
async function handleSearch() {
  const query = searchQueryEl.value.trim();
  if (!query) return;

  searchBtnEl.disabled = true;
  searchBtnEl.textContent = "Searching...";

  resetAttemptLog();
  errorEl.classList.add("hidden");
  successEl.classList.add("hidden");

  const includeOpenalex = includeOpenalexEl?.checked ?? false;
  const includeCrossref = includeCrossrefEl?.checked ?? false;

  // Show sources section with loading state
  sourcesSectionEl.classList.remove("hidden");

  // Always show and load page parsing
  sourcePageEl.classList.remove("hidden");
  setSourceLoading(sourcePageEl);

  // Always show and load DBLP and S2
  sourceDblpEl.classList.remove("hidden");
  sourceS2El.classList.remove("hidden");
  setSourceLoading(sourceDblpEl);
  setSourceLoading(sourceS2El);

  // Show/hide optional sources based on checkboxes
  if (includeOpenalex) {
    sourceOpenalexEl.classList.remove("hidden");
    setSourceLoading(sourceOpenalexEl);
  } else {
    sourceOpenalexEl.classList.add("hidden");
  }

  if (includeCrossref) {
    sourceCrossrefEl.classList.remove("hidden");
    setSourceLoading(sourceCrossrefEl);
  } else {
    sourceCrossrefEl.classList.add("hidden");
  }

  searchResults = { page: null, dblp: null, s2: null, openalex: null, crossref: null };

  const pageAttempt = addAttemptRow("Parse page metadata");
  const pageParse = await fetchPageMetadata();
  if (pageParse?.metadata) {
    searchResults.page = pageParse.metadata;
    updateSourceCard(
      sourcePageEl,
      "page",
      {
        title: pageParse.metadata.title,
        authors: pageParse.metadata.authors,
        year: pageParse.metadata.year,
        venue: pageParse.metadata.venue,
      },
      "Parsed"
    );
    const parserLabel = pageParse.parser || "page";
    const pageDetail = `${parserLabel} · ${summarizeMetadata(pageParse.metadata, pageParse.fields)}`;
    setAttemptStatus(pageAttempt, "success", pageDetail);
  } else {
    updateSourceCard(sourcePageEl, "page", null);
    const pageError = pageParse?.error;
    setAttemptStatus(pageAttempt, pageError ? "error" : "not-found", pageError || "No metadata found");
  }

  const dblpAttempt = addAttemptRow("DBLP API");
  try {
    const dblpResult = await searchDblp(query);
    searchResults.dblp = dblpResult;
    updateSourceCard(sourceDblpEl, "dblp", dblpResult?.paper ?? null);
    if (dblpResult?.paper) {
      setAttemptStatus(dblpAttempt, "success", `Found: ${truncateText(dblpResult.paper.title || "result")}`);
    } else {
      setAttemptStatus(dblpAttempt, "not-found", "No matching result");
    }
  } catch (error) {
    updateSourceCard(sourceDblpEl, "dblp", null);
    setAttemptStatus(dblpAttempt, "error", error instanceof Error ? error.message : "Lookup failed");
  }

  const s2Attempt = addAttemptRow("Semantic Scholar API");
  try {
    const s2Result = await searchSemanticScholar(query);
    searchResults.s2 = s2Result;

    const s2Paper = s2Result?.paper
      ? {
          title: s2Result.paper.title,
          authors: s2Result.paper.authors?.map((a) => a.name),
          year: s2Result.paper.year?.toString(),
          venue: s2Result.paper.venue,
        }
      : null;

    updateSourceCard(sourceS2El, "s2", s2Paper);
    if (s2Paper?.title) {
      setAttemptStatus(s2Attempt, "success", `Found: ${truncateText(s2Paper.title)}`);
    } else {
      setAttemptStatus(s2Attempt, "not-found", "No matching result");
    }
  } catch (error) {
    updateSourceCard(sourceS2El, "s2", null);
    setAttemptStatus(s2Attempt, "error", error instanceof Error ? error.message : "Lookup failed");
  }

  const openalexAttempt = addAttemptRow("OpenAlex API");
  if (!includeOpenalex) {
    setAttemptStatus(openalexAttempt, "skipped", "Not selected");
  } else {
    try {
      const openalexResult = await searchOpenAlex(query);
      searchResults.openalex = openalexResult;
      updateSourceCard(sourceOpenalexEl, "openalex", openalexResult?.paper ?? null);
      if (openalexResult?.paper?.title) {
        setAttemptStatus(openalexAttempt, "success", `Found: ${truncateText(openalexResult.paper.title)}`);
      } else {
        setAttemptStatus(openalexAttempt, "not-found", "No matching result");
      }
    } catch (error) {
      updateSourceCard(sourceOpenalexEl, "openalex", null);
      setAttemptStatus(openalexAttempt, "error", error instanceof Error ? error.message : "Lookup failed");
    }
  }

  const crossrefAttempt = addAttemptRow("Crossref API");
  if (!includeCrossref) {
    setAttemptStatus(crossrefAttempt, "skipped", "Not selected");
  } else {
    try {
      const crossrefResult = await searchCrossref(query);
      searchResults.crossref = crossrefResult;
      updateSourceCard(sourceCrossrefEl, "crossref", crossrefResult?.paper ?? null);
      if (crossrefResult?.paper?.title) {
        setAttemptStatus(crossrefAttempt, "success", `Found: ${truncateText(crossrefResult.paper.title)}`);
      } else {
        setAttemptStatus(crossrefAttempt, "not-found", "No matching result");
      }
    } catch (error) {
      updateSourceCard(sourceCrossrefEl, "crossref", null);
      setAttemptStatus(crossrefAttempt, "error", error instanceof Error ? error.message : "Lookup failed");
    }
  }

  autoSelectBest();

  searchBtnEl.disabled = false;
  searchBtnEl.textContent = "Search";
}

/**
 * Set source card to loading state
 */
function setSourceLoading(card: HTMLDivElement) {
  card.classList.add("loading");
  card.classList.remove("selected", "not-found");
  const status = card.querySelector(".source-status") as HTMLSpanElement;
  status.textContent = "...";
  status.className = "source-status loading";
  const content = card.querySelector(".source-content") as HTMLDivElement;
  content.querySelector(".source-title")!.textContent = "";
  content.querySelector(".source-authors")!.textContent = "";
  content.querySelector(".source-meta")!.textContent = "";
}

/**
 * Update source card with result
 */
function updateSourceCard(
  card: HTMLDivElement,
  source: string,
  paper: { title: string; authors?: string[]; year?: string; venue?: string } | null,
  statusLabel = "Found"
) {
  card.classList.remove("loading");
  const status = card.querySelector(".source-status") as HTMLSpanElement;
  const radio = card.querySelector(`#radio-${source}`) as HTMLInputElement;
  const content = card.querySelector(".source-content") as HTMLDivElement;

  if (!paper) {
    card.classList.add("not-found");
    status.textContent = "Not found";
    status.className = "source-status not-found";
    radio.disabled = true;
    content.querySelector(".source-title")!.textContent = "—";
    content.querySelector(".source-authors")!.textContent = "";
    content.querySelector(".source-meta")!.textContent = "";
    return;
  }

  card.classList.remove("not-found");
  status.textContent = statusLabel;
  status.className = "source-status found";
  radio.disabled = false;

  content.querySelector(".source-title")!.textContent = paper.title || "";
  content.querySelector(".source-authors")!.textContent =
    paper.authors?.slice(0, 3).join(", ") + (paper.authors && paper.authors.length > 3 ? "..." : "") || "";
  content.querySelector(".source-meta")!.textContent =
    [paper.year, paper.venue].filter(Boolean).join(" • ") || "";
}

function getPageCompletenessScore(metadata: PageMetadata): number {
  let score = 0;
  if (metadata.title) score += 1;
  if (metadata.authors && metadata.authors.length > 0) score += 2;
  if (metadata.year) score += 1;
  if (metadata.venue) score += 1;
  if (metadata.doi) score += 1;
  return score;
}

/**
 * Auto-select the best result based on completeness
 */
function autoSelectBest() {
  const scores: { source: SourceKey; score: number }[] = [];

  if (searchResults.page) {
    scores.push({ source: "page", score: getPageCompletenessScore(searchResults.page) });
  }
  if (searchResults.dblp?.paper) {
    scores.push({ source: "dblp", score: getDblpCompletenessScore(searchResults.dblp.paper) });
  }
  if (searchResults.s2?.paper) {
    scores.push({ source: "s2", score: getS2CompletenessScore(searchResults.s2.paper) });
  }
  if (searchResults.openalex?.paper) {
    scores.push({ source: "openalex", score: getOpenAlexCompletenessScore(searchResults.openalex.paper) });
  }
  if (searchResults.crossref?.paper) {
    scores.push({ source: "crossref", score: getCrossrefCompletenessScore(searchResults.crossref.paper) });
  }

  if (scores.length === 0) {
    // No results found
    editorSectionEl.classList.add("hidden");
    return;
  }

  // Sort by score descending
  scores.sort((a, b) => b.score - a.score);
  const best = scores[0].source;

  // Select the radio button
  const radio = document.getElementById(`radio-${best}`) as HTMLInputElement;
  radio.checked = true;
  selectSource(best);
}

/**
 * Handle source radio change
 */
function handleSourceChange(e: Event) {
  const radio = e.target as HTMLInputElement;
  selectSource(radio.value as SourceKey);
}

/**
 * Select a source and populate editor
 */
function selectSource(source: SourceKey) {
  selectedSource = source;

  // Update card styles
  [sourcePageEl, sourceDblpEl, sourceS2El, sourceOpenalexEl, sourceCrossrefEl].forEach((card) => {
    card?.classList.remove("selected");
  });

  const selectedCard = document.getElementById(`source-${source}`);
  selectedCard?.classList.add("selected");

  // Get paper data
  let paper: {
    title: string;
    authors?: string[];
    year?: string;
    venue?: string;
    doi?: string;
    abstract?: string;
  } | null = null;

  if (source === "page" && searchResults.page) {
    paper = {
      title: searchResults.page.title,
      authors: searchResults.page.authors,
      year: searchResults.page.year,
      venue: searchResults.page.venue,
      doi: searchResults.page.doi,
      abstract: searchResults.page.abstract,
    };
  } else if (source === "dblp" && searchResults.dblp?.paper) {
    paper = searchResults.dblp.paper;
  } else if (source === "s2" && searchResults.s2?.paper) {
    const s2Paper = searchResults.s2.paper;
    paper = {
      title: s2Paper.title,
      authors: s2Paper.authors?.map((a) => a.name),
      year: s2Paper.year?.toString(),
      venue: s2Paper.venue,
      doi: s2Paper.externalIds?.DOI,
      abstract: s2Paper.abstract,
    };
  } else if (source === "openalex" && searchResults.openalex?.paper) {
    paper = searchResults.openalex.paper;
  } else if (source === "crossref" && searchResults.crossref?.paper) {
    paper = searchResults.crossref.paper;
  }

  if (!paper) return;

  // Populate editor fields
  titleEl.value = paper.title || "";
  authorsEl.value = paper.authors?.join(", ") || "";
  yearEl.value = paper.year || "";
  venueEl.value = paper.venue || "";
  doiEl.value = paper.doi || "";
  abstractEl.value = paper.abstract || "";

  // Generate citation key
  const metadata: PageMetadata = {
    url: currentUrl,
    title: paper.title || "",
    authors: paper.authors,
    year: paper.year,
  };
  citationKeyEl.value = generateCitationKey(metadata);

  // Set default tags
  tagsEl.value = config.defaultTags.join(", ");

  // Show editor
  editorSectionEl.classList.remove("hidden");
  clipBtnEl.disabled = false;

  // Generate tag suggestions
  updateTagSuggestions();
}

/**
 * Update tag suggestions based on metadata
 */
function updateTagSuggestions() {
  const metadata: PageMetadata = {
    url: currentUrl,
    title: titleEl.value,
    authors: authorsEl.value.split(",").map((a) => a.trim()).filter(Boolean),
    year: yearEl.value,
    venue: venueEl.value,
    abstract: abstractEl.value,
  };

  const suggestions = suggestTags(metadata);
  const currentTags = tagsEl.value.split(",").map((t) => t.trim().toLowerCase());

  // Filter out already-added tags
  const filtered = suggestions.filter((s) => !currentTags.includes(s.tag.toLowerCase()));

  if (filtered.length === 0) {
    tagSuggestionsEl.classList.add("hidden");
    return;
  }

  tagSuggestionsEl.classList.remove("hidden");
  tagChipsEl.innerHTML = "";

  filtered.slice(0, 6).forEach((suggestion) => {
    const chip = document.createElement("span");
    chip.className = "tag-chip";
    chip.innerHTML = `${suggestion.tag} <span class="confidence">${Math.round(suggestion.confidence * 100)}%</span>`;
    chip.addEventListener("click", () => {
      const current = tagsEl.value.trim();
      tagsEl.value = current ? `${current}, ${suggestion.tag}` : suggestion.tag;
      updateTagSuggestions();
    });
    tagChipsEl.appendChild(chip);
  });
}

/**
 * Handle save button click
 */
async function handleSave() {
  clipBtnEl.disabled = true;
  clipBtnEl.textContent = "Saving...";

  try {
    const metadata: PageMetadata = {
      url: currentUrl,
      title: titleEl.value,
      authors: authorsEl.value.split(",").map((a) => a.trim()).filter(Boolean),
      year: yearEl.value,
      venue: venueEl.value,
      doi: doiEl.value,
      abstract: abstractEl.value,
    };

    const citationKey = citationKeyEl.value;
    const tags = tagsEl.value.split(",").map((t) => t.trim()).filter(Boolean);
    const project = projectEl.value;

    if (config.mode === "api" && apiClient) {
      await saveViaApi(metadata, citationKey, tags, project);
    } else {
      await downloadMarkdown(metadata, citationKey, tags);
    }

    showSuccess(citationKey);
  } catch (e) {
    showError(e instanceof Error ? e.message : "Failed to save");
    clipBtnEl.disabled = false;
    clipBtnEl.textContent = "Save to Vault";
  }
}

/**
 * Save via Extenote API
 */
async function saveViaApi(metadata: PageMetadata, citationKey: string, tags: string[], project: string) {
  if (!apiClient) throw new Error("API not configured");

  // Validate inputs
  if (!citationKey || citationKey.trim() === "") {
    throw new Error("Citation key is required");
  }
  if (!metadata.title || metadata.title.trim() === "") {
    throw new Error("Title is required");
  }

  console.log("[Clipper] saveViaApi called with:", {
    citationKey,
    title: metadata.title,
    authors: metadata.authors,
    year: metadata.year,
    doi: metadata.doi,
    tags,
    project,
  });

  // Create the object first (this creates the file from schema template)
  const createResult = await apiClient.createObject({
    schema: config.defaultSchema,
    slug: citationKey,
    title: metadata.title,
    project: project || undefined,
  });

  if (!createResult.success || !createResult.filePath) {
    throw new Error(createResult.error || "Failed to create object");
  }

  console.log("[Clipper] Created file:", createResult.filePath);

  // Build the full frontmatter with all metadata
  const frontmatter: Record<string, unknown> = {
    type: config.defaultSchema,
    citation_key: citationKey,
    title: metadata.title,
    entry_type: "misc",
    visibility: "public",
    url: metadata.url,
  };

  if (metadata.authors?.length) {
    frontmatter.authors = metadata.authors;
  }
  if (metadata.year) {
    frontmatter.year = metadata.year;
  }
  if (metadata.venue) {
    frontmatter.venue = metadata.venue;
  }
  if (metadata.doi) {
    frontmatter.doi = metadata.doi;
  }
  if (metadata.abstract) {
    frontmatter.abstract = metadata.abstract;
  }
  if (tags.length) {
    frontmatter.tags = tags;
  }

  console.log("[Clipper] Writing frontmatter with keys:", Object.keys(frontmatter));
  console.log("[Clipper] Full frontmatter:", JSON.stringify(frontmatter, null, 2));

  // Write the full frontmatter (merge: false to replace)
  try {
    const writeResult = await apiClient.writeObject({
      filePath: createResult.filePath,
      frontmatter,
      merge: false,
    });

    console.log("[Clipper] Write result:", writeResult);

    if (!writeResult.success) {
      // Throw error so user knows the save partially failed
      throw new Error(`Created file but failed to write metadata: ${writeResult.error || "Unknown error"}`);
    }

    console.log("[Clipper] Save completed successfully");
  } catch (writeErr) {
    console.error("[Clipper] Write error:", writeErr);
    throw new Error(`Created file but failed to write metadata: ${writeErr instanceof Error ? writeErr.message : "Unknown error"}`);
  }
}

/**
 * Download markdown file
 */
async function downloadMarkdown(metadata: PageMetadata, citationKey: string, tags: string[]) {
  const markdown = generateMarkdown(metadata, citationKey, tags, config.defaultSchema);
  const filename = `${config.downloadSubdir}${citationKey}.md`;

  const blob = new Blob([markdown], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);

  await browser.downloads.download({
    url,
    filename,
    saveAs: false,
  });

  URL.revokeObjectURL(url);
}

/**
 * Show success message
 */
function showSuccess(citationKey: string) {
  savedFilenameEl.textContent = `${citationKey}.md`;
  successEl.classList.remove("hidden");
  editorSectionEl.classList.add("hidden");
  sourcesSectionEl.classList.add("hidden");
  document.getElementById("search-section")?.classList.add("hidden");
}

/**
 * Show error message
 */
function showError(message: string) {
  errorMessageEl.textContent = message;
  errorEl.classList.remove("hidden");
}

/**
 * Check if current page matches a vault entry
 */
async function checkVaultMatch(pageTitle: string) {
  if (!apiClient) return;

  try {
    const vaultObjects = await apiClient.getVaultObjects();
    if (!vaultObjects) return;

    const match = matchPageToVault(currentUrl, pageTitle, vaultObjects);
    if (match) {
      matchedEntry = match;
      await enterValidationMode();
    }
  } catch (e) {
    console.warn("Failed to check vault match:", e);
  }
}

/**
 * Enter validation mode
 */
async function enterValidationMode() {
  if (!matchedEntry || !apiClient) return;

  currentMode = "validate";

  // Hide search UI, show validation UI
  document.getElementById("search-section")?.classList.add("hidden");
  sourcesSectionEl.classList.add("hidden");
  editorSectionEl.classList.add("hidden");
  validationSectionEl.classList.remove("hidden");

  // Set entry info
  validationEntryTitleEl.textContent = matchedEntry.entry.title;
  validationEntryPathEl.textContent = matchedEntry.entry.relativePath;

  // Get current validation status
  const status = getValidationStatus(matchedEntry.entry);
  updateValidationBadge(status);

  // Fetch full object details
  fullVaultObject = await apiClient.getObject({ path: matchedEntry.entry.relativePath });

  // Search APIs to get fresh data
  await fetchValidationApiData();
}

/**
 * Update validation status badge
 */
function updateValidationBadge(status: string) {
  validationStatusBadgeEl.textContent = status;
  validationStatusBadgeEl.className = `validation-badge ${status}`;
}

/**
 * Fetch fresh API data for comparison
 */
async function fetchValidationApiData() {
  if (!matchedEntry) return;

  updateValidationBadge("checking");
  comparisonFieldsEl.innerHTML = '<div class="loading">Fetching API data...</div>';

  // Use DOI if available, otherwise title
  const query = matchedEntry.entry.doi || matchedEntry.entry.title;

  // Search all sources in parallel
  const [dblpResult, openalexResult] = await Promise.all([
    searchDblp(query).catch(() => null),
    searchOpenAlex(query).catch(() => null),
  ]);

  // Pick the best result
  let apiResult: typeof validationApiResult = null;

  if (dblpResult?.paper) {
    apiResult = {
      title: dblpResult.paper.title,
      authors: dblpResult.paper.authors,
      year: dblpResult.paper.year,
      venue: dblpResult.paper.venue,
      doi: dblpResult.paper.doi,
    };
  } else if (openalexResult?.paper) {
    apiResult = {
      title: openalexResult.paper.title,
      authors: openalexResult.paper.authors,
      year: openalexResult.paper.year,
      venue: openalexResult.paper.venue,
      doi: openalexResult.paper.doi,
    };
  }

  validationApiResult = apiResult;

  if (!apiResult) {
    updateValidationBadge("not_found");
    comparisonFieldsEl.innerHTML = '<div class="not-found">No API results found for comparison</div>';
    return;
  }

  // Compare fields
  comparisonResult = compareFields(matchedEntry.entry, apiResult);
  updateValidationBadge(comparisonResult.status);

  // Render comparison table
  renderComparisonTable(comparisonResult.fields);

  // Show fix button if there are mismatches
  if (comparisonResult.status === "mismatch") {
    fixMismatchesBtnEl.classList.remove("hidden");
  } else {
    fixMismatchesBtnEl.classList.add("hidden");
  }
}

/**
 * Render the field comparison table
 */
function renderComparisonTable(fields: Record<string, { match: boolean; vault?: unknown; api?: unknown }>) {
  comparisonFieldsEl.innerHTML = "";

  const fieldNames = ["title", "authors", "year", "venue", "doi"];

  for (const fieldName of fieldNames) {
    const field = fields[fieldName];
    if (!field) continue;

    const row = document.createElement("div");
    row.className = "comparison-row";

    const vaultValue = formatFieldValue(field.vault);
    const apiValue = formatFieldValue(field.api);

    row.innerHTML = `
      <span class="field-name">${fieldName}</span>
      <span class="vault-value ${!vaultValue ? 'empty' : ''}">${vaultValue || '—'}</span>
      <span class="api-value ${!apiValue ? 'empty' : ''}">${apiValue || '—'}</span>
      <span class="match-indicator ${field.match ? 'match' : 'mismatch'}">${field.match ? '✓' : '✗'}</span>
    `;

    comparisonFieldsEl.appendChild(row);
  }
}

/**
 * Format a field value for display
 */
function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) {
    if (value.length <= 2) return value.join(", ");
    return `${value.slice(0, 2).join(", ")} +${value.length - 2}`;
  }
  const str = String(value);
  if (str.length > 60) return str.slice(0, 57) + "...";
  return str;
}

/**
 * Handle update check_log button
 */
async function handleUpdateChecklog() {
  if (!matchedEntry || !apiClient || !comparisonResult) return;

  updateChecklogBtnEl.disabled = true;
  updateChecklogBtnEl.textContent = "Updating...";

  try {
    const checkLog = createCheckLog(
      comparisonResult.status,
      "dblp", // or the source we used
      comparisonResult.fields
    );

    const result = await apiClient.writeObject({
      filePath: matchedEntry.entry.relativePath,
      frontmatter: { check_log: checkLog },
      merge: true,
    });

    if (result.success) {
      updateValidationBadge(comparisonResult.status);
      updateChecklogBtnEl.textContent = "Updated!";
      setTimeout(() => {
        updateChecklogBtnEl.textContent = "Update check_log";
        updateChecklogBtnEl.disabled = false;
      }, 2000);
    } else {
      throw new Error(result.error || "Failed to update");
    }
  } catch (e) {
    showError(e instanceof Error ? e.message : "Failed to update check_log");
    updateChecklogBtnEl.disabled = false;
    updateChecklogBtnEl.textContent = "Update check_log";
  }
}

/**
 * Handle fix mismatches button
 */
async function handleFixMismatches() {
  if (!matchedEntry || !apiClient || !validationApiResult || !comparisonResult) return;

  fixMismatchesBtnEl.disabled = true;
  fixMismatchesBtnEl.textContent = "Fixing...";

  try {
    // Build frontmatter update with API values for mismatched fields
    const updates: Record<string, unknown> = {};

    for (const [fieldName, fieldInfo] of Object.entries(comparisonResult.fields)) {
      if (!fieldInfo.match && fieldInfo.api !== undefined) {
        updates[fieldName] = fieldInfo.api;
      }
    }

    // Also update check_log to reflect the fix
    updates.check_log = createCheckLog("confirmed", "dblp", comparisonResult.fields);

    const result = await apiClient.writeObject({
      filePath: matchedEntry.entry.relativePath,
      frontmatter: updates,
      merge: true,
    });

    if (result.success) {
      // Re-fetch and compare
      await fetchValidationApiData();
      fixMismatchesBtnEl.textContent = "Fixed!";
      setTimeout(() => {
        fixMismatchesBtnEl.textContent = "Fix Mismatches";
        fixMismatchesBtnEl.disabled = false;
      }, 2000);
    } else {
      throw new Error(result.error || "Failed to fix");
    }
  } catch (e) {
    showError(e instanceof Error ? e.message : "Failed to fix mismatches");
    fixMismatchesBtnEl.disabled = false;
    fixMismatchesBtnEl.textContent = "Fix Mismatches";
  }
}

/**
 * Open matched entry in editor via API
 */
async function handleOpenInEditor() {
  if (!matchedEntry || !apiClient) return;

  openInEditorBtnEl.disabled = true;
  openInEditorBtnEl.textContent = "Opening...";

  try {
    const result = await apiClient.openInEditor(matchedEntry.entry.relativePath);
    if (result.success) {
      openInEditorBtnEl.textContent = "Opened!";
      setTimeout(() => {
        openInEditorBtnEl.textContent = "Open in Editor";
        openInEditorBtnEl.disabled = false;
      }, 1500);
    } else {
      throw new Error(result.error || "Failed to open in editor");
    }
  } catch (e) {
    showError(e instanceof Error ? e.message : "Failed to open in editor");
    openInEditorBtnEl.disabled = false;
    openInEditorBtnEl.textContent = "Open in Editor";
  }
}

/**
 * Switch from validation mode to search mode
 */
function switchToSearchMode() {
  currentMode = "search";
  matchedEntry = null;
  fullVaultObject = null;
  validationApiResult = null;
  comparisonResult = null;

  // Hide validation UI, show search UI
  validationSectionEl.classList.add("hidden");
  document.getElementById("search-section")?.classList.remove("hidden");
}

/**
 * Show validation queue
 */
async function showQueue() {
  // Hide other sections
  document.getElementById("search-section")?.classList.add("hidden");
  sourcesSectionEl.classList.add("hidden");
  editorSectionEl.classList.add("hidden");
  validationSectionEl.classList.add("hidden");

  // Show queue section
  queueSectionEl.classList.remove("hidden");

  await loadQueue();
}

/**
 * Hide validation queue
 */
function hideQueue() {
  queueSectionEl.classList.add("hidden");
  document.getElementById("search-section")?.classList.remove("hidden");
}

/**
 * Load validation queue from API
 */
async function loadQueue() {
  if (!apiClient) return;

  queueListEl.innerHTML = '<div class="loading">Loading queue...</div>';

  try {
    const queue = await apiClient.getValidationQueue({ limit: 20 });

    if (!queue) {
      queueListEl.innerHTML = '<div class="queue-empty">Failed to load queue</div>';
      return;
    }

    // Update stats
    queuePendingEl.textContent = `${queue.pending} pending`;
    queueValidatedEl.textContent = `${queue.validated} validated`;

    if (queue.entries.length === 0) {
      queueListEl.innerHTML = '<div class="queue-empty">All entries validated!</div>';
      return;
    }

    // Render queue items
    queueListEl.innerHTML = "";
    for (const entry of queue.entries) {
      const item = document.createElement("div");
      item.className = "queue-item";
      item.innerHTML = `
        <div class="queue-item-title">${escapeHtml(entry.title)}</div>
        <div class="queue-item-meta">${entry.id}${entry.doi ? ` • ${entry.doi}` : ""}</div>
      `;

      // Click to open URL if available
      if (entry.url) {
        item.addEventListener("click", () => {
          browser.tabs.create({ url: entry.url });
          window.close();
        });
      }

      queueListEl.appendChild(item);
    }
  } catch (e) {
    queueListEl.innerHTML = '<div class="queue-empty">Error loading queue</div>';
    console.error("Failed to load queue:", e);
  }
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Detect platform from URL
 */
function detectPlatform(url: string): string {
  if (url.includes("x.com/") || url.includes("twitter.com/")) return "x";
  if (url.includes("bsky.app/")) return "bluesky";
  if (url.includes("mastodon.") || url.includes("/@")) return "mastodon";
  return "web";
}

/**
 * Generate a slug from URL for bookmark
 */
function generateBookmarkSlug(url: string): string {
  const platform = detectPlatform(url);
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toISOString().slice(11, 16).replace(":", "");

  // Try to extract post ID from URL
  let postId = "";
  if (platform === "x") {
    const match = url.match(/status\/(\d+)/);
    if (match) postId = match[1].slice(-8); // last 8 digits
  } else if (platform === "bluesky") {
    const match = url.match(/post\/([a-z0-9]+)/i);
    if (match) postId = match[1].slice(0, 8);
  }

  return `${platform}-${dateStr}-${timeStr}${postId ? `-${postId}` : ""}`;
}

/**
 * Switch between Reference and Bookmark tabs
 */
function switchTab(tab: TabMode) {
  currentTabMode = tab;

  // Update tab active states
  tabReferenceEl.classList.toggle("active", tab === "reference");
  tabBookmarkEl.classList.toggle("active", tab === "bookmark");

  // Show/hide sections
  const searchSectionEl = document.getElementById("search-section");

  if (tab === "reference") {
    bookmarkSectionEl.classList.add("hidden");
    searchSectionEl?.classList.remove("hidden");
    sourcesSectionEl.classList.toggle("hidden", !selectedSource);
    editorSectionEl.classList.toggle("hidden", !selectedSource);
  } else {
    bookmarkSectionEl.classList.remove("hidden");
    searchSectionEl?.classList.add("hidden");
    sourcesSectionEl.classList.add("hidden");
    editorSectionEl.classList.add("hidden");
    validationSectionEl.classList.add("hidden");

    // Populate bookmark fields
    bookmarkUrlEl.textContent = currentUrl;

    // Check for existing bookmark (API mode only)
    if (config.mode === "api" && apiClient) {
      checkExistingBookmark();
    }
  }
}

/**
 * Check if current URL is already bookmarked
 */
async function checkExistingBookmark() {
  if (!apiClient) return;

  try {
    const vaultObjects = await apiClient.getVaultObjects();
    if (!vaultObjects) return;

    // Find bookmark with matching URL
    const existing = vaultObjects.find(
      (obj) => obj.frontmatter?.type === "bookmark" && obj.frontmatter?.url === currentUrl
    );

    if (existing) {
      existingBookmarkPath = existing.relativePath;
      bookmarkDuplicatePathEl.textContent = existing.relativePath;
      bookmarkDuplicateWarningEl.classList.remove("hidden");
      bookmarkSaveBtnEl.textContent = "Save Anyway";
    } else {
      existingBookmarkPath = null;
      bookmarkDuplicateWarningEl.classList.add("hidden");
      bookmarkSaveBtnEl.textContent = "Save Bookmark";
    }
  } catch (e) {
    console.warn("Failed to check for existing bookmark:", e);
  }
}

/**
 * Save bookmark
 */
async function saveBookmark() {
  const title = bookmarkTitleEl.value.trim();
  const tags = bookmarkTagsEl.value
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t);
  const notes = bookmarkNotesEl.value.trim();
  const platform = detectPlatform(currentUrl);
  const slug = generateBookmarkSlug(currentUrl);

  if (!title) {
    showError("Title is required");
    return;
  }

  bookmarkSaveBtnEl.disabled = true;
  bookmarkSaveBtnEl.textContent = "Saving...";

  try {
    const now = new Date().toISOString().slice(0, 10);

    // Build frontmatter
    const frontmatter: Record<string, unknown> = {
      type: "bookmark",
      title,
      url: currentUrl,
      platform,
      saved_at: now,
      visibility: "private",
    };
    if (tags.length > 0) frontmatter.tags = tags;
    if (notes) frontmatter.notes = notes;

    // Use API mode if configured and connected
    if (config.mode === "api" && apiClient) {
      await saveBookmarkViaApi(slug, frontmatter, notes);
    } else {
      await downloadBookmarkMarkdown(slug, frontmatter, notes);
    }

    // Show success
    savedFilenameEl.textContent = `${slug}.md`;
    successEl.classList.remove("hidden");
    bookmarkSectionEl.classList.add("hidden");
  } catch (e) {
    showError(`Failed to save: ${e instanceof Error ? e.message : "Unknown error"}`);
  } finally {
    bookmarkSaveBtnEl.disabled = false;
    bookmarkSaveBtnEl.textContent = "Save Bookmark";
  }
}

/**
 * Save bookmark via Extenote API
 */
async function saveBookmarkViaApi(slug: string, frontmatter: Record<string, unknown>, notes: string) {
  if (!apiClient) throw new Error("API not configured");

  console.log("[Clipper] saveBookmarkViaApi called with:", {
    slug,
    title: frontmatter.title,
    url: frontmatter.url,
    platform: frontmatter.platform,
  });

  // Create the bookmark file via API
  const createResult = await apiClient.createObject({
    schema: "bookmark",
    slug,
    title: frontmatter.title as string,
    project: "private-content",
  });

  if (!createResult.success || !createResult.filePath) {
    throw new Error(createResult.error || "Failed to create bookmark");
  }

  console.log("[Clipper] Created bookmark file:", createResult.filePath);

  // Write the full frontmatter
  const writeResult = await apiClient.writeObject({
    filePath: createResult.filePath,
    frontmatter,
    body: notes || "",
    merge: false,
  });

  if (!writeResult.success) {
    throw new Error(`Created file but failed to write metadata: ${writeResult.error || "Unknown error"}`);
  }

  console.log("[Clipper] Bookmark saved successfully");
}

/**
 * Download bookmark as markdown file (fallback for non-API mode)
 */
async function downloadBookmarkMarkdown(slug: string, frontmatter: Record<string, unknown>, notes: string) {
  // Generate markdown
  const yamlLines = ["---"];
  for (const [key, value] of Object.entries(frontmatter)) {
    if (Array.isArray(value)) {
      yamlLines.push(`${key}:`);
      for (const item of value) {
        yamlLines.push(`  - ${item}`);
      }
    } else {
      yamlLines.push(`${key}: ${JSON.stringify(value)}`);
    }
  }
  yamlLines.push("---");
  yamlLines.push("");
  if (notes) {
    yamlLines.push(notes);
  }

  const markdown = yamlLines.join("\n");
  const filename = `bookmarks/${slug}.md`;

  // Download the file
  const blob = new Blob([markdown], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);

  await browser.downloads.download({
    url,
    filename,
    saveAs: false,
  });

  URL.revokeObjectURL(url);
}

/**
 * Set up bookmark event listeners
 */
function setupBookmarkListeners() {
  tabReferenceEl?.addEventListener("click", () => switchTab("reference"));
  tabBookmarkEl?.addEventListener("click", () => switchTab("bookmark"));
  bookmarkSaveBtnEl?.addEventListener("click", saveBookmark);
}

// Initialize on load
document.addEventListener("DOMContentLoaded", init);
