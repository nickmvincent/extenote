import fs from "fs/promises";
import path from "path";
import process from "process";
import { cancel, confirm, intro, isCancel, note, outro, select, text } from "@clack/prompts";

interface InitOptions {
  cwd: string;
}

interface ProjectConfig {
  name: string;
  description: string;
  contentDir: string;
  schemaType: "notes" | "references" | "blog" | "custom";
  visibility: "public" | "private";
  enableSemble: boolean;
  sembleIdentifier?: string;
}

const SCHEMA_TEMPLATES = {
  notes: {
    name: "note",
    description: "Simple note or document",
    fields: `    fields:
      title:
        type: string
        description: Note title
      date:
        type: date
        description: Creation date
      tags:
        type: array
        items: string
        description: Optional tags for organization`,
    required: ["type", "title"],
  },
  references: {
    name: "bibtex_entry",
    description: "BibTeX-style citation reference",
    fields: `    fields:
      title:
        type: string
        description: Work title
      citation_key:
        type: string
        description: Unique citation key
      entry_type:
        type: string
        description: BibTeX type (article, inproceedings, etc.)
      authors:
        type: array
        items: string
        description: Author names
      year:
        type: string
        description: Publication year
      url:
        type: string
        description: URL to the work
      doi:
        type: string
        description: DOI identifier
      abstract:
        type: string
        description: Abstract or notes
      tags:
        type: array
        items: string
        description: Tags for organization`,
    required: ["type", "title", "citation_key"],
  },
  blog: {
    name: "blog_post",
    description: "Blog post or article",
    fields: `    fields:
      title:
        type: string
        description: Post title
      slug:
        type: string
        description: URL-friendly identifier
      date:
        type: date
        description: Publication date
      summary:
        type: string
        description: Short description for previews
      tags:
        type: array
        items: string
        description: Post tags/categories
      draft:
        type: boolean
        description: Whether post is a draft`,
    required: ["type", "title", "slug", "date"],
  },
  custom: {
    name: "document",
    description: "Custom document type",
    fields: `    fields:
      title:
        type: string
        description: Document title
      tags:
        type: array
        items: string
        description: Optional tags`,
    required: ["type", "title"],
  },
};

function generateProjectYaml(config: ProjectConfig): string {
  const lines = [
    `# ═══════════════════════════════════════════════════════════════════════════════`,
    `# Project: ${config.name}`,
    `# ${config.description}`,
    `# ═══════════════════════════════════════════════════════════════════════════════`,
    ``,
    `project: ${config.name}`,
    ``,
    `# ─── Visibility Settings ───────────────────────────────────────────────────────`,
    `defaultVisibility: ${config.visibility}`,
    `visibilityField: visibility`,
    ``,
    `# ─── Content Sources ───────────────────────────────────────────────────────────`,
    `sources:`,
    `  - id: ${config.name}-content`,
    `    type: local`,
    `    root: ${config.contentDir}`,
    `    include:`,
    `      - "**/*.md"`,
    ``,
    `# ─── Linting Rules ─────────────────────────────────────────────────────────────`,
    `lint:`,
    `  rules:`,
    `    required-visibility: warn`,
    `  autofix: true`,
  ];

  if (config.enableSemble && config.sembleIdentifier) {
    lines.push(
      ``,
      `# ─── Semble Sync Configuration ─────────────────────────────────────────────────`,
      `semble:`,
      `  enabled: true`,
      `  identifier: ${config.sembleIdentifier}`,
      `  publicOnly: true`
    );
  }

  return lines.join("\n") + "\n";
}

function generateSchemaYaml(config: ProjectConfig): string {
  const template = SCHEMA_TEMPLATES[config.schemaType];

  return `# ═══════════════════════════════════════════════════════════════════════════════
# ${config.name} Schemas
# Schema definitions for the ${config.name} project
# ═══════════════════════════════════════════════════════════════════════════════

schemas:
  - name: ${template.name}
    description: ${template.description}
    projects:
      - ${config.name}
    subdirectory: .
    identityField: ${config.schemaType === "references" ? "citation_key" : config.schemaType === "blog" ? "slug" : "title"}

    required:
${template.required.map((r) => `      - ${r}`).join("\n")}

${template.fields}
`;
}

