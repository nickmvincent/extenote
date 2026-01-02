import type { ExtenoteConfig, VaultObject, NetworkData } from "../../types.js";
import { formatProjectTitle, getProjectWebsite } from "../../websites.js";

export interface GenerateNetworkOptions {
  projectName: string;
  config: ExtenoteConfig;
  objects: VaultObject[];
  relatedProjects?: string[];
  excludeProjects?: string[];
}

/**
 * Provider metadata for discussion platforms
 */
const PROVIDER_INFO: Record<string, { label: string; description: string }> = {
  github: {
    label: "GitHub Discussions",
    description: "Threaded conversations with markdown support, reactions, and notifications.",
  },
  whitewind: {
    label: "WhiteWind",
    description: "Long-form posts on the ATProto/Bluesky network.",
  },
  leaflet: {
    label: "Leaflet",
    description: "Short-form discussion on the ATProto/Bluesky network.",
  },
  googledocs: {
    label: "Google Docs",
    description: "Collaborative document with inline comments.",
  },
};

/**
 * Get provider display info
 */
function getProviderInfo(provider: string): { label: string; description: string } {
  return PROVIDER_INFO[provider] ?? {
    label: provider.charAt(0).toUpperCase() + provider.slice(1),
    description: "",
  };
}

/**
 * Generate network data for a project
 */
export async function generateNetworkData(options: GenerateNetworkOptions): Promise<NetworkData> {
  const { projectName, config, objects, relatedProjects = [], excludeProjects = [] } = options;

  // Find the project profile
  const profile = config.projectProfiles?.find(p => p.name === projectName);
  const projectWebsite = getProjectWebsite(config, projectName);

  // Auto-discover related projects from includes
  const autoIncludes = profile?.includes ?? [];
  const allRelated = [...new Set([...autoIncludes, ...relatedProjects])];
  const filteredRelated = allRelated.filter(name => !excludeProjects.includes(name));

  // Build related projects info (only include projects with actual websites)
  const relatedProjectsData = filteredRelated
    .map(name => {
      const websiteInfo = getProjectWebsite(config, name);
      if (!websiteInfo?.url) return null;

      return {
        name,
        title: websiteInfo.title ?? formatProjectTitle(name),
        description: undefined, // Could add descriptions to project profiles later
        website: websiteInfo.url,
      };
    })
    .filter((project): project is NonNullable<typeof project> => Boolean(project));

  // Find discussions for this project (deduplicate by URL)
  const discussionMap = new Map<string, { provider: string; url: string; label: string; description: string }>();

  objects
    .filter(obj =>
      obj.type === "project_discussion" &&
      obj.frontmatter.project === projectName
    )
    .forEach(obj => {
      // Extract discussion URLs from frontmatter
      for (const [key, value] of Object.entries(obj.frontmatter)) {
        if (key.endsWith("_url") && typeof value === "string") {
          const provider = key.replace("_url", "");
          // Use URL as key to deduplicate
          if (!discussionMap.has(value)) {
            const info = getProviderInfo(provider);
            discussionMap.set(value, {
              provider,
              url: value,
              label: info.label,
              description: info.description,
            });
          }
        }
      }
    });

  const discussions = Array.from(discussionMap.values());

  // Extract project links
  const links = {
    github: projectWebsite?.github ?? undefined,
    website: projectWebsite?.url ?? undefined,
  };

  return {
    projectName,
    projectTitle: formatProjectTitle(projectName),
    links,
    relatedProjects: relatedProjectsData,
    discussions,
    generatedAt: new Date().toISOString(),
  };
}
