import type {
  SembleConfig,
  AtprotoSession,
  AtprotoRecord,
  AtprotoListResponse,
  SembleCard,
  SembleCollection,
  SembleCollectionLink,
} from "./types.js";

const LEXICON_CARD = "network.cosmik.card";
const LEXICON_COLLECTION = "network.cosmik.collection";
const LEXICON_COLLECTION_LINK = "network.cosmik.collectionLink";

/**
 * ATProto client for Semble operations
 */
export class SembleClient {
  private session: AtprotoSession | null = null;
  private config: SembleConfig;

  constructor(config: SembleConfig) {
    this.config = config;
  }

  get pds(): string {
    return this.config.pds ?? "https://bsky.social";
  }

  get password(): string | undefined {
    return this.config.password ?? process.env.SEMBLE_APP_PASSWORD ?? process.env.ATPROTO_APP_PASSWORD;
  }

  get did(): string | null {
    return this.session?.did ?? null;
  }

  get handle(): string | null {
    return this.session?.handle ?? null;
  }

  // ─── Authentication ──────────────────────────────────────────────────────

  async login(): Promise<AtprotoSession> {
    if (this.session) {
      return this.session;
    }

    const password = this.password;
    if (!password) {
      throw new Error("No ATProto app password available. Set SEMBLE_APP_PASSWORD or ATPROTO_APP_PASSWORD.");
    }

    const response = await fetch(`${this.pds}/xrpc/com.atproto.server.createSession`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifier: this.config.identifier,
        password,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`ATProto login failed: ${response.status} ${error}`);
    }

