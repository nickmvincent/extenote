import { describe, expect, it } from "bun:test";
import {
  getObjectTags,
  buildTagTree,
  getAllTags,
  previewTagMutation,
} from "../src/tags";
import type { VaultObject, VaultState } from "../src/types";

// ─── Test Helpers ─────────────────────────────────────────────────────────────

function buildObject(overrides: Partial<VaultObject>): VaultObject {
  return {
    id: "test-object",
    type: "note",
    sourceId: "local",
    project: "test-project",
    filePath: "/tmp/test.md",
    relativePath: "test.md",
    frontmatter: {},
    body: "",
    mtime: Date.now(),
    visibility: "private",
    ...overrides,
  };
}

function buildVault(objects: VaultObject[]): VaultState {
  return {
    objects,
    issues: [],
    config: {
      sources: [],
    },
    schemas: [],
  };
}

// ─── getObjectTags Tests ──────────────────────────────────────────────────────

describe("getObjectTags", () => {
  it("returns empty array when no tags", () => {
    const object = buildObject({ frontmatter: {} });
    expect(getObjectTags(object)).toEqual([]);
  });

  it("returns empty array when tags is undefined", () => {
    const object = buildObject({ frontmatter: { title: "Test" } });
    expect(getObjectTags(object)).toEqual([]);
  });

  it("extracts tags from array", () => {
    const object = buildObject({
      frontmatter: { tags: ["research", "ml", "papers"] },
    });
    expect(getObjectTags(object)).toEqual(["research", "ml", "papers"]);
  });

  it("wraps single string tag in array", () => {
    const object = buildObject({
      frontmatter: { tags: "single-tag" },
    });
    expect(getObjectTags(object)).toEqual(["single-tag"]);
  });

  it("converts non-string array elements to strings", () => {
    const object = buildObject({
      frontmatter: { tags: [123, "text", true] },
    });
    expect(getObjectTags(object)).toEqual(["123", "text", "true"]);
  });

  it("handles hierarchical tags with colons", () => {
    const object = buildObject({
      frontmatter: { tags: ["collection:data-leverage", "status:draft"] },
    });
    expect(getObjectTags(object)).toEqual(["collection:data-leverage", "status:draft"]);
  });
});

// ─── buildTagTree Tests ───────────────────────────────────────────────────────

/**
 * @narrative tags/tree-structure
 * @title Building the Tag Tree
 * @description Extenote organizes tags into a hierarchical tree. Simple tags like "research"
 * become root nodes. Hierarchical tags like "collection:papers" create nested structures
 * where "collection" is the parent and "papers" is a child node.
 */
