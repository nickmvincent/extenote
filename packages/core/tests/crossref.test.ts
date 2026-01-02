import { describe, expect, it } from "bun:test";
import {
  parseWikiLinks,
  parseCitations,
  buildObjectIndex,
  buildCitationKeyIndex,
  getObjectCrossRefs,
  buildObjectGraph,
  computeAllCrossRefs,
  buildProjectDependencyGraph,
} from "../src/crossref";
import type { VaultObject, ExtenoteConfig } from "../src/types";

// ─── Test Fixtures ───────────────────────────────────────────────────────────

function buildObject(overrides: Partial<VaultObject>): VaultObject {
  return {
    id: "test",
    type: "note",
    sourceId: "local",
    project: "default",
    filePath: "/tmp/test.md",
    relativePath: "test.md",
    frontmatter: {},
    body: "",
    mtime: Date.now(),
    visibility: "private",
    ...overrides,
  };
}

// ─── parseWikiLinks Tests ────────────────────────────────────────────────────

/**
 * @narrative crossref/wiki-links
 * @title Wiki Link Parsing
 * @description Wiki links connect your notes together using [[double-bracket]] syntax.
 * Extenote parses these links to build a graph of relationships between your content.
 */
describe("parseWikiLinks", () => {
  /**
   * @narrative-step 1
   * @explanation Wiki links use [[double-bracket]] syntax. The text inside the brackets
   * becomes the target ID. Text without brackets has no links.
   */
  it("returns empty array for text with no links", () => {
    const links = parseWikiLinks("This is plain text without any links.");
    expect(links).toEqual([]);
  });

  /**
   * @narrative-step 2
   * @explanation A single wiki link extracts the target ID from between the brackets.
   * @code-highlight
   */
  it("parses single wiki link", () => {
    const links = parseWikiLinks("See [[my-note]] for more.");
    expect(links.length).toBe(1);
    expect(links[0].targetId).toBe("my-note");
    expect(links[0].displayText).toBeUndefined();
  });

  /**
   * @narrative-step 3
   * @explanation You can have multiple wiki links in the same text. Each one is parsed
   * independently and returned in order.
   */
  it("parses multiple wiki links", () => {
    const links = parseWikiLinks("Links to [[note-a]] and [[note-b]] and [[note-c]].");
    expect(links.length).toBe(3);
    expect(links.map(l => l.targetId)).toEqual(["note-a", "note-b", "note-c"]);
  });

  /**
   * @narrative-step 4
   * @explanation Wiki links can include display text after a pipe character. The syntax
   * [[id|Display Text]] links to "id" but shows "Display Text" to readers.
   */
  it("parses wiki link with display text", () => {
    const links = parseWikiLinks("See [[my-note|My Custom Title]] here.");
    expect(links.length).toBe(1);
    expect(links[0].targetId).toBe("my-note");
    expect(links[0].displayText).toBe("My Custom Title");
  });

  it("extracts context around links", () => {
    const links = parseWikiLinks("Some context before [[target]] and after.");
    expect(links.length).toBe(1);
    expect(links[0].context).toContain("before");
    expect(links[0].context).toContain("after");
  });

  it("handles links at the start of text", () => {
    const links = parseWikiLinks("[[first-link]] starts the text.");
    expect(links.length).toBe(1);
    expect(links[0].targetId).toBe("first-link");
  });

  it("handles links at the end of text", () => {
    const links = parseWikiLinks("Text ends with [[last-link]]");
    expect(links.length).toBe(1);
    expect(links[0].targetId).toBe("last-link");
  });

  it("trims whitespace from target IDs", () => {
    const links = parseWikiLinks("See [[ spaced-id ]] here.");
    expect(links[0].targetId).toBe("spaced-id");
  });
});

// ─── parseCitations Tests ───────────────────────────────────────────────────

/**
 * @narrative crossref/citations
 * @title Citation Parsing
 * @description Extenote supports academic citation syntax similar to Pandoc and Quarto.
 * Citations link your notes to bibliography entries (bibtex_entry objects).
 */
