import { GitHubDiscussionPlugin } from "./providers/github.js";
import { LeafletPlugin } from "./providers/leaflet.js";
import { GoogleDocsPlugin } from "./providers/googledocs.js";
export * from "./types.js";
export { publishDiscussions, writeDiscussionObjects, updateSourceFrontmatter, generateDiscussionObject, } from "./publish.js";
const builtinPlugins = [
    new GitHubDiscussionPlugin(),
    new LeafletPlugin(),
    new GoogleDocsPlugin(),
];
export class DiscussionPluginRegistry {
    plugins = new Map();
    constructor(registerBuiltins = true) {
        if (registerBuiltins) {
            for (const plugin of builtinPlugins) {
                this.register(plugin);
            }
        }
    }
    register(plugin) {
        this.plugins.set(plugin.name, plugin);
    }
    unregister(name) {
        return this.plugins.delete(name);
    }
    get(name) {
        return this.plugins.get(name);
    }
    has(name) {
        return this.plugins.has(name);
    }
    all() {
        return Array.from(this.plugins.values());
    }
    names() {
        return Array.from(this.plugins.keys());
    }
}
// Default singleton registry
let defaultRegistry = null;
export function getDiscussionRegistry() {
    if (!defaultRegistry) {
        defaultRegistry = new DiscussionPluginRegistry();
    }
    return defaultRegistry;
}
export function registerDiscussionPlugin(plugin) {
    getDiscussionRegistry().register(plugin);
}