describe("buildTagTree", () => {
  /**
   * @narrative-step 1
   * @explanation When no objects have tags, the tree is empty with zero counts.
   */
  it("returns empty tree for vault with no tagged objects", () => {
    const vault = buildVault([
      buildObject({ frontmatter: {} }),
      buildObject({ id: "obj2", frontmatter: { title: "No tags" } }),
    ]);

    const tree = buildTagTree(vault);

    expect(tree.roots).toEqual([]);
    expect(tree.totalTags).toBe(0);
    expect(tree.totalTaggedObjects).toBe(0);
  });

  /**
   * @narrative-step 2
   * @explanation Simple tags without colons become root-level nodes. Each node tracks
   * how many objects use that tag. Here, "research" appears in 2 objects, "ml" in 1.
   */
  it("builds flat tree for simple tags", () => {
    const vault = buildVault([
      buildObject({
        id: "obj1",
        relativePath: "obj1.md",
        frontmatter: { tags: ["research"] },
      }),
      buildObject({
        id: "obj2",
        relativePath: "obj2.md",
        frontmatter: { tags: ["research", "ml"] },
      }),
    ]);

    const tree = buildTagTree(vault);

    expect(tree.totalTags).toBe(2);
    expect(tree.totalTaggedObjects).toBe(2);
    expect(tree.roots.length).toBe(2);

    const mlRoot = tree.roots.find((r) => r.name === "ml");
    expect(mlRoot).toBeDefined();
    expect(mlRoot!.count).toBe(1);
    expect(mlRoot!.children).toEqual([]);

    const researchRoot = tree.roots.find((r) => r.name === "research");
    expect(researchRoot).toBeDefined();
    expect(researchRoot!.count).toBe(2);
  });

  /**
   * @narrative-step 3
   * @explanation Colon-separated tags like "collection:papers" create hierarchy.
   * "collection" becomes a parent with "papers" and "data-leverage" as children.
   * Parent counts are the sum of all children.
   * @code-highlight
   */
  it("builds hierarchical tree for colon-separated tags", () => {
    const vault = buildVault([
      buildObject({
        id: "obj1",
        relativePath: "obj1.md",
        frontmatter: { tags: ["collection:data-leverage"] },
      }),
      buildObject({
        id: "obj2",
        relativePath: "obj2.md",
        frontmatter: { tags: ["collection:papers", "collection:data-leverage"] },
      }),
    ]);

    const tree = buildTagTree(vault);

    expect(tree.totalTags).toBe(2);
    expect(tree.roots.length).toBe(1);

    const collectionRoot = tree.roots[0];
    expect(collectionRoot.name).toBe("collection");
    expect(collectionRoot.children.length).toBe(2);
    expect(collectionRoot.count).toBe(3); // Sum of children counts

    const dataLeverageChild = collectionRoot.children.find((c) => c.name === "data-leverage");
    expect(dataLeverageChild).toBeDefined();
    expect(dataLeverageChild!.fullPath).toBe("collection:data-leverage");
    expect(dataLeverageChild!.count).toBe(2);
  });

  it("handles mixed simple and hierarchical tags", () => {
    const vault = buildVault([
      buildObject({
        id: "obj1",
        relativePath: "obj1.md",
        frontmatter: { tags: ["research", "collection:papers"] },
      }),
    ]);

    const tree = buildTagTree(vault);

    expect(tree.totalTags).toBe(2);
    expect(tree.roots.length).toBe(2);

    const researchRoot = tree.roots.find((r) => r.name === "research");
    expect(researchRoot!.children).toEqual([]);
    expect(researchRoot!.count).toBe(1);

    const collectionRoot = tree.roots.find((r) => r.name === "collection");
    expect(collectionRoot!.children.length).toBe(1);
  });

  it("sorts roots and children alphabetically", () => {
    const vault = buildVault([
      buildObject({
        id: "obj1",
        relativePath: "obj1.md",
        frontmatter: { tags: ["zebra", "apple", "collection:beta", "collection:alpha"] },
      }),
    ]);

    const tree = buildTagTree(vault);

    expect(tree.roots[0].name).toBe("apple");
    expect(tree.roots[1].name).toBe("collection");
    expect(tree.roots[2].name).toBe("zebra");

    const collectionRoot = tree.roots[1];
    expect(collectionRoot.children[0].name).toBe("alpha");
    expect(collectionRoot.children[1].name).toBe("beta");
  });

  it("tracks object relativePaths per tag", () => {
    const vault = buildVault([
      buildObject({
        id: "obj1",
        relativePath: "notes/obj1.md",
        frontmatter: { tags: ["shared"] },
      }),
      buildObject({
        id: "obj2",
        relativePath: "notes/obj2.md",
        frontmatter: { tags: ["shared"] },
      }),
    ]);

    const tree = buildTagTree(vault);
    const sharedRoot = tree.roots.find((r) => r.name === "shared");

    expect(sharedRoot!.objects).toContain("notes/obj1.md");
    expect(sharedRoot!.objects).toContain("notes/obj2.md");
  });

  it("handles deeply nested hierarchical tags", () => {
    const vault = buildVault([
      buildObject({
        id: "obj1",
        relativePath: "obj1.md",
        frontmatter: { tags: ["a:b:c"] },
      }),
    ]);

    const tree = buildTagTree(vault);

    expect(tree.roots.length).toBe(1);
    expect(tree.roots[0].name).toBe("a");
    expect(tree.roots[0].children.length).toBe(1);
    expect(tree.roots[0].children[0].name).toBe("b:c");
    expect(tree.roots[0].children[0].fullPath).toBe("a:b:c");
  });
});

// ─── getAllTags Tests ─────────────────────────────────────────────────────────