    this.session = await response.json() as AtprotoSession;
    return this.session;
  }

  private async authHeaders(): Promise<Record<string, string>> {
    const session = await this.login();
    return {
      Authorization: `Bearer ${session.accessJwt}`,
      "Content-Type": "application/json",
    };
  }

  // ─── Generic Record Operations ───────────────────────────────────────────

  async createRecord<T extends object>(
    collection: string,
    record: T,
    rkey?: string
  ): Promise<AtprotoRecord> {
    const session = await this.login();
    const headers = await this.authHeaders();

    const body: Record<string, unknown> = {
      repo: session.did,
      collection,
      record,
    };

    if (rkey) {
      body.rkey = rkey;
    }

    const response = await fetch(`${this.pds}/xrpc/com.atproto.repo.createRecord`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create record: ${response.status} ${error}`);
    }

    return await response.json() as AtprotoRecord;
  }

  async getRecord<T>(collection: string, rkey: string): Promise<T | null> {
    const session = await this.login();

    const params = new URLSearchParams({
      repo: session.did,
      collection,
      rkey,
    });

    const response = await fetch(`${this.pds}/xrpc/com.atproto.repo.getRecord?${params}`);

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Failed to get record: ${response.status}`);
    }

    const data = await response.json() as { value: T };
    return data.value;
  }

  async listRecords<T>(
    collection: string,
    limit = 100,
    cursor?: string
  ): Promise<AtprotoListResponse<T>> {
    const session = await this.login();

    const params = new URLSearchParams({
      repo: session.did,
      collection,
      limit: String(limit),
    });

    if (cursor) {
      params.set("cursor", cursor);
    }

    const response = await fetch(
      `${this.pds}/xrpc/com.atproto.repo.listRecords?${params}`,
      { headers: await this.authHeaders() }
    );

    if (!response.ok) {
      throw new Error(`Failed to list records: ${response.status}`);
    }

    return await response.json() as AtprotoListResponse<T>;
  }

  async deleteRecord(collection: string, rkey: string): Promise<boolean> {
    const session = await this.login();
    const headers = await this.authHeaders();

    const response = await fetch(`${this.pds}/xrpc/com.atproto.repo.deleteRecord`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        repo: session.did,
        collection,
        rkey,
      }),
    });

    return response.ok;
  }

  /**
   * Update an existing record (uses putRecord which creates or updates)
   */
  async putRecord<T extends object>(
    collection: string,
    rkey: string,
    record: T,
    swapRecord?: string // CID of the record to swap (for compare-and-swap)
  ): Promise<AtprotoRecord> {
    const session = await this.login();
    const headers = await this.authHeaders();

    const body: Record<string, unknown> = {
      repo: session.did,
      collection,
      rkey,
      record,
    };

    if (swapRecord) {
      body.swapRecord = swapRecord;
    }

    const response = await fetch(`${this.pds}/xrpc/com.atproto.repo.putRecord`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to update record: ${response.status} ${error}`);
    }

    return await response.json() as AtprotoRecord;
  }

  /**
   * Get a record by AT-URI
   */
  async getRecordByUri<T>(uri: string): Promise<{ value: T; cid: string } | null> {
    const { did, collection, rkey } = SembleClient.parseUri(uri);

    const params = new URLSearchParams({
      repo: did,
      collection,
      rkey,
    });

    const response = await fetch(
      `${this.pds}/xrpc/com.atproto.repo.getRecord?${params}`,
      { headers: await this.authHeaders() }
    );

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Failed to get record: ${response.status}`);
    }

    const data = await response.json() as { value: T; cid: string };
    return data;
  }

  // ─── Card Operations ─────────────────────────────────────────────────────

  async createCard(card: Omit<SembleCard, "$type">, rkey?: string): Promise<AtprotoRecord> {
    const record: SembleCard = {
      $type: LEXICON_CARD,
      ...card,
      createdAt: card.createdAt ?? new Date().toISOString(),
    };
    return this.createRecord(LEXICON_CARD, record, rkey ?? this.generateTid());
  }

  /**
   * Update an existing card by URI
   */
  async updateCard(
    uri: string,
    card: Omit<SembleCard, "$type">,
    swapCid?: string
  ): Promise<AtprotoRecord> {
    const { rkey } = SembleClient.parseUri(uri);
    const record: SembleCard = {
      $type: LEXICON_CARD,
      ...card,
      createdAt: card.createdAt ?? new Date().toISOString(),
    };
    return this.putRecord(LEXICON_CARD, rkey, record, swapCid);
  }

  /**
   * Get a card by URI
   */
  async getCard(uri: string): Promise<{ value: SembleCard; cid: string } | null> {
    return this.getRecordByUri<SembleCard>(uri);
  }

  async listCards(limit = 100, cursor?: string): Promise<AtprotoListResponse<SembleCard>> {
    return this.listRecords<SembleCard>(LEXICON_CARD, limit, cursor);
  }

  async getAllCards(): Promise<Array<{ uri: string; cid: string; value: SembleCard }>> {
    const allRecords: Array<{ uri: string; cid: string; value: SembleCard }> = [];
    let cursor: string | undefined;

    do {
      const response = await this.listCards(100, cursor);
      allRecords.push(...response.records);
      cursor = response.cursor;
    } while (cursor);

    return allRecords;
  }

  // ─── Collection Operations ───────────────────────────────────────────────

  async createCollection(
    name: string,
    description?: string,
    accessType: "OPEN" | "CLOSED" = "OPEN"
  ): Promise<AtprotoRecord> {
    const record: SembleCollection = {
      $type: LEXICON_COLLECTION,
      name,
      description,
      accessType,
      createdAt: new Date().toISOString(),
    };
    return this.createRecord(LEXICON_COLLECTION, record, this.generateTid());
  }

  async listCollections(): Promise<AtprotoListResponse<SembleCollection>> {
    return this.listRecords<SembleCollection>(LEXICON_COLLECTION, 100);
  }

  async findCollectionByName(name: string): Promise<{ uri: string; cid: string } | null> {
    const collections = await this.listCollections();
    const match = collections.records.find((r) => r.value.name === name);
    return match ? { uri: match.uri, cid: match.cid } : null;
  }

  // ─── Collection Link Operations ──────────────────────────────────────────

  async linkCardToCollection(
    cardUri: string,
    cardCid: string,
    collectionUri: string,
    collectionCid: string
  ): Promise<AtprotoRecord> {
    const now = new Date().toISOString();
    const record: SembleCollectionLink = {
      $type: LEXICON_COLLECTION_LINK,
      card: { uri: cardUri, cid: cardCid },
      collection: { uri: collectionUri, cid: collectionCid },
      addedBy: this.did ?? undefined,
      addedAt: now,
      createdAt: now,
    };
    return this.createRecord(LEXICON_COLLECTION_LINK, record, this.generateTid());
  }

  async listCollectionLinks(): Promise<AtprotoListResponse<SembleCollectionLink>> {
    return this.listRecords<SembleCollectionLink>(LEXICON_COLLECTION_LINK, 100);
  }

  /**
   * Get all collection links (handles pagination)
   */
  async getAllCollectionLinks(): Promise<Array<{ uri: string; cid: string; value: SembleCollectionLink }>> {
    const allLinks: Array<{ uri: string; cid: string; value: SembleCollectionLink }> = [];
    let cursor: string | undefined;

    do {
      const response = await this.listRecords<SembleCollectionLink>(LEXICON_COLLECTION_LINK, 100, cursor);
      allLinks.push(...response.records);
      cursor = response.cursor;
    } while (cursor);

    return allLinks;
  }

  /**
   * Find a collection link by card and collection URIs
   */
  async findCollectionLink(
    cardUri: string,
    collectionUri: string
  ): Promise<{ uri: string; rkey: string } | null> {
    const links = await this.getAllCollectionLinks();
    const match = links.find(
      (link) =>
        link.value.card.uri === cardUri && link.value.collection.uri === collectionUri
    );
    if (!match) return null;
    const { rkey } = SembleClient.parseUri(match.uri);
    return { uri: match.uri, rkey };
  }

  /**
   * Unlink a card from a collection by deleting the collection link record
   */
  async unlinkCardFromCollection(cardUri: string, collectionUri: string): Promise<boolean> {
    const link = await this.findCollectionLink(cardUri, collectionUri);
    if (!link) {
      // Link doesn't exist, nothing to do
      return true;
    }
    return this.deleteRecord(LEXICON_COLLECTION_LINK, link.rkey);
  }

  // ─── Utilities ───────────────────────────────────────────────────────────

  /**
   * Generate a TID (timestamp identifier) for ATProto records.
   */
  generateTid(): string {
    const now = Date.now() * 1000; // microseconds
    const clockId = Math.floor(Math.random() * 1024);
    const tid = (BigInt(now) << 10n) | BigInt(clockId);
    return this.base32Encode(tid);
  }

  private base32Encode(num: bigint): string {
    const chars = "234567abcdefghijklmnopqrstuvwxyz";
    let result = "";
    let n = num;
    for (let i = 0; i < 13; i++) {
      result = chars[Number(n & 31n)] + result;
      n >>= 5n;
    }
    return result;
  }

  /**
   * Parse an AT-URI into components
   */
  static parseUri(uri: string): { did: string; collection: string; rkey: string } {
    // at://did:plc:xxx/network.cosmik.card/rkey
    const parts = uri.replace("at://", "").split("/");
    return {
      did: parts[0],
      collection: parts[1],
      rkey: parts[2],
    };
  }

  /**
   * Build a Semble web URL for a card
   */
  getCardUrl(rkey: string): string {
    return `https://semble.so/card/${this.session?.handle ?? this.config.identifier}/${rkey}`;
  }
}
