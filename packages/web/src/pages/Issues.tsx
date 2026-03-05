import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useVault } from '../hooks/useVault'
import type { VaultIssue } from '@extenote/core'

type SeverityFilter = 'all' | 'error' | 'warn' | 'info'
type IssueObjectMeta = { relativePath: string; title?: string; type: string }

export function Issues() {
  const { data, loading, error } = useVault()
  const [filter, setFilter] = useState<SeverityFilter>('all')

  // Memoize counts - must be before conditional returns
  const counts = useMemo(() => {
    if (!data) return { all: 0, error: 0, warn: 0, info: 0 }
    const result = { all: 0, error: 0, warn: 0, info: 0 }
    for (const issue of data.vault.issues) {
      result.all++
      result[issue.severity]++
    }
    return result
  }, [data])

  // Memoize filtered and sorted issues
  const issues = useMemo(() => {
    if (!data) return []
    const severityWeight = { error: 3, warn: 2, info: 1 }
    return data.vault.issues
      .filter(issue => filter === 'all' || issue.severity === filter)
      .sort((a, b) => severityWeight[b.severity] - severityWeight[a.severity])
  }, [data, filter])

  const filePathToObjectMeta = useMemo(() => {
    if (!data) return new Map<string, IssueObjectMeta>()
    const map = new Map<string, IssueObjectMeta>()
    for (const obj of data.vault.objects) {
      map.set(obj.filePath, {
        relativePath: obj.relativePath,
        title: obj.title || (typeof obj.frontmatter['title'] === 'string' ? obj.frontmatter['title'] : undefined),
        type: obj.type,
      })
    }
    return map
  }, [data])

  if (loading) {
    return <div className="text-gray-500 dark:text-gray-400">Loading...</div>
  }

  if (error || !data) {
    return <div className="text-red-600 dark:text-red-400">Error loading issues</div>
  }

  return (
    <div className="px-4 sm:px-0">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Issues</h1>

      {/* Filter Tabs */}
      <div className="mb-6 border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex space-x-8">
          {(['all', 'error', 'warn', 'info'] as SeverityFilter[]).map((severity) => (
            <button
              key={severity}
              onClick={() => setFilter(severity)}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                filter === severity
                  ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              {severity.charAt(0).toUpperCase() + severity.slice(1)}
              <span className="ml-2 text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                {counts[severity]}
              </span>
            </button>
          ))}
        </nav>
      </div>

      {/* Issues List */}
      {issues.length === 0 ? (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-8 text-center">
          <div className="text-green-800 dark:text-green-300 font-semibold text-lg">✓ No issues found</div>
          <div className="text-green-600 dark:text-green-400 mt-2">
            {filter === 'all' ? 'Your vault is clean!' : `No ${filter} issues.`}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {issues.map((issue) => (
            <IssueCard
              key={`${issue.filePath}-${issue.message}`}
              issue={issue}
              objectMeta={filePathToObjectMeta.get(issue.filePath)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function IssueCard({ issue, objectMeta }: { issue: VaultIssue; objectMeta?: IssueObjectMeta }) {
  const getRelativePath = (filePath: string) => {
    const parts = filePath.split('/')
    return parts.slice(-3).join('/')
  }
  const displayPath = objectMeta?.relativePath ?? getRelativePath(issue.filePath)
  const displayTitle = objectMeta?.title || displayPath

  return (
    <div
      className={`bg-white dark:bg-gray-800 rounded-lg shadow-sm border-l-4 p-4 ${
        issue.severity === 'error'
          ? 'border-red-500'
          : issue.severity === 'warn'
          ? 'border-yellow-500'
          : 'border-blue-500'
      }`}
    >
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span
              className={`text-xs font-semibold uppercase px-2 py-1 rounded ${
                issue.severity === 'error'
                  ? 'bg-red-100 text-red-800'
                  : issue.severity === 'warn'
                  ? 'bg-yellow-100 text-yellow-800'
                  : 'bg-blue-100 text-blue-800'
              }`}
            >
              {issue.severity}
            </span>
            {objectMeta?.relativePath ? (
              <Link
                to={`/object/${encodeURIComponent(objectMeta.relativePath)}`}
                state={{ from: '/issues', label: 'Issues' }}
                className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-medium"
              >
                {displayTitle}
              </Link>
            ) : (
              <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">{displayTitle}</span>
            )}
            {objectMeta?.type && (
              <span className="text-[11px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                {objectMeta.type}
              </span>
            )}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{displayPath}</div>
          <div className="text-gray-800 dark:text-gray-200">{issue.message}</div>
        </div>
      </div>
    </div>
  )
}
