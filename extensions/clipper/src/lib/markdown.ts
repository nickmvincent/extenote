/**
 * Markdown generation utilities for Extenote Web Clipper
 * Generates markdown files with YAML frontmatter matching extenote schemas
 */

import type { PageMetadata } from "./types";
import type { CheckLogResult } from "./openalex";

interface FrontmatterFields {
  type: string;
  citation_key: string;
  title: string;
  entry_type?: string;
  authors?: string[];
  year?: string;
  venue?: string;
  url?: string;
  doi?: string;
  abstract?: string;
  tags?: string[];
  visibility?: string;
  external_bibtex?: string;
  check_log?: CheckLogResult;
}

/**
 * Escape special YAML characters in a string
 */
function escapeYamlString(str: string): string {
  // If string contains special chars, wrap in quotes
  if (/[:#\[\]{}|>!&*?'"`@,]/.test(str) || str.includes("\n")) {
    // Use block scalar for multiline
    if (str.includes("\n")) {
      return `|-\n  ${str.split("\n").join("\n  ")}`;
    }
    // Escape quotes and wrap
    return `'${str.replace(/'/g, "''")}'`;
  }
  return str;
}

/**
 * Convert a value to YAML format
 */
function toYaml(value: unknown, indent = 0): string {
  const prefix = "  ".repeat(indent);

  if (value === null || value === undefined) {
    return "";
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return value.map((v) => `${prefix}- ${escapeYamlString(String(v))}`).join("\n");
  }

  if (typeof value === "string") {
    return escapeYamlString(value);
  }

  return String(value);
}

/**
 * Generate YAML frontmatter from fields
 */
function generateFrontmatter(fields: FrontmatterFields): string {
  const lines: string[] = ["---"];

  // Required fields first
  lines.push(`type: ${fields.type}`);
  lines.push(`citation_key: ${fields.citation_key}`);

  // Title (may need escaping)
  if (fields.title.includes(":") || fields.title.includes("#")) {
    lines.push(`title: >`);
    lines.push(`  ${fields.title}`);
  } else {
    lines.push(`title: ${fields.title}`);
  }

  // Entry type
  if (fields.entry_type) {
    lines.push(`entry_type: ${fields.entry_type}`);
  }

  // Authors array
  if (fields.authors && fields.authors.length > 0) {
    lines.push("authors:");
    for (const author of fields.authors) {
      lines.push(`  - ${escapeYamlString(author)}`);
    }
  }

  // Year
  if (fields.year) {
    lines.push(`year: '${fields.year}'`);
  }

  // Venue
  if (fields.venue) {
    lines.push(`venue: ${escapeYamlString(fields.venue)}`);
  }

  // URL
  if (fields.url) {
    lines.push(`url: '${fields.url}'`);
  }

  // DOI
  if (fields.doi) {
    lines.push(`doi: ${fields.doi}`);
  }

  // Abstract (multiline)
  if (fields.abstract) {
    lines.push("abstract: >");
    // Wrap at ~80 chars for readability
    const wrapped = fields.abstract.match(/.{1,78}(\s|$)/g) || [fields.abstract];
    for (const line of wrapped) {
      lines.push(`  ${line.trim()}`);
    }
  }

  // Tags array
  if (fields.tags && fields.tags.length > 0) {
    lines.push("tags:");
    for (const tag of fields.tags) {
      lines.push(`  - ${tag}`);
    }
  }

  // Visibility
  if (fields.visibility) {
    lines.push(`visibility: ${fields.visibility}`);
  }

  // External BibTeX (multiline block)
  if (fields.external_bibtex) {
    lines.push("external_bibtex: |");
    for (const line of fields.external_bibtex.split("\n")) {
      lines.push(`  ${line}`);
    }
  }

  // Check log from OpenAlex validation
  if (fields.check_log) {
    lines.push("check_log:");
    lines.push(`  checked_at: '${fields.check_log.checked_at}'`);
    lines.push(`  checked_with: ${fields.check_log.checked_with}`);
    lines.push(`  status: ${fields.check_log.status}`);
    if (fields.check_log.paper_id) {
      lines.push(`  paper_id: ${fields.check_log.paper_id}`);
    }
    lines.push("  fields:");
    // Title field
    lines.push("    title:");
    lines.push(`      local: ${escapeYamlString(fields.check_log.fields.title.local)}`);
    if (fields.check_log.fields.title.remote) {
      lines.push(`      remote: ${escapeYamlString(fields.check_log.fields.title.remote)}`);
    }
    lines.push(`      match: ${fields.check_log.fields.title.match}`);
    if (fields.check_log.fields.title.edit_distance !== undefined) {
      lines.push(`      edit_distance: ${fields.check_log.fields.title.edit_distance}`);
    }
    // Authors field
    lines.push("    authors:");
    lines.push(`      local_count: ${fields.check_log.fields.authors.local_count}`);
    if (fields.check_log.fields.authors.remote_count !== undefined) {
      lines.push(`      remote_count: ${fields.check_log.fields.authors.remote_count}`);
    }
    lines.push(`      count_match: ${fields.check_log.fields.authors.count_match}`);
    // Year field
    lines.push("    year:");
    lines.push(`      local: '${fields.check_log.fields.year.local}'`);
    if (fields.check_log.fields.year.remote) {
      lines.push(`      remote: '${fields.check_log.fields.year.remote}'`);
    }
    lines.push(`      match: ${fields.check_log.fields.year.match}`);
  }

  lines.push("---");

  return lines.join("\n");
}

/**
 * Generate a citation key from metadata
 */
export function generateCitationKey(metadata: PageMetadata): string {
  // Try to extract last name from first author
  let authorPart = "unknown";
  if (metadata.authors && metadata.authors.length > 0) {
    const firstAuthor = metadata.authors[0];
    // Handle "Last, First" or "First Last" formats
    if (firstAuthor.includes(",")) {
      authorPart = firstAuthor.split(",")[0].trim().toLowerCase();
    } else {
      const parts = firstAuthor.split(" ");
      authorPart = parts[parts.length - 1].toLowerCase();
    }
    // Remove non-alphanumeric
    authorPart = authorPart.replace(/[^a-z]/g, "");
  }

  // Year
  const year = metadata.year || new Date().getFullYear().toString();

  // First meaningful word from title
  let titleWord = "";
  if (metadata.title) {
    const words = metadata.title.toLowerCase().split(/\s+/);
    const stopWords = ["a", "an", "the", "on", "in", "of", "for", "to", "and", "or"];
    for (const word of words) {
      const cleaned = word.replace(/[^a-z]/g, "");
      if (cleaned.length > 2 && !stopWords.includes(cleaned)) {
        titleWord = cleaned;
        break;
      }
    }
  }

  return `${authorPart}${year}${titleWord}`;
}

/**
 * Generate complete markdown file content
 */
export function generateMarkdown(
  metadata: PageMetadata,
  citationKey: string,
  tags: string[],
  schema = "bibtex_entry",
  checkLog?: CheckLogResult
): string {
  const fields: FrontmatterFields = {
    type: schema,
    citation_key: citationKey,
    title: metadata.title,
    entry_type: metadata.entryType || "misc",
    authors: metadata.authors,
    year: metadata.year,
    venue: metadata.venue,
    url: metadata.url,
    doi: metadata.doi,
    abstract: metadata.abstract,
    tags: tags,
    visibility: "public",
    external_bibtex: metadata.externalBibtex,
    check_log: checkLog,
  };

  const frontmatter = generateFrontmatter(fields);

  // Empty body for now - could add clipped content later
  return `${frontmatter}\n`;
}
