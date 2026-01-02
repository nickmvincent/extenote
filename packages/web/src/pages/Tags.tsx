import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import type { TagTree, TagNode, TagMutation, TagMutationPreview, TagMutationResult, TaxonomyValidationResult, TaxonomyViolation, Taxonomy, TagExplorerTree, TagExplorerNode, TagExplorerObject } from '@extenote/core'
import { LoadingSpinner } from '../components/LoadingSpinner'
import { API_ROUTES } from '../api/routes'

interface TagsData {
  tree: TagTree
  allTags: Array<{ tag: string; count: number }>
}

interface TagExplorerData {
  roots: TagExplorerNode[]
  totalTags: number
  totalTaggedObjects: number
}

type MutationType = 'rename' | 'delete' | 'merge'

export function Tags() {
  const [data, setData] = useState<TagsData | null>(null)
  const [explorerData, setExplorerData] = useState<TagExplorerData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  // Taxonomy validation state
  const [taxonomyResult, setTaxonomyResult] = useState<TaxonomyValidationResult | null>(null)
  const [taxonomyLoading, setTaxonomyLoading] = useState(false)
  const [taxonomyError, setTaxonomyError] = useState<string | null>(null)
  const [showTaxonomy, setShowTaxonomy] = useState(true)
  const [fixingViolation, setFixingViolation] = useState<string | null>(null)

  // Selection state
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [expandedRoots, setExpandedRoots] = useState<Set<string>>(new Set())

  // Mutation state
  const [mutationType, setMutationType] = useState<MutationType | null>(null)
  const [newTagName, setNewTagName] = useState('')
  const [mergeTarget, setMergeTarget] = useState('')
  const [preview, setPreview] = useState<TagMutationPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [applyResult, setApplyResult] = useState<TagMutationResult | null>(null)
  const [applying, setApplying] = useState(false)

  // Search/filter
  const [searchQuery, setSearchQuery] = useState('')

  const loadTags = async () => {
    setLoading(true)
    setError(null)
    try {
      const [tagsResponse, explorerResponse] = await Promise.all([
        fetch(API_ROUTES.TAGS),
        fetch(API_ROUTES.GRAPH_TAG_EXPLORER)
      ])
      if (!tagsResponse.ok) throw new Error('Failed to load tags')
      if (!explorerResponse.ok) throw new Error('Failed to load tag explorer')
      const tagsData = await tagsResponse.json()
      const explorerData = await explorerResponse.json()
      setData(tagsData)
      setExplorerData(explorerData)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load tags'))
    } finally {
      setLoading(false)
    }
  }

  const loadTaxonomy = async () => {
    setTaxonomyLoading(true)
    setTaxonomyError(null)
    try {
      const response = await fetch(API_ROUTES.TAGS_TAXONOMY)
      if (response.status === 404) {
        setTaxonomyError('No taxonomy file found')
        setTaxonomyResult(null)
        return
      }
      if (!response.ok) throw new Error('Failed to load taxonomy')
      const result = await response.json()
      setTaxonomyResult(result)
    } catch (err) {
      setTaxonomyError(err instanceof Error ? err.message : 'Failed to load taxonomy')
    } finally {
      setTaxonomyLoading(false)
    }
  }

  const fixViolation = async (violation: TaxonomyViolation, broadTag: string) => {
    const key = `${violation.relativePath}:${violation.specificTag}`
    setFixingViolation(key)
    try {
      const response = await fetch(API_ROUTES.TAGS_TAXONOMY_FIX, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ violation, broadTag }),
      })
      if (!response.ok) throw new Error('Failed to fix violation')
      // Reload taxonomy to see updated violations
      await loadTaxonomy()
      await loadTags()
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fix violation'))
    } finally {
      setFixingViolation(null)
    }
  }

  useEffect(() => {
    loadTags()
    loadTaxonomy()
  }, [])

  // Filter tags based on search
  const filteredRoots = useMemo(() => {
    if (!data || !searchQuery) return data?.tree.roots ?? []
    const query = searchQuery.toLowerCase()
    return data.tree.roots.filter(root => {
      if (root.name.toLowerCase().includes(query)) return true
      return root.children.some(child =>
        child.name.toLowerCase().includes(query) ||
        child.fullPath.toLowerCase().includes(query)
      )
    }).map(root => ({
      ...root,
      children: root.children.filter(child =>
        child.name.toLowerCase().includes(query) ||
        child.fullPath.toLowerCase().includes(query) ||
        root.name.toLowerCase().includes(query)
      )
    }))
  }, [data, searchQuery])

  const toggleExpand = (rootName: string) => {
    setExpandedRoots(prev => {
      const next = new Set(prev)
      if (next.has(rootName)) {
        next.delete(rootName)
      } else {
        next.add(rootName)
      }
      return next
    })
  }

  const selectTag = (tag: string) => {
    setSelectedTag(tag)
    setMutationType(null)
    setPreview(null)
    setApplyResult(null)
    setNewTagName('')
    setMergeTarget('')
  }

  const startMutation = (type: MutationType) => {
    setMutationType(type)
    setPreview(null)
    setApplyResult(null)
    if (type === 'rename' && selectedTag) {
      setNewTagName(selectedTag)
    }
  }

  const loadPreview = async () => {
    if (!selectedTag || !mutationType) return

    const mutation: TagMutation = {
      type: mutationType,
      oldTag: selectedTag,
      ...(mutationType === 'rename' && { newTag: newTagName }),
      ...(mutationType === 'merge' && { newTag: mergeTarget }),
    }

    setPreviewLoading(true)
    try {
      const response = await fetch(API_ROUTES.TAGS_PREVIEW, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mutation),
      })
      if (!response.ok) throw new Error('Failed to preview mutation')
      const previewData = await response.json()
      setPreview(previewData)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to preview'))
    } finally {
      setPreviewLoading(false)
    }
  }

  const applyMutation = async () => {
    if (!selectedTag || !mutationType) return

    const mutation: TagMutation = {
      type: mutationType,
      oldTag: selectedTag,
      ...(mutationType === 'rename' && { newTag: newTagName }),
      ...(mutationType === 'merge' && { newTag: mergeTarget }),
    }

    setApplying(true)
    try {
      const response = await fetch(API_ROUTES.TAGS_APPLY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mutation),
      })
      if (!response.ok) throw new Error('Failed to apply mutation')
      const result = await response.json()
      setApplyResult(result)

      // Reload tags after successful mutation
      if (result.success) {
        await loadTags()
        setSelectedTag(null)
        setMutationType(null)
        setPreview(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to apply'))
    } finally {
      setApplying(false)
    }
  }

  const cancelMutation = () => {
    setMutationType(null)
    setPreview(null)
    setApplyResult(null)
    setNewTagName('')
    setMergeTarget('')
  }

  // Get selected tag info
  const selectedTagInfo = useMemo(() => {
    if (!selectedTag || !data) return null
    const found = data.allTags.find(t => t.tag === selectedTag)
    return found ?? { tag: selectedTag, count: 0 }
  }, [selectedTag, data])

  // Other tags for merge dropdown
  const otherTags = useMemo(() => {
    if (!data || !selectedTag) return []
    return data.allTags.filter(t => t.tag !== selectedTag)
  }, [data, selectedTag])

  // Get objects for selected tag from explorer data
  const selectedTagObjects = useMemo(() => {
    if (!explorerData || !selectedTag) return []

    // Find the tag node in the explorer tree
    for (const root of explorerData.roots) {
      if (root.fullPath === selectedTag) {
        return root.objects
      }
      for (const child of root.children) {
        if (child.fullPath === selectedTag) {
          return child.objects
        }
      }
    }
    return []
  }, [explorerData, selectedTag])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" message="Loading tags..." />
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
        <h2 className="text-red-800 dark:text-red-400 font-semibold">Error</h2>
        <p className="text-red-600 dark:text-red-300 mt-2">{error.message}</p>
        <button
          onClick={loadTags}
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
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Tags</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          {data.tree.totalTags} tags across {data.tree.totalTaggedObjects} objects
        </p>
      </div>

      {/* Taxonomy Validation Section */}
      <div className="mb-6">
        <button
          onClick={() => setShowTaxonomy(!showTaxonomy)}
          className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
        >
          <span>{showTaxonomy ? '▾' : '▸'}</span>
          <span>Taxonomy Validation</span>
          {taxonomyResult && (
            <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
              taxonomyResult.violations.length === 0
                ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                : 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200'
            }`}>
              {taxonomyResult.violations.length === 0
                ? 'All valid'
                : `${taxonomyResult.violations.length} violations`}
            </span>
          )}
        </button>

        {showTaxonomy && (
          <div className="mt-3">
            {taxonomyLoading && (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <LoadingSpinner size="sm" />
                <span>Loading taxonomy...</span>
              </div>
            )}

            {taxonomyError && (
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {taxonomyError}
              </div>
            )}

            {taxonomyResult && taxonomyResult.violations.length === 0 && (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <p className="text-green-800 dark:text-green-200 text-sm">
                  All {taxonomyResult.validFiles} tagged files comply with the taxonomy.
                </p>
              </div>
            )}

            {taxonomyResult && taxonomyResult.violations.length > 0 && (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg overflow-hidden">
                <div className="p-4 border-b border-yellow-200 dark:border-yellow-800">
                  <h3 className="font-medium text-yellow-800 dark:text-yellow-200">
                    Taxonomy Violations ({taxonomyResult.violations.length})
                  </h3>
                  <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                    Files with specific tags missing their required broad tag
                  </p>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  <table className="min-w-full divide-y divide-yellow-200 dark:divide-yellow-800">
                    <thead className="bg-yellow-100 dark:bg-yellow-900/30">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-yellow-800 dark:text-yellow-300 uppercase">File</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-yellow-800 dark:text-yellow-300 uppercase">Specific Tag</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-yellow-800 dark:text-yellow-300 uppercase">Missing Broad Tag</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-yellow-800 dark:text-yellow-300 uppercase">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-yellow-200 dark:divide-yellow-700">
                      {taxonomyResult.violations.map((violation) => {
                        const key = `${violation.relativePath}:${violation.specificTag}`
                        const isFixing = fixingViolation === key
                        return (
                          <tr key={key}>
                            <td className="px-4 py-2">
                              <Link
                                to={`/object/${encodeURIComponent(violation.relativePath)}`}
                                className="text-indigo-600 dark:text-indigo-400 hover:underline text-sm"
                              >
                                {violation.title || violation.relativePath.split('/').pop()}
                              </Link>
                            </td>
                            <td className="px-4 py-2">
                              <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300">
                                {violation.specificTag}
                              </span>
                            </td>
                            <td className="px-4 py-2">
                              <div className="flex flex-wrap gap-1">
                                {violation.missingBroadTags.map((tag) => (
                                  <span
                                    key={tag}
                                    className="text-xs px-1.5 py-0.5 rounded bg-yellow-200 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-200"
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="px-4 py-2">
                              {violation.missingBroadTags.length === 1 ? (
                                <button
                                  onClick={() => fixViolation(violation, violation.missingBroadTags[0])}
                                  disabled={isFixing}
                                  className="text-xs px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
                                >
                                  {isFixing && <LoadingSpinner size="sm" />}
                                  {isFixing ? 'Fixing...' : 'Fix'}
                                </button>
                              ) : (
                                <select
                                  onChange={(e) => {
                                    if (e.target.value) {
                                      fixViolation(violation, e.target.value)
                                    }
                                  }}
                                  disabled={isFixing}
                                  className="text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
                                >
                                  <option value="">Add tag...</option>
                                  {violation.missingBroadTags.map((tag) => (
                                    <option key={tag} value={tag}>{tag}</option>
                                  ))}
                                </select>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tag Tree */}
        <div className="lg:col-span-1 bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <input
              type="text"
              placeholder="Filter tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
            />
          </div>
          <div className="max-h-[600px] overflow-y-auto">
            {filteredRoots.map((root) => (
              <div key={root.name}>
                <button
                  onClick={() => {
                    if (root.children.length > 0) {
                      toggleExpand(root.name)
                    } else {
                      selectTag(root.fullPath)
                    }
                  }}
                  className={`w-full flex items-center justify-between px-4 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700 ${
                    selectedTag === root.fullPath ? 'bg-indigo-50 dark:bg-indigo-900/30' : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {root.children.length > 0 && (
                      <span className="text-gray-400 w-4">
                        {expandedRoots.has(root.name) ? '▾' : '▸'}
                      </span>
                    )}
                    {root.children.length === 0 && <span className="w-4" />}
                    <span className="font-medium text-gray-900 dark:text-white">
                      {root.name}
                    </span>
                  </div>
                  <span className="text-sm text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-600 px-2 py-0.5 rounded-full">
                    {root.count}
                  </span>
                </button>
                {expandedRoots.has(root.name) && root.children.length > 0 && (
                  <div className="ml-6 border-l border-gray-200 dark:border-gray-700">
                    {root.children.map((child) => (
                      <button
                        key={child.fullPath}
                        onClick={() => selectTag(child.fullPath)}
                        className={`w-full flex items-center justify-between px-4 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700 ${
                          selectedTag === child.fullPath ? 'bg-indigo-50 dark:bg-indigo-900/30' : ''
                        }`}
                      >
                        <span className="text-gray-700 dark:text-gray-300">{child.name}</span>
                        <span className="text-sm text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-600 px-2 py-0.5 rounded-full">
                          {child.count}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Tag Details & Actions */}
        <div className="lg:col-span-2">
          {!selectedTag ? (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
              <p className="text-gray-500 dark:text-gray-400">
                Select a tag from the tree to view details and manage it
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Tag Info Card */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                      {selectedTag}
                    </h2>
                    <p className="text-gray-500 dark:text-gray-400 mt-1">
                      {selectedTagInfo?.count} object{selectedTagInfo?.count !== 1 ? 's' : ''}
                    </p>
                  </div>
                  {!mutationType && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => startMutation('rename')}
                        className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700"
                      >
                        Rename
                      </button>
                      <button
                        onClick={() => startMutation('merge')}
                        className="px-3 py-1.5 text-sm bg-yellow-600 text-white rounded hover:bg-yellow-700"
                      >
                        Merge
                      </button>
                      <button
                        onClick={() => startMutation('delete')}
                        className="px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>

                {/* Objects with this tag */}
                {selectedTagObjects.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Objects ({selectedTagObjects.length})
                    </h3>
                    <div className="max-h-64 overflow-y-auto space-y-1">
                      {selectedTagObjects.map((obj) => (
                        <Link
                          key={obj.relativePath}
                          to={`/object/${encodeURIComponent(obj.relativePath)}`}
                          className="block px-2 py-1.5 rounded hover:bg-gray-50 dark:hover:bg-gray-700 text-sm"
                        >
                          <span className="text-indigo-600 dark:text-indigo-400 hover:underline">
                            {obj.title}
                          </span>
                          <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
                            {obj.type}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Mutation Form */}
              {mutationType && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                    {mutationType === 'rename' && 'Rename Tag'}
                    {mutationType === 'merge' && 'Merge Tag Into Another'}
                    {mutationType === 'delete' && 'Delete Tag'}
                  </h3>

                  {mutationType === 'rename' && (
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        New tag name
                      </label>
                      <input
                        type="text"
                        value={newTagName}
                        onChange={(e) => setNewTagName(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        placeholder="Enter new tag name"
                      />
                    </div>
                  )}

                  {mutationType === 'merge' && (
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Merge into
                      </label>
                      <select
                        value={mergeTarget}
                        onChange={(e) => setMergeTarget(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        <option value="">Select target tag...</option>
                        {otherTags.map((t) => (
                          <option key={t.tag} value={t.tag}>
                            {t.tag} ({t.count})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {mutationType === 'delete' && (
                    <p className="mb-4 text-gray-600 dark:text-gray-400">
                      This will remove the tag "{selectedTag}" from all {selectedTagInfo?.count} objects.
                    </p>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={loadPreview}
                      disabled={
                        previewLoading ||
                        (mutationType === 'rename' && !newTagName) ||
                        (mutationType === 'merge' && !mergeTarget)
                      }
                      className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
                    >
                      {previewLoading && <LoadingSpinner size="sm" />}
                      {previewLoading ? 'Loading preview...' : 'Preview Changes'}
                    </button>
                    <button
                      onClick={cancelMutation}
                      className="px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded hover:bg-gray-300 dark:hover:bg-gray-500"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Preview */}
              {preview && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                    Preview: {preview.affectedFiles.length} file{preview.affectedFiles.length !== 1 ? 's' : ''} will be modified
                  </h3>

                  <div className="max-h-64 overflow-y-auto mb-4">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">File</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Current Tags</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">New Tags</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {preview.affectedFiles.map((file) => (
                          <tr key={file.relativePath}>
                            <td className="px-4 py-2">
                              <Link
                                to={`/object/${encodeURIComponent(file.relativePath)}`}
                                className="text-indigo-600 dark:text-indigo-400 hover:underline text-sm"
                              >
                                {file.title || file.relativePath}
                              </Link>
                            </td>
                            <td className="px-4 py-2">
                              <div className="flex flex-wrap gap-1">
                                {file.currentTags.map((tag) => (
                                  <span
                                    key={tag}
                                    className={`text-xs px-1.5 py-0.5 rounded ${
                                      tag === selectedTag
                                        ? 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 line-through'
                                        : 'bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300'
                                    }`}
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="px-4 py-2">
                              <div className="flex flex-wrap gap-1">
                                {file.newTags.map((tag) => (
                                  <span
                                    key={tag}
                                    className={`text-xs px-1.5 py-0.5 rounded ${
                                      !file.currentTags.includes(tag)
                                        ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                                        : 'bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300'
                                    }`}
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={applyMutation}
                      disabled={applying || preview.affectedFiles.length === 0}
                      className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                    >
                      {applying && <LoadingSpinner size="sm" />}
                      {applying ? 'Applying changes...' : 'Apply Changes'}
                    </button>
                    <button
                      onClick={cancelMutation}
                      className="px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded hover:bg-gray-300 dark:hover:bg-gray-500"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Result */}
              {applyResult && (
                <div className={`rounded-lg shadow p-6 ${
                  applyResult.success
                    ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                    : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                }`}>
                  <h3 className={`text-lg font-medium ${
                    applyResult.success ? 'text-green-800 dark:text-green-400' : 'text-red-800 dark:text-red-400'
                  }`}>
                    {applyResult.success ? 'Success!' : 'Some errors occurred'}
                  </h3>
                  <p className={applyResult.success ? 'text-green-600 dark:text-green-300' : 'text-red-600 dark:text-red-300'}>
                    Modified {applyResult.filesModified} file{applyResult.filesModified !== 1 ? 's' : ''}
                  </p>
                  {applyResult.errors.length > 0 && (
                    <ul className="mt-2 text-sm text-red-600 dark:text-red-300">
                      {applyResult.errors.map((err, i) => (
                        <li key={i}>{err.filePath}: {err.error}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
