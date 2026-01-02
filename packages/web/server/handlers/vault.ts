import { computeCitedIn, getAllTags } from '@extenote/core'
import { json } from '../utils.js'
import { loadVaultBundle, getCacheStatus, getCrossRefs, CACHE_TTL, CACHE_ENABLED } from '../cache.js'

export async function handleVault(cwd: string, headers: Headers) {
  const bundle = await loadVaultBundle(cwd)
  return json(bundle, 200, headers)
}

export async function handleReload(cwd: string, headers: Headers) {
  const bundle = await loadVaultBundle(cwd, true)
  return json(bundle, 200, headers)
}

export function handleCacheStatus(headers: Headers) {
  return json(getCacheStatus(), 200, headers)
}

export async function handleComputedData(cwd: string, headers: Headers) {
  const startTime = Date.now()
  const { vault, config } = await loadVaultBundle(cwd)
  const crossRefs = await getCrossRefs(cwd)
  const loadTime = Date.now() - startTime

  // Compute cited_in dynamically
  const citedInStart = Date.now()
  const citedInMap = computeCitedIn(vault.objects, config)
  const citedInTime = Date.now() - citedInStart

  // Get tag stats
  const tagStart = Date.now()
  const allTags = getAllTags(vault)
  const tagTime = Date.now() - tagStart

  // Count bibtex entries with persisted vs computed cited_in
  const bibtexEntries = vault.objects.filter((o) => o.type === 'bibtex_entry')
  let persistedCitedIn = 0
  let computedCitedIn = 0
  for (const entry of bibtexEntries) {
    const persisted = entry.frontmatter.cited_in
    if (Array.isArray(persisted) && persisted.length > 0) {
      persistedCitedIn++
    }
    const key = (entry.frontmatter.citation_key as string) || entry.id
    if (citedInMap.citedIn.has(key)) {
      computedCitedIn++
    }
  }

  return json({
    computedData: [
      {
        name: 'cited_in',
        description: 'Which projects cite each bibtex entry',
        persistence: 'optional',
        persistCommand: 'extenote sync-citations',
        stats: {
          totalBibtexEntries: bibtexEntries.length,
          withPersistedCitedIn: persistedCitedIn,
          withComputedCitedIn: computedCitedIn,
          scannedProjects: citedInMap.scannedProjects,
        },
        computeTimeMs: citedInTime,
      },
      {
        name: 'cross_refs',
        description: 'Wikilinks and backlinks between objects',
        persistence: 'computed-only',
        stats: {
          objectsWithLinks: crossRefs.size,
          totalLinks: Array.from(crossRefs.values()).reduce(
            (sum, refs) => sum + refs.outgoingLinks.length,
            0
          ),
        },
        computeTimeMs: null, // Computed during vault load
      },
      {
        name: 'tags',
        description: 'Tag index and tree structure',
        persistence: 'computed-only',
        stats: {
          uniqueTags: allTags.length,
        },
        computeTimeMs: tagTime,
      },
      {
        name: 'vault_summary',
        description: 'Object counts, issues, project breakdowns',
        persistence: 'computed-only',
        stats: {
          totalObjects: vault.objects.length,
          totalIssues: vault.issues.length,
        },
        computeTimeMs: null, // Part of vault load
      },
    ],
    cache: {
      enabled: CACHE_ENABLED,
      ttl: CACHE_TTL,
      lastLoadTime: loadTime,
    },
  }, 200, headers)
}