describe("getAllTags", () => {
  it("returns empty array for vault with no tags", () => {
    const vault = buildVault([buildObject({ frontmatter: {} })]);
    expect(getAllTags(vault)).toEqual([]);
  });

  it("returns tags with correct counts", () => {
    const vault = buildVault([
      buildObject({ id: "obj1", frontmatter: { tags: ["a", "b"] } }),
      buildObject({ id: "obj2", frontmatter: { tags: ["a"] } }),
      buildObject({ id: "obj3", frontmatter: { tags: ["c"] } }),
    ]);

    const tags = getAllTags(vault);

    expect(tags.length).toBe(3);
    expect(tags.find((t) => t.tag === "a")!.count).toBe(2);
    expect(tags.find((t) => t.tag === "b")!.count).toBe(1);
    expect(tags.find((t) => t.tag === "c")!.count).toBe(1);
  });

  it("sorts tags by count descending", () => {
    const vault = buildVault([
      buildObject({ id: "obj1", frontmatter: { tags: ["rare"] } }),
      buildObject({ id: "obj2", frontmatter: { tags: ["common", "rare"] } }),
      buildObject({ id: "obj3", frontmatter: { tags: ["common"] } }),
      buildObject({ id: "obj4", frontmatter: { tags: ["common"] } }),
    ]);

    const tags = getAllTags(vault);

    expect(tags[0].tag).toBe("common");
    expect(tags[0].count).toBe(3);
    expect(tags[1].tag).toBe("rare");
    expect(tags[1].count).toBe(2);
  });

  it("includes hierarchical tags as-is", () => {
    const vault = buildVault([
      buildObject({
        id: "obj1",
        frontmatter: { tags: ["collection:papers", "simple"] },
      }),
    ]);

    const tags = getAllTags(vault);

    expect(tags.find((t) => t.tag === "collection:papers")).toBeDefined();
    expect(tags.find((t) => t.tag === "simple")).toBeDefined();
  });
});

// ─── previewTagMutation Tests ─────────────────────────────────────────────────

