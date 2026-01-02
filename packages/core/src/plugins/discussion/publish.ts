import fs from "fs/promises";
import path from "path";
import type { VaultObject, DiscussionConfig } from "../../types.js";
import type {
  DiscussionPlugin,
  DiscussionLink,
  DiscussionPluginConfig,
  PublishDiscussionsOptions,
  PublishDiscussionsResult,
  PublishDiscussionEntry,
  DiscussionProgressEvent,
} from "./types.js";
import { GitHubDiscussionPlugin } from "./providers/github.js";
import { LeafletPlugin } from "./providers/leaflet.js";
import { WhiteWindPlugin } from "./providers/whitewind.js";
import { GoogleDocsPlugin } from "./providers/googledocs.js";

export interface PublishProjectDiscussionOptions {
  projectName: string;
  projectDescription?: string;
  discussionConfig: DiscussionConfig;
  providers?: string[];
  dryRun?: boolean;
  onProgress?: (event: DiscussionProgressEvent) => void;
}

export interface ProjectDiscussionResult {
  projectName: string;
  links: DiscussionLink[];
  errors: Array<{ provider: string; error: string }>;
}

// Local registry to avoid circular import
function createRegistry(): Map<string, DiscussionPlugin> {
  const registry = new Map<string, DiscussionPlugin>();
  const plugins = [
    new GitHubDiscussionPlugin(),
    new LeafletPlugin(),
    new WhiteWindPlugin(),
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
export async function publishDiscussions(
  options: PublishDiscussionsOptions
): Promise<PublishDiscussionsResult> {
  const registry = createRegistry();
  const result: PublishDiscussionsResult = {
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

    const existingLinks = (object.frontmatter[discussionConfig.frontmatterKey ?? "discussions"] ?? {}) as Record<string, string>;
    const newLinks: DiscussionLink[] = [];

    for (const [providerName, providerConfig] of Object.entries(providersConfig)) {
      if (!providerConfig || !providerConfig.enabled) continue;
      if (providerFilter && !providerFilter.includes(providerName)) continue;
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
      const validation = await plugin.validate(providerConfig as DiscussionPluginConfig);
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
          config: providerConfig as DiscussionPluginConfig,
          dryRun,
        });

        if (createResult.success && createResult.link) {
          if (createResult.skipped) {
            result.skipped.push({
              object,
              reason: `${providerName} discussion already exists`,
            });
          } else {
            newLinks.push(createResult.link);
          }
        } else if (createResult.error) {
          result.errors.push({
            object,
            provider: providerName,
            error: createResult.error,
          });
        }
      } catch (err) {
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
 * Publish a single project-level discussion across configured providers.
 */
export async function publishProjectDiscussion(
  options: PublishProjectDiscussionOptions
): Promise<ProjectDiscussionResult> {
  const registry = createRegistry();
  const result: ProjectDiscussionResult = {
    projectName: options.projectName,
    links: [],
    errors: [],
  };

  const { projectName, projectDescription, discussionConfig, providers: providerFilter, dryRun, onProgress } = options;
  const providersConfig = discussionConfig.providers ?? {};

  // Create a synthetic "project object" to pass to plugins
  const projectObject: VaultObject = {
    id: projectName,
    type: "project",
    title: `${projectName} Discussions`,
    sourceId: "project",
    project: projectName,
    filePath: "",
    relativePath: projectName,
    frontmatter: {
      title: `${projectName} Discussions`,
      subtitle: projectDescription ?? `Discussion and feedback for the ${projectName} project`,
    },
    body: "",
    mtime: Date.now(),
    visibility: "public",
  };

  onProgress?.({
    type: "start",
    message: `Creating project-level discussion for ${projectName}`,
  });

  for (const [providerName, providerConfig] of Object.entries(providersConfig)) {
    if (!providerConfig || !providerConfig.enabled) continue;
    if (providerFilter && !providerFilter.includes(providerName)) continue;

    const plugin = registry.get(providerName);
    if (!plugin) {
      result.errors.push({
        provider: providerName,
        error: `Unknown provider: ${providerName}`,
      });
      continue;
    }

    // Validate config
    const validation = await plugin.validate(providerConfig as DiscussionPluginConfig);
    if (!validation.valid) {
      result.errors.push({
        provider: providerName,
        error: `Config invalid: ${validation.errors?.join(", ")}`,
      });
      continue;
    }

    onProgress?.({
      type: "progress",
      provider: providerName,
      message: `Creating ${providerName} discussion for ${projectName}`,
    });

    try {
      // Check if already exists
      const existing = await plugin.exists(projectObject, providerConfig as DiscussionPluginConfig);
      if (existing) {
        result.links.push(existing);
        onProgress?.({
          type: "progress",
          provider: providerName,
          message: `${providerName} discussion already exists`,
        });
        continue;
      }

      if (dryRun) {
        result.links.push({
          provider: providerName,
          url: `[dry-run] Would create ${providerName} discussion`,
          createdAt: new Date().toISOString(),
        });
        continue;
      }

      const createResult = await plugin.create({
        object: projectObject,
        config: providerConfig as DiscussionPluginConfig,
        dryRun,
      });

      if (createResult.success && createResult.link) {
        result.links.push(createResult.link);
      } else if (createResult.error) {
        result.errors.push({
          provider: providerName,
          error: createResult.error,
        });
      }
    } catch (err) {
      result.errors.push({
        provider: providerName,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  onProgress?.({
    type: "complete",
    message: `Created ${result.links.length} discussion links for ${projectName}`,
  });

  return result;
}

/**
 * Generate a project-level discussion object markdown file.
 */
export function generateProjectDiscussionObject(
  projectName: string,
  links: DiscussionLink[],
  _config: DiscussionConfig,
  description?: string
): string {
  const frontmatter: Record<string, unknown> = {
    type: "project_discussion",
    project: projectName,
    title: `${projectName} Discussions`,
    description: description ?? `Discussion and feedback for the ${projectName} project`,
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
  const body = `# ${projectName} Discussions

Welcome! This is the central discussion space for the **${projectName}** project.

## Discussion Links

${links.map((l) => `- [Discuss on ${l.provider}](${l.url})`).join("\n")}

---

*Have feedback on a specific post? Let us know and we can create a dedicated discussion thread.*
`;

  // Format as markdown with YAML frontmatter
  const yaml = Object.entries(frontmatter)
    .map(([key, value]) => {
      if (typeof value === "string" && (value.includes(":") || value.includes('"'))) {
        return `${key}: "${value.replace(/"/g, '\\"')}"`;
      }
      return `${key}: ${value}`;
    })
    .join("\n");

  return `---\n${yaml}\n---\n\n${body}`;
}

/**
 * Write a project-level discussion object to the output directory.
 */
export async function writeProjectDiscussionObject(
  projectName: string,
  links: DiscussionLink[],
  config: DiscussionConfig,
  cwd: string,
  description?: string
): Promise<string> {
  const outputDir = path.resolve(cwd, config.outputDir ?? "content/discussions");
  await fs.mkdir(outputDir, { recursive: true });

  const content = generateProjectDiscussionObject(projectName, links, config, description);
  const slug = projectName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const filePath = path.join(outputDir, `${slug}.md`);

  await fs.writeFile(filePath, content, "utf8");
  return filePath;
}

/**
 * Generate a discussion object markdown file.
 */
export function generateDiscussionObject(
  object: VaultObject,
  links: DiscussionLink[],
  config: DiscussionConfig
): string {
  const frontmatter: Record<string, unknown> = {
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
  let body: string;
  if (config.bodyTemplate) {
    body = config.bodyTemplate
      .replace(/\{\{source_title\}\}/g, String(frontmatter.source_title ?? ""))
      .replace(/\{\{source_url\}\}/g, String(frontmatter.source_url ?? ""));
    // Simple {{#each links}} replacement
    const linksSection = links
      .map((l) => `- [${l.provider}](${l.url})`)
      .join("\n");
    body = body.replace(/\{\{#each links\}\}[\s\S]*?\{\{\/each\}\}/g, linksSection);
  } else {
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
export async function writeDiscussionObjects(
  entries: PublishDiscussionEntry[],
  config: DiscussionConfig,
  cwd: string
): Promise<string[]> {
  const outputDir = path.resolve(cwd, config.outputDir ?? "content/discussions");
  await fs.mkdir(outputDir, { recursive: true });

  const writtenFiles: string[] = [];

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
export async function updateSourceFrontmatter(
  entries: PublishDiscussionEntry[],
  config: DiscussionConfig
): Promise<void> {
  const frontmatterKey = config.frontmatterKey ?? "discussions";

  for (const entry of entries) {
    const content = await fs.readFile(entry.object.filePath, "utf8");

    // Parse frontmatter
    const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) continue;

    const [, frontmatterRaw, body] = match;

    // Build new discussion links
    const links: Record<string, string> = {};
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
