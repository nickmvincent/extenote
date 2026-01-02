import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useVault } from '../hooks/useVault'

export function Search() {
  const [searchParams] = useSearchParams()
  const query = searchParams.get('q') || ''
  const { data, loading, error } = useVault()

  // Memoize search results - must be before conditional returns
  const results = useMemo(() => {
    if (!data) return []
    const queryLower = query.toLowerCase()
    const matches = data.vault.objects.filter((o) => {
      if (o.title?.toLowerCase().includes(queryLower)) return true
      if (o.id.toLowerCase().includes(queryLower)) return true
      if (o.relativePath.toLowerCase().includes(queryLower)) return true
      if (o.body?.toLowerCase().includes(queryLower)) return true
      return false
    })
    return matches.slice(0, 50).map((obj) => {
      let contextSnippet = ''
      if (obj.body) {
        const bodyLower = obj.body.toLowerCase()
        const matchIndex = bodyLower.indexOf(queryLower)
        if (matchIndex !== -1) {
          const start = Math.max(0, matchIndex - 30)
          const end = Math.min(obj.body.length, matchIndex + query.length + 50)
          contextSnippet = (start > 0 ? '...' : '') +
            obj.body.slice(start, end).replace(/\n/g, ' ') +
            (end < obj.body.length ? '...' : '')
        }
      }
      return { obj, contextSnippet }
    })
  }, [query, data])

  const totalMatches = useMemo(() => {
    if (!data) return 0
    const queryLower = query.toLowerCase()
    return data.vault.objects.filter((o) => {
      if (o.title?.toLowerCase().includes(queryLower)) return true
      if (o.id.toLowerCase().includes(queryLower)) return true
      if (o.relativePath.toLowerCase().includes(queryLower)) return true
      if (o.body?.toLowerCase().includes(queryLower)) return true
      return false
    }).length
  }, [query, data])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500 dark:text-gray-400">Loading...</div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
        <h2 className="text-red-800 dark:text-red-400 font-semibold">Error loading vault</h2>
        <p className="text-red-600 dark:text-red-300 mt-2">{error?.message || 'No data'}</p>
      </div>
    )
  }

  return (
    <div className="px-4 sm:px-0">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Search Results
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          {totalMatches} result{totalMatches !== 1 ? 's' : ''} for "{query}"
        </p>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-500">
          Searches title, ID, path, and body content
        </p>
      </div>

      {results.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 dark:text-gray-400">No objects found matching your search.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {results.map(({ obj, contextSnippet }) => (
              <li key={obj.filePath || obj.relativePath}>
                <Link
                  to={`/object/${encodeURIComponent(obj.relativePath)}`}
                  state={{ from: `/search?q=${encodeURIComponent(query)}`, label: 'Search Results' }}
                  className="block px-4 py-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400 truncate">
                        {obj.title || obj.id}
                      </p>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 truncate">
                        {obj.relativePath}
                      </p>
                      {contextSnippet && (
                        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500 truncate">
                          {contextSnippet}
                        </p>
                      )}
                    </div>
                    <div className="ml-4 flex-shrink-0 flex items-center gap-2">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200">
                        {obj.type}
                      </span>
                      {obj.visibility && (
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          obj.visibility === 'public'
                            ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                            : 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200'
                        }`}>
                          {obj.visibility}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {totalMatches > 50 && (
            <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700 text-sm text-gray-500 dark:text-gray-400">
              Showing 50 of {totalMatches} results
            </div>
          )}
        </div>
      )}
    </div>
  )
}
