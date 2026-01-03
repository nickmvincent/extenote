import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import type { VaultObject, ExtenoteConfig } from "../../types.js";
import { DEFAULT_SLUG_LENGTH, DEFAULT_SHORT_PREVIEW_LENGTH } from "../../constants.js";
import { stringifyMarkdown } from "../../markdown.js";
import { SembleClient } from "./client.js";
import type {
  SembleConfig,
  SembleCard,
  SembleUrlContent,
  SembleUrlMetadata,
  SyncState,
  SyncResult,
  SyncOptions,
  SyncedReference,
} from "./types.js";

// ─── Content Hashing ─────────────────────────────────────────────────────────

/**
 * Recursively sort object keys for canonical JSON serialization
 */
function sortObjectKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys);
  }
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
    sorted[key] = sortObjectKeys((obj as Record<string, unknown>)[key]);
  }
  return sorted;
}

/**
 * Compute a content hash for a card (used for change detection).
 * This hash is based on the card content that would be pushed to Semble.
 */
function computeCardHash(card: Omit<SembleCard, "$type" | "createdAt">): string {
  // Create a canonical representation of the card content
  // Exclude createdAt since it changes on each push
  const toHash = {
    type: card.type,
    content: card.content,
    url: card.url,
    parentCard: card.parentCard,
    originalCard: card.originalCard,
  };

  // Use recursive key sorting for deterministic serialization
  const canonical = JSON.stringify(sortObjectKeys(toHash));

  return crypto.createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

/**
 * Compute a content hash for a VaultObject (based on its card representation).
 * Exported for use in testing and debugging.
 */
export function computeObjectHash(object: VaultObject): string | null {
  const card = objectToCard(object);
  if (!card) return null;
  return computeCardHash(card);
}

// ─── Sync State Management ───────────────────────────────────────────────────

const SYNC_STATE_FILE = ".semble-sync.json";

async function loadSyncState(cwd: string, project: string): Promise<SyncState> {
  const statePath = path.join(cwd, ".extenote", project, SYNC_STATE_FILE);
  try {
    const content = await fs.readFile(statePath, "utf8");
    return JSON.parse(content) as SyncState;
  } catch {
    return { project, references: {} };
  }
}

async function saveSyncState(cwd: string, state: SyncState): Promise<void> {
  const stateDir = path.join(cwd, ".extenote", state.project);
  await fs.mkdir(stateDir, { recursive: true });
  const statePath = path.join(stateDir, SYNC_STATE_FILE);
  await fs.writeFile(statePath, JSON.stringify(state, null, 2), "utf8");
}

// ─── Object <-> Card Mapping ─────────────────────────────────────────────────

/**
 * Get a unique local ID for an object (used for sync tracking)
 */
function getLocalId(object: VaultObject): string {
  // Prefer citation_key for bibtex entries, otherwise use object id
  return (object.frontmatter.citation_key as string) ?? object.id;
}

/** Fields to check for URLs, in priority order */
const URL_FIELDS = ["url", "website", "link", "href"] as const;

/**
 * Extract URL from object frontmatter, checking multiple fields
 */
function extractUrl(frontmatter: Record<string, unknown>): string | undefined {
  for (const field of URL_FIELDS) {
    const value = frontmatter[field];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

/**
 * Extract collection tags from object (e.g., 'collection:data-leverage' → 'data-leverage')
 */
function extractCollectionTags(object: VaultObject): string[] {
  const tags = object.frontmatter.tags;
  if (!Array.isArray(tags)) return [];

  return tags
    .filter((t): t is string => typeof t === "string")
    .filter((t) => t.startsWith("collection:"))
    .map((t) => t.replace("collection:", ""));
}

/**
 * Format collection name with project prefix
 * - Project collection: "shared-references"
 * - Tag collection: "shared-references:data-leverage"
 */
function formatCollectionName(project: string, collectionTag?: string): string {
  if (!collectionTag) return project;
  return `${project}:${collectionTag}`;
}

/**
 * Convert a VaultObject to a Semble URL card.
 * Only objects with URLs are synced - objects without URLs are skipped.
 * (NOTE cards are not currently supported in the Semble UI)
 */
function objectToCard(object: VaultObject): Omit<SembleCard, "$type"> | null {
  const url = extractUrl(object.frontmatter);

  // Only sync objects with URLs
  if (!url) {
    return null;
  }

  const metadata: SembleUrlMetadata = {};

  // Map frontmatter fields to Semble metadata
  if (object.frontmatter.title) {
    metadata.title = String(object.frontmatter.title);
  }
  if (object.frontmatter.abstract) {
    metadata.description = String(object.frontmatter.abstract);
  }
  if (object.frontmatter.author) {
    // Handle both string and array authors
    const author = object.frontmatter.author;
    metadata.author = Array.isArray(author) ? author.join(", ") : String(author);
  }
  if (object.frontmatter.date || object.frontmatter.year) {
    const dateValue = object.frontmatter.date ?? object.frontmatter.year;
    if (dateValue) {
      // Try to parse as ISO date
      const parsed = new Date(String(dateValue));
      if (!isNaN(parsed.getTime())) {
        metadata.publishedDate = parsed.toISOString();
      }
    }
  }
  if (object.frontmatter.journal || object.frontmatter.booktitle) {
    metadata.siteName = String(object.frontmatter.journal ?? object.frontmatter.booktitle);
  }
  if (object.frontmatter.type) {
    metadata.type = String(object.frontmatter.type);
  }

  const content: SembleUrlContent = { url, metadata };

  return {
    type: "URL",
    content,
    url,
  };
}

/**
 * Convert a Semble card to frontmatter for a new object
 */
function cardToFrontmatter(card: SembleCard, uri: string): { frontmatter: Record<string, unknown>; body: string } {
  const baseFrontmatter: Record<string, unknown> = {
    visibility: "private",
    semble_uri: uri,
    semble_synced_at: new Date().toISOString(),
  };

  if (card.type === "URL") {
    const content = card.content as SembleUrlContent;
    const metadata = content.metadata ?? {};

    const frontmatter: Record<string, unknown> = {
      ...baseFrontmatter,
      type: "bibtex_entry",
      url: content.url,
    };

    if (metadata.title) {
      frontmatter.title = metadata.title;
    }
    if (metadata.description) {
      frontmatter.abstract = metadata.description;
    }
    if (metadata.author) {
      frontmatter.author = metadata.author;
    }
    if (metadata.publishedDate) {
      // Extract just the date part
      const date = new Date(metadata.publishedDate);
      if (!isNaN(date.getTime())) {
        frontmatter.date = date.toISOString().split("T")[0];
        frontmatter.year = date.getFullYear();
      }
    }
    if (metadata.siteName) {
      frontmatter.journal = metadata.siteName;
    }

    // Generate citation key from URL
    const urlSlug = new URL(content.url).hostname.replace(/\./g, "-");
    const dateSlug = metadata.publishedDate
      ? new Date(metadata.publishedDate).getFullYear()
      : new Date().getFullYear();
    frontmatter.citation_key = `${urlSlug}-${dateSlug}-${Date.now().toString(36)}`;

    const body = `Imported from Semble on ${new Date().toISOString()}.\n\nOriginal URL: ${content.url}`;
    return { frontmatter, body };
  }

  // NOTE card
  const content = card.content as { text: string };
  const text = content.text ?? "";

  // Try to extract title from first markdown heading
  const titleMatch = text.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : undefined;

  const frontmatter: Record<string, unknown> = {
    ...baseFrontmatter,
    type: "note",
  };

  if (title) {
    frontmatter.title = title;
  }

  // Generate a unique ID for the note
  frontmatter.note_id = `semble-note-${Date.now().toString(36)}`;

  // Use the note text as body, removing the title heading if present
  let body = text;
  if (titleMatch) {
    body = text.replace(/^#\s+.+\n*/, "").trim();
  }

  if (!body) {
    body = `Imported from Semble on ${new Date().toISOString()}.`;
  }

  return { frontmatter, body };
}

/**
 * Generate a filename for a new object from a card
 */
function cardToFilename(card: SembleCard): string {
  if (card.type === "URL") {
    const content = card.content as SembleUrlContent;
    const metadata = content.metadata ?? {};

    // Try to create a meaningful slug from title or URL
    let slug = "reference";
    if (metadata.title) {
      slug = metadata.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, DEFAULT_SLUG_LENGTH);
    } else {
      try {
        const url = new URL(content.url);
        slug = url.hostname.replace(/\./g, "-");
      } catch {
        // Use default
      }
    }

    return `${slug}.md`;
  }

  // NOTE card
  const content = card.content as { text: string };
  const text = content.text ?? "";

  // Try to extract title from first markdown heading for slug
  const titleMatch = text.match(/^#\s+(.+)$/m);
  let slug = "note";
  if (titleMatch) {
    slug = titleMatch[1]
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, DEFAULT_SLUG_LENGTH);
  }

  // Add timestamp to ensure uniqueness
  return `${slug}-${Date.now().toString(36)}.md`;
}

// ─── Sync Operations ─────────────────────────────────────────────────────────

export interface SyncContext {
  client: SembleClient;
  config: SembleConfig;
  extenoteConfig: ExtenoteConfig;
  cwd: string;
  project: string;
  state: SyncState;
  options: SyncOptions;
  /** Map of collection name → {uri, cid} for multi-collection sync */
  collections: Record<string, { uri: string; cid: string }>;
}

/**
 * Ensure multiple collections exist (project + all collection tags from objects)
 * Returns a map of collection name → {uri, cid}
 */
async function ensureCollections(
  client: SembleClient,
  state: SyncState,
  project: string,
  objects: VaultObject[],
  log: (msg: string) => void,
  dryRun?: boolean
): Promise<Record<string, { uri: string; cid: string }>> {
  const collections: Record<string, { uri: string; cid: string }> = {};

  // Initialize collectionUris map in state if needed
  if (!state.collectionUris) {
    state.collectionUris = {};
  }

  // Collect all unique collection names needed
  const collectionNames = new Set<string>();
  collectionNames.add(formatCollectionName(project)); // Project collection

  for (const obj of objects) {
    const tags = extractCollectionTags(obj);
    for (const tag of tags) {
      collectionNames.add(formatCollectionName(project, tag));
    }
  }

  log(`  Need ${collectionNames.size} collections: ${[...collectionNames].join(", ")}`);

  // Ensure each collection exists
  for (const name of collectionNames) {
    // Check if we have it cached in state
    const cachedUri = state.collectionUris[name];
    if (cachedUri) {
      // Verify it still exists
      const existing = await client.findCollectionByName(name);
      if (existing) {
        collections[name] = existing;
        continue;
      }
      // Collection was deleted, clear cache
      delete state.collectionUris[name];
    }

    // Look for existing collection
    const existing = await client.findCollectionByName(name);
    if (existing) {
      collections[name] = existing;
      state.collectionUris[name] = existing.uri;
      log(`  Found collection: ${name}`);
      continue;
    }

    // Create new collection
    if (dryRun) {
      log(`  [dry-run] Would create collection: ${name}`);
      continue;
    }

    const isProjectCollection = name === project;
    const description = isProjectCollection
      ? `Extenote project: ${name}`
      : `Extenote collection: ${name}`;

    log(`  Creating collection: ${name}`);
    const result = await client.createCollection(name, description);
    collections[name] = { uri: result.uri, cid: result.cid };
    state.collectionUris[name] = result.uri;
  }

  return collections;
}

/**
 * List all collections for the authenticated user
 */
export async function listCollections(sembleConfig: SembleConfig): Promise<Array<{ name: string; uri: string; description?: string }>> {
  const client = new SembleClient(sembleConfig);
  await client.login();
  const response = await client.listCollections();
  return response.records.map((r) => ({
    name: r.value.name,
    uri: r.uri,
    description: r.value.description,
  }));
}

interface PushResult {
  pushed: number;
  updated: number;
  skipped: number;
  conflicts: SyncResult["conflicts"];
  errors: SyncResult["errors"];
}

interface DeleteResult {
  deleted: number;
  errors: SyncResult["errors"];
}

/**
 * Detect locally deleted objects and remove from remote
 */
async function processDeletes(
  ctx: SyncContext,
  currentObjects: VaultObject[]
): Promise<DeleteResult> {
  const { client, state, options } = ctx;
  const log = options.onProgress ?? (() => {});

  let deleted = 0;
  const errors: SyncResult["errors"] = [];

  // Build set of current local IDs
  const currentLocalIds = new Set(currentObjects.map(getLocalId));

  // Find references that were pushed but no longer exist locally
  const deletedRefs = Object.entries(state.references).filter(([localId, ref]) => {
    // Only consider refs that were pushed (not pulled)
    // and where the local object no longer exists
    return ref.direction === "push" && !ref.deleted && !currentLocalIds.has(localId);
  });

  if (!deletedRefs.length) {
    return { deleted: 0, errors: [] };
  }

  log(`  Found ${deletedRefs.length} locally deleted objects`);

  for (const [localId, ref] of deletedRefs) {
    if (options.dryRun) {
      log(`  [dry-run] Would delete from remote: ${localId}`);
      deleted++;
      continue;
    }

    try {
      log(`  Deleting from remote: ${localId}`);
      const { rkey } = SembleClient.parseUri(ref.uri);
      const success = await client.deleteRecord("network.cosmik.card", rkey);

      if (success) {
        // Mark as deleted in sync state (don't remove entirely to track history)
        state.references[localId] = {
          ...ref,
          deleted: true,
          syncedAt: new Date().toISOString(),
        };
        deleted++;
      } else {
        errors.push({
          id: localId,
          error: "Failed to delete remote record",
          direction: "push",
        });
      }
    } catch (err) {
      errors.push({
        id: localId,
        error: err instanceof Error ? err.message : String(err),
        direction: "push",
      });
    }
  }

  return { deleted, errors };
}

interface RelinkResult {
  linked: number;
  unlinked: number;
  alreadyLinked: number;
  errors: SyncResult["errors"];
}

/**
 * Re-link existing synced cards to all their appropriate collections.
 * Handles multi-collection sync: links to new collections, unlinks from removed ones.
 */
async function relinkCardsToCollections(
  ctx: SyncContext,
  objects: VaultObject[]
): Promise<RelinkResult> {
  const { client, state, options, collections, project } = ctx;
  const log = options.onProgress ?? (() => {});

  if (Object.keys(collections).length === 0) {
    log("  No collections configured, skipping relink");
    return { linked: 0, unlinked: 0, alreadyLinked: 0, errors: [] };
  }

  let linked = 0;
  let unlinked = 0;
  let alreadyLinked = 0;
  const errors: SyncResult["errors"] = [];

  // Build a map of localId → object for quick lookup
  const objectMap = new Map<string, VaultObject>();
  for (const obj of objects) {
    objectMap.set(getLocalId(obj), obj);
  }

  // Get all existing collection links
  log("  Fetching existing collection links...");
  const existingLinks = await client.getAllCollectionLinks();

  // Build map of cardUri → Set of linked collection URIs
  const cardToLinkedCollections = new Map<string, Set<string>>();
  for (const link of existingLinks) {
    const cardUri = link.value.card.uri;
    if (!cardToLinkedCollections.has(cardUri)) {
      cardToLinkedCollections.set(cardUri, new Set());
    }
    cardToLinkedCollections.get(cardUri)!.add(link.value.collection.uri);
  }

  // Check each synced reference that was PUSHED from this project
  const refs = Object.entries(state.references).filter(
    ([, ref]) => !ref.deleted && ref.uri && ref.direction === "push"
  );

  log(`  Checking ${refs.length} pushed cards for collection links...`);

  for (const [localId, ref] of refs) {
    // Find the corresponding object to get its current tags
    const obj = objectMap.get(localId);
    if (!obj) {
      // Object no longer exists locally, skip
      continue;
    }

    // Determine which collections this card should be in
    const collectionTags = extractCollectionTags(obj);
    const desiredCollectionNames = new Set([
      formatCollectionName(project),
      ...collectionTags.map((t) => formatCollectionName(project, t)),
    ]);

    // Get URIs for desired collections
    const desiredCollectionUris = new Set<string>();
    for (const name of desiredCollectionNames) {
      const coll = collections[name];
      if (coll) desiredCollectionUris.add(coll.uri);
    }

    // Get current linked collections
    const currentlyLinked = cardToLinkedCollections.get(ref.uri) ?? new Set();

    // Link to new collections
    for (const name of desiredCollectionNames) {
      const coll = collections[name];
      if (coll && !currentlyLinked.has(coll.uri)) {
        if (options.dryRun) {
          log(`  [dry-run] Would link ${localId} to ${name}`);
          linked++;
          continue;
        }

        try {
          log(`  Linking ${localId} to ${name}`);
          const cardData = await client.getCard(ref.uri);
          if (!cardData) {
            errors.push({ id: localId, error: "Card not found on remote", direction: "push" });
            continue;
          }
          await client.linkCardToCollection(ref.uri, cardData.cid, coll.uri, coll.cid);
          linked++;
        } catch (err) {
          errors.push({
            id: localId,
            error: err instanceof Error ? err.message : String(err),
            direction: "push",
          });
        }
      } else if (coll && currentlyLinked.has(coll.uri)) {
        alreadyLinked++;
      }
    }

    // Unlink from removed collections (only for collections we know about)
    for (const collUri of currentlyLinked) {
      // Check if this is one of our managed collections
      const isOurCollection = Object.values(collections).some((c) => c.uri === collUri);
      if (isOurCollection && !desiredCollectionUris.has(collUri)) {
        if (options.dryRun) {
          log(`  [dry-run] Would unlink ${localId} from ${collUri}`);
          unlinked++;
          continue;
        }

        try {
          log(`  Unlinking ${localId} from ${collUri}`);
          await client.unlinkCardFromCollection(ref.uri, collUri);
          unlinked++;
        } catch (err) {
          errors.push({
            id: localId,
            error: err instanceof Error ? err.message : String(err),
            direction: "push",
          });
        }
      }
    }

    // Update sync state with current collections
    state.references[localId] = {
      ...ref,
      collectionUris: [...desiredCollectionUris],
    };
  }

  return { linked, unlinked, alreadyLinked, errors };
}

/**
 * Check if remote has changed since last sync
 */
async function checkRemoteChanged(
  client: SembleClient,
  syncRef: SyncedReference
): Promise<{ changed: boolean; currentCid?: string }> {
  try {
    const remote = await client.getCard(syncRef.uri);
    if (!remote) {
      // Remote was deleted
      return { changed: true, currentCid: undefined };
    }
    // Compare CID with what we had at last sync
    const lastKnownCid = syncRef.remoteCid ?? syncRef.cid;
    return {
      changed: remote.cid !== lastKnownCid,
      currentCid: remote.cid,
    };
  } catch {
    // If we can't fetch, assume no change to be safe
    return { changed: false };
  }
}

/**
 * Push local objects to Semble
 */
async function pushObjects(
  ctx: SyncContext,
  objects: VaultObject[]
): Promise<PushResult> {
  const { client, state, options, project } = ctx;
  const log = options.onProgress ?? (() => {});
  const mergeStrategy = options.mergeStrategy ?? "skip-conflicts";

  let pushed = 0;
  let updated = 0;
  let skipped = 0;
  const conflicts: SyncResult["conflicts"] = [];
  const errors: SyncResult["errors"] = [];

  for (const object of objects) {
    const localId = getLocalId(object);
    const existing = state.references[localId];

    const card = objectToCard(object);
    if (!card) {
      log(`  Skipping ${localId} (no URL)`);
      skipped++;
      continue;
    }

    const currentHash = computeCardHash(card);

    // Check if this is a new object or an existing one
    if (existing) {
      // Check if local content has changed since last sync
      const localChanged = existing.contentHash !== currentHash;

      if (!localChanged && !options.force) {
        // No local changes, skip
        skipped++;
        continue;
      }

      // Local has changed - check if remote has also changed (conflict detection)
      if (localChanged && !options.force) {
        const { changed: remoteChanged, currentCid } = await checkRemoteChanged(client, existing);

        if (remoteChanged) {
          // CONFLICT: Both local and remote have changed
          log(`  Conflict detected: ${localId}`);
          conflicts.push({
            id: localId,
            localHash: currentHash,
            remoteCid: currentCid ?? "deleted",
          });

          switch (mergeStrategy) {
            case "local-wins":
              // Continue to update with local version
              log(`  Resolving conflict: local-wins for ${localId}`);
              break;
            case "remote-wins":
              // Skip this object, remote version is kept
              log(`  Resolving conflict: remote-wins for ${localId}`);
              skipped++;
              continue;
            case "error-on-conflict":
              errors.push({
                id: localId,
                error: `Conflict detected: both local and remote have changed`,
                direction: "update",
              });
              continue;
            case "skip-conflicts":
            default:
              log(`  Skipping conflict: ${localId}`);
              skipped++;
              continue;
          }
        }
      }

      // Update existing card
      if (options.dryRun) {
        log(`  [dry-run] Would update: ${localId}`);
        updated++;
        continue;
      }

      try {
        log(`  Updating: ${localId}`);
        const result = await client.updateCard(existing.uri, card);

        // Handle collection membership changes
        const collectionTags = extractCollectionTags(object);
        const desiredCollectionNames = new Set([
          formatCollectionName(project),
          ...collectionTags.map((t) => formatCollectionName(project, t)),
        ]);

        // Get URIs for desired collections
        const desiredCollectionUris = new Set<string>();
        for (const name of desiredCollectionNames) {
          const coll = ctx.collections[name];
          if (coll) desiredCollectionUris.add(coll.uri);
        }

        // Get previous collection URIs
        const previousCollectionUris = new Set(existing.collectionUris ?? []);

        // Link to new collections
        for (const name of desiredCollectionNames) {
          const coll = ctx.collections[name];
          if (coll && !previousCollectionUris.has(coll.uri)) {
            try {
              log(`    Linking to collection: ${name}`);
              await client.linkCardToCollection(result.uri, result.cid, coll.uri, coll.cid);
            } catch (linkErr) {
              log(`    Warning: Failed to link to ${name}: ${linkErr}`);
            }
          }
        }

        // Unlink from removed collections
        for (const prevUri of previousCollectionUris) {
          if (!desiredCollectionUris.has(prevUri)) {
            try {
              log(`    Unlinking from collection: ${prevUri}`);
              await client.unlinkCardFromCollection(existing.uri, prevUri);
            } catch (unlinkErr) {
              log(`    Warning: Failed to unlink from ${prevUri}: ${unlinkErr}`);
            }
          }
        }

        state.references[localId] = {
          ...existing,
          cid: result.cid,
          contentHash: currentHash,
          remoteCid: result.cid,
          syncedAt: new Date().toISOString(),
          direction: "push",
          collectionUris: [...desiredCollectionUris],
        };

        updated++;
      } catch (err) {
        errors.push({
          id: localId,
          error: err instanceof Error ? err.message : String(err),
          direction: "update",
        });
      }
    } else {
      // New object - create card
      if (options.dryRun) {
        log(`  [dry-run] Would push: ${localId}`);
        pushed++;
        continue;
      }

      try {
        log(`  Pushing: ${localId}`);
        const result = await client.createCard(card);

        // Determine which collections this card should be in
        const collectionTags = extractCollectionTags(object);
        const desiredCollectionNames = [
          formatCollectionName(project),  // Always include project collection
          ...collectionTags.map((t) => formatCollectionName(project, t)),
        ];

        // Link to all relevant collections
        const linkedCollectionUris: string[] = [];
        for (const collName of desiredCollectionNames) {
          const coll = ctx.collections[collName];
          if (coll) {
            try {
              await client.linkCardToCollection(result.uri, result.cid, coll.uri, coll.cid);
              linkedCollectionUris.push(coll.uri);
            } catch (linkErr) {
              log(`  Warning: Failed to link to ${collName}: ${linkErr}`);
            }
          }
        }

        state.references[localId] = {
          localId,
          uri: result.uri,
          cid: result.cid,
          contentHash: currentHash,
          remoteCid: result.cid,
          syncedAt: new Date().toISOString(),
          direction: "push",
          collectionUris: linkedCollectionUris,
        };

        pushed++;
      } catch (err) {
        errors.push({
          id: localId,
          error: err instanceof Error ? err.message : String(err),
          direction: "push",
        });
      }
    }
  }

  return { pushed, updated, skipped, conflicts, errors };
}

/**
 * Pull cards from Semble and create local objects
 */
async function pullCards(
  ctx: SyncContext,
  existingObjects: VaultObject[]
): Promise<{ pulled: number; skipped: number; errors: SyncResult["errors"]; newObjects: VaultObject[] }> {
  const { client, extenoteConfig, cwd, project, state, options } = ctx;
  const log = options.onProgress ?? (() => {});

  let pulled = 0;
  let skipped = 0;
  const errors: SyncResult["errors"] = [];
  const newObjects: VaultObject[] = [];

  // Get all cards from Semble
  log("  Fetching cards from Semble...");
  const cards = await client.getAllCards();
  log(`  Found ${cards.length} cards`);

  // Build set of already-synced URIs
  const syncedUris = new Set(Object.values(state.references).map((r) => r.uri));

  // Build set of existing URLs in local objects (check all URL fields)
  const existingUrls = new Set(
    existingObjects
      .map((o) => extractUrl(o.frontmatter))
      .filter((url): url is string => url !== undefined)
  );

  for (const { uri, cid, value: card } of cards) {
    // Skip if already synced
    if (syncedUris.has(uri)) {
      skipped++;
      continue;
    }

    // For URL cards, skip if we already have this URL locally
    if (card.type === "URL") {
      const content = card.content as SembleUrlContent;
      if (existingUrls.has(content.url)) {
        skipped++;
        continue;
      }
    }

    // Get display title for logging
    const displayTitle = card.type === "URL"
      ? ((card.content as SembleUrlContent).metadata?.title ?? (card.content as SembleUrlContent).url)
      : ((card.content as { text: string }).text?.slice(0, DEFAULT_SHORT_PREVIEW_LENGTH) ?? "note");

    if (options.dryRun) {
      log(`  [dry-run] Would pull ${card.type}: ${displayTitle}`);
      pulled++;
      continue;
    }

    try {
      log(`  Pulling ${card.type}: ${displayTitle}`);

      // Create frontmatter and body from card
      const { frontmatter, body } = cardToFrontmatter(card, uri);
      const filename = cardToFilename(card);

      // Determine output directory based on card type
      const profile = extenoteConfig.projectProfiles?.find((p) => p.name === project);
      const sourceId = profile?.sourceIds?.[0];
      const source = extenoteConfig.sources.find((s) => s.id === sourceId);

      // Use different subdirectory for notes vs references
      const subdir = card.type === "URL" ? "references" : "notes";

      let outputDir: string;
      if (source && "root" in source) {
        outputDir = path.join(cwd, source.root as string, project, subdir);
      } else {
        outputDir = path.join(cwd, "content", project, subdir);
      }

      await fs.mkdir(outputDir, { recursive: true });

      // Write the new file
      const filePath = path.join(outputDir, filename);
      const markdown = stringifyMarkdown(frontmatter, body);
      await fs.writeFile(filePath, markdown, "utf8");

      // Track in sync state (compute hash from the card for future change detection)
      const localId = (frontmatter.citation_key ?? frontmatter.note_id) as string;
      const cardForHash = { type: card.type, content: card.content, url: card.url } as Omit<SembleCard, "$type" | "createdAt">;
      state.references[localId] = {
        localId,
        uri,
        cid,
        contentHash: computeCardHash(cardForHash),
        remoteCid: cid,
        syncedAt: new Date().toISOString(),
        direction: "pull",
      };

      // Create a minimal VaultObject for the result
      const objectType = card.type === "URL" ? "bibtex_entry" : "note";
      newObjects.push({
        id: localId,
        type: objectType,
        title: String(frontmatter.title ?? filename),
        sourceId: sourceId ?? "unknown",
        project,
        filePath,
        relativePath: path.relative(cwd, filePath),
        frontmatter,
        body,
        mtime: Date.now(),
        visibility: "private",
      });

      pulled++;
    } catch (err) {
      errors.push({
        id: uri,
        error: err instanceof Error ? err.message : String(err),
        direction: "pull",
      });
    }
  }

  return { pulled, skipped, errors, newObjects };
}

// ─── Main Sync Function ──────────────────────────────────────────────────────

export interface SyncInput {
  /** Objects to sync (filtered by project/type) */
  objects: VaultObject[];
  /** Extenote config */
  config: ExtenoteConfig;
  /** Semble config from project profile */
  sembleConfig: SembleConfig;
  /** Working directory */
  cwd: string;
  /** Project name */
  project: string;
  /** Sync options */
  options?: SyncOptions;
}

/**
 * Synchronize references with Semble
 */
export async function syncWithSemble(input: SyncInput): Promise<SyncResult> {
  const { objects, config, sembleConfig, cwd, project, options = {} } = input;
  const log = options.onProgress ?? (() => {});

  // Validate config
  if (!sembleConfig.identifier) {
    throw new Error("Semble identifier is required");
  }

  // Load sync state
  const state = await loadSyncState(cwd, project);

  // Create client
  const client = new SembleClient(sembleConfig);

  log(`Syncing with Semble as ${sembleConfig.identifier}...`);

  // Login (needed for all operations including dry-run collection check)
  await client.login();
  log(`  Logged in as ${client.handle} (${client.did})`);

  // Filter objects by configured types
  const allowedTypes = new Set(sembleConfig.types ?? ["bibtex_entry"]);
  let filteredObjects = objects.filter((o) => allowedTypes.has(o.type));

  // Optionally filter by visibility
  if (sembleConfig.publicOnly) {
    filteredObjects = filteredObjects.filter((o) => o.visibility === "public");
  }

  // Filter by syncTag if configured (e.g., only sync objects with `semble: true`)
  if (sembleConfig.syncTag) {
    const tagField = sembleConfig.syncTag;
    const beforeCount = filteredObjects.length;
    filteredObjects = filteredObjects.filter((o) => {
      const tagValue = o.frontmatter[tagField];
      return tagValue === true || tagValue === "true";
    });
    log(`  Filtered by syncTag '${tagField}': ${beforeCount} → ${filteredObjects.length} objects`);
  }

  const syncObjects = filteredObjects;
  log(`  Found ${syncObjects.length} objects to sync`);

  // Set up collections (project + all collection tags from objects)
  let collections: Record<string, { uri: string; cid: string }> = {};

  if (sembleConfig.collection !== null) {
    collections = await ensureCollections(client, state, project, syncObjects, log, options.dryRun);
  }

  const ctx: SyncContext = {
    client,
    config: sembleConfig,
    extenoteConfig: config,
    cwd,
    project,
    state,
    options,
    collections,
  };

  let pushResult: PushResult = {
    pushed: 0,
    updated: 0,
    skipped: 0,
    conflicts: [],
    errors: [],
  };
  let pullResult = { pulled: 0, skipped: 0, errors: [] as SyncResult["errors"], newObjects: [] as VaultObject[] };
  let deleteResult: DeleteResult = { deleted: 0, errors: [] };

  // Push local objects to Semble
  if (!options.pullOnly) {
    log("Pushing to Semble...");
    pushResult = await pushObjects(ctx, syncObjects);

    if (pushResult.updated > 0) {
      log(`  Updated ${pushResult.updated} existing cards`);
    }
    if (pushResult.conflicts.length > 0) {
      log(`  Found ${pushResult.conflicts.length} conflicts`);
    }
  }

  // Process deletions if enabled
  if (options.syncDeletes && !options.pullOnly) {
    log("Processing deletions...");
    deleteResult = await processDeletes(ctx, syncObjects);
    if (deleteResult.deleted > 0) {
      log(`  Deleted ${deleteResult.deleted} cards from remote`);
    }
  }

  // Re-link existing cards to collections if requested
  if (options.relinkCollection) {
    log("Re-linking cards to collections...");
    const relinkResult = await relinkCardsToCollections(ctx, syncObjects);
    if (relinkResult.linked > 0) {
      log(`  Linked ${relinkResult.linked} cards to collections`);
    }
    if (relinkResult.unlinked > 0) {
      log(`  Unlinked ${relinkResult.unlinked} cards from collections`);
    }
    if (relinkResult.alreadyLinked > 0) {
      log(`  ${relinkResult.alreadyLinked} cards already linked`);
    }
    if (relinkResult.errors.length > 0) {
      pushResult.errors.push(...relinkResult.errors);
    }
  }

  // Pull cards from Semble
  if (!options.pushOnly) {
    log("Pulling from Semble...");
    pullResult = await pullCards(ctx, objects);
  }

  // Collect all errors
  const allErrors = [...pushResult.errors, ...pullResult.errors, ...deleteResult.errors];

  // Save sync state - handle failures gracefully to avoid losing sync result
  if (!options.dryRun) {
    state.lastSync = new Date().toISOString();
    try {
      await saveSyncState(cwd, state);
    } catch (err) {
      // State save failed - add error but still return results
      // The next sync may re-attempt some operations, but this is safer than losing the result
      allErrors.push({
        id: "__sync_state__",
        error: `Failed to save sync state: ${err instanceof Error ? err.message : String(err)}. Some operations may be retried on next sync.`,
        direction: "push",
      });
      log(`  Warning: Failed to save sync state - ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    pushed: pushResult.pushed,
    pulled: pullResult.pulled,
    updated: pushResult.updated,
    deleted: deleteResult.deleted,
    skipped: pushResult.skipped + pullResult.skipped,
    conflicts: pushResult.conflicts,
    errors: allErrors,
    newObjects: pullResult.newObjects,
  };
}

/**
 * Validate Semble configuration
 */
export function validateSembleConfig(config: SembleConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.identifier) {
    errors.push("identifier is required (ATProto handle or DID)");
  }

  const password = config.password ?? process.env.SEMBLE_APP_PASSWORD ?? process.env.ATPROTO_APP_PASSWORD;
  if (!password) {
    errors.push("password or SEMBLE_APP_PASSWORD/ATPROTO_APP_PASSWORD env required");
  }

  return { valid: errors.length === 0, errors };
}
