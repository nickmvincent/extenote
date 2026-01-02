import { describe, it, expect } from "bun:test";
import type { VaultObject } from "@extenote/core";
import {
  countObjectsByProject,
  getObjectProject,
  listProjects,
  objectBelongsToProject,
} from "../src/util/projects.js";

function makeObject(overrides: Partial<VaultObject>): VaultObject {
  return {
    id: overrides.id ?? "id",
    type: overrides.type ?? "note",
    title: overrides.title,
    sourceId: overrides.sourceId ?? "local",
    project: overrides.project ?? "alpha",
    filePath: overrides.filePath ?? "/tmp/note.md",
    relativePath: overrides.relativePath ?? "note.md",
    frontmatter: overrides.frontmatter ?? {},
    body: overrides.body ?? "",
    mtime: overrides.mtime ?? 0,
    schema: overrides.schema,
    visibility: overrides.visibility ?? "public",
  };
}

describe("tui project helpers", () => {
  it("returns unknown when project is blank", () => {
    const obj = makeObject({ project: "" });
    expect(getObjectProject(obj)).toBe("unknown");
  });

  it("detects direct ownership and includes", () => {
    const obj = makeObject({ project: "child" });
    const profiles = [{ name: "parent", includes: ["child"] }];

    expect(objectBelongsToProject(obj, "child", profiles)).toBe(true);
    expect(objectBelongsToProject(obj, "parent", profiles)).toBe(true);
    expect(objectBelongsToProject(obj, "other", profiles)).toBe(false);
  });

  it("lists projects from profiles plus extras", () => {
    const objects = [
      makeObject({ id: "a", project: "alpha" }),
      makeObject({ id: "b", project: "beta" }),
      makeObject({ id: "c", project: "gamma" }),
    ];
    const profiles = [{ name: "alpha" }, { name: "beta" }];

    expect(listProjects(objects, profiles)).toEqual(["alpha", "beta", "gamma"]);
  });

  it("lists projects from objects when no profiles are provided", () => {
    const objects = [
      makeObject({ id: "a", project: "alpha" }),
      makeObject({ id: "b", project: "beta" }),
      makeObject({ id: "c", project: "beta" }),
      makeObject({ id: "d", project: "unknown" }),
    ];

    expect(listProjects(objects)).toEqual(["alpha", "beta"]);
  });

  it("counts objects per project", () => {
    const objects = [
      makeObject({ id: "a", project: "alpha" }),
      makeObject({ id: "b", project: "beta" }),
      makeObject({ id: "c", project: "beta" }),
    ];

    const counts = countObjectsByProject(objects);
    expect(counts.get("alpha")).toBe(1);
    expect(counts.get("beta")).toBe(2);
  });
});
