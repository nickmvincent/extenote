import { useState, useMemo } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useVault } from '../hooks/useVault'
import { ObjectPreview } from '../components/ObjectPreview'

export function TypeDetail() {
  const { type } = useParams<{ type: string }>()
  const navigate = useNavigate()
  const { data, loading, error } = useVault()
  const [filter, setFilter] = useState('')

  const decodedType = type ? decodeURIComponent(type) : ''

  const allObjects = useMemo(() => {
    if (!data) return []
    return data.vault.objects.filter(obj => obj.type === decodedType)
  }, [data, decodedType])

  const filteredObjects = useMemo(() => {
    if (!filter.trim()) return allObjects
    const q = filter.toLowerCase()
    return allObjects.filter(obj =>
      obj.title?.toLowerCase().includes(q) ||
      obj.id.toLowerCase().includes(q) ||
      obj.relativePath.toLowerCase().includes(q)
    )
  }, [allObjects, filter])

  if (loading) {
    return <div className="text-gray-500 dark:text-gray-400">Loading...</div>
  }

  if (error || !data || !type) {
    return <div className="text-red-600 dark:text-red-400">Error loading objects</div>
  }

  return (
    <div className="px-4 sm:px-0">
      <div className="mb-6">
        <Link to="/" className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 text-sm">
          ← Back to Dashboard
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            {decodedType}
          </h1>
          <div className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            {filteredObjects.length === allObjects.length
              ? `${allObjects.length} ${allObjects.length === 1 ? 'object' : 'objects'}`
              : `${filteredObjects.length} of ${allObjects.length} objects`}
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
          {allObjects.length === 0 ? 'No objects of this type' : 'No matching objects'}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredObjects.map((obj) => (
            <ObjectPreview
              key={obj.id || obj.filePath}
              object={obj}
              onClick={() => navigate(`/object/${encodeURIComponent(obj.relativePath)}`)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
