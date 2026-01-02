import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { runDoctor } from "../src/doctor.js";

describe("doctor", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "extenote-doctor-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("runDoctor", () => {
    it("reports missing projects directory", async () => {
      const results = await runDoctor({ cwd: tempDir });

      const projectsCheck = results.find(
        (r) => r.category === "Structure" && r.check === "Projects directory"
      );
      expect(projectsCheck).toBeDefined();
      expect(projectsCheck?.status).toBe("fail");
      expect(projectsCheck?.message).toContain("No projects/ directory");
    });

    it("reports empty projects directory", async () => {
      await fs.mkdir(path.join(tempDir, "projects"));

      const results = await runDoctor({ cwd: tempDir });

      const projectsCheck = results.find(
        (r) => r.category === "Structure" && r.check === "Projects directory"
      );
      expect(projectsCheck).toBeDefined();
      expect(projectsCheck?.status).toBe("warn");
      expect(projectsCheck?.message).toContain("no YAML files");
    });

    it("passes with valid projects directory", async () => {
      const projectsDir = path.join(tempDir, "projects");
      await fs.mkdir(projectsDir);
      await fs.writeFile(
        path.join(projectsDir, "test.yaml"),
        `project: test\nsources:\n  - id: test\n    type: local\n    root: ./content`
      );

      const results = await runDoctor({ cwd: tempDir });

      const projectsCheck = results.find(
        (r) => r.category === "Structure" && r.check === "Projects directory"
      );
      expect(projectsCheck).toBeDefined();
      expect(projectsCheck?.status).toBe("pass");
      expect(projectsCheck?.message).toContain("1 project configuration");
    });

    it("reports missing schemas directory as warning", async () => {
      const results = await runDoctor({ cwd: tempDir });

      const schemasCheck = results.find(
        (r) => r.category === "Structure" && r.check === "Schemas directory"
      );
      expect(schemasCheck).toBeDefined();
      expect(schemasCheck?.status).toBe("warn");
      expect(schemasCheck?.message).toContain("No schemas/ directory");
    });

    it("validates YAML syntax in project files", async () => {
      const projectsDir = path.join(tempDir, "projects");
      await fs.mkdir(projectsDir);
      // This is truly invalid YAML - unquoted colon in value
      await fs.writeFile(
        path.join(projectsDir, "invalid.yaml"),
        `project: test: value\nkey: [unclosed`
      );

      const results = await runDoctor({ cwd: tempDir });

      const configCheck = results.find(
        (r) => r.category === "Config" && r.check === "Project: invalid.yaml"
      );
      expect(configCheck).toBeDefined();
      expect(configCheck?.status).toBe("fail");
      expect(configCheck?.message).toContain("Invalid YAML");
    });

    it("warns about missing required fields", async () => {
      const projectsDir = path.join(tempDir, "projects");
      await fs.mkdir(projectsDir);
      await fs.writeFile(
        path.join(projectsDir, "incomplete.yaml"),
        `name: test` // missing 'project' and 'sources'
      );

      const results = await runDoctor({ cwd: tempDir });

      const configCheck = results.find(
        (r) => r.category === "Config" && r.check === "Project: incomplete.yaml"
      );
      expect(configCheck).toBeDefined();
      expect(configCheck?.status).toBe("warn");
      expect(configCheck?.message).toContain("missing 'project' field");
    });

    it("checks content source directories", async () => {
      const projectsDir = path.join(tempDir, "projects");
      await fs.mkdir(projectsDir);
      await fs.writeFile(
        path.join(projectsDir, "test.yaml"),
        `project: test\nsources:\n  - id: content\n    type: local\n    root: ./nonexistent`
      );

      const results = await runDoctor({ cwd: tempDir });

      const contentCheck = results.find(
        (r) => r.category === "Content" && r.check === "Source: content"
      );
      expect(contentCheck).toBeDefined();
      expect(contentCheck?.status).toBe("fail");
      expect(contentCheck?.message).toContain("not found");
    });

    it("counts markdown files in valid content directories", async () => {
      const projectsDir = path.join(tempDir, "projects");
      const contentDir = path.join(tempDir, "content");
      await fs.mkdir(projectsDir);
      await fs.mkdir(contentDir);
      await fs.writeFile(path.join(contentDir, "test.md"), "# Test");
      await fs.writeFile(path.join(contentDir, "another.md"), "# Another");
      await fs.writeFile(
        path.join(projectsDir, "test.yaml"),
        `project: test\nsources:\n  - id: content\n    type: local\n    root: ./content`
      );

      const results = await runDoctor({ cwd: tempDir });

      const contentCheck = results.find(
        (r) => r.category === "Content" && r.check === "Source: content"
      );
      expect(contentCheck).toBeDefined();
      expect(contentCheck?.status).toBe("pass");
      expect(contentCheck?.message).toContain("2 markdown file");
    });

    it("reports package.json status", async () => {
      const results = await runDoctor({ cwd: tempDir });

      const depsCheck = results.find(
        (r) => r.category === "Dependencies" && r.check === "package.json"
      );
      expect(depsCheck).toBeDefined();
      expect(depsCheck?.status).toBe("warn");
      expect(depsCheck?.message).toContain("No package.json");
    });

    it("passes when package.json exists", async () => {
      await fs.writeFile(path.join(tempDir, "package.json"), "{}");

      const results = await runDoctor({ cwd: tempDir });

      const depsCheck = results.find(
        (r) => r.category === "Dependencies" && r.check === "package.json"
      );
      expect(depsCheck).toBeDefined();
      expect(depsCheck?.status).toBe("pass");
    });
  });
});
