import { useState, useMemo } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useVault } from '../hooks/useVault'
import { getProjectObjects } from '../api/vault'
import { ObjectPreview } from '../components/ObjectPreview'

export function ProjectDetail() {
  const { project } = useParams<{ project: string }>()
  const navigate = useNavigate()
  const { data, loading, error } = useVault()
  const [filter, setFilter] = useState('')

  const targetProject = project ? decodeURIComponent(project) : ''

  const allObjects = useMemo(() => {
    if (!data) return []
    const objects = getProjectObjects(data.vault, targetProject)
    // Sort: project's own objects first, then included
    return [...objects].sort((a, b) => {
      const aIsIncluded = a.project !== targetProject
      const bIsIncluded = b.project !== targetProject
      if (aIsIncluded === bIsIncluded) return 0
      return aIsIncluded ? 1 : -1
    })
  }, [data, targetProject])

  const filteredObjects = useMemo(() => {
    if (!filter.trim()) return allObjects
    const q = filter.toLowerCase()
    return allObjects.filter(obj =>
      obj.title?.toLowerCase().includes(q) ||
      obj.id.toLowerCase().includes(q) ||
      obj.relativePath.toLowerCase().includes(q)
    )
  }, [allObjects, filter])

  // Count own vs included
  const includedCount = allObjects.filter(obj => obj.project !== targetProject).length
  const ownCount = allObjects.length - includedCount

  if (loading) {
    return <div className="text-gray-500 dark:text-gray-400">Loading...</div>
  }

  if (error || !data || !project) {
    return <div className="text-red-600 dark:text-red-400">Error loading project</div>
  }

  return (
    <div className="px-4 sm:px-0">
      <div className="mb-6">
        <Link to="/" className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 text-sm">
          ← Back to Dashboard
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            {targetProject}
          </h1>
          <div className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            {filteredObjects.length === allObjects.length
              ? `${allObjects.length} ${allObjects.length === 1 ? 'object' : 'objects'}`
              : `${filteredObjects.length} of ${allObjects.length} objects`}
            {includedCount > 0 && (
              <span className="ml-2 text-gray-400 dark:text-gray-500">
                ({ownCount} own · {includedCount} included)
              </span>
            )}
          </div>
        </div>
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by title or path..."
          className="w-full sm:w-64 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
        />
      </div>

      {filteredObjects.length === 0 ? (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-8 text-center text-gray-500 dark:text-gray-400">
          {allObjects.length === 0 ? 'No objects found in this project' : 'No matching objects'}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredObjects.map((obj, idx) => {
            const isIncluded = obj.project !== targetProject
            const prevObj = filteredObjects[idx - 1]
            const prevWasIncluded = prevObj ? prevObj.project !== targetProject : false
            const showSeparator = isIncluded && !prevWasIncluded && includedCount > 0 && ownCount > 0

            return (
              <div key={obj.id || obj.filePath}>
                {showSeparator && (
                  <div className="flex items-center gap-3 mb-4 mt-2">
                    <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                    <span className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide">Included from {obj.project}</span>
                    <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                  </div>
                )}
                <ObjectPreview
                  object={obj}
                  onClick={() => navigate(`/object/${encodeURIComponent(obj.relativePath)}`)}
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
