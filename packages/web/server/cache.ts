import { loadVault, loadConfig, loadSchemas, computeAllCrossRefs, loadSettings, DEFAULT_CACHE_TTL, type VaultState, type ExtenoteConfig, type LoadedSchema, type ObjectCrossRefs, type VaultObject } from '@extenote/core'

// Public-only mode - filters out private content for screenshots/demos
export const PUBLIC_ONLY = process.env.EXTENOTE_PUBLIC_ONLY === 'true'

// Cached settings - reload only when explicitly requested or on first access
let cachedSettings: ReturnType<typeof loadSettings> | null = null
let settingsTimestamp = 0
const SETTINGS_CACHE_TTL = 60000 // 1 minute

function getCachedSettings() {
  const now = Date.now()
  if (!cachedSettings || now - settingsTimestamp > SETTINGS_CACHE_TTL) {
    cachedSettings = loadSettings()
    settingsTimestamp = now
  }
  return cachedSettings
}

// Cache configuration - read from cached settings with env var override
function getCacheConfig() {
  const settings = getCachedSettings()
  return {
    ttl: Number(process.env.EXTENOTE_CACHE_TTL) || settings.cache.ttl,
    enabled: process.env.EXTENOTE_CACHE_ENABLED !== 'false' && settings.cache.enabled,
  }
}

// Export getters for cache config
export const CACHE_TTL = getCacheConfig().ttl
export const CACHE_ENABLED = getCacheConfig().enabled

// Vault object without body - saves significant memory in cache
export type CachedVaultObject = Omit<VaultObject, 'body'>

export interface CachedVaultState {
  objects: CachedVaultObject[]
  config: ExtenoteConfig
  issues: VaultState['issues']
}

export interface CachedBundle {
  vault: CachedVaultState
  config: ExtenoteConfig
  schemas: LoadedSchema[]
  timestamp: number
}

// Lazy cross-refs cache - computed on demand, not at load time
let crossRefsCache: Map<string, ObjectCrossRefs> | null = null
let crossRefsCacheTimestamp = 0

let cachedBundle: CachedBundle | null = null
let cacheLoadPromise: Promise<CachedBundle> | null = null

/**
 * Load vault bundle with optional caching.
 * Set EXTENOTE_CACHE_ENABLED=false to disable caching.
 * Set EXTENOTE_CACHE_TTL to adjust cache TTL in milliseconds.
 */
export async function loadVaultBundle(cwd: string, forceReload = false): Promise<CachedBundle> {
  const now = Date.now()

  // Return cached bundle if valid and not forcing reload
  if (
    CACHE_ENABLED &&
    !forceReload &&
    cachedBundle &&
    now - cachedBundle.timestamp < CACHE_TTL
  ) {
    return cachedBundle
  }

  // If a load is already in progress and we're not forcing reload, wait for it
  if (cacheLoadPromise && !forceReload) {
    return cacheLoadPromise
  }

  // If forcing reload, invalidate cached bundle so new loads after this one
  // will see it as stale
  if (forceReload) {
    cachedBundle = null
  }

  // Start loading (or restart if forceReload)
  cacheLoadPromise = (async () => {
    try {
      const { config, schemas } = await loadConfigAndSchemas(cwd)
      const fullVault = await loadVault({ cwd })

      // Filter out private content if PUBLIC_ONLY mode is enabled
      let filteredObjects = fullVault.objects
      let filteredIssues = fullVault.issues

      if (PUBLIC_ONLY) {
        // Filter out private objects and objects from private projects
        filteredObjects = fullVault.objects.filter(obj => {
          // Exclude objects with private visibility
          if (obj.visibility === 'private') return false
          // Exclude objects from projects containing "private" in name
          if (obj.project?.toLowerCase().includes('private')) return false
          return true
        })

        // Filter issues to only include those for remaining objects
        // Note: issue.filePath is absolute, so compare against object.filePath (also absolute)
        const remainingPaths = new Set(filteredObjects.map(o => o.filePath))
        filteredIssues = fullVault.issues.filter(issue =>
          remainingPaths.has(issue.filePath)
        )
      }

      // Filter config to hide private projects if PUBLIC_ONLY mode
      let filteredConfig = config
      if (PUBLIC_ONLY && filteredConfig.projectProfiles) {
        filteredConfig = {
          ...filteredConfig,
          projectProfiles: filteredConfig.projectProfiles.filter(
            p => !p.name.toLowerCase().includes('private')
          ),
        }
      }

      // Strip body from objects to save memory - bodies are loaded on-demand
      const cachedVault: CachedVaultState = {
        objects: filteredObjects.map(({ body, ...rest }) => rest),
        config: filteredConfig,
        issues: filteredIssues,
      }

      // Invalidate cross-refs cache when vault reloads
      crossRefsCache = null
      crossRefsCacheTimestamp = 0

      const bundle: CachedBundle = { vault: cachedVault, config: filteredConfig, schemas, timestamp: Date.now() }
      cachedBundle = bundle
      return bundle
    } finally {
      cacheLoadPromise = null
    }
  })()

  return cacheLoadPromise
}

/**
 * Invalidate the vault cache.
 * Call this after operations that modify files.
 */
export function invalidateVaultCache() {
  cachedBundle = null
  crossRefsCache = null
  crossRefsCacheTimestamp = 0
}

/**
 * Invalidate settings cache.
 * Call this after settings are modified.
 */
export function invalidateSettingsCache() {
  cachedSettings = null
  settingsTimestamp = 0
}

/**
 * Get cross-refs lazily - only computed when first requested.
 * Uses cached vault objects, loads full vault only if needed for body content.
 */
export async function getCrossRefs(cwd: string): Promise<Map<string, ObjectCrossRefs>> {
  const bundle = await loadVaultBundle(cwd)
  const now = Date.now()

  // Return cached cross-refs if still valid
  if (crossRefsCache && now - crossRefsCacheTimestamp < CACHE_TTL) {
    return crossRefsCache
  }

  // Need to load full vault with bodies to compute cross-refs (for body link extraction)
  const fullVault = await loadVault({ cwd })
  crossRefsCache = computeAllCrossRefs(fullVault.objects)
  crossRefsCacheTimestamp = now

  return crossRefsCache
}

export async function loadConfigAndSchemas(cwd: string) {
  const config = await loadConfig({ cwd })
  const schemas = await loadSchemas(config, cwd)
  return { config, schemas }
}

export function getCacheStatus() {
  const now = Date.now()
  const age = cachedBundle ? now - cachedBundle.timestamp : null
  return {
    enabled: CACHE_ENABLED,
    ttl: CACHE_TTL,
    cached: cachedBundle !== null,
    age: age,
    isStale: age !== null && age >= CACHE_TTL,
    objectCount: cachedBundle?.vault.objects.length ?? null,
  }
}