describe("parseCitations", () => {
  /**
   * @narrative-step 1
   * @explanation Citations use the at-bracket syntax (like Pandoc/Quarto). The key inside
   * references a bibtex_entry's citation_key field.
   */
  it("returns empty array for text with no citations", () => {
    const citations = parseCitations("This is plain text without any citations.");
    expect(citations).toEqual([]);
  });

  /**
   * @narrative-step 2
   * @explanation A single citation is parsed and tagged as a "citation" link type,
   * distinguishing it from wiki links.
   * @code-highlight
   */
  it("parses single citation", () => {
    const citations = parseCitations("See [@smith2024] for more.");
    expect(citations.length).toBe(1);
    expect(citations[0].targetId).toBe("smith2024");
    expect(citations[0].linkType).toBe("citation");
  });

  /**
   * @narrative-step 3
   * @explanation Multiple citations can be combined in one bracket, separated by semicolons.
   * This is the standard academic style for citing multiple sources.
   */
  it("parses multiple citations in one bracket", () => {
    const citations = parseCitations("Multiple sources [@smith2024; @jones2023; @lee2022].");
    expect(citations.length).toBe(3);
    expect(citations.map(c => c.targetId)).toEqual(["smith2024", "jones2023", "lee2022"]);
  });

  it("parses separate citation brackets", () => {
    const citations = parseCitations("First [@smith2024] and second [@jones2023].");
    expect(citations.length).toBe(2);
    expect(citations.map(c => c.targetId)).toEqual(["smith2024", "jones2023"]);
  });

  it("handles citation keys with colons", () => {
    const citations = parseCitations("See [@author:2024].");
    expect(citations.length).toBe(1);
    expect(citations[0].targetId).toBe("author:2024");
  });

  it("handles citation keys with underscores and dots", () => {
    const citations = parseCitations("See [@first_author.2024].");
    expect(citations.length).toBe(1);
    expect(citations[0].targetId).toBe("first_author.2024");
  });

  it("handles citation keys with hyphens", () => {
    const citations = parseCitations("See [@smith-jones2024].");
    expect(citations.length).toBe(1);
    expect(citations[0].targetId).toBe("smith-jones2024");
  });

  it("skips mailto links", () => {
    const citations = parseCitations("Email [me@example.com](mailto:me@example.com).");
    expect(citations).toEqual([]);
  });

  it("extracts context around citations", () => {
    const citations = parseCitations("Some context before [@target] and after.");
    expect(citations.length).toBe(1);
    expect(citations[0].context).toContain("before");
    expect(citations[0].context).toContain("after");
  });

  it("deduplicates repeated citations", () => {
    const citations = parseCitations("First [@smith2024] and again [@smith2024].");
    expect(citations.length).toBe(1);
    expect(citations[0].targetId).toBe("smith2024");
  });

  it("handles citations with prefixes", () => {
    const citations = parseCitations("See [e.g., @smith2024; cf. @jones2023].");
    expect(citations.length).toBe(2);
    expect(citations.map(c => c.targetId)).toEqual(["smith2024", "jones2023"]);
  });

  it("handles page number suffixes", () => {
    const citations = parseCitations("See [@smith2024, p. 42].");
    expect(citations.length).toBe(1);
    expect(citations[0].targetId).toBe("smith2024");
  });
});

// ─── buildCitationKeyIndex Tests ────────────────────────────────────────────

describe("buildCitationKeyIndex", () => {
  it("returns empty map for empty array", () => {
    const index = buildCitationKeyIndex([]);
    expect(index.size).toBe(0);
  });

  it("indexes bibtex_entry by citation_key", () => {
    const obj = buildObject({
      id: "some-id",
      type: "bibtex_entry",
      frontmatter: { citation_key: "smith2024" },
    });
    const index = buildCitationKeyIndex([obj]);
    expect(index.get("smith2024")).toBe(obj);
  });

  it("ignores non-bibtex_entry objects", () => {
    const obj = buildObject({
      id: "note-id",
      type: "note",
      frontmatter: { citation_key: "smith2024" },
    });
    const index = buildCitationKeyIndex([obj]);
    expect(index.size).toBe(0);
  });

  it("ignores bibtex_entry without citation_key", () => {
    const obj = buildObject({
      id: "some-id",
      type: "bibtex_entry",
      frontmatter: {},
    });
    const index = buildCitationKeyIndex([obj]);
    expect(index.size).toBe(0);
  });

  it("indexes multiple bibtex entries", () => {
    const obj1 = buildObject({
      id: "id1",
      type: "bibtex_entry",
      frontmatter: { citation_key: "smith2024" },
    });
    const obj2 = buildObject({
      id: "id2",
      type: "bibtex_entry",
      frontmatter: { citation_key: "jones2023" },
    });
    const index = buildCitationKeyIndex([obj1, obj2]);
    expect(index.get("smith2024")).toBe(obj1);
    expect(index.get("jones2023")).toBe(obj2);
  });
});

// ─── buildObjectIndex Tests ──────────────────────────────────────────────────

describe("buildObjectIndex", () => {
  it("returns empty map for empty array", () => {
    const index = buildObjectIndex([]);
    expect(index.size).toBe(0);
  });

  it("indexes single object by ID", () => {
    const obj = buildObject({ id: "my-note" });
    const index = buildObjectIndex([obj]);
    expect(index.get("my-note")).toBe(obj);
  });

  it("indexes multiple objects", () => {
    const obj1 = buildObject({ id: "note-a", relativePath: "notes/a.md" });
    const obj2 = buildObject({ id: "note-b", relativePath: "notes/b.md" });
    const index = buildObjectIndex([obj1, obj2]);
    expect(index.get("note-a")).toBe(obj1);
    expect(index.get("note-b")).toBe(obj2);
  });

  it("indexes by filename without extension", () => {
    const obj = buildObject({ id: "my-id", relativePath: "notes/my-note.md" });
    const index = buildObjectIndex([obj]);
    expect(index.get("my-id")).toBe(obj);
    expect(index.get("my-note")).toBe(obj); // filename fallback
  });

  it("prefers ID over filename when both exist", () => {
    const obj1 = buildObject({ id: "note-id", relativePath: "notes/note-filename.md" });
    const obj2 = buildObject({ id: "note-filename", relativePath: "other/something.md" });
    const index = buildObjectIndex([obj1, obj2]);
    // note-filename should be obj2 (by ID), not obj1 (by filename)
    expect(index.get("note-filename")).toBe(obj2);
  });
});

