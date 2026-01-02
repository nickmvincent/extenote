import fs from "fs/promises";
import path from "path";
import type { ExportOptions, ExportResult } from "../types.js";

export async function exportHtml(options: ExportOptions): Promise<ExportResult> {
  await fs.mkdir(options.outputDir, { recursive: true });
  const target = path.join(options.outputDir, "index.html");
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Extenote Export</title>
    <style>
      body { font-family: ui-sans-serif, system-ui; margin: 2rem; }
      article { border-bottom: 1px solid #ddd; padding: 1rem 0; }
      .meta { color: #555; font-size: 0.9rem; }
    </style>
  </head>
  <body>
    <h1>Extenote export (${options.objects.length} objects)</h1>
    ${options.objects
      .map(
        (object) => `
      <article>
        <h2>${object.title ?? object.id}</h2>
        <div class="meta">${object.type} · ${object.visibility} · ${object.sourceId}</div>
        <pre>${escapeHtml(object.body).slice(0, 2000)}</pre>
      </article>`
      )
      .join("\n")}
  </body>
</html>`;
  await fs.writeFile(target, html, "utf8");
  return { format: "html", outputDir: options.outputDir, files: [target] };
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
