import { useState, useEffect } from 'react'
import { useParams, Link, useLocation } from 'react-router-dom'
import { useVault } from '../hooks/useVault'
import { useRecentItems } from '../hooks/useRecentItems'
import { getObjectIssues, loadCrossRefs, type CrossRefs } from '../api/vault'
import { MarkdownPreview } from '../components/MarkdownPreview'

export function ObjectDetail() {
  const { path } = useParams<{ path: string }>()
  const location = useLocation()
  const { data, loading, error } = useVault()
  const { addItem } = useRecentItems()
  const [viewMode, setViewMode] = useState<'preview' | 'source'>('preview')
  const [crossRefs, setCrossRefs] = useState<CrossRefs | null>(null)
  const [crossRefsLoading, setCrossRefsLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [editorOpening, setEditorOpening] = useState(false)

  const decodedPath = path ? decodeURIComponent(path) : ''

  // Find the object first (needed for hooks)
  const object = data?.vault.objects.find(obj => obj.relativePath === decodedPath)

  // Load cross-refs
  useEffect(() => {
    if (!decodedPath) return

    setCrossRefsLoading(true)
    loadCrossRefs(decodedPath)
      .then(setCrossRefs)
      .catch((err) => console.error('Failed to load cross-refs:', err))
      .finally(() => setCrossRefsLoading(false))
  }, [decodedPath])

  // Track this item as recently viewed
  useEffect(() => {
    if (object) {
      addItem({
        path: object.relativePath,
        title: String(object.title || object.frontmatter.title || object.id || 'Untitled'),
        type: object.type,
      })
    }
  }, [object?.relativePath, object?.title, object?.frontmatter?.title, object?.id, object?.type, addItem])

  if (loading) {
    return <div className="text-gray-500 dark:text-gray-400">Loading...</div>
  }

  if (error || !data || !path) {
    return <div className="text-red-600 dark:text-red-400">Error loading object</div>
  }

  if (!object) {
    return <div className="text-red-600 dark:text-red-400">Object not found: {decodedPath}</div>
  }

  const issues = getObjectIssues(data.vault, object.filePath)
  const state = (location.state && typeof location.state === 'object') ? location.state as { from?: string; label?: string } : null
  const project = object.project || object.relativePath.split(/[\\/]/)[0]
  const backTo = state?.from || `/project/${encodeURIComponent(project)}`
  const backLabel = state?.label || project

  // Word count
  const wordCount = object.body ? object.body.trim().split(/\s+/).filter(Boolean).length : 0

  // Copy citation for bibtex entries
  const copyCitation = () => {
    const fm = object.frontmatter
    const authors = Array.isArray(fm.authors) ? fm.authors.join(', ') : fm.authors || fm.author || ''
    const title = fm.title || object.title || ''
    const year = fm.year || ''
    const venue = fm.venue || fm.journal || fm.booktitle || ''
    const citation = `${authors}. "${title}." ${venue}${venue && year ? ', ' : ''}${year}.`
    navigator.clipboard.writeText(citation)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Open in editor
  const openInEditor = async () => {
    setEditorOpening(true)
    try {
      const res = await fetch('/api/open-in-editor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: object.relativePath }),
      })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Failed to open in editor')
      }
    } catch (err) {
      alert('Failed to open in editor')
    } finally {
      setEditorOpening(false)
    }
  }

  return (
    <div className="px-4 sm:px-0">
      <div className="mb-6">
        <Link to={backTo} className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 text-sm">
          ← Back to {backLabel}
        </Link>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          {String(object.title || object.frontmatter.title || object.id || 'Untitled')}
        </h1>

        <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500 dark:text-gray-400 mb-6">
          <span>{object.relativePath}</span>
          <span className="text-gray-300 dark:text-gray-600">|</span>
          <button
            onClick={openInEditor}
            disabled={editorOpening}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors disabled:opacity-50"
            title="Open in $EDITOR"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            {editorOpening ? 'Opening...' : 'Edit'}
          </button>
          {object.type === 'bibtex_entry' && (
            <button
              onClick={copyCitation}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
              title="Copy citation"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              {copied ? 'Copied!' : 'Copy Citation'}
            </button>
          )}
        </div>

        {/* Metadata */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6 p-4 bg-gray-50 dark:bg-gray-700/50 rounded">
          <div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Type</div>
            <div className="font-medium text-gray-900 dark:text-white">{object.type}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Visibility</div>
            <div className="font-medium text-gray-900 dark:text-white">{object.visibility}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Schema</div>
            <div className="font-medium text-gray-900 dark:text-white">{object.schema?.name || 'None'}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 dark:text-gray-400">ID</div>
            <div className="font-medium text-gray-900 dark:text-white">{object.id || 'N/A'}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Words</div>
            <div className="font-medium text-gray-900 dark:text-white">{wordCount.toLocaleString()}</div>
          </div>
        </div>

        {/* Issues */}
        {issues.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Issues</h2>
            <div className="space-y-2">
              {issues.map((issue, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded border ${
                    issue.severity === 'error'
                      ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                      : issue.severity === 'warn'
                      ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                      : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span
                      className={`text-xs font-semibold uppercase ${
                        issue.severity === 'error'
                          ? 'text-red-700 dark:text-red-400'
                          : issue.severity === 'warn'
                          ? 'text-yellow-700 dark:text-yellow-400'
                          : 'text-blue-700 dark:text-blue-400'
                      }`}
                    >
                      {issue.severity}
                    </span>
                    <span className="text-sm text-gray-700 dark:text-gray-300">{issue.message}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Frontmatter */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Frontmatter</h2>
          <pre className="bg-gray-900 text-gray-100 p-4 rounded overflow-x-auto text-sm">
            {JSON.stringify(object.frontmatter, null, 2)}
          </pre>
        </div>

        {/* Cross-References */}
        {(crossRefsLoading || crossRefs) && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Cross-References</h2>
            {crossRefsLoading ? (
              <div className="text-gray-500 dark:text-gray-400">Loading cross-references...</div>
            ) : crossRefs && (
              <div className="grid md:grid-cols-2 gap-4">
                {/* Outgoing Links */}
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded p-4 border border-gray-200 dark:border-gray-600">
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Outgoing Links ({crossRefs.outgoingLinks.length})
                  </h3>
                  {crossRefs.outgoingLinks.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400 italic">No outgoing links</p>
                  ) : (
                    <ul className="space-y-2">
                      {crossRefs.outgoingLinks.map((link, idx) => (
                        <li key={idx} className="text-sm">
                          <span className={`inline-block px-1.5 py-0.5 text-xs rounded mr-2 ${
                            link.linkType === 'citation'
                              ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                              : 'bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300'
                          }`}>
                            {link.linkType === 'citation' ? '@' : '[['}
                          </span>
                          {link.resolved ? (
                            <Link
                              to={`/object/${encodeURIComponent(link.resolved.path)}`}
                              className="text-indigo-600 dark:text-indigo-400 hover:underline"
                            >
                              {link.displayText || link.resolved.title || link.targetId}
                            </Link>
                          ) : (
                            <span className="text-red-500 dark:text-red-400">
                              {link.displayText || link.targetId} <span className="text-xs">(broken)</span>
                            </span>
                          )}
                          {link.context && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 ml-7 truncate">
                              {link.context}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Backlinks */}
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded p-4 border border-gray-200 dark:border-gray-600">
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Backlinks ({crossRefs.backlinks.length})
                    {crossRefs.backlinks.some(b => b.linkType === 'citation') && (
                      <span className="text-xs font-normal text-gray-500 dark:text-gray-400 ml-2">
                        includes citations
                      </span>
                    )}
                  </h3>
                  {crossRefs.backlinks.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400 italic">No backlinks</p>
                  ) : (
                    <ul className="space-y-2">
                      {crossRefs.backlinks.map((backlink, idx) => (
                        <li key={idx} className="text-sm">
                          <span className={`inline-block px-1.5 py-0.5 text-xs rounded mr-2 ${
                            backlink.linkType === 'citation'
                              ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                              : 'bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300'
                          }`}>
                            {backlink.linkType === 'citation' ? 'cites' : 'links'}
                          </span>
                          <Link
                            to={`/object/${encodeURIComponent(backlink.sourcePath)}`}
                            className="text-indigo-600 dark:text-indigo-400 hover:underline"
                          >
                            {backlink.sourceTitle || backlink.sourceId}
                          </Link>
                          {backlink.context && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 ml-12 truncate">
                              {backlink.context}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Body */}
        {object.body && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Body</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setViewMode('preview')}
                  className={`px-3 py-1 text-sm rounded-md transition-colors ${
                    viewMode === 'preview'
                      ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  Preview
                </button>
                <button
                  onClick={() => setViewMode('source')}
                  className={`px-3 py-1 text-sm rounded-md transition-colors ${
                    viewMode === 'source'
                      ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  Source
                </button>
              </div>
            </div>
            {viewMode === 'preview' ? (
              <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded border border-gray-200 dark:border-gray-600">
                <MarkdownPreview content={object.body} />
              </div>
            ) : (
              <pre className="bg-gray-900 text-gray-100 p-4 rounded overflow-x-auto text-sm whitespace-pre-wrap">
                {object.body}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
