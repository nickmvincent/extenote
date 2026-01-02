import fs from "fs/promises";
import path from "path";
import fg from "fast-glob";
import { load } from "js-yaml";
import type { ExtenoteConfig, LoadedSchema, SchemaDefinition } from "./types.js";

export async function loadSchemas(config: ExtenoteConfig, cwd = process.cwd()): Promise<LoadedSchema[]> {
  const schemaDir = path.resolve(cwd, config.schemaDir);
  const files = await fg(["**/*.yml", "**/*.yaml"], { cwd: schemaDir });

  const loaded: LoadedSchema[] = [];
  const seenSchemas = new Map<string, string>();

  for (const relative of files) {
    const filePath = path.join(schemaDir, relative);
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = load(raw) as { schemas?: SchemaDefinition[] } | undefined;
    const schemas = parsed?.schemas ?? [];

    for (const schema of schemas) {
      const existingPath = seenSchemas.get(schema.name);
      if (existingPath) {
        throw new Error(
          `Duplicate schema name "${schema.name}" detected in ${filePath} (already defined in ${existingPath})`
        );
      }
      seenSchemas.set(schema.name, filePath);
      loaded.push({
        ...schema,
        fields: schema.fields ?? {},
        required: schema.required ?? [],
        filePath
      });
    }
  }

  return loaded;
}
