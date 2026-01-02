import fs from "fs/promises";
import path from "path";
import type { ExportOptions, ExportResult } from "../types.js";

export async function exportAtproto(options: ExportOptions): Promise<ExportResult> {
  await fs.mkdir(options.outputDir, { recursive: true });
  const filePath = path.join(options.outputDir, "records.json");
  const payload = options.objects.map((object) => ({
    collection: `app.extenote.${object.type}`,
    record: {
      $type: `app.extenote.${object.type}`,
      createdAt: new Date(object.mtime).toISOString(),
      title: object.title ?? object.id,
      body: object.body,
      metadata: object.frontmatter,
      visibility: object.visibility
    }
  }));
  await fs.writeFile(filePath, JSON.stringify({ records: payload }, null, 2), "utf8");
  return { format: "atproto", outputDir: options.outputDir, files: [filePath] };
}
