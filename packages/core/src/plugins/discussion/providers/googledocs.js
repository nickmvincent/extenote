import fs from "fs/promises";
import { BaseDiscussionPlugin } from "./base.js";
export class GoogleDocsPlugin extends BaseDiscussionPlugin {
    name = "googledocs";
    displayName = "Google Docs";
    accessToken = null;
    tokenExpiry = 0;
    async validate(config) {
        const errors = [];
        const credentialsPath = config.credentialsPath ?? process.env.GOOGLE_APPLICATION_CREDENTIALS;
        const accessToken = process.env.GOOGLE_ACCESS_TOKEN;
        if (!credentialsPath && !accessToken) {
            errors.push("credentialsPath, GOOGLE_APPLICATION_CREDENTIALS, or GOOGLE_ACCESS_TOKEN required");
        }
        if (credentialsPath) {
            try {
                await fs.access(credentialsPath);
            }
            catch {
                errors.push(`Credentials file not found: ${credentialsPath}`);
            }
        }
        if (!config.access) {
            errors.push("access level required (view, comment, or edit)");
        }
        return { valid: errors.length === 0, errors };
    }
    async getAccessToken(config) {
        // Check for direct access token in env
        const envToken = process.env.GOOGLE_ACCESS_TOKEN;
        if (envToken) {
            return envToken;
        }
        // Check if we have a valid cached token
        if (this.accessToken && Date.now() < this.tokenExpiry) {
            return this.accessToken;
        }
        // Load service account credentials
        const credentialsPath = config.credentialsPath ?? process.env.GOOGLE_APPLICATION_CREDENTIALS;
        if (!credentialsPath) {
            throw new Error("No Google credentials available");
        }
        const credentialsRaw = await fs.readFile(credentialsPath, "utf8");
        const credentials = JSON.parse(credentialsRaw);
        // Create JWT for service account
        const now = Math.floor(Date.now() / 1000);
        const expiry = now + 3600;
        const header = {
            alg: "RS256",
            typ: "JWT",
        };
        const payload = {
            iss: credentials.client_email,
            scope: "https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/drive.file",
            aud: credentials.token_uri,
            iat: now,
            exp: expiry,
        };
        // Note: In production, use a proper JWT library
        // This is a simplified implementation
        const jwt = await this.createJwt(header, payload, credentials.private_key);
        // Exchange JWT for access token
        const response = await fetch(credentials.token_uri, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
                grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
                assertion: jwt,
            }),
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to get access token: ${error}`);
        }
        const tokenData = await response.json();
        this.accessToken = tokenData.access_token;
        this.tokenExpiry = Date.now() + (tokenData.expires_in - 60) * 1000;
        return this.accessToken;
    }
    async createJwt(header, payload, privateKey) {
        // Base64URL encode helper
        const base64url = (data) => {
            return Buffer.from(data)
                .toString("base64")
                .replace(/\+/g, "-")
                .replace(/\//g, "_")
                .replace(/=/g, "");
        };
        const encodedHeader = base64url(JSON.stringify(header));
        const encodedPayload = base64url(JSON.stringify(payload));
        const signatureInput = `${encodedHeader}.${encodedPayload}`;
        // Use Node.js crypto for signing
        const crypto = await import("crypto");
        const sign = crypto.createSign("RSA-SHA256");
        sign.update(signatureInput);
        const signature = sign.sign(privateKey, "base64url");
        return `${signatureInput}.${signature}`;
    }
    getRoleForAccess(access) {
        switch (access) {
            case "view":
                return "reader";
            case "comment":
                return "commenter";
            case "edit":
                return "writer";
        }
    }
    async exists(object, config) {
        try {
            const accessToken = await this.getAccessToken(config);
            const title = this.getTitle(object);
            // Search for existing doc by title
            let query = `name='${title}' and mimeType='application/vnd.google-apps.document' and trashed=false`;
            if (config.folderId) {
                query += ` and '${config.folderId}' in parents`;
            }
            const params = new URLSearchParams({
                q: query,
                fields: "files(id,name,webViewLink)",
            });
            const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            });
            if (!response.ok) {
                return null;
            }
            const data = await response.json();
            const match = data.files?.[0];
            if (match) {
                return {
                    provider: this.name,
                    url: match.webViewLink,
                    uri: match.id,
                    createdAt: new Date().toISOString(),
                };
            }
        }
        catch {
            // Search failed
        }
        return null;
    }
    async create(options) {
        const config = options.config;
        const { object, dryRun } = options;
        // Check if already exists
        const existing = await this.exists(object, config);
        if (existing) {
            return { success: true, link: existing, skipped: true };
        }
        const title = this.getTitle(object);
        if (dryRun) {
            return {
                success: true,
                link: {
                    provider: this.name,
                    url: "https://docs.google.com/document/create",
                    createdAt: new Date().toISOString(),
                },
            };
        }
        try {
            const accessToken = await this.getAccessToken(config);
            // Create the document
            const createResponse = await fetch("https://docs.googleapis.com/v1/documents", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ title }),
            });
            if (!createResponse.ok) {
                const error = await createResponse.text();
                return { success: false, error: `Failed to create doc: ${error}` };
            }
            const doc = await createResponse.json();
            // Move to folder if specified
            if (config.folderId) {
                await fetch(`https://www.googleapis.com/drive/v3/files/${doc.documentId}?addParents=${config.folderId}`, {
                    method: "PATCH",
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    },
                });
            }
            // Add initial content
            const body = this.getBody(object);
            const requests = [
                {
                    insertText: {
                        location: { index: 1 },
                        text: `${body}\n\n---\n\nLeave your comments and feedback below!`,
                    },
                },
            ];
            await fetch(`https://docs.googleapis.com/v1/documents/${doc.documentId}:batchUpdate`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ requests }),
            });
            // Set sharing permissions
            await fetch(`https://www.googleapis.com/drive/v3/files/${doc.documentId}/permissions`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    type: "anyone",
                    role: this.getRoleForAccess(config.access),
                }),
            });
            const url = `https://docs.google.com/document/d/${doc.documentId}/edit`;
            return {
                success: true,
                link: {
                    provider: this.name,
                    url,
                    uri: doc.documentId,
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
            const accessToken = await this.getAccessToken(config);
            // Move to trash
            const response = await fetch(`https://www.googleapis.com/drive/v3/files/${link.uri}`, {
                method: "PATCH",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ trashed: true }),
            });
            return response.ok;
        }
        catch {
            return false;
        }
    }
}
