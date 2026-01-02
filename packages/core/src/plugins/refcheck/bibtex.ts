/**
 * BibTeX Entry Checking
 *
 * Uses @extenote/refcheck for unified validation logic.
 */

import fs from "fs/promises";
import type { VaultObject } from "../../types.js";
import { stringifyMarkdown } from "../../markdown.js";
import type { CheckOptions, CheckReport, CheckResult, CheckLog } from "./types.js";

// Import from refcheck
import {
  checkEntry as refcheckEntry,
  type EntryMetadata,
  type CheckLog as RefcheckLog,
  type FieldChecks,
} from "@extenote/refcheck";

// Re-export provider utilities from refcheck
export { getAvailableProviders } from "@extenote/refcheck";

// Increased from 100ms to reduce rate limiting issues with APIs
const DEFAULT_RATE_LIMIT_DELAY = 250;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Convert VaultObject to EntryMetadata for refcheck
 */
function toEntryMetadata(object: VaultObject): EntryMetadata {
  const { frontmatter } = object;

  // Handle authors - can be array or single string
  let authors: string[] | undefined;
  if (Array.isArray(frontmatter.authors)) {
    authors = frontmatter.authors as string[];
  } else if (typeof frontmatter.author === "string") {
    authors = [frontmatter.author];
  } else if (Array.isArray(frontmatter.author)) {
    authors = frontmatter.author as string[];
  }

  // Handle year - can be string or number
  let year: string | number | undefined;
  if (typeof frontmatter.year === "number") {
    year = frontmatter.year;
  } else if (typeof frontmatter.year === "string") {
    year = frontmatter.year;
  }

  // Handle venue - can be venue, journal, booktitle
  const venue =
    (frontmatter.venue as string) ||
    (frontmatter.journal as string) ||
    (frontmatter.booktitle as string);

  return {
    id: object.id,
    title: (frontmatter.title as string) || object.title || "",
    authors,
    year,
    venue,
    doi: frontmatter.doi as string | undefined,
    url: frontmatter.url as string | undefined,
    check_log: frontmatter.check_log as RefcheckLog | undefined,
  };
}

/**
 * Convert refcheck CheckLog to core CheckLog format
 * (They should be compatible, but this ensures type safety)
 */
function toCheckLog(refcheckLog: RefcheckLog): CheckLog {
  const log: CheckLog = {
    checked_at: refcheckLog.checked_at,
    checked_with: refcheckLog.checked_with,
    status: refcheckLog.status,
  };

  if (refcheckLog.mismatch_severity) {
    log.mismatch_severity = refcheckLog.mismatch_severity;
  }

  if (refcheckLog.paper_id) {
    log.paper_id = refcheckLog.paper_id;
  }

  if (refcheckLog.fields) {
    log.fields = convertFieldChecks(refcheckLog.fields);
  }

  if (refcheckLog.remote) {
    log.remote = refcheckLog.remote;
  }

  if (refcheckLog.external_bibtex) {
    log.external_bibtex = refcheckLog.external_bibtex;
  }

  return log;
}

/**
 * Helper to filter out undefined values from an object
 */
function removeUndefined<T extends Record<string, unknown>>(obj: T): T {
  const result = {} as T;
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      (result as Record<string, unknown>)[key] = value;
    }
  }
  return result;
}

/**
 * Convert refcheck FieldChecks to core format
 */
function convertFieldChecks(fields: FieldChecks): CheckLog["fields"] {
  const result: CheckLog["fields"] = {};

  if (fields.title) {
    result.title = removeUndefined({
      local: fields.title.local ?? null,
      remote: fields.title.remote ?? null,
      match: fields.title.match,
      edit_distance: fields.title.edit_distance,
    });
  }

  if (fields.year) {
    result.year = removeUndefined({
      local: fields.year.local ?? null,
      remote: fields.year.remote ?? null,
      match: fields.year.match,
      year_diff: fields.year.year_diff,
    });
  }

  if (fields.venue) {
    result.venue = removeUndefined({
      local: fields.venue.local ?? null,
      remote: fields.venue.remote ?? null,
      match: fields.venue.match,
      edit_distance: fields.venue.edit_distance,
    });
  }

  if (fields.doi) {
    result.doi = removeUndefined({
      local: fields.doi.local ?? null,
      remote: fields.doi.remote ?? null,
      match: fields.doi.match,
    });
  }

  if (fields.authors) {
    result.authors = removeUndefined({
      local_count: fields.authors.local_count,
      remote_count: fields.authors.remote_count,
      count_match: fields.authors.count_match,
    });
    if (fields.authors.details) {
      result.authors.details = fields.authors.details.map((d) => removeUndefined({
        index: d.index,
        local: d.local ?? null,
        remote: d.remote ?? null,
        first_match: d.first_match,
        last_match: d.last_match,
      }));
    }
  }

  return result;
}

/**
 * Convert refcheck result to core CheckResult format
 */