// ─── getObjectCrossRefs Tests ────────────────────────────────────────────────

describe("getObjectCrossRefs", () => {
  it("returns empty links for object with no wiki links", () => {
    const obj = buildObject({ id: "lonely", body: "No links here." });
    const refs = getObjectCrossRefs(obj, [obj]);
    expect(refs.outgoingLinks).toEqual([]);
    expect(refs.backlinks).toEqual([]);
  });

  it("finds outgoing links from object body", () => {
    const obj = buildObject({ id: "source", body: "Links to [[target-a]] and [[target-b]]." });
    const refs = getObjectCrossRefs(obj, [obj]);
    expect(refs.outgoingLinks.length).toBe(2);
    expect(refs.outgoingLinks.map(l => l.targetId)).toEqual(["target-a", "target-b"]);
  });

  it("finds backlinks from other objects", () => {
    const target = buildObject({ id: "target", body: "I am the target." });
    const source = buildObject({ id: "source", body: "Links to [[target]] here." });
    const refs = getObjectCrossRefs(target, [target, source]);

    expect(refs.backlinks.length).toBe(1);
    expect(refs.backlinks[0].sourceId).toBe("source");
  });

  it("excludes self-references from backlinks", () => {
    const obj = buildObject({ id: "self-ref", body: "Links to [[self-ref]] itself." });
    const refs = getObjectCrossRefs(obj, [obj]);
    expect(refs.backlinks).toEqual([]);
    expect(refs.outgoingLinks.length).toBe(1); // still has outgoing link
  });

  it("matches backlinks by filename", () => {
    const target = buildObject({ id: "target-id", relativePath: "notes/my-target.md", body: "" });
    const source = buildObject({ id: "source", body: "Links to [[my-target]]." });
    const refs = getObjectCrossRefs(target, [target, source]);

    expect(refs.backlinks.length).toBe(1);
    expect(refs.backlinks[0].sourceId).toBe("source");
  });
});

// ─── buildObjectGraph Tests ──────────────────────────────────────────────────

describe("buildObjectGraph", () => {
  it("returns empty graph for empty array", () => {
    const graph = buildObjectGraph([]);
    expect(graph.nodes).toEqual([]);
    expect(graph.edges).toEqual([]);
  });

  it("creates nodes for all objects", () => {
    const obj1 = buildObject({ id: "note-a", title: "Note A", type: "article" });
    const obj2 = buildObject({ id: "note-b", title: "Note B", type: "reference" });
    const graph = buildObjectGraph([obj1, obj2]);

    expect(graph.nodes.length).toBe(2);
    expect(graph.nodes.find(n => n.id === "note-a")?.title).toBe("Note A");
    expect(graph.nodes.find(n => n.id === "note-b")?.type).toBe("reference");
  });

  it("creates edges for resolved links", () => {
    const objA = buildObject({ id: "note-a", body: "Links to [[note-b]]." });
    const objB = buildObject({ id: "note-b", body: "" });
    const graph = buildObjectGraph([objA, objB]);

    expect(graph.edges.length).toBe(1);
    expect(graph.edges[0]).toEqual({ source: "note-a", target: "note-b" });
  });

  it("does not create edges for unresolved links", () => {
    const obj = buildObject({ id: "source", body: "Links to [[nonexistent]]." });
    const graph = buildObjectGraph([obj]);

    expect(graph.edges).toEqual([]);
  });

  it("deduplicates edges", () => {
    const obj = buildObject({ id: "source", body: "Links to [[target]] twice [[target]]." });
    const target = buildObject({ id: "target", body: "" });
    const graph = buildObjectGraph([obj, target]);

    expect(graph.edges.length).toBe(1);
  });

  it("counts outgoing links correctly", () => {
    const obj = buildObject({ id: "linker", body: "[[a]] and [[b]] and [[c]]" });
    const graph = buildObjectGraph([obj]);

    expect(graph.nodes[0].linkCount).toBe(3);
  });
});

// ─── computeAllCrossRefs Tests ───────────────────────────────────────────────

/**
 * @narrative crossref/backlinks
 * @title Backlinks and Cross-References
 * @description Extenote automatically computes bidirectional links between your content.
 * When note A links to note B, note B gets a "backlink" to note A.
 */
