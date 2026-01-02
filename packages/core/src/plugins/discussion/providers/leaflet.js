import { BaseDiscussionPlugin } from "./base.js";
export class LeafletPlugin extends BaseDiscussionPlugin {
    name = "leaflet";
    displayName = "Leaflet (ATProto)";
    session = null;
    getPassword(config) {
        return config.password ?? process.env.LEAFLET_APP_PASSWORD ?? process.env.ATPROTO_APP_PASSWORD;
    }
    getPds(config) {
        return config.pds ?? "https://bsky.social";
    }
    async validate(config) {
        const errors = [];
        if (!config.identifier) {
            errors.push("identifier is required (handle or DID)");
        }
        const password = this.getPassword(config);
        if (!password) {
            errors.push("password or LEAFLET_APP_PASSWORD/ATPROTO_APP_PASSWORD env required");
        }
        return { valid: errors.length === 0, errors };
    }
    async createSession(config) {
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
        this.session = await response.json();
        return this.session;
    }
    async listRecords(config, collection) {
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
        const data = await response.json();
        return data.records ?? [];
    }
    async exists(object, config) {
        try {
            const records = await this.listRecords(config, "com.whtwnd.blog.entry");
            const title = this.getTitle(object);
            const match = records.find((r) => r.value.title === title);
            if (match) {
                const session = await this.createSession(config);
                // Extract rkey from URI: at://did:plc:xxx/com.whtwnd.blog.entry/rkey
                const rkey = match.uri.split("/").pop();
                const entry = match.value;
                return {
                    provider: this.name,
                    url: `https://whtwnd.com/${session.handle}/${rkey}`,
                    uri: match.uri,
                    createdAt: entry.createdAt,
                };
            }
        }
        catch {
            // Failed to check, assume doesn't exist
        }
        return null;
    }
    async create(options) {
        const config = options.config;
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
            const record = {
                $type: "com.whtwnd.blog.entry",
                title,
                content,
                createdAt: new Date().toISOString(),
                visibility: "public",
                ogp: {
                    url: object.frontmatter.original_url,
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
            const result = await response.json();
            return {
                success: true,
                link: {
                    provider: this.name,
                    url: `https://whtwnd.com/${session.handle}/${rkey}`,
                    uri: result.uri,
                    createdAt: new Date().toISOString(),
                },
            };
        }
        catch (err) {
            return {
                success: false,
                error: err instanceof Error ? err.message : String(err),
            };
        }
    }
    async delete(link, config) {
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
        }
        catch {
            return false;
        }
    }
}