function toCheckResult(
  object: VaultObject,
  refcheckLog: RefcheckLog,
  provider: string
): CheckResult {
  // Build field checks array from refcheck fields
  const fieldChecks: CheckResult["fieldChecks"] = [];

  if (refcheckLog.fields) {
    if (refcheckLog.fields.title) {
      fieldChecks.push({
        field: "title",
        local: refcheckLog.fields.title.local ?? undefined,
        remote: refcheckLog.fields.title.remote ?? undefined,
        match: refcheckLog.fields.title.match,
        charDiff: refcheckLog.fields.title.edit_distance,
      });
    }

    if (refcheckLog.fields.authors) {
      const authors = refcheckLog.fields.authors;
      fieldChecks.push({
        field: "authors",
        local: authors.details?.map((d) => d.local).join("; "),
        remote: authors.details?.map((d) => d.remote).join("; "),
        match: authors.count_match && (authors.details?.every((d) => d.last_match) ?? true),
        authorCountMatch: authors.count_match,
        authorDetails: authors.details?.map((d) => ({
          index: d.index,
          localName: d.local,
          remoteName: d.remote,
          firstMatch: d.first_match,
          lastMatch: d.last_match,
        })),
      });
    }

    if (refcheckLog.fields.year) {
      fieldChecks.push({
        field: "year",
        local: refcheckLog.fields.year.local ?? undefined,
        remote: refcheckLog.fields.year.remote ?? undefined,
        match: refcheckLog.fields.year.match,
        yearDiff: refcheckLog.fields.year.year_diff,
      });
    }

    if (refcheckLog.fields.venue) {
      fieldChecks.push({
        field: "venue",
        local: refcheckLog.fields.venue.local ?? undefined,
        remote: refcheckLog.fields.venue.remote ?? undefined,
        match: refcheckLog.fields.venue.match,
        charDiff: refcheckLog.fields.venue.edit_distance,
      });
    }

    if (refcheckLog.fields.doi) {
      fieldChecks.push({
        field: "doi",
        local: refcheckLog.fields.doi.local ?? undefined,
        remote: refcheckLog.fields.doi.remote ?? undefined,
        match: refcheckLog.fields.doi.match,
      });
    }
  }

  // Build message
  let message: string;
  const hasMismatch = fieldChecks.some((c) => !c.match);
  if (refcheckLog.status === "not_found") {
    message = `No matching paper found in ${provider}`;
  } else if (refcheckLog.status === "error") {
    message = "Error during check";
  } else if (hasMismatch) {
    const mismatches = fieldChecks.filter((c) => !c.match).map((c) => c.field);
    message = `Mismatches in: ${mismatches.join(", ")}`;
  } else {
    const matched = fieldChecks.map((c) => c.field);
    message = matched.length > 0 ? `Confirmed: ${matched.join(", ")}` : "Paper found";
  }

  return {
    objectId: object.id,
    filePath: object.filePath,
    title: object.title || object.id,
    status: refcheckLog.status,
    mismatchSeverity: refcheckLog.mismatch_severity,
    provider,
    checkedAt: refcheckLog.checked_at,
    paperId: refcheckLog.paper_id,
    fieldChecks,
    message,
  };
}

/**
 * Update object frontmatter with check log
 */
async function updateCheckLog(
  object: VaultObject,
  checkLog: CheckLog
): Promise<void> {
  const updatedFrontmatter = {
    ...object.frontmatter,
    check_log: checkLog,
  };

  const content = stringifyMarkdown(updatedFrontmatter, object.body);
  await fs.writeFile(object.filePath, content, "utf8");
}

/**
 * Check bibtex entries against an external provider
 */
export async function checkBibtexEntries(
  objects: VaultObject[],
  options: CheckOptions = {}
): Promise<CheckReport> {
  const providerName = options.provider || "auto";
  const rateLimitDelay = options.rateLimitDelay ?? DEFAULT_RATE_LIMIT_DELAY;
  const log = options.onProgress ?? (() => {});

  const checkedAt = new Date().toISOString();
  const results: CheckResult[] = [];

  // Filter to bibtex entries only
  const bibtexEntries = objects.filter((o) => o.type === "bibtex_entry");

  for (const object of bibtexEntries) {
    // Check if already checked (unless --force)
    const existingLog = object.frontmatter.check_log as CheckLog | undefined;
    if (existingLog && !options.force) {
      results.push({
        objectId: object.id,
        filePath: object.filePath,
        title: object.title || object.id,
        status: "skipped",
        provider: providerName,
        checkedAt,
        fieldChecks: [],
        message: `Already checked on ${existingLog.checked_at}`,
      });
      continue;
    }

    // Convert to refcheck format and check
    log(`Checking: ${object.id}`);
    const entryMetadata = toEntryMetadata(object);

    const refcheckResult = await refcheckEntry(entryMetadata, {
      provider: providerName,
      dryRun: options.dryRun,
      force: options.force,
      includeBibtex: true,
      rateLimit: 0, // We handle rate limiting ourselves
    });

    const checkLog = toCheckLog(refcheckResult.checkLog);
    const result = toCheckResult(object, refcheckResult.checkLog, refcheckResult.provider);
    results.push(result);

    // Update frontmatter unless dry-run
    if (!options.dryRun && result.status !== "error") {
      await updateCheckLog(object, checkLog);
      log(`  Updated: ${result.status}`);
    }

    // Rate limiting
    await sleep(rateLimitDelay);
  }

  // Build summary
  const summary = {
    confirmed: 0,
    mismatches: 0,
    mismatchesMinor: 0,
    mismatchesMajor: 0,
    notFound: 0,
    errors: 0,
    skipped: 0,
  };

  for (const result of results) {
    switch (result.status) {
      case "confirmed":
        summary.confirmed++;
        break;
      case "mismatch":
        summary.mismatches++;
        if (result.mismatchSeverity === "minor") {
          summary.mismatchesMinor++;
        } else if (result.mismatchSeverity === "major") {
          summary.mismatchesMajor++;
        }
        break;
      case "not_found":
        summary.notFound++;
        break;
      case "error":
        summary.errors++;
        break;
      case "skipped":
        summary.skipped++;
        break;
    }
  }

  return {
    provider: providerName,
    checkedAt,
    total: results.length,
    ...summary,
    results,
  };
}
