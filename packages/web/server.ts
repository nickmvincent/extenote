import { json, buildHeaders, resolveProjectRoot, API_PORT, API_HOST } from './server/utils.js'
import { CACHE_ENABLED, CACHE_TTL, PUBLIC_ONLY } from './server/cache.js'
import {
  handleVault,
  handleReload,
  handleCacheStatus,
  handleComputedData,
  handleExport,
  handleGraph,
  handleCrossRefs,
  handleTags,
  handleTagPreview,
  handleTagApply,
  handleTaxonomy,
  handleTaxonomyFix,
  handleRefcheckProviders,
  handleRefcheck,
  handleRefcheckStats,
  handleValidationQueue,
  handleWebsites,
  handleCreate,
  handleGetObject,
  handleWrite,
  handleOpenInEditor,
  handleGetSettings,
  handleSaveSettings,
  handleResetSettings,
} from './server/handlers/index.js'
import type { TagMutation, TaxonomyViolation, ExtenoteSettings } from '@extenote/core'

const serverRoot = resolveProjectRoot()

console.log(`Extenote API server starting on http://${API_HOST}:${API_PORT}`)
console.log(`  Cache: ${CACHE_ENABLED ? `enabled (TTL: ${CACHE_TTL}ms)` : 'disabled'}`)
if (PUBLIC_ONLY) {
  console.log(`  Mode: PUBLIC_ONLY (private content filtered out)`)
}

Bun.serve({
  hostname: API_HOST,
  port: API_PORT,
  async fetch(req) {
    const url = new URL(req.url)
    const origin = req.headers.get('origin')
    const headers = buildHeaders(origin)

    if (req.method === 'OPTIONS') {
      return new Response(null, { headers })
    }

    try {
      const cwd = serverRoot

      // Vault endpoints
      if (url.pathname === '/api/vault') {
        return handleVault(cwd, headers)
      }

      if (url.pathname === '/api/reload') {
        return handleReload(cwd, headers)
      }

      if (url.pathname === '/api/cache/status') {
        return handleCacheStatus(headers)
      }

      if (url.pathname === '/api/computed-data') {
        return handleComputedData(cwd, headers)
      }

      // Export endpoint
      if (url.pathname === '/api/export' && req.method === 'POST') {
        const body = await req.json()
        return handleExport(cwd, body, headers)
      }

      // Graph endpoints
      if (url.pathname === '/api/graph') {
        const graphType = url.searchParams.get('type') || 'project-deps'
        return handleGraph(cwd, graphType, headers)
      }

      if (url.pathname.startsWith('/api/crossrefs/')) {
        const objectPath = decodeURIComponent(url.pathname.replace('/api/crossrefs/', ''))
        return handleCrossRefs(cwd, objectPath, headers)
      }

      // Websites endpoint
      if (url.pathname === '/api/websites') {
        return handleWebsites(cwd, headers)
      }

      // Object creation endpoint
      if (url.pathname === '/api/create' && req.method === 'POST') {
        const body = await req.json()
        return handleCreate(cwd, body, headers)
      }

      // Tag endpoints
      if (url.pathname === '/api/tags') {
        return handleTags(cwd, headers)
      }

      if (url.pathname === '/api/tags/preview' && req.method === 'POST') {
        const body = await req.json() as TagMutation
        return handleTagPreview(cwd, body, headers)
      }

      if (url.pathname === '/api/tags/apply' && req.method === 'POST') {
        const body = await req.json() as TagMutation
        return handleTagApply(cwd, body, headers)
      }

      if (url.pathname === '/api/tags/taxonomy') {
        return handleTaxonomy(cwd, headers)
      }

      if (url.pathname === '/api/tags/taxonomy/fix' && req.method === 'POST') {
        const body = await req.json() as { violation: TaxonomyViolation; broadTag?: string }
        return handleTaxonomyFix(body, headers)
      }

      // Refcheck endpoints
      if (url.pathname === '/api/refcheck/providers') {
        return handleRefcheckProviders(headers)
      }

      if (url.pathname === '/api/refcheck' && req.method === 'POST') {
        const body = await req.json()
        return handleRefcheck(cwd, body, headers)
      }

      if (url.pathname === '/api/refcheck/stats') {
        const project = url.searchParams.get('project')
        return handleRefcheckStats(cwd, project, headers)
      }

      // Object endpoints
      if (url.pathname === '/api/object') {
        const pathParam = url.searchParams.get('path')
        const idParam = url.searchParams.get('id')
        return handleGetObject(cwd, pathParam, idParam, headers)
      }

      if (url.pathname === '/api/write' && req.method === 'POST') {
        const body = await req.json()
        return handleWrite(cwd, body, headers)
      }

      if (url.pathname === '/api/open-in-editor' && req.method === 'POST') {
        const body = await req.json() as { filePath?: string }
        if (!body.filePath) {
          return json({ error: 'filePath is required' }, 400, headers)
        }
        return handleOpenInEditor(cwd, body.filePath, headers)
      }

      if (url.pathname === '/api/validation-queue') {
        const project = url.searchParams.get('project')
        const limitParam = url.searchParams.get('limit')
        const limit = limitParam ? parseInt(limitParam, 10) : 50
        return handleValidationQueue(cwd, project, limit, headers)
      }

      // Settings endpoints
      if (url.pathname === '/api/settings') {
        if (req.method === 'GET') {
          return handleGetSettings(cwd, headers)
        }
        if (req.method === 'POST') {
          const body = await req.json()
          return handleSaveSettings(cwd, body, headers)
        }
      }

      if (url.pathname === '/api/settings/reset' && req.method === 'POST') {
        const body = await req.json() as { section?: keyof ExtenoteSettings }
        return handleResetSettings(cwd, body, headers)
      }

      return new Response('Not found', { status: 404, headers })
    } catch (error) {
      console.error('API Error:', error)
      return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500, headers)
    }
  },
})

console.log(`🚀 Extenote API server running on http://${API_HOST}:${API_PORT}`)