function generateExampleContent(config: ProjectConfig): string {
  const today = new Date().toISOString().split("T")[0];

  switch (config.schemaType) {
    case "notes":
      return `---
type: note
title: My First Note
date: ${today}
visibility: ${config.visibility}
tags:
  - example
---

# My First Note

Welcome to your new Extenote project! This is an example note.

## Getting Started

- Edit this file to change the content
- Create new files in \`${config.contentDir}\` directory
- Use \`bun run cli -- status\` to see all your content
`;

    case "references":
      return `---
type: bibtex_entry
title: "Example Paper Title"
citation_key: example-2024
entry_type: article
authors:
  - "Jane Doe"
  - "John Smith"
year: "2024"
visibility: ${config.visibility}
url: https://example.com/paper
tags:
  - example
---

This is an example reference entry. Edit the frontmatter to update the citation details.
`;

    case "blog":
      return `---
type: blog_post
title: Hello World
slug: hello-world
date: ${today}
visibility: ${config.visibility}
summary: Your first blog post
tags:
  - welcome
draft: false
---

# Hello World

Welcome to your new blog! This is your first post.

## What's Next?

1. Edit this post to add your content
2. Create new posts in the \`${config.contentDir}\` directory
3. Run \`bun run cli -- status\` to see all posts
`;

    default:
      return `---
type: document
title: Example Document
visibility: ${config.visibility}
tags:
  - example
---

# Example Document

This is an example document. Edit it to get started with your project.
`;
  }
}

