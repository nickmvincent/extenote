import { objectBelongsToProject, checkBibtexEntries, getAvailableProviders, type CheckOptions, type VaultObject } from '@extenote/core'
import { json } from '../utils.js'
import { invalidateVaultCache, loadVaultBundle, type CachedVaultObject } from '../cache.js'

// Helper to adapt cached objects (without bodies) for refcheck - body not needed for metadata checks
function asVaultObjects(cached: CachedVaultObject[]): VaultObject[] {
  return cached.map(obj => ({ ...obj, body: '' }))
}

export function handleRefcheckProviders(headers: Headers) {
  const providers = getAvailableProviders()
  return json({ providers }, 200, headers)
}

interface RefcheckRequest {
  project?: string
  provider?: string
  limit?: number
  filter?: string
  dryRun?: boolean
  force?: boolean
}

export async function handleRefcheck(cwd: string, body: RefcheckRequest, headers: Headers) {
  const { vault, config } = await loadVaultBundle(cwd)

  // Filter objects
  let objects = asVaultObjects(vault.objects)

  // Filter by project if specified
  if (body.project) {
    objects = objects.filter((o) => objectBelongsToProject(o, body.project!, config))
  }

  // Apply path filter if specified
  if (body.filter) {
    const pattern = new RegExp(body.filter.replace(/\*/g, '.*'))
    objects = objects.filter((o) => pattern.test(o.relativePath))
  }

  // Filter to bibtex_entry type only
  objects = objects.filter((o) => o.type === 'bibtex_entry')

  // Apply limit if specified
  if (body.limit && body.limit > 0) {
    objects = objects.slice(0, body.limit)
  }

  if (!objects.length) {
    return json({ error: 'No bibtex entries found to check' }, 400, headers)
  }

  const checkOptions: CheckOptions = {
    provider: body.provider || 'auto',
    dryRun: body.dryRun,
    force: body.force,
  }

  const report = await checkBibtexEntries(objects, checkOptions)

  // Invalidate cache if files were modified (not a dry run)
  if (!body.dryRun) {
    invalidateVaultCache()
  }

  return json(report, 200, headers)
}

export async function handleRefcheckStats(cwd: string, project: string | null, headers: Headers) {
  const { vault, config } = await loadVaultBundle(cwd)

  let objects = asVaultObjects(vault.objects)
  if (project) {
    objects = objects.filter((o) => objectBelongsToProject(o, project, config))
  }

  // Filter to bibtex entries
  const bibtexEntries = objects.filter((o) => o.type === 'bibtex_entry')

  const stats = {
    total: bibtexEntries.length,
    checked: 0,
    unchecked: 0,
    confirmed: 0,
    mismatch: 0,
    notFound: 0,
    error: 0,
  }

  for (const obj of bibtexEntries) {
    const checkLog = obj.frontmatter.check_log as { status?: string } | undefined
    if (checkLog?.status) {
      stats.checked++
      switch (checkLog.status) {
        case 'confirmed':
          stats.confirmed++
          break
        case 'mismatch':
          stats.mismatch++
          break
        case 'not_found':
          stats.notFound++
          break
        case 'error':
          stats.error++
          break
      }
    } else {
      stats.unchecked++
    }
  }

  return json(stats, 200, headers)
}

export async function handleValidationQueue(cwd: string, project: string | null, limit: number, headers: Headers) {
  const { vault, config } = await loadVaultBundle(cwd)

  let objects = asVaultObjects(vault.objects)
  if (project) {
    objects = objects.filter((o) => objectBelongsToProject(o, project, config))
  }

  // Filter to bibtex entries
  const bibtexEntries = objects.filter((o) => o.type === 'bibtex_entry')

  // Separate validated and pending
  const validated: typeof bibtexEntries = []
  const pending: typeof bibtexEntries = []

  for (const obj of bibtexEntries) {
    const checkLog = obj.frontmatter.check_log as { checked_at?: string; status?: string } | undefined
    if (checkLog?.status) {
      validated.push(obj)
    } else {
      pending.push(obj)
    }
  }

  // Return pending entries up to limit
  const entries = pending.slice(0, limit).map((obj) => {
    const fm = obj.frontmatter as Record<string, unknown>
    const checkLog = fm.check_log as { checked_at?: string } | undefined
    return {
      id: obj.id,
      title: obj.title,
      filePath: obj.relativePath,
      url: fm.url as string | undefined,
      doi: fm.doi as string | undefined,
      lastChecked: checkLog?.checked_at ?? null,
    }
  })

  return json({
    total: bibtexEntries.length,
    validated: validated.length,
    pending: pending.length,
    entries,
  }, 200, headers)
}
