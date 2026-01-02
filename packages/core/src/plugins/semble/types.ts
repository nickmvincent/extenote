import type { VaultObject } from "../../types.js";

// ─── Configuration ───────────────────────────────────────────────────────────

export interface SembleConfig {
  enabled: boolean;
  /** ATProto PDS URL (default: https://bsky.social) */
  pds?: string;
  /** ATProto identifier (handle or DID) */
  identifier: string;
  /** App password (or use SEMBLE_APP_PASSWORD env var) */
  password?: string;
  /** Collection name to sync with (optional - creates one per project) */
  collection?: string;
  /** Only sync objects matching these types (default: bibtex_entry) */
  types?: string[];
  /** Only sync public objects */
  publicOnly?: boolean;
  /** Only sync objects with this frontmatter field set to true (e.g., 'semble') */
  syncTag?: string;
}

// ─── ATProto Types ───────────────────────────────────────────────────────────

export interface AtprotoSession {
  did: string;
  handle: string;
  accessJwt: string;
  refreshJwt: string;
}

export interface AtprotoRecord {
  uri: string;
  cid: string;
}

export interface AtprotoListResponse<T> {
  records: Array<{
    uri: string;
    cid: string;
    value: T;
  }>;
  cursor?: string;
}

// ─── Semble Lexicon Types (network.cosmik.*) ─────────────────────────────────

export type SembleCardType = "URL" | "NOTE";

export interface SembleUrlMetadata {
  title?: string;
  description?: string;
  author?: string;
  publishedDate?: string;
  siteName?: string;
  imageUrl?: string;
  type?: string;
  retrievedAt?: string;
}

export interface SembleUrlContent {
  url: string;
  metadata?: SembleUrlMetadata;
}

export interface SembleNoteContent {
  text: string;
}

export interface SembleCard {
  $type: "network.cosmik.card";
  type: SembleCardType;
  content: SembleUrlContent | SembleNoteContent;
  url?: string;
  parentCard?: { uri: string; cid: string };
  createdAt?: string;
  originalCard?: { uri: string; cid: string };
}

export interface SembleCollection {
  $type: "network.cosmik.collection";
  name: string;
  description?: string;
  accessType: "OPEN" | "CLOSED";
  collaborators?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface SembleCollectionLink {
  $type: "network.cosmik.collectionLink";
  card: { uri: string; cid: string };
  collection: { uri: string; cid: string };
  originalCardRef?: { uri: string; cid: string };
  /** DID of user who added the card to collection */
  addedBy?: string;
  /** When the card was added to collection */
  addedAt?: string;
  createdAt?: string;
}

// ─── Sync Types ──────────────────────────────────────────────────────────────

export interface SyncedReference {
  /** Local object ID (slug or citation_key) */
  localId: string;
  /** ATProto URI of the synced card */
  uri: string;
  /** ATProto CID */
  cid: string;
  /** Content hash of local object at sync time (for change detection) */
  contentHash?: string;
  /** Last sync timestamp */
  syncedAt: string;
  /** Direction of last sync */
  direction: "push" | "pull";
  /** Whether the object has been deleted locally */
  deleted?: boolean;
  /** Remote CID at last pull (for conflict detection) */
  remoteCid?: string;
  /** Collection URIs this card is linked to (for multi-collection sync) */
  collectionUris?: string[];
}

export interface SyncState {
  /** Project name */
  project: string;
  /** Map of collection name to URI (for multi-collection sync) */
  collectionUris?: Record<string, string>;
  /** Map of local ID to sync info */
  references: Record<string, SyncedReference>;
  /** Last full sync timestamp */
  lastSync?: string;
}

export interface SyncResult {
  pushed: number;
  pulled: number;
  updated: number;
  deleted: number;
  skipped: number;
  conflicts: Array<{ id: string; localHash: string; remoteCid: string }>;
  errors: Array<{ id: string; error: string; direction: "push" | "pull" | "update" | "delete" }>;
  newObjects: VaultObject[];
}

export type MergeStrategy = "local-wins" | "remote-wins" | "skip-conflicts" | "error-on-conflict";

export interface SyncOptions {
  /** Only push (don't pull new cards) */
  pushOnly?: boolean;
  /** Only pull (don't push local changes) */
  pullOnly?: boolean;
  /** Dry run - show what would happen */
  dryRun?: boolean;
  /** Force re-sync even if already synced */
  force?: boolean;
  /** Strategy for handling conflicts (default: skip-conflicts) */
  mergeStrategy?: MergeStrategy;
  /** Sync deletions to remote */
  syncDeletes?: boolean;
  /** Re-link existing synced cards to the project collection */
  relinkCollection?: boolean;
  /** Progress callback */
  onProgress?: (message: string) => void;
}
