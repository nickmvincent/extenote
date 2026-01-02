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
 * WhiteWind discussion plugin.
 *
 * Creates blog entries on ATProto using the WhiteWind lexicon (com.whtwnd.blog.entry).
 * WhiteWind is a simple markdown-based blogging platform on ATProto.
 *
 * @see https://whtwnd.com
 */

export interface WhiteWindConfig extends DiscussionPluginConfig {
  enabled: boolean;
  pds?: string;
  identifier: string;
  password?: string;
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

// WhiteWind blog entry lexicon
interface WhiteWindBlogEntry {
  $type: "com.whtwnd.blog.entry";
  content: string;
  title: string;
  createdAt: string;
  visibility: "public" | "url" | "author";
  ogp?: {
    url?: string;
  };
}

export class WhiteWindPlugin extends BaseDiscussionPlugin {
  name = "whitewind";
  displayName = "WhiteWind";

  private session: AtprotoSession | null = null;

  private getPassword(config: WhiteWindConfig): string | undefined {
    return config.password ?? process.env.WHITEWIND_APP_PASSWORD ?? process.env.ATPROTO_APP_PASSWORD;
  }

  private getPds(config: WhiteWindConfig): string {
    return config.pds ?? "https://bsky.social";
  }

  async validate(config: WhiteWindConfig): Promise<ValidationResult> {
    const errors: string[] = [];

    if (!config.identifier) {
      errors.push("identifier is required (handle or DID)");
    }

    const password = this.getPassword(config);
    if (!password) {
      errors.push("password or WHITEWIND_APP_PASSWORD/ATPROTO_APP_PASSWORD env required");
    }

    return { valid: errors.length === 0, errors };
  }

  private async createSession(config: WhiteWindConfig): Promise<AtprotoSession> {
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
    config: WhiteWindConfig,
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
    config: WhiteWindConfig
  ): Promise<DiscussionLink | null> {
    try {
      const records = await this.listRecords(config, "com.whtwnd.blog.entry");
      const title = this.getTitle(object);

      const match = records.find(
        (r) => (r.value as unknown as WhiteWindBlogEntry).title === title
      );

      if (match) {
        const session = await this.createSession(config);
        // Extract rkey from URI: at://did:plc:xxx/com.whtwnd.blog.entry/rkey
        const rkey = match.uri.split("/").pop();
        const entry = match.value as unknown as WhiteWindBlogEntry;

        return {
          provider: this.name,
          url: `https://whtwnd.com/${session.handle}/${rkey}`,
          uri: match.uri,
          createdAt: entry.createdAt,
        };
      }
    } catch {
      // Failed to check, assume doesn't exist
    }

    return null;
  }

  async create(options: CreateDiscussionOptions): Promise<CreateDiscussionResult> {
    const config = options.config as WhiteWindConfig;
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
    const content = this.getBody(object);

    if (dryRun) {
      return {
        success: true,
        link: {
          provider: this.name,
          url: `https://whtwnd.com/${config.identifier}/new`,
          createdAt: new Date().toISOString(),
        },
      };
    }

    try {
      const session = await this.createSession(config);
      const pds = this.getPds(config);

      // Generate a timestamp-based rkey
      const rkey = Date.now().toString(36);

      const record: WhiteWindBlogEntry = {
        $type: "com.whtwnd.blog.entry",
        title,
        content,
        createdAt: new Date().toISOString(),
        visibility: "public",
        ogp: {
          url: object.frontmatter.original_url as string | undefined,
        },
      };

      const response = await fetch(`${pds}/xrpc/com.atproto.repo.createRecord`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.accessJwt}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          repo: session.did,
          collection: "com.whtwnd.blog.entry",
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
          url: `https://whtwnd.com/${session.handle}/${rkey}`,
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

  async delete(link: DiscussionLink, config: WhiteWindConfig): Promise<boolean> {
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
          collection: "com.whtwnd.blog.entry",
          rkey,
        }),
      });

      return response.ok;
    } catch {
      return false;
    }
  }
}
