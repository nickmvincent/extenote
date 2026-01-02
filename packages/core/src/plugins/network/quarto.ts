import fs from "fs/promises";
import path from "path";
import { load, dump } from "js-yaml";
import type { NetworkData } from "../../types.js";

/**
 * Generate a Quarto discussions page (.qmd) from network data
 */
export function generateQuartoDiscussionsPage(
  data: NetworkData,
  includeProjectLinks = true
): string {
  const lines: string[] = [];

  // YAML frontmatter
  lines.push("---");
  lines.push("title: \"Discussions & Network\"");
  lines.push("---");
  lines.push("");

  // Discussions section
  if (data.discussions.length > 0) {
    lines.push("## Join the Discussion");
    lines.push("");
    for (const d of data.discussions) {
      const label = (d as any).label ?? formatProviderName(d.provider);
      const description = (d as any).description;
      lines.push(`- [${label}](${d.url})${description ? ` — ${description}` : ""}`);
    }
    lines.push("");
  }

  // Related projects section
  if (data.relatedProjects.length > 0) {
    lines.push("## Related Projects");
    lines.push("");
    for (const p of data.relatedProjects) {
      const title = p.title ?? p.name;
      if (p.website) {
        lines.push(`- [${title}](${p.website})`);
      } else {
        lines.push(`- ${title}`);
      }
      if (p.description) {
        lines.push(`  - ${p.description}`);
      }
    }
    lines.push("");
  }

  // Project links section
  if (includeProjectLinks && (data.links.github || data.links.website)) {
    lines.push("## Project Links");
    lines.push("");
    if (data.links.github) {
      lines.push(`- [GitHub Repository](${data.links.github})`);
    }
    if (data.links.website) {
      lines.push(`- [Live Site](${data.links.website})`);
    }
    lines.push("");
  }

  // Footer
  lines.push("---");
  lines.push("");
  lines.push(`*Generated on ${new Date(data.generatedAt).toLocaleDateString()}*`);
  lines.push("");

  return lines.join("\n");
}

/**
 * Format provider name for display
 */
function formatProviderName(provider: string): string {
  const names: Record<string, string> = {
    github: "GitHub Discussions",
    whitewind: "WhiteWind",
    leaflet: "Leaflet",
    googledocs: "Google Docs",
  };
  return names[provider] ?? provider.charAt(0).toUpperCase() + provider.slice(1);
}

/**
 * Update _quarto.yml to add discussions page to navbar
 */
export async function updateQuartoNavbar(
  projectDir: string,
  addToNavbar: boolean
): Promise<void> {
  if (!addToNavbar) return;

  const quartoConfigPath = path.join(projectDir, "_quarto.yml");

  try {
    const content = await fs.readFile(quartoConfigPath, "utf8");
    const config = load(content) as Record<string, unknown>;

    // Handle website type
    if (config.website && typeof config.website === "object") {
      const website = config.website as Record<string, unknown>;

      if (website.navbar && typeof website.navbar === "object") {
        const navbar = website.navbar as Record<string, unknown>;
        const left = (navbar.left as Array<{ text: string; href: string }>) ?? [];

        // Check if discussions is already in navbar
        const hasDiscussions = left.some(
          item => item.href === "discussions.qmd" || item.text?.toLowerCase() === "discussions"
        );

        if (!hasDiscussions) {
          left.push({
            text: "Discussions",
            href: "discussions.qmd"
          });
          navbar.left = left;

          const updatedContent = dump(config, { lineWidth: -1 });
          await fs.writeFile(quartoConfigPath, updatedContent, "utf8");
        }
      }
    }

    // Handle book type
    if (config.book && typeof config.book === "object") {
      const book = config.book as Record<string, unknown>;
      const chapters = (book.chapters as Array<unknown>) ?? [];

      // Check if discussions is already in chapters
      const hasDiscussions = chapters.some(ch => {
        if (typeof ch === "string") return ch === "discussions.qmd";
        if (typeof ch === "object" && ch !== null) {
          const part = ch as Record<string, unknown>;
          if (part.chapters && Array.isArray(part.chapters)) {
            return (part.chapters as string[]).includes("discussions.qmd");
          }
        }
        return false;
      });

      if (!hasDiscussions) {
        // Add as a chapter before references if it exists, otherwise at the end
        const refsIndex = chapters.findIndex(ch =>
          typeof ch === "string" && ch.includes("references")
        );

        if (refsIndex > 0) {
          chapters.splice(refsIndex, 0, "discussions.qmd");
        } else {
          chapters.push("discussions.qmd");
        }

        book.chapters = chapters;

        const updatedContent = dump(config, { lineWidth: -1 });
        await fs.writeFile(quartoConfigPath, updatedContent, "utf8");
      }
    }
  } catch (error) {
    // If _quarto.yml doesn't exist or can't be read, skip navbar update
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

/**
 * Write Quarto output files
 */
export async function writeQuartoOutput(
  data: NetworkData,
  projectDir: string,
  addToNavbar: boolean,
  includeProjectLinks: boolean
): Promise<void> {
  // Generate and write discussions.qmd
  const qmdContent = generateQuartoDiscussionsPage(data, includeProjectLinks);
  const qmdPath = path.join(projectDir, "discussions.qmd");
  await fs.writeFile(qmdPath, qmdContent, "utf8");

  // Update navbar if requested
  await updateQuartoNavbar(projectDir, addToNavbar);
}
