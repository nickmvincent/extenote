import path from 'path'
import { exportContent, type ExportFormat } from '@extenote/core'
import { json } from '../utils.js'
import { loadVaultBundle } from '../cache.js'

const supportedFormats = new Set<ExportFormat>(['json', 'markdown', 'html', 'atproto', 'bibtex'])

interface ExportRequest {
  project: string
  format: string
  outputDir?: string
}

export async function handleExport(cwd: string, body: ExportRequest, headers: Headers) {
  if (!supportedFormats.has(body.format as ExportFormat)) {
    return json({ error: `Unsupported format ${body.format}` }, 400, headers)
  }

  const { vault, config, schemas } = await loadVaultBundle(cwd)

  const objects = vault.objects.filter((object) =>
    object.project === body.project
  )

  if (!objects.length) {
    return json({ error: `No objects found for project ${body.project}` }, 404, headers)
  }

  const outputDir = path.resolve(
    cwd,
    body.outputDir ?? path.join('dist/export', body.project, body.format)
  )

  const result = await exportContent({
    format: body.format as ExportFormat,
    outputDir,
    objects,
    config,
    schemas
  })

  return json({
    count: objects.length,
    outputDir: result.outputDir,
    files: result.files
  }, 200, headers)
}
