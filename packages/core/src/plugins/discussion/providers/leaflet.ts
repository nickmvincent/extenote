import type { VaultObject } from "../../../types.js";
import type {
  DiscussionPluginConfig,
  DiscussionLink,
  CreateDiscussionOptions,
  CreateDiscussionResult,
  ValidationResult,
} from "../types.js";
import { BaseDiscussionPlugin } from "./base.js";

/**
 * Leaflet discussion plugin.
 *
 * Creates documents on ATProto using the Leaflet lexicon (pub.leaflet.document).
 * Leaflet is a rich document publishing platform on ATProto with block-based content.
 *
 * @see https://leaflet.pub
 * @see https://github.com/hyperlink-academy/leaflet
 */

export interface LeafletConfig extends DiscussionPluginConfig {
  enabled: boolean;
  pds?: string;
  identifier: string;
  password?: string;
  /** AT-URI of a pub.leaflet.publication to add documents to */
  publication?: string;
  /** Publication subdomain (e.g., "dlpd" for dlpd.leaflet.pub) */
  subdomain?: string;
}

interface AtprotoSession {
  did: string;
  handle: string;
  accessJwt: string;
  refreshJwt: string;
}

interface AtprotoRecord {
  uri: string;
  cid: string;
}

// Leaflet document lexicon types
interface LeafletTextBlock {
  $type: "pub.leaflet.blocks.text";
  plaintext: string;
  facets?: Array<unknown>;
}

interface LeafletHeaderBlock {
  $type: "pub.leaflet.blocks.header";
  plaintext: string;
  level: 1 | 2 | 3;
}

interface LeafletBlockWrapper {
  $type: "pub.leaflet.pages.linearDocument#block";
  block: LeafletTextBlock | LeafletHeaderBlock;
}

interface LeafletLinearDocumentPage {
  $type: "pub.leaflet.pages.linearDocument";
  id: string;
  blocks: LeafletBlockWrapper[];
}

interface LeafletDocument {
  $type: "pub.leaflet.document";
  title: string;
  author: string;
  pages: LeafletLinearDocumentPage[];
  description?: string;
  publishedAt?: string;
  publication?: string;
  tags?: string[];
}

export class LeafletPlugin extends BaseDiscussionPlugin {
  name = "leaflet";
  displayName = "Leaflet";

  private session: AtprotoSession | null = null;

  private getPassword(config: LeafletConfig): string | undefined {
    return config.password ?? process.env.LEAFLET_APP_PASSWORD ?? process.env.ATPROTO_APP_PASSWORD;
  }

  private getPds(config: LeafletConfig): string {
    return config.pds ?? "https://bsky.social";
  }

  private getDocumentUrl(config: LeafletConfig, rkey: string, handle?: string): string {
    if (config.subdomain) {
      return `https://${config.subdomain}.leaflet.pub/${rkey}`;
    }
    return `https://leaflet.pub/${handle ?? config.identifier}/${rkey}`;
  }

  async validate(config: LeafletConfig): Promise<ValidationResult> {
    const errors: string[] = [];

    if (!config.identifier) {
      errors.push("identifier is required (handle or DID)");
    }

    const password = this.getPassword(config);
    if (!password) {
      errors.push("password or LEAFLET_APP_PASSWORD/ATPROTO_APP_PASSWORD env required");
    }

    return { valid: errors.length === 0, errors };
  }

