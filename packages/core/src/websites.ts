import type { ExtenoteConfig, ProjectProfile, DeployConfig, DeployPlatform } from "./types.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ProjectWebsite {
  /** Project name */
  name: string;
  /** Human-readable project title */
  title: string;
  /** Primary URL (custom domain if set, otherwise inferred/configured URL) */
  url: string | null;
  /** Custom domain (e.g., "datalicenses.org") */
  domain: string | null;
  /** Deploy platform URL (may differ from custom domain) */
  platformUrl: string | null;
  /** Deploy platform */
  platform: DeployPlatform;
  /** GitHub repository URL (if available) */
  github: string | null;
  /** Website directory name */
  websiteDir: string | null;
  /** Build type (astro, quarto, custom) */
  buildType: string | null;
}

// ─── URL Inference ───────────────────────────────────────────────────────────

/**
 * Infer website URL from deploy configuration
 */
export function inferWebsiteUrl(profile: ProjectProfile): string | null {
  const deploy = profile.deploy;
  if (!deploy || deploy.platform === "none") return null;

  switch (deploy.platform) {
    case "github-pages": {
      // Try to extract from repo URL: https://github.com/user/repo.git -> https://user.github.io/repo
      if (deploy.repo) {
        const match = deploy.repo.match(/github\.com\/([^/]+)\/([^/.]+)/);
        if (match) {
          const [, user, repo] = match;
          return `https://${user}.github.io/${repo}`;
        }
      }
      break;
    }
    case "cloudflare-pages": {
      // Use project name as subdomain (remove hyphens for Cloudflare project name)
      const projectName = profile.name.replace(/-/g, "");
      return `https://${projectName}.pages.dev`;
    }
    case "vercel": {
      return `https://${profile.name}.vercel.app`;
    }
    case "netlify": {
      return `https://${profile.name}.netlify.app`;
    }
  }

  return null;
}

/**
 * Extract GitHub repo URL from deploy config
 */
export function extractGitHubUrl(deploy?: DeployConfig): string | null {
  if (!deploy?.repo) return null;
  // Convert git URL to web URL
  return deploy.repo.replace(/\.git$/, "");
}

/**
 * Format project name as a title (kebab-case to Title Case)
 */
export function formatProjectTitle(name: string): string {
  return name
    .split("-")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// ─── Main Function ───────────────────────────────────────────────────────────

/**
 * Get all project websites from configuration
 */
export function getProjectWebsites(config: ExtenoteConfig): ProjectWebsite[] {
  const profiles = config.projectProfiles ?? [];

  return profiles
    .filter(profile => profile.deploy && profile.deploy.platform !== "none")
    .map(profile => {
      const deploy = profile.deploy!;
      const platformUrl = deploy.url ?? inferWebsiteUrl(profile);
      const domain = deploy.domain ? `https://${deploy.domain.replace(/^https?:\/\//, "")}` : null;

      return {
        name: profile.name,
        title: formatProjectTitle(profile.name),
        // Use custom domain as primary URL if available, otherwise platform URL
        url: domain ?? platformUrl,
        domain: deploy.domain ?? null,
        platformUrl,
        platform: deploy.platform,
        github: extractGitHubUrl(deploy),
        websiteDir: profile.build?.websiteDir ?? null,
        buildType: profile.build?.type ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Get a single project's website info
 */
export function getProjectWebsite(config: ExtenoteConfig, projectName: string): ProjectWebsite | null {
  const profile = config.projectProfiles?.find(p => p.name === projectName);
  if (!profile || !profile.deploy || profile.deploy.platform === "none") {
    return null;
  }

  const deploy = profile.deploy;
  const platformUrl = deploy.url ?? inferWebsiteUrl(profile);
  const domain = deploy.domain ? `https://${deploy.domain.replace(/^https?:\/\//, "")}` : null;

  return {
    name: profile.name,
    title: formatProjectTitle(profile.name),
    url: domain ?? platformUrl,
    domain: deploy.domain ?? null,
    platformUrl,
    platform: deploy.platform,
    github: extractGitHubUrl(deploy),
    websiteDir: profile.build?.websiteDir ?? null,
    buildType: profile.build?.type ?? null,
  };
}
