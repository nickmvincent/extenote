import type { DiscussionPlugin } from "./types.js";
import { GitHubDiscussionPlugin } from "./providers/github.js";
import { LeafletPlugin } from "./providers/leaflet.js";
import { WhiteWindPlugin } from "./providers/whitewind.js";
import { GoogleDocsPlugin } from "./providers/googledocs.js";

export * from "./types.js";
export {
  publishDiscussions,
  publishProjectDiscussion,
  writeDiscussionObjects,
  writeProjectDiscussionObject,
  updateSourceFrontmatter,
  generateDiscussionObject,
  generateProjectDiscussionObject,
} from "./publish.js";
export type {
  PublishProjectDiscussionOptions,
  ProjectDiscussionResult,
} from "./publish.js";

const builtinPlugins: DiscussionPlugin[] = [
  new GitHubDiscussionPlugin(),
  new LeafletPlugin(),
  new WhiteWindPlugin(),
  new GoogleDocsPlugin(),
];

export class DiscussionPluginRegistry {
  private plugins = new Map<string, DiscussionPlugin>();

  constructor(registerBuiltins = true) {
    if (registerBuiltins) {
      for (const plugin of builtinPlugins) {
        this.register(plugin);
      }
    }
  }

  register(plugin: DiscussionPlugin): void {
    this.plugins.set(plugin.name, plugin);
  }

  unregister(name: string): boolean {
    return this.plugins.delete(name);
  }

  get(name: string): DiscussionPlugin | undefined {
    return this.plugins.get(name);
  }

  has(name: string): boolean {
    return this.plugins.has(name);
  }

  all(): DiscussionPlugin[] {
    return Array.from(this.plugins.values());
  }

  names(): string[] {
    return Array.from(this.plugins.keys());
  }
}

// Default singleton registry
let defaultRegistry: DiscussionPluginRegistry | null = null;

export function getDiscussionRegistry(): DiscussionPluginRegistry {
  if (!defaultRegistry) {
    defaultRegistry = new DiscussionPluginRegistry();
  }
  return defaultRegistry;
}

export function registerDiscussionPlugin(plugin: DiscussionPlugin): void {
  getDiscussionRegistry().register(plugin);
}
