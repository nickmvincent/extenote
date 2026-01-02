import { useState, useEffect } from 'react'
import { API_ROUTES } from '../api/routes'
import { LoadingSpinner } from '../components/LoadingSpinner'

interface ComputedDataItem {
  name: string
  description: string
  persistence: 'optional' | 'computed-only'
  persistCommand?: string
  stats: Record<string, unknown>
  computeTimeMs: number | null
}

interface ComputedDataResponse {
  computedData: ComputedDataItem[]
  cache: {
    enabled: boolean
    ttl: number
    lastLoadTime: number
  }
}

export function Status() {
  const [data, setData] = useState<ComputedDataResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(API_ROUTES.COMPUTED_DATA)
      if (!response.ok) {
        throw new Error(`Failed to load: ${response.statusText}`)
      }
      const result = await response.json()
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" message="Loading computed data status..." />
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
        <h2 className="text-red-800 dark:text-red-400 font-semibold">Error</h2>
        <p className="text-red-600 dark:text-red-300 mt-2">{error.message}</p>
        <button
          onClick={loadData}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="px-4 sm:px-0">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Computed Data</h1>
          <p className="mt-1 text-gray-600 dark:text-gray-400">
            How Extenote derives and caches data from your vault
          </p>
        </div>
        <button
          onClick={loadData}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Cache Status */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Cache</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Status</div>
            <div className="font-medium text-gray-900 dark:text-white">
              {data.cache.enabled ? (
                <span className="text-green-600 dark:text-green-400">Enabled</span>
              ) : (
                <span className="text-yellow-600 dark:text-yellow-400">Disabled</span>
              )}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-500 dark:text-gray-400">TTL</div>
            <div className="font-medium text-gray-900 dark:text-white">
              {(data.cache.ttl / 1000).toFixed(0)}s
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Last Load Time</div>
            <div className="font-medium text-gray-900 dark:text-white">
              {data.cache.lastLoadTime}ms
            </div>
          </div>
        </div>
      </div>

      {/* Computed Data */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Computed Data
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Extenote derives certain data dynamically from your vault content. Some data can optionally
          be persisted to frontmatter for performance or audit purposes.
        </p>

        <div className="space-y-6">
          {data.computedData.map((item) => (
            <div
              key={item.name}
              className="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="font-medium text-gray-900 dark:text-white">{item.name}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{item.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  {item.persistence === 'optional' ? (
                    <span className="px-2 py-1 text-xs rounded bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
                      Optional Persist
                    </span>
                  ) : (
                    <span className="px-2 py-1 text-xs rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                      Computed Only
                    </span>
                  )}
                  {item.computeTimeMs !== null && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {item.computeTimeMs}ms
                    </span>
                  )}
                </div>
              </div>

              {/* Stats */}
              <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
                {Object.entries(item.stats).map(([key, value]) => (
                  <div key={key} className="text-sm">
                    <span className="text-gray-500 dark:text-gray-400">
                      {key.replace(/([A-Z])/g, ' $1').toLowerCase()}:
                    </span>{' '}
                    <span className="font-medium text-gray-900 dark:text-white">
                      {Array.isArray(value) ? value.length : String(value)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Persist Command */}
              {item.persistCommand && (
                <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                    To persist this data:
                  </div>
                  <code className="text-xs bg-gray-100 dark:bg-gray-900 px-2 py-1 rounded text-gray-700 dark:text-gray-300">
                    {item.persistCommand}
                  </code>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h3 className="text-blue-800 dark:text-blue-400 font-medium mb-2">
          About Computed Data
        </h3>
        <div className="text-sm text-blue-700 dark:text-blue-300 space-y-2">
          <p>
            <strong>Computed Only:</strong> Data is calculated fresh each time it's needed.
            Always accurate but requires processing.
          </p>
          <p>
            <strong>Optional Persist:</strong> Data can be saved to frontmatter using CLI commands.
            Useful for large vaults or when you want an audit trail.
          </p>
        </div>
      </div>
    </div>
  )
}
