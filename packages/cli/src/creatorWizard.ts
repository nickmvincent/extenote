import path from "path";
import process from "process";
import { buildCreatePlan, createMarkdownObject, resolveVisibilityDefaults, slugify, type ExtenoteConfig, type LoadedSchema } from "@extenote/core";
import { cancel, confirm, intro, isCancel, note, outro, select, spinner, text } from "@clack/prompts";

interface CreatorWizardOptions {
  cwd: string;
  config: ExtenoteConfig;
  schemas: LoadedSchema[];
  initialSchemaName?: string;
  dirOverride?: string;
}

export async function launchCreatorWizard(options: CreatorWizardOptions): Promise<void> {
  if (!process.stdin.isTTY) {
    throw new Error("Interactive creator requires a TTY. Run this command directly in a terminal.");
  }
  if (!options.schemas.length) {
    throw new Error("No schemas available. Add schema definitions in schemas/ directory.");
  }

  intro("Extenote Creator");
  const schema = await chooseSchema(options.schemas, options.initialSchemaName);
  if (!schema) {
    cancel("Creator cancelled.");
    return;
  }

  const allProjects = schema.projects ?? [];
  let project: string | undefined;
  if (allProjects.length > 1) {
    const selection = await select({
      message: `Schema ${schema.name} spans multiple projects. Choose one:`,
      options: allProjects.map((entry) => ({ value: entry, label: entry })),
      initialValue: allProjects[0]
    });
    if (isCancel(selection)) {
      cancel("Creator cancelled.");
      return;
    }
    project = selection;
  } else {
    project = allProjects[0];
  }

  const defaults = resolveVisibilityDefaults(options.config, schema, project);
  const baseSlug = slugify(schema.name);

  const titleInput = await text({
    message: "Title (optional)",
    placeholder: "Press enter to skip",
    initialValue: ""
  });
  if (isCancel(titleInput)) {
    cancel("Creator cancelled.");
    return;
  }
  const title = titleInput.trim();

  const slugResult = await text({
    message: "Slug (filename without .md)",
    initialValue: baseSlug,
    validate: (value) => (value && value.trim().length > 0 ? undefined : "Slug is required.")
  });
  if (isCancel(slugResult)) {
    cancel("Creator cancelled.");
    return;
  }
  const slug = slugify(slugResult.trim());

  const visibility = await text({
    message: `Visibility (${defaults.visibilityField})`,
    initialValue: defaults.defaultVisibility
  });
  if (isCancel(visibility)) {
    cancel("Creator cancelled.");
    return;
  }

  const dirPrompt = await text({
    message: "Directory override (optional)",
    placeholder: "Leave blank to use configured source root",
    initialValue: options.dirOverride ?? ""
  });
  if (isCancel(dirPrompt)) {
    cancel("Creator cancelled.");
    return;
  }
  const dirValue = typeof dirPrompt === "string" ? dirPrompt.trim() : "";

  const plan = buildCreatePlan({
    config: options.config,
    schema,
    cwd: options.cwd,
    slug,
    title: title || undefined,
    dir: dirValue || undefined,
    visibility: visibility || defaults.defaultVisibility,
    project
  });

  note(
    [
      `Schema: ${schema.name}`,
      project ? `Project: ${project}` : undefined,
      `Title: ${plan.title}`,
      `Visibility (${plan.visibilityField}): ${plan.visibility}`,
      `Slug: ${slug}`,
      `Output: ${path.relative(options.cwd, plan.filePath)}`
    ]
      .filter(Boolean)
      .join("\n"),
    "Planned file"
  );

  const shouldCreate = await confirm({
    message: `Create ${path.relative(options.cwd, plan.filePath)}?`,
    initialValue: true
  });
  if (isCancel(shouldCreate) || !shouldCreate) {
    cancel("Creator cancelled.");
    return;
  }

  const task = spinner();
  task.start("Writing file…");
  try {
    const result = await createMarkdownObject(
      {
        config: options.config,
        schema,
        cwd: options.cwd,
        slug,
        title: title || undefined,
        dir: dirValue || undefined,
        visibility: visibility || defaults.defaultVisibility,
        project
      },
      plan
    );
    task.stop(`Created ${path.relative(options.cwd, result.filePath)}`);
    outro("Done!");
  } catch (error) {
    task.stop("Failed.");
    throw error;
  }
}

async function chooseSchema(schemas: LoadedSchema[], initial?: string): Promise<LoadedSchema | undefined> {
  if (schemas.length === 1) {
    return schemas[0];
  }
  const sorted = schemas.slice().sort((a, b) => a.name.localeCompare(b.name));
  const initialValue =
    initial && sorted.some((schema) => schema.name === initial) ? initial : sorted[0].name;

  const value = await select({
    message: "Pick a schema",
    initialValue,
    options: sorted.map((schema) => ({
      value: schema.name,
      label: schema.name,
      hint: schema.description
    }))
  });
  if (isCancel(value)) {
    return undefined;
  }
  return schemas.find((schema) => schema.name === value);
}