  private async createSession(config: LeafletConfig): Promise<AtprotoSession> {
    if (this.session) {
      return this.session;
    }

    const pds = this.getPds(config);
    const password = this.getPassword(config);

    const response = await fetch(`${pds}/xrpc/com.atproto.server.createSession`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        identifier: config.identifier,
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

  private async listRecords(
    config: LeafletConfig,
    collection: string
  ): Promise<Array<{ uri: string; value: Record<string, unknown> }>> {
    const session = await this.createSession(config);
    const pds = this.getPds(config);

    const params = new URLSearchParams({
      repo: session.did,
      collection,
      limit: "100",
    });

    const response = await fetch(`${pds}/xrpc/com.atproto.repo.listRecords?${params}`, {
      headers: {
        Authorization: `Bearer ${session.accessJwt}`,
      },
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json() as { records: Array<{ uri: string; value: Record<string, unknown> }> };
    return data.records ?? [];
  }

  async exists(
    object: VaultObject,
    config: LeafletConfig
  ): Promise<DiscussionLink | null> {
    try {
      const records = await this.listRecords(config, "pub.leaflet.document");
      const title = this.getTitle(object);

      const match = records.find(
        (r) => (r.value as unknown as LeafletDocument).title === title
      );

      if (match) {
        const session = await this.createSession(config);
        // Extract rkey from URI: at://did:plc:xxx/pub.leaflet.document/rkey
        const rkey = match.uri.split("/").pop()!;

        return {
          provider: this.name,
          url: this.getDocumentUrl(config, rkey, session.handle),
          uri: match.uri,
          createdAt: (match.value as unknown as LeafletDocument).publishedAt ?? new Date().toISOString(),
        };
      }
    } catch {
      // Failed to check, assume doesn't exist
    }

    return null;
  }

  async create(options: CreateDiscussionOptions): Promise<CreateDiscussionResult> {
    const config = options.config as LeafletConfig;
    const { object, dryRun } = options;

    const password = this.getPassword(config);
    if (!password) {
      return { success: false, error: "No ATProto app password available" };
    }

    // Check if already exists
    const existing = await this.exists(object, config);
    if (existing) {
      return { success: true, link: existing, skipped: true };
    }

    const title = this.getTitle(object);
    const bodyText = this.getBody(object);
    const subtitle = object.frontmatter.subtitle as string | undefined;

    if (dryRun) {
      const dryRunUrl = config.subdomain
        ? `https://${config.subdomain}.leaflet.pub/new`
        : `https://leaflet.pub/${config.identifier}/new`;
      return {
        success: true,
        link: {
          provider: this.name,
          url: dryRunUrl,
          createdAt: new Date().toISOString(),
        },
      };
    }

    try {
      const session = await this.createSession(config);
      const pds = this.getPds(config);

      // Generate a TID-style rkey (Leaflet uses tid format)
      const rkey = this.generateTid();

      // Build blocks for the document
      const blocks: LeafletBlockWrapper[] = [];

      // Add subtitle as first text block if present
      if (subtitle) {
        blocks.push({
          $type: "pub.leaflet.pages.linearDocument#block",
          block: {
            $type: "pub.leaflet.blocks.text",
            plaintext: subtitle,
            facets: [],
          },
        });
      }

      // Add body text
      blocks.push({
        $type: "pub.leaflet.pages.linearDocument#block",
        block: {
          $type: "pub.leaflet.blocks.text",
          plaintext: bodyText,
          facets: [],
        },
      });

      // Generate UUID for the page
      const pageId = crypto.randomUUID();

      const record: LeafletDocument = {
        $type: "pub.leaflet.document",
        title,
        author: session.did,
        pages: [
          {
            $type: "pub.leaflet.pages.linearDocument",
            id: pageId,
            blocks,
          },
        ],
        description: subtitle,
        publishedAt: new Date().toISOString(),
        ...(config.publication && { publication: config.publication }),
      };

      const response = await fetch(`${pds}/xrpc/com.atproto.repo.createRecord`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.accessJwt}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          repo: session.did,
          collection: "pub.leaflet.document",
          rkey,
          record,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error: `Failed to create record: ${error}` };
      }

      const result = await response.json() as AtprotoRecord;

      return {
        success: true,
        link: {
          provider: this.name,
          url: this.getDocumentUrl(config, rkey, session.handle),
          uri: result.uri,
          createdAt: new Date().toISOString(),
        },
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async delete(link: DiscussionLink, config: LeafletConfig): Promise<boolean> {
    if (!link.uri) {
      return false;
    }

    try {
      const session = await this.createSession(config);
      const pds = this.getPds(config);

      // Parse AT-URI: at://did:plc:xxx/collection/rkey
      const parts = link.uri.replace("at://", "").split("/");
      const rkey = parts[2];

      const response = await fetch(`${pds}/xrpc/com.atproto.repo.deleteRecord`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.accessJwt}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          repo: session.did,
          collection: "pub.leaflet.document",
          rkey,
        }),
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Generate a TID (timestamp identifier) for ATProto records.
   * TIDs are base32-sortable timestamps used as record keys.
   */
  private generateTid(): string {
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
}