describe("previewTagMutation", () => {
  describe("rename mutation", () => {
    it("previews renaming a tag", () => {
      const vault = buildVault([
        buildObject({
          id: "obj1",
          relativePath: "obj1.md",
          filePath: "/tmp/obj1.md",
          frontmatter: { tags: ["old-tag", "other"] },
        }),
        buildObject({
          id: "obj2",
          relativePath: "obj2.md",
          filePath: "/tmp/obj2.md",
          frontmatter: { tags: ["old-tag"] },
        }),
        buildObject({
          id: "obj3",
          relativePath: "obj3.md",
          filePath: "/tmp/obj3.md",
          frontmatter: { tags: ["different"] },
        }),
      ]);

      const preview = previewTagMutation(vault, {
        type: "rename",
        oldTag: "old-tag",
        newTag: "new-tag",
      });

      expect(preview.mutation.type).toBe("rename");
      expect(preview.affectedFiles.length).toBe(2);

      const file1 = preview.affectedFiles.find((f) => f.relativePath === "obj1.md");
      expect(file1!.currentTags).toEqual(["old-tag", "other"]);
      expect(file1!.newTags).toContain("new-tag");
      expect(file1!.newTags).toContain("other");
      expect(file1!.newTags).not.toContain("old-tag");

      const file2 = preview.affectedFiles.find((f) => f.relativePath === "obj2.md");
      expect(file2!.newTags).toEqual(["new-tag"]);
    });

    it("does not include unaffected files", () => {
      const vault = buildVault([
        buildObject({
          id: "obj1",
          frontmatter: { tags: ["unrelated"] },
        }),
      ]);

      const preview = previewTagMutation(vault, {
        type: "rename",
        oldTag: "nonexistent",
        newTag: "new-tag",
      });

      expect(preview.affectedFiles).toEqual([]);
    });
  });

  describe("delete mutation", () => {
    it("previews deleting a tag", () => {
      const vault = buildVault([
        buildObject({
          id: "obj1",
          relativePath: "obj1.md",
          filePath: "/tmp/obj1.md",
          frontmatter: { tags: ["delete-me", "keep"] },
        }),
      ]);

      const preview = previewTagMutation(vault, {
        type: "delete",
        oldTag: "delete-me",
      });

      expect(preview.affectedFiles.length).toBe(1);
      expect(preview.affectedFiles[0].currentTags).toEqual(["delete-me", "keep"]);
      expect(preview.affectedFiles[0].newTags).toEqual(["keep"]);
    });

    it("handles deleting the only tag", () => {
      const vault = buildVault([
        buildObject({
          id: "obj1",
          relativePath: "obj1.md",
          filePath: "/tmp/obj1.md",
          frontmatter: { tags: ["only-tag"] },
        }),
      ]);

      const preview = previewTagMutation(vault, {
        type: "delete",
        oldTag: "only-tag",
      });

      expect(preview.affectedFiles[0].newTags).toEqual([]);
    });
  });

  describe("merge mutation", () => {
    it("previews merging tags when target not present", () => {
      const vault = buildVault([
        buildObject({
          id: "obj1",
          relativePath: "obj1.md",
          filePath: "/tmp/obj1.md",
          frontmatter: { tags: ["source-tag"] },
        }),
      ]);

      const preview = previewTagMutation(vault, {
        type: "merge",
        oldTag: "source-tag",
        newTag: "target-tag",
      });

      expect(preview.affectedFiles.length).toBe(1);
      expect(preview.affectedFiles[0].currentTags).toEqual(["source-tag"]);
      expect(preview.affectedFiles[0].newTags).toContain("target-tag");
      expect(preview.affectedFiles[0].newTags).not.toContain("source-tag");
    });

    it("does not duplicate target tag if already present", () => {
      const vault = buildVault([
        buildObject({
          id: "obj1",
          relativePath: "obj1.md",
          filePath: "/tmp/obj1.md",
          frontmatter: { tags: ["source-tag", "target-tag"] },
        }),
      ]);

      const preview = previewTagMutation(vault, {
        type: "merge",
        oldTag: "source-tag",
        newTag: "target-tag",
      });

      expect(preview.affectedFiles.length).toBe(1);
      const newTags = preview.affectedFiles[0].newTags;
      expect(newTags.filter((t) => t === "target-tag").length).toBe(1);
      expect(newTags).not.toContain("source-tag");
    });

    it("handles objects with only source tag", () => {
      const vault = buildVault([
        buildObject({
          id: "obj1",
          relativePath: "obj1.md",
          filePath: "/tmp/obj1.md",
          frontmatter: { tags: ["source"] },
        }),
        buildObject({
          id: "obj2",
          relativePath: "obj2.md",
          filePath: "/tmp/obj2.md",
          frontmatter: { tags: ["source", "target"] },
        }),
      ]);

      const preview = previewTagMutation(vault, {
        type: "merge",
        oldTag: "source",
        newTag: "target",
      });

      expect(preview.affectedFiles.length).toBe(2);

      const obj1Preview = preview.affectedFiles.find((f) => f.relativePath === "obj1.md");
      expect(obj1Preview!.newTags).toEqual(["target"]);

      const obj2Preview = preview.affectedFiles.find((f) => f.relativePath === "obj2.md");
      expect(obj2Preview!.newTags).toEqual(["target"]);
    });
  });

  it("preserves file metadata in preview", () => {
    const vault = buildVault([
      buildObject({
        id: "obj1",
        title: "My Document",
        relativePath: "notes/obj1.md",
        filePath: "/home/user/vault/notes/obj1.md",
        frontmatter: { tags: ["test"] },
      }),
    ]);

    const preview = previewTagMutation(vault, {
      type: "delete",
      oldTag: "test",
    });

    expect(preview.affectedFiles[0].title).toBe("My Document");
    expect(preview.affectedFiles[0].relativePath).toBe("notes/obj1.md");
    expect(preview.affectedFiles[0].filePath).toBe("/home/user/vault/notes/obj1.md");
  });
});

// ─── Edge Cases ──────────────────────────────────────────────────────────────

/**
 * @narrative tags/edge-cases
 * @title Tag Edge Cases
 * @description These tests cover unusual inputs and boundary conditions
 * that the tag system must handle gracefully.
 */
