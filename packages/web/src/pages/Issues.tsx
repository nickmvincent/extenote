import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useVault } from '../hooks/useVault'
import type { VaultIssue } from '@extenote/core'

type SeverityFilter = 'all' | 'error' | 'warn' | 'info'

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

  if (loading) {
    return <div className="text-gray-500">Loading...</div>
  }

  if (error || !data) {
    return <div className="text-red-600">Error loading issues</div>
  }

  return (
    <div className="px-4 sm:px-0">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Issues</h1>

      {/* Filter Tabs */}
      <div className="mb-6 border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {(['all', 'error', 'warn', 'info'] as SeverityFilter[]).map((severity) => (
            <button
              key={severity}
              onClick={() => setFilter(severity)}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                filter === severity
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {severity.charAt(0).toUpperCase() + severity.slice(1)}
              <span className="ml-2 text-xs bg-gray-100 px-2 py-1 rounded">
                {counts[severity]}
              </span>
            </button>
          ))}
        </nav>
      </div>

      {/* Issues List */}
      {issues.length === 0 ? (
        <div className="bg-green-50 border border-green-200 rounded-lg p-8 text-center">
          <div className="text-green-800 font-semibold text-lg">✓ No issues found</div>
          <div className="text-green-600 mt-2">
            {filter === 'all' ? 'Your vault is clean!' : `No ${filter} issues.`}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {issues.map((issue) => (
            <IssueCard key={`${issue.filePath}-${issue.message}`} issue={issue} />
          ))}
        </div>
      )}
    </div>
  )
}

function IssueCard({ issue }: { issue: VaultIssue }) {
  const getRelativePath = (filePath: string) => {
    const parts = filePath.split('/')
    return parts.slice(-3).join('/')
  }

  return (
    <div
      className={`bg-white rounded-lg shadow-sm border-l-4 p-4 ${
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
            <Link
              to={`/object/${encodeURIComponent(issue.filePath.split('/').slice(-2).join('/'))}`}
              className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
            >
              {getRelativePath(issue.filePath)}
            </Link>
          </div>
          <div className="text-gray-800">{issue.message}</div>
        </div>
      </div>
    </div>
  )
}
