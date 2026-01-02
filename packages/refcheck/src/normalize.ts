/**
 * String Normalization Utilities
 *
 * Functions for normalizing strings before comparison.
 */

/**
 * Basic normalization: lowercase, remove diacritics, collapse whitespace
 */
export function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove diacritics
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Strict normalization: also remove punctuation and non-alphanumeric chars
 */
export function normalizeStrict(str: string): string {
  return normalizeString(str)
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalize DOI: strip URL prefixes, lowercase
 */
export function normalizeDoi(doi: string): string {
  let normalized = doi.toLowerCase().trim();

  // Strip common URL prefixes
  const prefixes = [
    "https://doi.org/",
    "http://doi.org/",
    "https://dx.doi.org/",
    "http://dx.doi.org/",
    "doi:",
  ];

  for (const prefix of prefixes) {
    if (normalized.startsWith(prefix)) {
      normalized = normalized.slice(prefix.length);
      break;
    }
  }

  return normalized;
}

/**
 * Extract DOI from a URL or string
 */
export function extractDoi(urlOrDoi: string): string | null {
  const text = urlOrDoi.trim();

  // Check for DOI pattern: 10.XXXX/...
  const doiPattern = /\b(10\.\d{4,}\/[^\s]+)/i;
  const match = text.match(doiPattern);

  if (match) {
    return normalizeDoi(match[1]);
  }

  return null;
}

/**
 * Extract arXiv ID from URL or string
 */
export function extractArxivId(urlOrId: string): string | null {
  const text = urlOrId.trim();

  // Pattern: YYMM.NNNNN or YYMM.NNNNNvN
  const arxivPattern = /(\d{4}\.\d{4,5})(v\d+)?/;

  // Check arxiv.org URLs
  if (text.includes("arxiv.org")) {
    const match = text.match(/arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,5})/);
    if (match) {
      return match[1];
    }
  }

  // Check raw ID
  const match = text.match(arxivPattern);
  if (match) {
    return match[1]; // Return without version suffix
  }

  return null;
}

/**
 * Calculate Levenshtein edit distance between two strings
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];

  // Initialize matrix
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate Jaccard similarity between two strings (word-based)
 */
export function jaccardSimilarity(a: string, b: string): number {
  const wordsA = new Set(
    normalizeStrict(a)
      .split(/\s+/)
      .filter((w) => w.length >= 3)
  );
  const wordsB = new Set(
    normalizeStrict(b)
      .split(/\s+/)
      .filter((w) => w.length >= 3)
  );

  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  const intersection = new Set([...wordsA].filter((w) => wordsB.has(w)));
  const union = new Set([...wordsA, ...wordsB]);

  return intersection.size / union.size;
}

/**
 * Parse author name into first and last name components
 */
export function parseAuthorName(name: string): { first: string; last: string } {
  const normalized = normalizeString(name);

  // Handle "Last, First" format
  if (normalized.includes(",")) {
    const [last, first] = normalized.split(",").map((s) => s.trim());
    return { first: first || "", last: last || "" };
  }

  // Handle "First Last" or "First Middle Last" format
  const parts = normalized.split(/\s+/);
  if (parts.length === 1) {
    return { first: "", last: parts[0] };
  }

  return {
    first: parts.slice(0, -1).join(" "),
    last: parts[parts.length - 1],
  };
}

/**
 * Normalize URL for comparison
 */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Remove query string and hash
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`.toLowerCase();
  } catch {
    return url.toLowerCase().trim();
  }
}

/**
 * Parse year from various formats
 */
export function parseYear(value: string | number | undefined): number | null {
  if (value === undefined || value === null) return null;

  if (typeof value === "number") {
    return value >= 1900 && value <= 2100 ? value : null;
  }

  const str = String(value).trim();

  // Try direct parse
  const year = parseInt(str, 10);
  if (!isNaN(year) && year >= 1900 && year <= 2100) {
    return year;
  }

  // Try extracting 4-digit year
  const match = str.match(/\b(19|20)\d{2}\b/);
  if (match) {
    return parseInt(match[0], 10);
  }

  return null;
}
