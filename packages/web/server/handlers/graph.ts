import path from 'path'
import { readFile } from 'fs/promises'
import { buildProjectDependencyGraph, buildTagExplorerTree, buildTagTaxonomyGraph, loadTaxonomy } from '@extenote/core'
import { json } from '../utils.js'
import { loadVaultBundle, getCrossRefs } from '../cache.js'

export async function handleGraph(cwd: string, graphType: string, headers: Headers) {
  const { vault, config } = await loadVaultBundle(cwd)

  switch (graphType) {
    case 'project-deps':
      return json(buildProjectDependencyGraph(config, vault.objects), 200, headers)

    case 'tag-explorer':
      return json(buildTagExplorerTree(vault), 200, headers)

    case 'tag-taxonomy': {
      // Find content root by looking for _taxonomy.md in source roots or their parents
      let contentRoot: string | null = null
      for (const source of config.sources) {
        if (!source.root) continue
        const sourceRoot = path.resolve(cwd, source.root)
        try {
          await readFile(path.join(sourceRoot, '_taxonomy.md'))
          contentRoot = sourceRoot
          break
        } catch {
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
      const taxonomy = await loadTaxonomy(contentRoot || cwd)
      if (!taxonomy) {
        return json({ type: 'tag-taxonomy', nodes: [], edges: [] }, 200, headers)
      }
      return json(buildTagTaxonomyGraph(taxonomy, vault), 200, headers)
    }

    // Deprecated graph types - these are no longer supported
    case 'objects-by-project':
    case 'tag-cooccurrence':
      return json({ error: `Graph type '${graphType}' is deprecated and no longer supported` }, 400, headers)

    default:
      return json({ error: `Unknown graph type: ${graphType}` }, 400, headers)
  }
}

export async function handleCrossRefs(cwd: string, objectPath: string, headers: Headers) {
  const { vault } = await loadVaultBundle(cwd)
  // Get cross-refs lazily - only computed on first request
  const allCrossRefs = await getCrossRefs(cwd)

  const object = vault.objects.find(
    (o) => o.relativePath === objectPath || o.id === objectPath
  )

  if (!object) {
    return json({ error: 'Object not found' }, 404, headers)
  }

  // Use pre-computed cross-refs from cache (O(1) lookup instead of O(n²) computation)
  const crossRefs = allCrossRefs.get(object.id)

  if (!crossRefs) {
    return json({ id: object.id, outgoingLinks: [], backlinks: [] }, 200, headers)
  }

  // Resolve link targets to get titles and paths
  const resolvedLinks = crossRefs.outgoingLinks.map((link) => {
    let target: typeof vault.objects[0] | undefined

    if (link.linkType === 'citation') {
      // For citations, look up by citation_key in bibtex_entry objects
      target = vault.objects.find(
        (o) => o.type === 'bibtex_entry' && o.frontmatter.citation_key === link.targetId
      )
    } else {
      // For wikilinks, look up by id or filename
      target = vault.objects.find(
        (o) => o.id === link.targetId ||
               o.relativePath.split('/').pop()?.replace(/\.md$/, '') === link.targetId
      )
    }

    return {
      ...link,
      resolved: target ? {
        id: target.id,
        title: target.title,
        path: target.relativePath,
        type: target.type,
      } : null,
    }
  })

  return json({
    ...crossRefs,
    outgoingLinks: resolvedLinks,
  }, 200, headers)
}