export async function launchInitWizard(options: InitOptions): Promise<void> {
  if (!process.stdin.isTTY) {
    throw new Error("Interactive init requires a TTY. Run this command directly in a terminal.");
  }

  const { cwd } = options;

  intro("Extenote Project Setup");

  // Check if already initialized
  const projectsDir = path.join(cwd, "projects");
  const schemasDir = path.join(cwd, "schemas");

  try {
    const existingProjects = await fs.readdir(projectsDir);
    if (existingProjects.some((f) => f.endsWith(".yaml"))) {
      const continueAnyway = await confirm({
        message: "Projects already exist in this directory. Create another project?",
        initialValue: false,
      });
      if (isCancel(continueAnyway) || !continueAnyway) {
        cancel("Init cancelled.");
        return;
      }
    }
  } catch {
    // Directory doesn't exist, that's fine
  }

  // Project name
  const projectName = await text({
    message: "What is your project name?",
    placeholder: "my-project",
    validate: (value) => {
      if (!value) return "Project name is required";
      if (!/^[a-z0-9-]+$/.test(value)) return "Use lowercase letters, numbers, and hyphens only";
      return undefined;
    },
  });
  if (isCancel(projectName)) {
    cancel("Init cancelled.");
    return;
  }

  // Description
  const description = await text({
    message: "Brief description of your project:",
    placeholder: "My awesome content project",
    initialValue: `Content for ${projectName}`,
  });
  if (isCancel(description)) {
    cancel("Init cancelled.");
    return;
  }

  // Schema type
  const schemaType = await select({
    message: "What type of content will you create?",
    options: [
      { value: "notes", label: "Notes", hint: "Simple notes and documents" },
      { value: "references", label: "References", hint: "BibTeX citations (papers, books)" },
      { value: "blog", label: "Blog", hint: "Blog posts with dates and slugs" },
      { value: "custom", label: "Custom", hint: "Basic document structure" },
    ],
    initialValue: "notes",
  });
  if (isCancel(schemaType)) {
    cancel("Init cancelled.");
    return;
  }

  // Content directory
  const contentDir = await text({
    message: "Where should content files live?",
    placeholder: `content/${projectName}`,
    initialValue: `content/${projectName}`,
  });
  if (isCancel(contentDir)) {
    cancel("Init cancelled.");
    return;
  }

  // Default visibility
  const visibility = await select({
    message: "Default visibility for new content?",
    options: [
      { value: "private", label: "Private", hint: "Content is private by default" },
      { value: "public", label: "Public", hint: "Content is public by default" },
    ],
    initialValue: "private",
  });
  if (isCancel(visibility)) {
    cancel("Init cancelled.");
    return;
  }

  // Semble sync
  const enableSemble = await confirm({
    message: "Enable Semble sync? (ATProto-based sharing)",
    initialValue: false,
  });
  if (isCancel(enableSemble)) {
    cancel("Init cancelled.");
    return;
  }

  let sembleIdentifier: string | undefined;
  if (enableSemble) {
    const id = await text({
      message: "Your Bluesky/ATProto identifier:",
      placeholder: "username.bsky.social",
      validate: (value) => {
        if (!value) return "Identifier is required for Semble sync";
        if (!value.includes(".")) return "Enter a valid identifier (e.g., username.bsky.social)";
        return undefined;
      },
    });
    if (isCancel(id)) {
      cancel("Init cancelled.");
      return;
    }
    sembleIdentifier = id;
  }

  const config: ProjectConfig = {
    name: projectName,
    description: description || `Content for ${projectName}`,
    contentDir,
    schemaType: schemaType as ProjectConfig["schemaType"],
    visibility: visibility as ProjectConfig["visibility"],
    enableSemble: enableSemble || false,
    sembleIdentifier,
  };

  // Show summary
  note(
    [
      `Project: ${config.name}`,
      `Content: ${config.contentDir}`,
      `Schema: ${SCHEMA_TEMPLATES[config.schemaType].name}`,
      `Visibility: ${config.visibility}`,
      config.enableSemble ? `Semble: ${config.sembleIdentifier}` : "Semble: disabled",
    ].join("\n"),
    "Configuration Summary"
  );

  const confirmed = await confirm({
    message: "Create this project?",
    initialValue: true,
  });
  if (isCancel(confirmed) || !confirmed) {
    cancel("Init cancelled.");
    return;
  }

  // Create directories
  await fs.mkdir(projectsDir, { recursive: true });
  await fs.mkdir(schemasDir, { recursive: true });

  const contentFullPath = path.resolve(cwd, config.contentDir);
  await fs.mkdir(contentFullPath, { recursive: true });

  // Write files
  const projectFile = path.join(projectsDir, `${config.name}.yaml`);
  const schemaFile = path.join(schemasDir, `${config.name}.yaml`);
  const exampleFile = path.join(contentFullPath, "example.md");

  await fs.writeFile(projectFile, generateProjectYaml(config), "utf8");
  await fs.writeFile(schemaFile, generateSchemaYaml(config), "utf8");
  await fs.writeFile(exampleFile, generateExampleContent(config), "utf8");

  outro(`Project "${config.name}" created successfully!

Next steps:
  1. Edit content in ${config.contentDir}/
  2. Run: bun run cli -- status
  3. Run: bun run cli -- issues

For more help: bun run cli -- help`);
}

export async function quickInit(options: {
  cwd: string;
  name: string;
  type?: "notes" | "references" | "blog" | "custom";
}): Promise<void> {
  const { cwd, name, type = "notes" } = options;

  const config: ProjectConfig = {
    name,
    description: `Content for ${name}`,
    contentDir: `content/${name}`,
    schemaType: type,
    visibility: "private",
    enableSemble: false,
  };

  const projectsDir = path.join(cwd, "projects");
  const schemasDir = path.join(cwd, "schemas");
  const contentDir = path.resolve(cwd, config.contentDir);

  await fs.mkdir(projectsDir, { recursive: true });
  await fs.mkdir(schemasDir, { recursive: true });
  await fs.mkdir(contentDir, { recursive: true });

  await fs.writeFile(path.join(projectsDir, `${name}.yaml`), generateProjectYaml(config), "utf8");
  await fs.writeFile(path.join(schemasDir, `${name}.yaml`), generateSchemaYaml(config), "utf8");
  await fs.writeFile(path.join(contentDir, "example.md"), generateExampleContent(config), "utf8");

  console.log(`Created project "${name}" with ${type} schema.`);
  console.log(`Content directory: ${config.contentDir}`);
  console.log(`\nNext: bun run cli -- status`);
}
