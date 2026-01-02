import fs from "fs/promises";
import path from "path";
import type { ExportOptions, ExportResult } from "../types.js";
import { stringifyMarkdown } from "../markdown.js";

export async function exportMarkdownMirror(options: ExportOptions): Promise<ExportResult> {
  const files: string[] = [];
  for (const object of options.objects) {
    const targetPath = path.join(options.outputDir, object.sourceId, object.relativePath);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    const file = stringifyMarkdown(object.frontmatter, object.body);
    await fs.writeFile(targetPath, file, "utf8");
    files.push(targetPath);
  }
  return { format: "markdown", outputDir: options.outputDir, files };
}
