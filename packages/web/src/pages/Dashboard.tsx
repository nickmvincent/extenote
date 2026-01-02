import { Link } from 'react-router-dom'
import { useVault } from '../hooks/useVault'
import { useRecentItems } from '../hooks/useRecentItems'
import { getVaultStats } from '../api/vault'
import { LoadingSpinner } from '../components/LoadingSpinner'

export function Dashboard() {
  const { data, loading, error, reload } = useVault()
  const { items: recentItems, clearItems: clearRecentItems } = useRecentItems()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" message="Loading vault..." />
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
        <h2 className="text-red-800 dark:text-red-400 font-semibold">Error loading vault</h2>
        <p className="text-red-600 dark:text-red-300 mt-2">{error.message}</p>
        <button
          onClick={reload}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    )
  }

  if (!data) return null

  const stats = getVaultStats(data.vault)

  return (
    <div className="px-4 sm:px-0">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
        <button
          onClick={reload}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Reload
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Objects</div>
          <div className="mt-2 text-3xl font-semibold text-gray-900 dark:text-white">
            {stats.totalObjects}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Projects</div>
          <div className="mt-2 text-3xl font-semibold text-gray-900 dark:text-white">
            {stats.projects.length}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Issues</div>
          <div className="mt-2 text-3xl font-semibold text-gray-900 dark:text-white">
            {stats.totalIssues}
          </div>
          <div className="mt-2 flex gap-3 text-xs">
            <span className="text-red-600 dark:text-red-400">{stats.issueSeverityCounts.error} errors</span>
            <span className="text-yellow-600 dark:text-yellow-400">{stats.issueSeverityCounts.warn} warnings</span>
            <span className="text-blue-600 dark:text-blue-400">{stats.issueSeverityCounts.info} info</span>
          </div>
        </div>
      </div>

      {/* Recent Items */}
      {recentItems.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Recently Viewed</h2>
            <button
              onClick={clearRecentItems}
              className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              Clear
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {recentItems.slice(0, 6).map((item) => (
              <Link
                key={item.path}
                to={`/object/${encodeURIComponent(item.path)}`}
                className="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-indigo-500 dark:hover:border-indigo-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-all"
              >
                <span className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded">
                  {item.type}
                </span>
                <span className="text-sm text-gray-900 dark:text-white truncate flex-1">
                  {item.title}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Type Distribution */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Object Types</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Object.entries(stats.typeCounts).map(([type, count]) => (
            <Link
              key={type}
              to={`/type/${encodeURIComponent(type)}`}
              className="flex justify-between items-center p-2 rounded hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
            >
              <span className="text-gray-600 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400">{type}</span>
              <span className="font-semibold text-gray-900 dark:text-white">{count}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Visibility Distribution */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Visibility</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Object.entries(stats.visibilityCounts).map(([visibility, count]) => (
            <div key={visibility} className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-300">{visibility}</span>
              <span className="font-semibold text-gray-900 dark:text-white">{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Projects List */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Projects</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {stats.projects.map((project) => (
            <Link
              key={project}
              to={`/project/${encodeURIComponent(project)}`}
              className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-indigo-500 dark:hover:border-indigo-400 hover:shadow-md transition-all"
            >
              <div className="font-medium text-gray-900 dark:text-white">{project}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {stats.projectCounts[project] || 0} objects
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
