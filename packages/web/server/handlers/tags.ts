import path from 'path'
import { readFile } from 'fs/promises'
import { buildTagTree, getAllTags, previewTagMutation, applyTagMutation, loadTaxonomy, validateTaxonomy, fixTaxonomyViolation, type TagMutation, type TaxonomyViolation, type VaultState } from '@extenote/core'
import { json } from '../utils.js'
import { invalidateVaultCache, loadVaultBundle, type CachedVaultState } from '../cache.js'

// Helper to adapt cached vault (without bodies) to VaultState interface for tag functions
function asVaultState(cached: CachedVaultState): VaultState {
  return {
    ...cached,
    objects: cached.objects.map(obj => ({ ...obj, body: '' })),
  }
}

export async function handleTags(cwd: string, headers: Headers) {
  const { vault } = await loadVaultBundle(cwd)
  const vaultState = asVaultState(vault)
  const tree = buildTagTree(vaultState)
  const allTags = getAllTags(vaultState)
  return json({ tree, allTags }, 200, headers)
}

export async function handleTagPreview(cwd: string, body: TagMutation, headers: Headers) {
  const { vault } = await loadVaultBundle(cwd)
  const vaultState = asVaultState(vault)
  const preview = previewTagMutation(vaultState, body)
  return json(preview, 200, headers)
}

export async function handleTagApply(cwd: string, body: TagMutation, headers: Headers) {
  const { vault } = await loadVaultBundle(cwd)
  const vaultState = asVaultState(vault)
  const preview = previewTagMutation(vaultState, body)
  const result = await applyTagMutation(preview)

  // Invalidate cache after modifying files
  invalidateVaultCache()

  return json(result, 200, headers)
}

export async function handleTaxonomy(cwd: string, headers: Headers) {
  const { vault, config } = await loadVaultBundle(cwd)
  const vaultState = asVaultState(vault)

  // Find content root by looking for _taxonomy.md in source roots or their parents
  let contentRoot: string | null = null

  for (const source of config.sources) {
    if (!source.root) continue
    const sourceRoot = path.resolve(cwd, source.root)

    // Check if _taxonomy.md exists in source root
    try {
      await readFile(path.join(sourceRoot, '_taxonomy.md'))
      contentRoot = sourceRoot
      break
    } catch {
      // Check parent directory
      const parentDir = path.dirname(sourceRoot)
      try {
        await readFile(path.join(parentDir, '_taxonomy.md'))
        contentRoot = parentDir
        break
      } catch {
        // Continue searching
      }
    }
  }

  if (!contentRoot) {
    contentRoot = cwd
  }

  const taxonomy = await loadTaxonomy(contentRoot)

  if (!taxonomy) {
    return json({
      error: 'No taxonomy found',
      message: 'Create a _taxonomy.md file in your content root with a taxonomy field in frontmatter'
    }, 404, headers)
  }

  const result = validateTaxonomy(vaultState, taxonomy)
  return json(result, 200, headers)
}

export async function handleTaxonomyFix(body: { violation: TaxonomyViolation; broadTag?: string }, headers: Headers) {
  const result = await fixTaxonomyViolation(body.violation, body.broadTag)

  if (result.success) {
    invalidateVaultCache()
  }

  return json(result, 200, headers)
}
