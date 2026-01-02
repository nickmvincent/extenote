import type { VaultObject } from "../../../types.js";
import type {
  DiscussionPlugin,
  DiscussionPluginConfig,
  DiscussionLink,
  CreateDiscussionOptions,
  CreateDiscussionResult,
  ValidationResult,
} from "../types.js";

export abstract class BaseDiscussionPlugin implements DiscussionPlugin {
  abstract name: string;
  abstract displayName: string;

  abstract validate(config: DiscussionPluginConfig): Promise<ValidationResult>;
  abstract exists(object: VaultObject, config: DiscussionPluginConfig): Promise<DiscussionLink | null>;
  abstract create(options: CreateDiscussionOptions): Promise<CreateDiscussionResult>;

  /** Generate a consistent discussion title from object */
  protected getTitle(object: VaultObject): string {
    return (
      object.title ??
      (object.frontmatter.title as string) ??
      object.id
    );
  }

  /** Generate discussion body with metadata */
  protected getBody(object: VaultObject): string {
    const subtitle = object.frontmatter.subtitle ?? object.frontmatter.summary;
    const originalUrl = object.frontmatter.original_url ?? object.frontmatter.url;
    const date = object.frontmatter.date;

    const lines: string[] = [];

    if (subtitle) {
      lines.push(String(subtitle), "");
    }

    lines.push("---", "");

    if (originalUrl) {
      lines.push(`**Source:** ${originalUrl}`);
    }

    if (date) {
      lines.push(`**Date:** ${date}`);
    }

    lines.push("", "---", "", "*Share your thoughts and feedback below!*");

    return lines.join("\n");
  }

  /** Generate a URL-safe slug from object */
  protected getSlug(object: VaultObject): string {
    const title = this.getTitle(object);
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 100);
  }

  /** Get a unique identifier for the object (for deduplication) */
  protected getObjectId(object: VaultObject): string {
    return object.frontmatter.original_url as string ?? object.id;
  }
}