describe("Tag Edge Cases", () => {
  /**
   * @narrative-step 1
   * @explanation Empty tag arrays should be handled without errors.
   */
  describe("Empty tag array in frontmatter", () => {
    it("handles empty tags array", () => {
      const object = buildObject({ frontmatter: { tags: [] } });
      expect(getObjectTags(object)).toEqual([]);
    });

    it("builds empty tree for objects with only empty tag arrays", () => {
      const vault = buildVault([
        buildObject({ id: "obj1", frontmatter: { tags: [] } }),
        buildObject({ id: "obj2", frontmatter: { tags: [] } }),
      ]);

      const tree = buildTagTree(vault);
      expect(tree.roots).toEqual([]);
      expect(tree.totalTags).toBe(0);
      expect(tree.totalTaggedObjects).toBe(0);
    });

    it("preview returns empty affected files for mutation on empty tags", () => {
      const vault = buildVault([
        buildObject({ frontmatter: { tags: [] } }),
      ]);

      const preview = previewTagMutation(vault, {
        type: "rename",
        oldTag: "nonexistent",
        newTag: "new-tag",
      });

      expect(preview.affectedFiles).toEqual([]);
    });
  });

  /**
   * @narrative-step 2
   * @explanation Tags can contain special characters that need proper handling.
   */
  describe("Tags with special characters", () => {
    it("handles tags with slashes", () => {
      const object = buildObject({
        frontmatter: { tags: ["ai/ml/deep-learning"] },
      });
      expect(getObjectTags(object)).toEqual(["ai/ml/deep-learning"]);
    });

    it("handles tags with unicode characters", () => {
      const object = buildObject({
        frontmatter: { tags: ["日本語", "émoji-🎉", "über-tag"] },
      });
      expect(getObjectTags(object)).toEqual(["日本語", "émoji-🎉", "über-tag"]);
    });

    it("builds tree with unicode tags", () => {
      const vault = buildVault([
        buildObject({
          id: "obj1",
          relativePath: "obj1.md",
          frontmatter: { tags: ["日本語:サブタグ"] },
        }),
      ]);

      const tree = buildTagTree(vault);

      expect(tree.roots.length).toBe(1);
      expect(tree.roots[0].name).toBe("日本語");
      expect(tree.roots[0].children[0].name).toBe("サブタグ");
    });

    it("renames tags with special characters", () => {
      const vault = buildVault([
        buildObject({
          id: "obj1",
          relativePath: "obj1.md",
          filePath: "/tmp/obj1.md",
          frontmatter: { tags: ["über-tag", "other"] },
        }),
      ]);

      const preview = previewTagMutation(vault, {
        type: "rename",
        oldTag: "über-tag",
        newTag: "super-tag",
      });

      expect(preview.affectedFiles.length).toBe(1);
      expect(preview.affectedFiles[0].newTags).toContain("super-tag");
      expect(preview.affectedFiles[0].newTags).not.toContain("über-tag");
    });

    it("handles tags with multiple colons", () => {
      const object = buildObject({
        frontmatter: { tags: ["a:b:c:d:e"] },
      });
      expect(getObjectTags(object)).toEqual(["a:b:c:d:e"]);
    });

    it("builds tree with deeply nested colons", () => {
      const vault = buildVault([
        buildObject({
          id: "obj1",
          relativePath: "obj1.md",
          frontmatter: { tags: ["level1:level2:level3:level4"] },
        }),
      ]);

      const tree = buildTagTree(vault);

      expect(tree.roots[0].name).toBe("level1");
      expect(tree.roots[0].children[0].name).toBe("level2:level3:level4");
      expect(tree.roots[0].children[0].fullPath).toBe("level1:level2:level3:level4");
    });

    it("handles tag starting with colon", () => {
      const object = buildObject({
        frontmatter: { tags: [":leading-colon"] },
      });
      // First part would be empty string
      expect(getObjectTags(object)).toEqual([":leading-colon"]);
    });

    it("handles tag ending with colon", () => {
      const object = buildObject({
        frontmatter: { tags: ["trailing-colon:"] },
      });
      expect(getObjectTags(object)).toEqual(["trailing-colon:"]);
    });
  });

  /**
   * @narrative-step 3
   * @explanation Tags that span multiple projects should be handled correctly.
   */
  describe("Tags spanning multiple projects", () => {
    it("renames tag across objects from different projects", () => {
      const vault = buildVault([
        buildObject({
          id: "obj1",
          project: "project-a",
          relativePath: "project-a/obj1.md",
          filePath: "/vault/project-a/obj1.md",
          frontmatter: { tags: ["shared-tag"] },
        }),
        buildObject({
          id: "obj2",
          project: "project-b",
          relativePath: "project-b/obj2.md",
          filePath: "/vault/project-b/obj2.md",
          frontmatter: { tags: ["shared-tag", "other"] },
        }),
        buildObject({
          id: "obj3",
          project: "project-c",
          relativePath: "project-c/obj3.md",
          filePath: "/vault/project-c/obj3.md",
          frontmatter: { tags: ["different-tag"] },
        }),
      ]);

      const preview = previewTagMutation(vault, {
        type: "rename",
        oldTag: "shared-tag",
        newTag: "renamed-tag",
      });

      // Should affect objects from both project-a and project-b
      expect(preview.affectedFiles.length).toBe(2);
      expect(preview.affectedFiles.some((f) => f.relativePath.includes("project-a"))).toBe(true);
      expect(preview.affectedFiles.some((f) => f.relativePath.includes("project-b"))).toBe(true);
    });

    it("getAllTags aggregates across projects", () => {
      const vault = buildVault([
        buildObject({
          id: "obj1",
          project: "project-a",
          frontmatter: { tags: ["shared", "a-only"] },
        }),
        buildObject({
          id: "obj2",
          project: "project-b",
          frontmatter: { tags: ["shared", "b-only"] },
        }),
      ]);

      const tags = getAllTags(vault);

      expect(tags.find((t) => t.tag === "shared")?.count).toBe(2);
      expect(tags.find((t) => t.tag === "a-only")?.count).toBe(1);
      expect(tags.find((t) => t.tag === "b-only")?.count).toBe(1);
    });
  });

  /**
   * @narrative-step 4
   * @explanation Operations on hierarchical tags should not affect sibling or parent tags.
   */
  describe("Hierarchical tag operations", () => {
    it("deleting child tag does not affect parent", () => {
      const vault = buildVault([
        buildObject({
          id: "obj1",
          relativePath: "obj1.md",
          filePath: "/tmp/obj1.md",
          frontmatter: { tags: ["ai:ml", "ai:nlp"] },
        }),
        buildObject({
          id: "obj2",
          relativePath: "obj2.md",
          filePath: "/tmp/obj2.md",
          frontmatter: { tags: ["ai:ml"] },
        }),
      ]);

      const preview = previewTagMutation(vault, {
        type: "delete",
        oldTag: "ai:ml",
      });

      expect(preview.affectedFiles.length).toBe(2);

      // obj1 should still have ai:nlp
      const obj1Preview = preview.affectedFiles.find((f) => f.relativePath === "obj1.md");
      expect(obj1Preview!.newTags).toContain("ai:nlp");
      expect(obj1Preview!.newTags).not.toContain("ai:ml");

      // obj2 should have empty tags
      const obj2Preview = preview.affectedFiles.find((f) => f.relativePath === "obj2.md");
      expect(obj2Preview!.newTags).toEqual([]);
    });

    it("renaming child tag does not affect siblings", () => {
      const vault = buildVault([
        buildObject({
          id: "obj1",
          relativePath: "obj1.md",
          filePath: "/tmp/obj1.md",
          frontmatter: { tags: ["ai:ml", "ai:nlp", "ai:cv"] },
        }),
      ]);

      const preview = previewTagMutation(vault, {
        type: "rename",
        oldTag: "ai:ml",
        newTag: "ai:machine-learning",
      });

      const newTags = preview.affectedFiles[0].newTags;
      expect(newTags).toContain("ai:machine-learning");
      expect(newTags).toContain("ai:nlp");
      expect(newTags).toContain("ai:cv");
      expect(newTags).not.toContain("ai:ml");
    });

    it("merging hierarchical tags preserves structure", () => {
      const vault = buildVault([
        buildObject({
          id: "obj1",
          relativePath: "obj1.md",
          filePath: "/tmp/obj1.md",
          frontmatter: { tags: ["old:category"] },
        }),
        buildObject({
          id: "obj2",
          relativePath: "obj2.md",
          filePath: "/tmp/obj2.md",
          frontmatter: { tags: ["new:category"] },
        }),
      ]);

      const preview = previewTagMutation(vault, {
        type: "merge",
        oldTag: "old:category",
        newTag: "new:category",
      });

      // Only obj1 should be affected (obj2 already has target tag)
      expect(preview.affectedFiles.length).toBe(1);
      expect(preview.affectedFiles[0].relativePath).toBe("obj1.md");
      expect(preview.affectedFiles[0].newTags).toEqual(["new:category"]);
    });
  });

  /**
   * @narrative-step 5
   * @explanation System should handle large numbers of objects efficiently.
   */
  describe("Large scale operations", () => {
    it("handles merge with many occurrences (100+ objects)", () => {
      // Generate 150 objects with the source tag
      const objects: VaultObject[] = [];
      for (let i = 0; i < 150; i++) {
        objects.push(
          buildObject({
            id: `obj${i}`,
            relativePath: `folder/obj${i}.md`,
            filePath: `/tmp/folder/obj${i}.md`,
            frontmatter: { tags: ["high-frequency-tag", `unique-${i}`] },
          })
        );
      }

      const vault = buildVault(objects);

      const preview = previewTagMutation(vault, {
        type: "merge",
        oldTag: "high-frequency-tag",
        newTag: "consolidated-tag",
      });

      expect(preview.affectedFiles.length).toBe(150);
      // All should have the new tag
      for (const file of preview.affectedFiles) {
        expect(file.newTags).toContain("consolidated-tag");
        expect(file.newTags).not.toContain("high-frequency-tag");
      }
    });

    it("buildTagTree handles vault with many unique tags", () => {
      const objects: VaultObject[] = [];
      for (let i = 0; i < 100; i++) {
        objects.push(
          buildObject({
            id: `obj${i}`,
            relativePath: `obj${i}.md`,
            frontmatter: { tags: [`tag-${i}`, `category:subtag-${i}`] },
          })
        );
      }

      const vault = buildVault(objects);
      const tree = buildTagTree(vault);

      // Should have 100 unique root tags + category root
      expect(tree.totalTags).toBe(200); // 100 simple + 100 hierarchical
      expect(tree.roots.length).toBe(101); // 100 tag-X + 1 category

      const categoryRoot = tree.roots.find((r) => r.name === "category");
      expect(categoryRoot!.children.length).toBe(100);
    });

    it("getAllTags handles vault with many tags", () => {
      const objects: VaultObject[] = [];
      for (let i = 0; i < 50; i++) {
        objects.push(
          buildObject({
            id: `obj${i}`,
            frontmatter: { tags: ["common-tag", `rare-tag-${i}`] },
          })
        );
      }

      const vault = buildVault(objects);
      const tags = getAllTags(vault);

      // common-tag should be first (count 50)
      expect(tags[0].tag).toBe("common-tag");
      expect(tags[0].count).toBe(50);

      // 51 total unique tags
      expect(tags.length).toBe(51);
    });
  });

  /**
   * @narrative-step 6
   * @explanation Tags with null or undefined values should be handled gracefully.
   */
  describe("Null and undefined handling", () => {
    it("handles null tags value", () => {
      const object = buildObject({ frontmatter: { tags: null } });
      expect(getObjectTags(object)).toEqual([]);
    });

    it("handles tags array with null elements", () => {
      const object = buildObject({
        frontmatter: { tags: ["valid", null, "also-valid"] as any },
      });
      // null.toString() will produce "null"
      expect(getObjectTags(object)).toEqual(["valid", "null", "also-valid"]);
    });

    it("handles tags array with undefined elements", () => {
      const object = buildObject({
        frontmatter: { tags: ["valid", undefined, "also-valid"] as any },
      });
      // undefined.toString() will produce "undefined"
      expect(getObjectTags(object)).toEqual(["valid", "undefined", "also-valid"]);
    });
  });

  /**
   * @narrative-step 7
   * @explanation Whitespace-only or unusual string tags should be handled.
   */
  describe("Whitespace and unusual strings", () => {
    it("handles whitespace-only tag", () => {
      const object = buildObject({
        frontmatter: { tags: ["   "] },
      });
      // Whitespace is preserved
      expect(getObjectTags(object)).toEqual(["   "]);
    });

    it("handles empty string tag", () => {
      const object = buildObject({
        frontmatter: { tags: [""] },
      });
      expect(getObjectTags(object)).toEqual([""]);
    });

    it("handles mixed valid and empty tags", () => {
      const object = buildObject({
        frontmatter: { tags: ["valid", "", "   ", "also-valid"] },
      });
      expect(getObjectTags(object)).toEqual(["valid", "", "   ", "also-valid"]);
    });

    it("can delete whitespace-only tag", () => {
      const vault = buildVault([
        buildObject({
          id: "obj1",
          relativePath: "obj1.md",
          filePath: "/tmp/obj1.md",
          frontmatter: { tags: ["   ", "keep"] },
        }),
      ]);

      const preview = previewTagMutation(vault, {
        type: "delete",
        oldTag: "   ",
      });

      expect(preview.affectedFiles.length).toBe(1);
      expect(preview.affectedFiles[0].newTags).toEqual(["keep"]);
    });
  });
});
