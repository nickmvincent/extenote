import type { VaultObject, ExtenoteConfig } from "./types.js";

/**
 * Type of link between objects
 */
export type LinkType = "wikilink" | "citation";

/**
 * Represents a link between two objects
 */
export interface ObjectLink {
  /** The object ID being linked to */
  targetId: string;
  /** The display text (if different from target ID) */
  displayText?: string;
  /** Context around the link (surrounding text) */
  context?: string;
  /** Type of link (wikilink or citation) */
  linkType: LinkType;
}

/**
 * Cross-reference data for a single object
 */
export interface ObjectCrossRefs {
  /** Object ID */
  id: string;
  /** Outgoing links from this object */
  outgoingLinks: ObjectLink[];
  /** Backlinks from other objects to this one */
  backlinks: Array<{
    sourceId: string;
    sourceTitle?: string;
    sourcePath: string;
    context?: string;
    linkType?: LinkType;
  }>;
}

/**
 * Node in the object graph
 */
export interface GraphNode {
  id: string;
  title: string;
  type: string;
  project: string;
  path: string;
  linkCount: number;
}

/**
 * Edge in the object graph
 */
export interface GraphEdge {
  source: string;
  target: string;
  weight?: number;
  directed?: boolean;
}

/**
 * Node representing a project (for project dependency graph)
 */
export interface ProjectGraphNode {
  id: string;
  title: string;
  objectCount: number;
}

/**
 * Graph types available
 */
export type GraphType = "project-deps";

/**
 * Complete graph data for visualization
 */
export interface ObjectGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * Project dependency graph data
 */
export interface ProjectGraph {
  type: "project-deps";
  nodes: ProjectGraphNode[];
  edges: GraphEdge[];
}


/**
 * Regular expression to match [[object-id]] or [[object-id|display text]] links
 */
const WIKI_LINK_REGEX = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

/**
 * Parse wiki-style links from text content
 */
export function parseWikiLinks(text: string): ObjectLink[] {
  const links: ObjectLink[] = [];
  const matches = text.matchAll(WIKI_LINK_REGEX);

  for (const match of matches) {
    const targetId = match[1].trim();
    const displayText = match[2]?.trim();

    // Get context (30 chars before and after)
    const start = Math.max(0, match.index! - 30);
    const end = Math.min(text.length, match.index! + match[0].length + 30);
    const context = text.slice(start, end).replace(/\n/g, ' ').trim();

    links.push({
      targetId,
      displayText,
      context: start > 0 ? `...${context}...` : `${context}...`,
      linkType: "wikilink",
    });
  }

  return links;
}

/**
 * Regular expression to find citation brackets like [@key] or [@key1; @key2]
 */
const CITATION_BRACKET_REGEX = /\[([^\]]*@[^\]]+)\]/g;

/**
 * Regular expression to extract individual citation keys from within brackets
 */
const CITATION_KEY_REGEX = /@([\w][\w:._-]*)/g;

/**
 * Parse Pandoc/Quarto style citations from text content
 * Matches patterns like [@smith2024] or [@smith2024; @jones2023]
 */
export function parseCitations(text: string): ObjectLink[] {
  const links: ObjectLink[] = [];
  const seenKeys = new Set<string>(); // Dedupe within same text

  for (const bracketMatch of text.matchAll(CITATION_BRACKET_REGEX)) {
    const bracketContent = bracketMatch[1];
    const matchEnd = bracketMatch.index! + bracketMatch[0].length;

    // Skip email addresses (mailto: links)
    if (bracketContent.toLowerCase().includes("mailto:")) {
      continue;
    }

    // Skip markdown links - if bracket is immediately followed by (
    if (text[matchEnd] === "(") {
      continue;
    }

    // Get context for this citation bracket
    const start = Math.max(0, bracketMatch.index! - 30);
    const end = Math.min(text.length, matchEnd + 30);
    const context = text.slice(start, end).replace(/\n/g, ' ').trim();
    const contextStr = start > 0 ? `...${context}...` : `${context}...`;

    // Extract all @keys from within the brackets
    for (const keyMatch of bracketContent.matchAll(CITATION_KEY_REGEX)) {
      const citationKey = keyMatch[1];

      // Dedupe - only add first occurrence of each key
      if (!seenKeys.has(citationKey)) {
        seenKeys.add(citationKey);
        links.push({
          targetId: citationKey, // citation_key to match against bibtex_entry
          context: contextStr,
          linkType: "citation",
        });
      }
    }
  }

  return links;
}

