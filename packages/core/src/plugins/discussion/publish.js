import fs from "fs/promises";
import path from "path";
import { GitHubDiscussionPlugin } from "./providers/github.js";
import { LeafletPlugin } from "./providers/leaflet.js";
import { GoogleDocsPlugin } from "./providers/googledocs.js";
// Local registry to avoid circular import
function createRegistry() {
    const registry = new Map();
    const plugins = [
        new GitHubDiscussionPlugin(),
        new LeafletPlugin(),
        new GoogleDocsPlugin(),
    ];
    for (const plugin of plugins) {
        registry.set(plugin.name, plugin);
    }
    return registry;
}
/**
 * Publish discussions for vault objects across configured providers.
 */
export async function publishDiscussions(options) {
    const registry = createRegistry();
    const result = {
        created: [],
        skipped: [],
        errors: [],
    };
    const { objects, discussionConfig, providers: providerFilter, dryRun, onProgress } = options;
    const providersConfig = discussionConfig.providers ?? {};
    for (const object of objects) {
        onProgress?.({
            type: "progress",
            object,
            message: `Processing ${object.id}`,
        });
        const existingLinks = (object.frontmatter[discussionConfig.frontmatterKey ?? "discussions"] ?? {});
        const newLinks = [];
        for (const [providerName, providerConfig] of Object.entries(providersConfig)) {
            if (!providerConfig || !providerConfig.enabled)
                continue;
            if (providerFilter && !providerFilter.includes(providerName))
                continue;
            if (existingLinks[providerName]) {
                result.skipped.push({
                    object,
                    reason: `${providerName} link already exists`,
                });
                continue;
            }
            const plugin = registry.get(providerName);
            if (!plugin) {
                result.errors.push({
                    object,
                    provider: providerName,
                    error: `Unknown provider: ${providerName}`,
                });
                continue;
            }
            // Validate config
            const validation = await plugin.validate(providerConfig);
            if (!validation.valid) {
                result.errors.push({
                    object,
                    provider: providerName,
                    error: `Config invalid: ${validation.errors?.join(", ")}`,
                });
                continue;
            }
            onProgress?.({
                type: "progress",
                object,
                provider: providerName,
                message: `Creating ${providerName} discussion`,
            });
            try {
                const createResult = await plugin.create({
                    object,
                    config: providerConfig,
                    dryRun,
                });
                if (createResult.success && createResult.link) {
                    if (createResult.skipped) {
                        result.skipped.push({
                            object,
                            reason: `${providerName} discussion already exists`,
                        });
                    }
                    else {
                        newLinks.push(createResult.link);
                    }
                }
                else if (createResult.error) {
                    result.errors.push({
                        object,
                        provider: providerName,
                        error: createResult.error,
                    });
                }
            }
            catch (err) {
                result.errors.push({
                    object,
                    provider: providerName,
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        }
        if (newLinks.length > 0) {
            result.created.push({ object, links: newLinks });
        }
    }
    onProgress?.({
        type: "complete",
        message: `Created ${result.created.length} discussions, skipped ${result.skipped.length}, errors ${result.errors.length}`,
    });
    return result;
}
/**
 * Generate a discussion object markdown file.
 */
export function generateDiscussionObject(object, links, config) {
    const frontmatter = {
        type: "discussion",
        source_id: object.id,
        source_type: object.type,
        source_title: object.title ?? object.frontmatter.title,
        source_url: object.frontmatter.original_url ?? object.frontmatter.url,
        created_at: new Date().toISOString().split("T")[0],
    };
    // Add provider-specific URLs
    for (const link of links) {
        frontmatter[`${link.provider}_url`] = link.url;
        if (link.uri) {
            frontmatter[`${link.provider}_uri`] = link.uri;
        }
    }
    // Generate body
    let body;
    if (config.bodyTemplate) {
        body = config.bodyTemplate
            .replace(/\{\{source_title\}\}/g, String(frontmatter.source_title ?? ""))
            .replace(/\{\{source_url\}\}/g, String(frontmatter.source_url ?? ""));
        // Simple {{#each links}} replacement
        const linksSection = links
            .map((l) => `- [${l.provider}](${l.url})`)
            .join("\n");
        body = body.replace(/\{\{#each links\}\}[\s\S]*?\{\{\/each\}\}/g, linksSection);
    }
    else {
        const sourceTitle = frontmatter.source_title ?? object.id;
        const sourceUrl = frontmatter.source_url;
        const titleLink = sourceUrl
            ? `[${sourceTitle}](${sourceUrl})`
            : String(sourceTitle);
        body = `Discussion threads for ${titleLink}.\n\n`;
        body += links.map((l) => `- [${l.provider}](${l.url})`).join("\n");
    }
    // Format as markdown with YAML frontmatter
    const yaml = Object.entries(frontmatter)
        .map(([key, value]) => {
        if (typeof value === "string" && (value.includes(":") || value.includes('"'))) {
            return `${key}: "${value.replace(/"/g, '\\"')}"`;
        }
        return `${key}: ${value}`;
    })
        .join("\n");
    return `---\n${yaml}\n---\n\n${body}\n`;
}
/**
 * Write discussion objects to the output directory.
 */
export async function writeDiscussionObjects(entries, config, cwd) {
    const outputDir = path.resolve(cwd, config.outputDir ?? "content/discussions");
    await fs.mkdir(outputDir, { recursive: true });
    const writtenFiles = [];
    for (const entry of entries) {
        const content = generateDiscussionObject(entry.object, entry.links, config);
        const slug = entry.object.id
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");
        const filePath = path.join(outputDir, `${slug}.md`);
        await fs.writeFile(filePath, content, "utf8");
        writtenFiles.push(filePath);
    }
    return writtenFiles;
}
/**
 * Update source file frontmatter with discussion links.
 */
export async function updateSourceFrontmatter(entries, config) {
    const frontmatterKey = config.frontmatterKey ?? "discussions";
    for (const entry of entries) {
        const content = await fs.readFile(entry.object.filePath, "utf8");
        // Parse frontmatter
        const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
        if (!match)
            continue;
        const [, frontmatterRaw, body] = match;
        // Build new discussion links
        const links = {};
        for (const link of entry.links) {
            links[link.provider] = link.url;
        }
        // Simple YAML update - append to frontmatter
        // In production, use a proper YAML library
        let updatedFrontmatter = frontmatterRaw;
        if (!frontmatterRaw.includes(`${frontmatterKey}:`)) {
            const linksYaml = Object.entries(links)
                .map(([k, v]) => `  ${k}: "${v}"`)
                .join("\n");
            updatedFrontmatter = `${frontmatterRaw}\n${frontmatterKey}:\n${linksYaml}`;
        }
        const updatedContent = `---\n${updatedFrontmatter}\n---\n${body}`;
        await fs.writeFile(entry.object.filePath, updatedContent, "utf8");
    }
}
