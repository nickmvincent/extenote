import fs from "fs/promises";
import path from "path";
import type { ExportOptions, ExportResult } from "../types.js";

export async function exportJson(options: ExportOptions): Promise<ExportResult> {
  await fs.mkdir(options.outputDir, { recursive: true });
  const outputPath = path.join(options.outputDir, "objects.json");
  const payload = options.objects.map((object) => ({
    id: object.id,
    type: object.type,
    title: object.title,
    visibility: object.visibility,
    sourceId: object.sourceId,
    frontmatter: object.frontmatter,
    body: object.body
  }));
  await fs.writeFile(outputPath, JSON.stringify({ objects: payload }, null, 2), "utf8");
  return { format: "json", outputDir: options.outputDir, files: [outputPath] };
}