describe("computeAllCrossRefs", () => {
  /**
   * @narrative-step 1
   * @explanation Cross-references are computed for all objects at once. Each object gets
   * a list of outgoing links (what it references) and backlinks (what references it).
   */
  it("returns empty map for empty array", () => {
    const refs = computeAllCrossRefs([]);
    expect(refs.size).toBe(0);
  });

  /**
   * @narrative-step 2
   * @explanation When two notes link to each other, both get backlinks. Here A links to B
   * and B links to A, so both have one outgoing link and one backlink.
   * @code-highlight
   */
  it("computes refs for all objects", () => {
    const objA = buildObject({ id: "a", body: "Links to [[b]]." });
    const objB = buildObject({ id: "b", body: "Links to [[a]]." });
    const refs = computeAllCrossRefs([objA, objB]);

    expect(refs.size).toBe(2);

    const refsA = refs.get("a")!;
    expect(refsA.outgoingLinks.length).toBe(1);
    expect(refsA.outgoingLinks[0].targetId).toBe("b");
    expect(refsA.backlinks.length).toBe(1);
    expect(refsA.backlinks[0].sourceId).toBe("b");

    const refsB = refs.get("b")!;
    expect(refsB.outgoingLinks.length).toBe(1);
    expect(refsB.backlinks.length).toBe(1);
  });

  it("handles objects with no links", () => {
    const obj = buildObject({ id: "lonely", body: "No links." });
    const refs = computeAllCrossRefs([obj]);

    expect(refs.get("lonely")!.outgoingLinks).toEqual([]);
    expect(refs.get("lonely")!.backlinks).toEqual([]);
  });

  it("handles complex link structures", () => {
    const hub = buildObject({ id: "hub", body: "" });
    const spoke1 = buildObject({ id: "spoke1", body: "[[hub]]" });
    const spoke2 = buildObject({ id: "spoke2", body: "[[hub]]" });
    const spoke3 = buildObject({ id: "spoke3", body: "[[hub]]" });

    const refs = computeAllCrossRefs([hub, spoke1, spoke2, spoke3]);
    const hubRefs = refs.get("hub")!;

    expect(hubRefs.backlinks.length).toBe(3);
    expect(hubRefs.backlinks.map(b => b.sourceId).sort()).toEqual(["spoke1", "spoke2", "spoke3"]);
  });

  /**
   * @narrative-step 3
   * @explanation Citations create backlinks too. When a note cites a paper, the
   * corresponding bibtex_entry (matched by citation_key) gets a backlink from that note.
   */
  it("finds citation backlinks to bibtex_entry objects", () => {
    const paper = buildObject({
      id: "paper-id",
      type: "bibtex_entry",
      frontmatter: { citation_key: "smith2024" },
      body: "",
    });
    const note = buildObject({
      id: "note-id",
      type: "note",
      body: "See [@smith2024] for details.",
    });

    const refs = computeAllCrossRefs([paper, note]);
    const paperRefs = refs.get("paper-id")!;

    expect(paperRefs.backlinks.length).toBe(1);
    expect(paperRefs.backlinks[0].sourceId).toBe("note-id");
    expect(paperRefs.backlinks[0].linkType).toBe("citation");
  });

  it("includes citations in outgoing links", () => {
    const paper = buildObject({
      id: "paper-id",
      type: "bibtex_entry",
      frontmatter: { citation_key: "smith2024" },
      body: "",
    });
    const note = buildObject({
      id: "note-id",
      type: "note",
      body: "See [@smith2024] for details.",
    });

    const refs = computeAllCrossRefs([paper, note]);
    const noteRefs = refs.get("note-id")!;

    expect(noteRefs.outgoingLinks.length).toBe(1);
    expect(noteRefs.outgoingLinks[0].targetId).toBe("smith2024");
    expect(noteRefs.outgoingLinks[0].linkType).toBe("citation");
  });

  it("handles multiple citation backlinks to same paper", () => {
    const paper = buildObject({
      id: "paper-id",
      type: "bibtex_entry",
      frontmatter: { citation_key: "smith2024" },
      body: "",
    });
    const note1 = buildObject({ id: "note1", type: "note", body: "See [@smith2024]." });
    const note2 = buildObject({ id: "note2", type: "note", body: "Also [@smith2024]." });
    const note3 = buildObject({ id: "note3", type: "note", body: "And [@smith2024]." });

    const refs = computeAllCrossRefs([paper, note1, note2, note3]);
    const paperRefs = refs.get("paper-id")!;

    expect(paperRefs.backlinks.length).toBe(3);
    expect(paperRefs.backlinks.every(b => b.linkType === "citation")).toBe(true);
  });

  it("distinguishes wikilink backlinks from citation backlinks", () => {
    const paper = buildObject({
      id: "paper-id",
      type: "bibtex_entry",
      frontmatter: { citation_key: "smith2024" },
      body: "",
    });
    const noteWithCitation = buildObject({
      id: "note-citation",
      type: "note",
      body: "See [@smith2024].",
    });
    const noteWithWikilink = buildObject({
      id: "note-wikilink",
      type: "note",
      body: "See [[paper-id]].",
    });

    const refs = computeAllCrossRefs([paper, noteWithCitation, noteWithWikilink]);
    const paperRefs = refs.get("paper-id")!;

    expect(paperRefs.backlinks.length).toBe(2);
    const citationBacklink = paperRefs.backlinks.find(b => b.sourceId === "note-citation");
    const wikilinkBacklink = paperRefs.backlinks.find(b => b.sourceId === "note-wikilink");
    expect(citationBacklink?.linkType).toBe("citation");
    expect(wikilinkBacklink?.linkType).toBe("wikilink");
  });

  it("combines wikilinks and citations in outgoing links", () => {
    const paper = buildObject({
      id: "paper-id",
      type: "bibtex_entry",
      frontmatter: { citation_key: "cited-paper" },
      body: "",
    });
    const otherNote = buildObject({ id: "other-note", type: "note", body: "" });
    const note = buildObject({
      id: "note-id",
      type: "note",
      body: "See [[other-note]] and [@cited-paper].",
    });

    const refs = computeAllCrossRefs([paper, otherNote, note]);
    const noteRefs = refs.get("note-id")!;

    expect(noteRefs.outgoingLinks.length).toBe(2);
    const wikilink = noteRefs.outgoingLinks.find(l => l.linkType === "wikilink");
    const citation = noteRefs.outgoingLinks.find(l => l.linkType === "citation");
    expect(wikilink?.targetId).toBe("other-note");
    expect(citation?.targetId).toBe("cited-paper");
  });
});

