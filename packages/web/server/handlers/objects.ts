import path from 'path'
import { existsSync } from 'fs'
import { readFile, writeFile } from 'fs/promises'
import { getProjectWebsites, parseMarkdown, stringifyMarkdown, DEFAULT_EDITOR, createMarkdownObject, selectSchemaProject } from '@extenote/core'
import { json, splitCommand } from '../utils.js'
import { invalidateVaultCache, loadConfigAndSchemas, loadVaultBundle } from '../cache.js'

export async function handleWebsites(cwd: string, headers: Headers) {
  const { config } = await loadVaultBundle(cwd)
  const websites = getProjectWebsites(config)
  return json(websites, 200, headers)
}

interface CreateRequest {
  schema: string
  slug: string
  title?: string
  visibility?: string
  dir?: string
  project?: string
}

export async function handleCreate(cwd: string, body: CreateRequest, headers: Headers) {
  const { config, schemas } = await loadConfigAndSchemas(cwd)
  const schema = schemas.find((s) => s.name === body.schema)

  if (!schema) {
    return json({ error: `Schema ${body.schema} not found` }, 404, headers)
  }

  const project = selectSchemaProject(schema, body.project)

  const result = await createMarkdownObject({
    config,
    schema,
    cwd,
    slug: body.slug,
    title: body.title,
    dir: body.dir,
    visibility: body.visibility,
    project
  })

  // Invalidate cache after creating a new file
  invalidateVaultCache()

  const relativePath = path.relative(cwd, result.filePath)

  return json({
    filePath: relativePath
  }, 200, headers)
}

export async function handleGetObject(cwd: string, pathParam: string | null, idParam: string | null, headers: Headers) {
  if (!pathParam && !idParam) {
    return json({ error: 'Either path or id parameter is required' }, 400, headers)
  }

  const { vault } = await loadVaultBundle(cwd)
  const object = vault.objects.find((o) => {
    if (pathParam) {
      return o.relativePath === pathParam
    }
    return o.id === idParam
  })

  if (!object) {
    return json(null, 200, headers)
  }

  // Read the full file content to get the body
  // Use object.filePath which is the absolute path (relativePath is relative to source root, not cwd)
  const content = await readFile(object.filePath, 'utf-8')
  const parsed = parseMarkdown(content)

  return json({
    id: object.id,
    filePath: object.filePath,
    relativePath: object.relativePath,
    project: object.project,
    type: object.type,
    title: object.title,
    frontmatter: parsed.frontmatter,
    body: parsed.body,
  }, 200, headers)
}

interface WriteRequest {
  filePath: string
  frontmatter: Record<string, unknown>
  body?: string
  merge?: boolean
}

export async function handleWrite(cwd: string, body: WriteRequest, headers: Headers) {
  if (!body.filePath) {
    return json({ error: 'filePath is required' }, 400, headers)
  }

  // Look up the object in vault to get the actual absolute file path
  // (relativePath is relative to source root, not cwd)
  const { vault } = await loadVaultBundle(cwd)
  const object = vault.objects.find((o) => o.relativePath === body.filePath)

  let fullPath: string
  if (object) {
    fullPath = object.filePath
  } else {
    // Fallback: try resolving from cwd (for newly created files not yet in vault cache)
    fullPath = path.resolve(cwd, body.filePath)
  }

  // Read existing file
  let existingContent: string
  try {
    existingContent = await readFile(fullPath, 'utf-8')
  } catch {
    return json({ error: `File not found: ${body.filePath}` }, 404, headers)
  }

  const parsed = parseMarkdown(existingContent)

  // Determine new frontmatter
  let newFrontmatter: Record<string, unknown>
  if (body.merge) {
    newFrontmatter = { ...parsed.frontmatter, ...body.frontmatter }
  } else {
    newFrontmatter = body.frontmatter
  }

  // Determine body content
  const newBody = body.body !== undefined ? body.body : parsed.body

  // Write back
  const newContent = stringifyMarkdown(newFrontmatter, newBody)
  await writeFile(fullPath, newContent, 'utf-8')

  // Invalidate cache after modifying files
  invalidateVaultCache()

  return json({
    success: true,
    filePath: fullPath,
    relativePath: body.filePath,
  }, 200, headers)
}

export async function handleOpenInEditor(cwd: string, filePath: string, headers: Headers) {
  const { vault } = await loadVaultBundle(cwd)
  const object = vault.objects.find((o) =>
    o.relativePath === filePath || o.filePath === filePath
  )

  let fullPath = object?.filePath
  if (!fullPath) {
    const resolved = path.resolve(cwd, filePath)
    if (!resolved.startsWith(cwd)) {
      return json({ error: 'Invalid filePath' }, 400, headers)
    }
    fullPath = resolved
  }

  if (!existsSync(fullPath)) {
    return json({ error: `File not found: ${filePath}` }, 404, headers)
  }

  const editorCommand = process.env.EDITOR || DEFAULT_EDITOR
  const [command, ...args] = splitCommand(editorCommand)
  if (!command) {
    return json({ error: 'Editor command not configured' }, 500, headers)
  }

  try {
    Bun.spawn({
      cmd: [command, ...args, fullPath],
      stdout: 'ignore',
      stderr: 'pipe',
      stdin: 'ignore'
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to launch editor'
    return json({ error: message }, 500, headers)
  }

  return json({ success: true }, 200, headers)
}
