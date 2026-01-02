export class BaseDiscussionPlugin {
    /** Generate a consistent discussion title from object */
    getTitle(object) {
        return (object.title ??
            object.frontmatter.title ??
            object.id);
    }
    /** Generate discussion body with metadata */
    getBody(object) {
        const subtitle = object.frontmatter.subtitle ?? object.frontmatter.summary;
        const originalUrl = object.frontmatter.original_url ?? object.frontmatter.url;
        const date = object.frontmatter.date;
        const lines = [];
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
    getSlug(object) {
        const title = this.getTitle(object);
        return title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 100);
    }
    /** Get a unique identifier for the object (for deduplication) */
    getObjectId(object) {
        return object.frontmatter.original_url ?? object.id;
    }
}