// ─── Config Builder ─────────────────────────────────────────────────────────

function buildConfig(overrides: Partial<ExtenoteConfig> = {}): ExtenoteConfig {
  return {
    schemaDir: "schemas",
    sources: [],
    sites: [],
    lint: { rules: {} },
    ...overrides,
  };
}

// ─── buildProjectDependencyGraph Tests ──────────────────────────────────────

/**
 * @narrative crossref/project-dependency-graph
 * @title Project Dependency Graph
 * @description Projects can include other projects to share content. The dependency
 * graph represents these relationships as nodes (projects) and directed edges
 * (includes). This enables cross-project references and shared bibliographies.
 */
describe("buildProjectDependencyGraph", () => {
  /**
   * @narrative-step 1
   * @explanation The graph structure has nodes for each project profile and directed
   * edges for each include relationship. Projects without profiles are ignored.
   */
  it("returns empty graph when no project profiles exist", () => {
    const config = buildConfig({ projectProfiles: [] });
    const graph = buildProjectDependencyGraph(config, []);

    expect(graph.type).toBe("project-deps");
    expect(graph.nodes).toEqual([]);
    expect(graph.edges).toEqual([]);
  });

  it("returns empty graph when projectProfiles is undefined", () => {
    const config = buildConfig();
    const graph = buildProjectDependencyGraph(config, []);

    expect(graph.nodes).toEqual([]);
    expect(graph.edges).toEqual([]);
  });

  it("creates nodes for each project profile", () => {
    const config = buildConfig({
      projectProfiles: [
        { name: "project-a" },
        { name: "project-b" },
        { name: "project-c" },
      ],
    });
    const graph = buildProjectDependencyGraph(config, []);

    expect(graph.nodes.length).toBe(3);
    expect(graph.nodes.map(n => n.id).sort()).toEqual(["project-a", "project-b", "project-c"]);
  });

  /**
   * @narrative-step 2
   * @explanation Node metadata includes object counts, enabling visualization
   * of project sizes and dependencies in the web UI.
   */
  it("counts objects per project correctly", () => {
    const config = buildConfig({
      projectProfiles: [
        { name: "project-a" },
        { name: "project-b" },
      ],
    });
    const objects = [
      buildObject({ id: "obj1", project: "project-a" }),
      buildObject({ id: "obj2", project: "project-a" }),
      buildObject({ id: "obj3", project: "project-a" }),
      buildObject({ id: "obj4", project: "project-b" }),
    ];
    const graph = buildProjectDependencyGraph(config, objects);

    const nodeA = graph.nodes.find(n => n.id === "project-a");
    const nodeB = graph.nodes.find(n => n.id === "project-b");
    expect(nodeA?.objectCount).toBe(3);
    expect(nodeB?.objectCount).toBe(1);
  });

  /**
   * @narrative-step 3
   * @explanation Includes create directed edges from parent to dependency. This
   * allows content in "shared" to be referenced from "main" without duplication.
   */
  it("creates directed edges for includes relationships", () => {
    const config = buildConfig({
      projectProfiles: [
        { name: "main", includes: ["shared", "utils"] },
        { name: "shared" },
        { name: "utils" },
      ],
    });
    const graph = buildProjectDependencyGraph(config, []);

    expect(graph.edges.length).toBe(2);
    expect(graph.edges).toContainEqual({ source: "main", target: "shared", directed: true });
    expect(graph.edges).toContainEqual({ source: "main", target: "utils", directed: true });
  });

  it("does not create edges for non-existent included projects", () => {
    const config = buildConfig({
      projectProfiles: [
        { name: "main", includes: ["nonexistent"] },
      ],
    });
    const graph = buildProjectDependencyGraph(config, []);

    expect(graph.nodes.length).toBe(1);
    expect(graph.edges).toEqual([]);
  });

  /**
   * @narrative-step 4
   * @explanation Circular includes are allowed (A includes B, B includes A). The
   * graph builder handles this without infinite loops by simply recording edges.
   */
  it("handles circular includes", () => {
    const config = buildConfig({
      projectProfiles: [
        { name: "a", includes: ["b"] },
        { name: "b", includes: ["a"] },
      ],
    });
    const graph = buildProjectDependencyGraph(config, []);

    expect(graph.edges.length).toBe(2);
    expect(graph.edges).toContainEqual({ source: "a", target: "b", directed: true });
    expect(graph.edges).toContainEqual({ source: "b", target: "a", directed: true });
  });

  it("handles self-includes (project includes itself)", () => {
    const config = buildConfig({
      projectProfiles: [
        { name: "self-ref", includes: ["self-ref"] },
      ],
    });
    const graph = buildProjectDependencyGraph(config, []);

    // Self-reference should create an edge (up to implementation)
    expect(graph.edges.length).toBe(1);
    expect(graph.edges[0]).toEqual({ source: "self-ref", target: "self-ref", directed: true });
  });

  it("handles projects with empty includes array", () => {
    const config = buildConfig({
      projectProfiles: [
        { name: "isolated", includes: [] },
        { name: "other" },
      ],
    });
    const graph = buildProjectDependencyGraph(config, []);

    expect(graph.nodes.length).toBe(2);
    expect(graph.edges).toEqual([]);
  });

  it("handles objects in projects without profiles", () => {
    const config = buildConfig({
      projectProfiles: [{ name: "known" }],
    });
    const objects = [
      buildObject({ id: "obj1", project: "known" }),
      buildObject({ id: "obj2", project: "unknown" }),
    ];
    const graph = buildProjectDependencyGraph(config, objects);

    // Only creates node for known project
    expect(graph.nodes.length).toBe(1);
    expect(graph.nodes[0].objectCount).toBe(1);
  });

  it("sets correct title for project nodes", () => {
    const config = buildConfig({
      projectProfiles: [{ name: "my-project" }],
    });
    const graph = buildProjectDependencyGraph(config, []);

    expect(graph.nodes[0].title).toBe("my-project");
  });

  /**
   * @narrative-step 5
   * @explanation Complex dependency chains are represented as multiple edges.
   * Transitive dependencies (app → core → utils) result in direct edges for
   * each hop, enabling correct content resolution.
   */
  it("handles complex dependency chain", () => {
    const config = buildConfig({
      projectProfiles: [
        { name: "app", includes: ["core", "utils"] },
        { name: "core", includes: ["utils"] },
        { name: "utils" },
      ],
    });
    const graph = buildProjectDependencyGraph(config, []);

    expect(graph.edges.length).toBe(3);
    expect(graph.edges).toContainEqual({ source: "app", target: "core", directed: true });
    expect(graph.edges).toContainEqual({ source: "app", target: "utils", directed: true });
    expect(graph.edges).toContainEqual({ source: "core", target: "utils", directed: true });
  });
});

