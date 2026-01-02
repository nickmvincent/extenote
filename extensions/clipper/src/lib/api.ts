/**
 * Extenote API client for V2 mode
 */

import type { ExtenoteVaultInfo, VaultObject, ValidationQueueResponse } from "./types";

export class ExtenoteApi {
  constructor(private baseUrl: string) {}

  /**
   * Check if the API is reachable and get vault info
   */
  async checkConnection(): Promise<{ connected: boolean; info?: ExtenoteVaultInfo }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/vault`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        return { connected: false };
      }

      const data = await response.json();

      // Extract schema and project info
      const schemas = (data.schemas || []).map((s: { name: string; projects?: string[]; fields?: unknown }) => ({
        name: s.name,
        projects: s.projects || [],
        fields: s.fields || {},
      }));

      const projects = [...new Set(schemas.flatMap((s: { projects: string[] }) => s.projects))] as string[];

      return {
        connected: true,
        info: { schemas, projects },
      };
    } catch (err) {
      console.warn("[Extenote API] Connection failed:", err);
      return { connected: false };
    }
  }

  /**
   * Create a new object via the API
   */
  async createObject(options: {
    schema: string;
    slug: string;
    title?: string;
    project?: string;
    visibility?: string;
  }): Promise<{ success: boolean; filePath?: string; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options),
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error || "Failed to create object" };
      }

      return { success: true, filePath: data.filePath };
    } catch (err) {
      console.error("[Extenote API] Create failed:", err);
      return { success: false, error: err instanceof Error ? err.message : "Network error" };
    }
  }

  /**
   * Check if an object with this citation key already exists
   */
  async checkDuplicate(citationKey: string): Promise<{ exists: boolean; path?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/vault`);
      if (!response.ok) {
        return { exists: false };
      }

      const data = await response.json();
      const objects = data.vault?.objects || [];

      // Look for an object with matching citation_key or id
      const existing = objects.find(
        (obj: { id: string; frontmatter?: { citation_key?: string } }) =>
          obj.id === citationKey || obj.frontmatter?.citation_key === citationKey
      );

      if (existing) {
        return { exists: true, path: existing.relativePath };
      }

      return { exists: false };
    } catch {
      return { exists: false };
    }
  }

  /**
   * Write a complete markdown file with frontmatter via custom endpoint
   * This requires the extenote web API to have a /api/write endpoint
   * For now, we'll use the /api/create endpoint and note the limitation
   */
  async writeMarkdown(options: {
    project: string;
    schema: string;
    slug: string;
    frontmatter: Record<string, unknown>;
    body?: string;
  }): Promise<{ success: boolean; filePath?: string; error?: string }> {
    // For now, use the basic create endpoint
    // A future enhancement would add a /api/write endpoint that accepts full frontmatter
    return this.createObject({
      schema: options.schema,
      slug: options.slug,
      title: options.frontmatter.title as string,
      project: options.project,
      visibility: (options.frontmatter.visibility as string) || "public",
    });
  }

  /**
   * Get a single vault object by path or ID
   */
  async getObject(options: { path?: string; id?: string }): Promise<VaultObject | null> {
    try {
      const params = new URLSearchParams();
      if (options.path) params.set("path", options.path);
      if (options.id) params.set("id", options.id);

      const response = await fetch(`${this.baseUrl}/api/object?${params}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        console.warn("[Extenote API] getObject failed:", response.status);
        return null;
      }

      return await response.json();
    } catch (err) {
      console.warn("[Extenote API] getObject error:", err);
      return null;
    }
  }

  /**
   * Write frontmatter to an existing file
   */
  async writeObject(options: {
    filePath: string;
    frontmatter: Record<string, unknown>;
    body?: string;
    merge?: boolean;
  }): Promise<{ success: boolean; filePath?: string; error?: string }> {
    console.log("[Extenote API] writeObject called with:", {
      filePath: options.filePath,
      frontmatterKeys: Object.keys(options.frontmatter),
      merge: options.merge,
    });

    try {
      const url = `${this.baseUrl}/api/write`;
      console.log("[Extenote API] POSTing to:", url);

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options),
      });

      console.log("[Extenote API] Response status:", response.status, response.statusText);

      // Try to parse JSON response
      let data: Record<string, unknown>;
      try {
        data = await response.json();
        console.log("[Extenote API] Response data:", data);
      } catch (parseErr) {
        console.error("[Extenote API] Failed to parse response:", parseErr);
        return { success: false, error: "Invalid server response" };
      }

      if (!response.ok) {
        const errorMsg = (data.error as string) || `Server error: ${response.status}`;
        console.error("[Extenote API] Write failed:", errorMsg);
        return { success: false, error: errorMsg };
      }

      return { success: true, filePath: data.filePath as string };
    } catch (err) {
      // This catches network errors including CORS issues
      console.error("[Extenote API] writeObject failed:", err);
      const errorMsg = err instanceof Error ? err.message : "Network error";

      // Check if it's likely a CORS error
      if (err instanceof TypeError && errorMsg.includes("fetch")) {
        return { success: false, error: "Network error (possibly CORS blocked)" };
      }

      return { success: false, error: errorMsg };
    }
  }

  /**
   * Get the validation queue (entries needing check_log)
   */
  async getValidationQueue(options?: {
    project?: string;
    limit?: number;
  }): Promise<ValidationQueueResponse | null> {
    try {
      const params = new URLSearchParams();
      if (options?.project) params.set("project", options.project);
      if (options?.limit) params.set("limit", String(options.limit));

      const url = `${this.baseUrl}/api/validation-queue${params.toString() ? `?${params}` : ""}`;
      const response = await fetch(url, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        console.warn("[Extenote API] getValidationQueue failed:", response.status);
        return null;
      }

      return await response.json();
    } catch (err) {
      console.warn("[Extenote API] getValidationQueue error:", err);
      return null;
    }
  }

  /**
   * Get all vault objects (for matching)
   */
  async getVaultObjects(): Promise<Array<{
    id: string;
    relativePath: string;
    title: string;
    frontmatter: Record<string, unknown>;
  }> | null> {
    try {
      const response = await fetch(`${this.baseUrl}/api/vault`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return data.vault?.objects || [];
    } catch (err) {
      console.warn("[Extenote API] getVaultObjects error:", err);
      return null;
    }
  }

  /**
   * Open a file in the configured editor (VS Code by default)
   */
  async openInEditor(filePath: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/open-in-editor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath }),
      });

      const text = await response.text();
      let data: { error?: string } | null = null;
      if (text) {
        try {
          data = JSON.parse(text) as { error?: string };
        } catch (parseError) {
          console.warn("[Extenote API] openInEditor response not JSON:", parseError);
        }
      }

      if (!response.ok) {
        return {
          success: false,
          error: data?.error || text || `Failed to open in editor (${response.status})`,
        };
      }

      return { success: true };
    } catch (err) {
      console.error("[Extenote API] openInEditor failed:", err);
      return { success: false, error: err instanceof Error ? err.message : "Network error" };
    }
  }
}

/**
 * Create API client with config URL
 */
export function createApiClient(apiUrl: string): ExtenoteApi {
  return new ExtenoteApi(apiUrl);
}