/**
 * Build a map of object IDs to objects for quick lookup
 */
export function buildObjectIndex(objects: VaultObject[]): Map<string, VaultObject> {
  const index = new Map<string, VaultObject>();

  for (const obj of objects) {
    // Index by id
    index.set(obj.id, obj);

    // Also index by filename without extension for easier linking
    const filename = obj.relativePath.split('/').pop()?.replace(/\.md$/, '');
    if (filename && !index.has(filename)) {
      index.set(filename, obj);
    }
  }

  return index;
}

/**
 * Build a map of citation keys to bibtex_entry objects
 */
export function buildCitationKeyIndex(objects: VaultObject[]): Map<string, VaultObject> {
  const index = new Map<string, VaultObject>();

  for (const obj of objects) {
    if (obj.type === "bibtex_entry") {
      const citationKey = obj.frontmatter.citation_key;
      if (typeof citationKey === "string" && citationKey) {
        index.set(citationKey, obj);
      }
    }
  }

  return index;
}

/**
 * Get cross-references for a specific object
 */
export function getObjectCrossRefs(
  object: VaultObject,
  allObjects: VaultObject[],
  _objectIndex?: Map<string, VaultObject>
): ObjectCrossRefs {

  // Parse outgoing wikilinks from this object's body
  const outgoingLinks = parseWikiLinks(object.body);

  // Parse outgoing citations from this object's body
  const citations = parseCitations(object.body);
  outgoingLinks.push(...citations);

  // Find backlinks (other objects that link to this one via wikilinks)
  const backlinks: ObjectCrossRefs["backlinks"] = [];

  for (const otherObj of allObjects) {
    if (otherObj.id === object.id) continue;

    // Check wikilinks
    const linksInOther = parseWikiLinks(otherObj.body);
    for (const link of linksInOther) {
      // Check if the link points to our object
      if (
        link.targetId === object.id ||
        link.targetId === object.relativePath.split('/').pop()?.replace(/\.md$/, '')
      ) {
        backlinks.push({
          sourceId: otherObj.id,
          sourceTitle: otherObj.title,
          sourcePath: otherObj.relativePath,
          context: link.context,
          linkType: "wikilink",
        });
      }
    }

    // Check citations (only if this object is a bibtex_entry)
    if (object.type === "bibtex_entry") {
      const citationKey = object.frontmatter.citation_key;
      if (typeof citationKey === "string") {
        const citationsInOther = parseCitations(otherObj.body);
        for (const citation of citationsInOther) {
          if (citation.targetId === citationKey) {
            backlinks.push({
              sourceId: otherObj.id,
              sourceTitle: otherObj.title,
              sourcePath: otherObj.relativePath,
              context: citation.context,
              linkType: "citation",
            });
          }
        }
      }
    }
  }

  return {
    id: object.id,
    outgoingLinks,
    backlinks,
  };
}

/**
 * Build a complete graph of all object cross-references
 */
export function buildObjectGraph(objects: VaultObject[]): ObjectGraph {
  const index = buildObjectIndex(objects);
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const edgeSet = new Set<string>(); // Track unique edges

  // First pass: create all nodes
  for (const obj of objects) {
    const outgoingLinks = parseWikiLinks(obj.body);
    nodes.push({
      id: obj.id,
      title: obj.title || obj.id,
      type: obj.type,
      project: obj.project,
      path: obj.relativePath,
      linkCount: outgoingLinks.length,
    });
  }

  // Second pass: create edges
  for (const obj of objects) {
    const links = parseWikiLinks(obj.body);

    for (const link of links) {
      // Try to resolve the target
      const targetObj = index.get(link.targetId);
      if (targetObj) {
        const edgeKey = `${obj.id}->${targetObj.id}`;
        if (!edgeSet.has(edgeKey)) {
          edgeSet.add(edgeKey);
          edges.push({
            source: obj.id,
            target: targetObj.id,
          });
        }
      }
    }
  }

  return { nodes, edges };
}