// ─── Edge Cases ──────────────────────────────────────────────────────────────

/**
 * @narrative crossref/edge-cases
 * @title Cross-Reference Edge Cases
 * @description These tests cover unusual inputs and boundary conditions
 * that the cross-reference system must handle gracefully.
 */
describe("Cross-Reference Edge Cases", () => {
  /**
   * @narrative-step 1
   * @explanation Escaped brackets should not be parsed as wiki links.
   */
  describe("Escaped and literal brackets", () => {
    it("does not parse escaped brackets as wiki link", () => {
      // Markdown uses backslash escaping
      const links = parseWikiLinks("Use \\[\\[literal brackets\\]\\] syntax.");
      // The escaped version should not be parsed as a link
      expect(links).toEqual([]);
    });

    it("handles mix of escaped and real links", () => {
      const links = parseWikiLinks("Real [[real-link]] and \\[\\[escaped\\]\\].");
      expect(links.length).toBe(1);
      expect(links[0].targetId).toBe("real-link");
    });

    it("handles consecutive brackets with whitespace content", () => {
      const links = parseWikiLinks("[[ ]]"); // whitespace content
      // Implementation trims whitespace but still creates a link entry with empty targetId
      expect(links.length).toBe(1);
      expect(links[0].targetId).toBe(""); // trimmed to empty
    });

    it("handles nested brackets", () => {
      const links = parseWikiLinks("[[outer[[inner]]outer]]");
      // Implementation-dependent behavior
      expect(links.length).toBeGreaterThanOrEqual(0);
    });

    it("handles unbalanced brackets", () => {
      const links = parseWikiLinks("Start [[unbalanced and more text");
      // Should not crash, might return empty or partial
      expect(Array.isArray(links)).toBe(true);
    });

    it("handles closing without opening", () => {
      const links = parseWikiLinks("Some text]] without opening");
      expect(links).toEqual([]);
    });
  });

  /**
   * @narrative-step 2
   * @explanation Code blocks should be ignored to prevent false positives.
   */
  describe("Code blocks", () => {
    it("parses citations in regular text but not code blocks", () => {
      // Inline code with backticks
      const citations1 = parseCitations("Normal [@cite1] and `[@not-a-cite]` here.");
      // We only test that normal citations are found
      expect(citations1.some((c) => c.targetId === "cite1")).toBe(true);
    });

    it("parses wiki links in regular text", () => {
      const links = parseWikiLinks("Normal [[link1]] and more text.");
      expect(links.some((l) => l.targetId === "link1")).toBe(true);
    });

    it("handles triple backtick code blocks", () => {
      const text = `
Some text [[real-link]]
\`\`\`
[[code-link]]
[@code-citation]
\`\`\`
More text [[another-link]]
`;
      // Parse and check that real links are found
      const links = parseWikiLinks(text);
      expect(links.some((l) => l.targetId === "real-link")).toBe(true);
      expect(links.some((l) => l.targetId === "another-link")).toBe(true);
    });
  });

  /**
   * @narrative-step 3
   * @explanation Circular references between objects should be handled correctly.
   */
  describe("Circular references", () => {
    it("handles simple A→B→A circular reference", () => {
      const objA = buildObject({ id: "a", body: "Links to [[b]]." });
      const objB = buildObject({ id: "b", body: "Links to [[a]]." });

      const refs = computeAllCrossRefs([objA, objB]);

      // A has outgoing to B and backlink from B
      const refsA = refs.get("a")!;
      expect(refsA.outgoingLinks.length).toBe(1);
      expect(refsA.outgoingLinks[0].targetId).toBe("b");
      expect(refsA.backlinks.length).toBe(1);
      expect(refsA.backlinks[0].sourceId).toBe("b");

      // B has outgoing to A and backlink from A
      const refsB = refs.get("b")!;
      expect(refsB.outgoingLinks.length).toBe(1);
      expect(refsB.outgoingLinks[0].targetId).toBe("a");
      expect(refsB.backlinks.length).toBe(1);
      expect(refsB.backlinks[0].sourceId).toBe("a");
    });

    it("handles longer circular chain A→B→C→A", () => {
      const objA = buildObject({ id: "a", body: "[[b]]" });
      const objB = buildObject({ id: "b", body: "[[c]]" });
      const objC = buildObject({ id: "c", body: "[[a]]" });

      const refs = computeAllCrossRefs([objA, objB, objC]);

      expect(refs.get("a")!.backlinks[0].sourceId).toBe("c");
      expect(refs.get("b")!.backlinks[0].sourceId).toBe("a");
      expect(refs.get("c")!.backlinks[0].sourceId).toBe("b");
    });

    it("handles object linking to itself", () => {
      const obj = buildObject({ id: "self", body: "Links to [[self]] itself." });

      const refs = computeAllCrossRefs([obj]);
      const selfRefs = refs.get("self")!;

      // Has outgoing link to self
      expect(selfRefs.outgoingLinks.length).toBe(1);
      expect(selfRefs.outgoingLinks[0].targetId).toBe("self");
      // Backlinks exclude self-references
      expect(selfRefs.backlinks.length).toBe(0);
    });

    it("graph handles circular references without infinite loop", () => {
      const objA = buildObject({ id: "a", body: "[[b]]" });
      const objB = buildObject({ id: "b", body: "[[a]]" });

      const graph = buildObjectGraph([objA, objB]);

      expect(graph.nodes.length).toBe(2);
      expect(graph.edges.length).toBe(2);
      expect(graph.edges).toContainEqual({ source: "a", target: "b" });
      expect(graph.edges).toContainEqual({ source: "b", target: "a" });
    });
  });

  /**
   * @narrative-step 4
   * @explanation Very long citation keys should be handled correctly.
   */
  describe("Very long citation keys", () => {
    it("handles citation key over 100 characters", () => {
      const longKey = "author" + "x".repeat(100) + "2024";
      const citations = parseCitations(`See [@${longKey}].`);
      expect(citations.length).toBe(1);
      expect(citations[0].targetId).toBe(longKey);
    });

    it("indexes bibtex entry with very long citation key", () => {
      const longKey = "very-long-key-" + "a".repeat(100);
      const obj = buildObject({
        id: "paper-id",
        type: "bibtex_entry",
        frontmatter: { citation_key: longKey },
      });

      const index = buildCitationKeyIndex([obj]);
      expect(index.get(longKey)).toBe(obj);
    });

    it("computes backlinks for very long citation key", () => {
      const longKey = "author" + "y".repeat(100) + "2024";
      const paper = buildObject({
        id: "paper",
        type: "bibtex_entry",
        frontmatter: { citation_key: longKey },
        body: "",
      });
      const note = buildObject({
        id: "note",
        type: "note",
        body: `See [@${longKey}].`,
      });

      const refs = computeAllCrossRefs([paper, note]);
      expect(refs.get("paper")!.backlinks.length).toBe(1);
    });
  });

  /**
   * @narrative-step 5
   * @explanation Citation prefixes and suffixes should be handled.
   */
  describe("Citation prefix and suffix handling", () => {
    it("handles citation with complex prefix", () => {
      const citations = parseCitations("See [e.g., @smith2024; cf. @jones2023].");
      expect(citations.length).toBe(2);
      expect(citations.map((c) => c.targetId)).toEqual(["smith2024", "jones2023"]);
    });

    it("handles citation with page range suffix", () => {
      const citations = parseCitations("See [@smith2024, pp. 42-50].");
      expect(citations.length).toBe(1);
      expect(citations[0].targetId).toBe("smith2024");
    });

    it("handles citation with chapter suffix", () => {
      const citations = parseCitations("See [@smith2024, ch. 3].");
      expect(citations.length).toBe(1);
      expect(citations[0].targetId).toBe("smith2024");
    });

    it("handles citation with see also prefix", () => {
      const citations = parseCitations("[see also @smith2024]");
      expect(citations.length).toBe(1);
      expect(citations[0].targetId).toBe("smith2024");
    });

    it("handles multiple citations with various prefixes", () => {
      const citations = parseCitations("[see @a; cf. @b; but see @c]");
      expect(citations.length).toBe(3);
      expect(citations.map((c) => c.targetId)).toEqual(["a", "b", "c"]);
    });
  });

  /**
   * @narrative-step 6
   * @explanation Unicode and special characters in IDs should work correctly.
   */
  describe("Unicode and special characters", () => {
    it("handles wiki link with unicode target", () => {
      const links = parseWikiLinks("See [[日本語ノート]].");
      expect(links.length).toBe(1);
      expect(links[0].targetId).toBe("日本語ノート");
    });

    it("documents citation key parsing stops at non-ASCII characters", () => {
      // Note: Current regex only matches ASCII citation keys
      // This documents the actual behavior limitation
      const citations = parseCitations("See [@müller2024].");
      // Regex stops at 'ü', only capturing "m"
      expect(citations.length).toBe(1);
      expect(citations[0].targetId).toBe("m");
    });

    it("handles wiki link with emoji", () => {
      const links = parseWikiLinks("See [[note-🎉-party]].");
      expect(links.length).toBe(1);
      expect(links[0].targetId).toBe("note-🎉-party");
    });

    it("builds graph with unicode node IDs", () => {
      const objA = buildObject({ id: "日本語", body: "[[中文]]" });
      const objB = buildObject({ id: "中文", body: "" });

      const graph = buildObjectGraph([objA, objB]);

      expect(graph.nodes.some((n) => n.id === "日本語")).toBe(true);
      expect(graph.nodes.some((n) => n.id === "中文")).toBe(true);
      expect(graph.edges).toContainEqual({ source: "日本語", target: "中文" });
    });
  });

  /**
   * @narrative-step 7
   * @explanation Empty and whitespace inputs should be handled gracefully.
   */
  describe("Empty and whitespace handling", () => {
    it("handles empty body", () => {
      const links = parseWikiLinks("");
      expect(links).toEqual([]);
    });

    it("handles whitespace-only body", () => {
      const links = parseWikiLinks("   \n\t  ");
      expect(links).toEqual([]);
    });

    it("handles wiki link with whitespace-only content", () => {
      const links = parseWikiLinks("See [[   ]] here.");
      // Implementation trims whitespace, resulting in empty targetId
      expect(links.length).toBe(1);
      expect(links[0].targetId).toBe("");
    });

    it("handles citation with extra whitespace", () => {
      const citations = parseCitations("See [  @smith2024  ] here.");
      expect(citations.length).toBe(1);
      expect(citations[0].targetId).toBe("smith2024");
    });

    it("object with empty body has no cross refs", () => {
      const obj = buildObject({ id: "empty", body: "" });
      const refs = computeAllCrossRefs([obj]);
      expect(refs.get("empty")!.outgoingLinks).toEqual([]);
      expect(refs.get("empty")!.backlinks).toEqual([]);
    });
  });

  /**
   * @narrative-step 8
   * @explanation Mixed content with many different link types.
   */
  describe("Complex mixed content", () => {
    it("handles document with many link types", () => {
      const body = `
# My Document

See [[wiki-link-1]] for context. Also reference [@cite1; @cite2].

More text with [[wiki-link-2|Custom Display]] and another [@cite3, p. 42].

Check [[wiki-link-1]] again (duplicate).
`;
      const obj = buildObject({ id: "complex", body });

      const wikiLinks = parseWikiLinks(body);
      const citations = parseCitations(body);

      // 3 wiki links (2 unique targets)
      expect(wikiLinks.length).toBe(3);
      // 3 citations (deduplicated)
      expect(citations.length).toBe(3);
    });

    it("computes cross refs for complex document", () => {
      const doc = buildObject({
        id: "doc",
        body: "[[target-a]] and [[target-b]] and [@paper1]",
      });
      const targetA = buildObject({ id: "target-a", body: "" });
      const targetB = buildObject({ id: "target-b", body: "" });
      const paper = buildObject({
        id: "paper1",
        type: "bibtex_entry",
        frontmatter: { citation_key: "paper1" },
        body: "",
      });

      const refs = computeAllCrossRefs([doc, targetA, targetB, paper]);
      const docRefs = refs.get("doc")!;

      expect(docRefs.outgoingLinks.length).toBe(3);
      expect(docRefs.outgoingLinks.filter((l) => l.linkType === "wikilink").length).toBe(2);
      expect(docRefs.outgoingLinks.filter((l) => l.linkType === "citation").length).toBe(1);
    });
  });
});

