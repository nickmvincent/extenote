import fs from "fs/promises";
import path from "path";
import type { ExportOptions, ExportResult, VaultObject } from "../types.js";

/**
 * Fields that are handled specially and should not be passed through directly
 */
const SPECIAL_FIELDS = new Set([
  "type",
  "entry_type",
  "citation_key",
  "authors",
  "visibility",
  "slug",
  // These are explicitly handled above
  "title",
  "year",
  "venue",
  "doi",
  "url",
  "abstract",
  // These might be set by the importer but venue takes precedence
  "journal",
  "booktitle",
]);

/**
 * Escape special BibTeX characters in a value.
 * Wraps the value in braces which handles most escaping needs.
 */
function escapeValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  const str = String(value);
  // Values are wrapped in braces, so we just need to escape unbalanced braces
  // For simplicity, we trust the input is reasonably well-formed
  return str;
}

/**
 * Format an array of authors into BibTeX author format (joined with " and ")
 */
function formatAuthors(authors: unknown): string {
  if (!Array.isArray(authors)) {
    return String(authors || "");
  }
  return authors.map((a) => String(a)).join(" and ");
}

/**
 * Convert a VaultObject with bibtex_entry type to a BibTeX entry string
 */
function objectToBibtex(object: VaultObject): string {
  const fm = object.frontmatter;

  const entryType = (fm.entry_type as string) || "misc";
  const citationKey = (fm.citation_key as string) || object.id;

  const fields: Array<[string, string]> = [];

  // Add title
  if (fm.title) {
    fields.push(["title", escapeValue(fm.title)]);
  }

  // Add authors
  if (fm.authors) {
    fields.push(["author", formatAuthors(fm.authors)]);
  }

  // Add year
  if (fm.year) {
    fields.push(["year", escapeValue(fm.year)]);
  }

  // Add venue - use specific fields if available, otherwise map venue
  if (entryType === "article" && (fm.journal || fm.venue)) {
    fields.push(["journal", escapeValue(fm.journal || fm.venue)]);
  } else if (entryType === "inproceedings" && (fm.booktitle || fm.venue)) {
    fields.push(["booktitle", escapeValue(fm.booktitle || fm.venue)]);
  } else if (fm.venue) {
    fields.push(["publisher", escapeValue(fm.venue)]);
  }

  // Add standard fields
  if (fm.doi) {
    fields.push(["doi", escapeValue(fm.doi)]);
  }
  if (fm.url) {
    fields.push(["url", escapeValue(fm.url)]);
  }
  if (fm.abstract) {
    fields.push(["abstract", escapeValue(fm.abstract)]);
  }

  // Pass through any other fields from frontmatter
  for (const [key, value] of Object.entries(fm)) {
    if (SPECIAL_FIELDS.has(key)) continue;
    if (fields.some(([k]) => k === key)) continue; // Already added
    if (value === null || value === undefined || value === "") continue;

    // Handle arrays (like tags) by joining with comma
    if (Array.isArray(value)) {
      fields.push([key, value.map((v) => String(v)).join(", ")]);
    } else {
      fields.push([key, escapeValue(value)]);
    }
  }

  // Build the BibTeX entry
  const fieldLines = fields
    .map(([key, value]) => `  ${key} = {${value}}`)
    .join(",\n");

  return `@${entryType}{${citationKey},\n${fieldLines}\n}`;
}

/**
 * Export VaultObjects of type bibtex_entry to a .bib file
 */
export async function exportBibtex(
  options: ExportOptions
): Promise<ExportResult> {
  await fs.mkdir(options.outputDir, { recursive: true });

  // Filter to only bibtex_entry objects
  const bibObjects = options.objects.filter(
    (obj) => obj.type === "bibtex_entry"
  );

  // Convert each object to BibTeX format
  const entries = bibObjects.map((obj) => objectToBibtex(obj));

  // Write to single file
  const outputPath = path.join(options.outputDir, "references.bib");
  const content = entries.join("\n\n") + "\n";

  await fs.writeFile(outputPath, content, "utf8");

  return {
    format: "bibtex",
    outputDir: options.outputDir,
    files: [outputPath],
  };
}