/**
 * Get all cross-references for all objects (cached computation)
 * Includes both wikilinks and citations
 */
export function computeAllCrossRefs(objects: VaultObject[]): Map<string, ObjectCrossRefs> {
  const index = buildObjectIndex(objects);
  const result = new Map<string, ObjectCrossRefs>();

  // First, compute all outgoing links (wikilinks + citations)
  const outgoingMap = new Map<string, ObjectLink[]>();
  const citationMap = new Map<string, ObjectLink[]>(); // Keep citations separate for backlink lookup

  for (const obj of objects) {
    const wikilinks = parseWikiLinks(obj.body);
    const citations = parseCitations(obj.body);
    outgoingMap.set(obj.id, [...wikilinks, ...citations]);
    citationMap.set(obj.id, citations);
  }

  // Build a map of citation_key -> object id for bibtex entries
  const citationKeyToId = new Map<string, string>();
  for (const obj of objects) {
    if (obj.type === "bibtex_entry") {
      const citationKey = obj.frontmatter.citation_key;
      if (typeof citationKey === "string" && citationKey) {
        citationKeyToId.set(citationKey, obj.id);
      }
    }
  }

  // Then compute backlinks for each object
  for (const obj of objects) {
    const backlinks: ObjectCrossRefs["backlinks"] = [];

    // Check wikilinks pointing to this object
    for (const [sourceId, links] of outgoingMap) {
      if (sourceId === obj.id) continue;

      for (const link of links) {
        if (link.linkType === "wikilink") {
          if (
            link.targetId === obj.id ||
            link.targetId === obj.relativePath.split('/').pop()?.replace(/\.md$/, '')
          ) {
            const sourceObj = index.get(sourceId);
            if (sourceObj) {
              backlinks.push({
                sourceId,
                sourceTitle: sourceObj.title,
                sourcePath: sourceObj.relativePath,
                context: link.context,
                linkType: "wikilink",
              });
            }
          }
        }
      }
    }

    // Check citations pointing to this object (if it's a bibtex_entry)
    if (obj.type === "bibtex_entry") {
      const citationKey = obj.frontmatter.citation_key;
      if (typeof citationKey === "string" && citationKey) {
        for (const [sourceId, citations] of citationMap) {
          if (sourceId === obj.id) continue;

          for (const citation of citations) {
            if (citation.targetId === citationKey) {
              const sourceObj = index.get(sourceId);
              if (sourceObj) {
                backlinks.push({
                  sourceId,
                  sourceTitle: sourceObj.title,
                  sourcePath: sourceObj.relativePath,
                  context: citation.context,
                  linkType: "citation",
                });
              }
            }
          }
        }
      }
    }

    result.set(obj.id, {
      id: obj.id,
      outgoingLinks: outgoingMap.get(obj.id) || [],
      backlinks,
    });
  }

  return result;
}

/**
 * Build a graph of project dependencies based on includes relationships
 */
export function buildProjectDependencyGraph(
  config: ExtenoteConfig,
  objects: VaultObject[]
): ProjectGraph {
  const nodes: ProjectGraphNode[] = [];
  const edges: GraphEdge[] = [];

  const profiles = config.projectProfiles ?? [];

  // Count objects per project
  const objectCounts = new Map<string, number>();
  for (const obj of objects) {
    objectCounts.set(obj.project, (objectCounts.get(obj.project) ?? 0) + 1);
  }

  // Create nodes for each project
  for (const profile of profiles) {
    nodes.push({
      id: profile.name,
      title: profile.name,
      objectCount: objectCounts.get(profile.name) ?? 0,
    });
  }

  // Create directed edges based on includes
  for (const profile of profiles) {
    if (profile.includes) {
      for (const includedProject of profile.includes) {
        // Only add edge if included project exists as a node
        if (profiles.some((p) => p.name === includedProject)) {
          edges.push({
            source: profile.name,
            target: includedProject,
            directed: true,
          });
        }
      }
    }
  }

  return { type: "project-deps", nodes, edges };
}

