import type { ExportFormat, ExportOptions, ExportResult } from "../types.js";
import { exportJson } from "./json.js";
import { exportMarkdownMirror } from "./markdown.js";
import { exportHtml } from "./html.js";
import { exportAtproto } from "./proto.js";
import { exportBibtex } from "./bibtex.js";

const EXPORTERS: Record<ExportFormat, (options: ExportOptions) => Promise<ExportResult>> = {
  json: exportJson,
  markdown: exportMarkdownMirror,
  html: exportHtml,
  atproto: exportAtproto,
  bibtex: exportBibtex
};

export async function exportContent(options: ExportOptions): Promise<ExportResult> {
  const exporter = EXPORTERS[options.format];
  if (!exporter) {
    throw new Error(`Unknown export format ${options.format}`);
  }
  return exporter(options);
}
