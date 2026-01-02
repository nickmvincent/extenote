import { memo, useMemo } from 'react'
import type { VaultObject } from '@extenote/core'

interface ObjectPreviewProps {
  object: VaultObject
  onClick?: () => void
}

export const ObjectPreview = memo(function ObjectPreview({ object, onClick }: ObjectPreviewProps) {
  // Memoize body split to avoid computing twice
  const { previewLines, hasMore } = useMemo(() => {
    const lines = object.body?.split('\n') || []
    return {
      previewLines: lines.slice(0, 3),
      hasMore: lines.length > 3
    }
  }, [object.body])

  return (
    <div
      onClick={onClick}
      className={`bg-white p-4 rounded-lg shadow-sm border border-gray-200 ${
        onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''
      }`}
    >
      <div className="flex justify-between items-start mb-2">
        <h3 className="text-lg font-medium text-gray-900">
          {String(object.title || object.frontmatter.title || object.id || 'Untitled')}
        </h3>
        <span className="text-xs px-2 py-1 bg-gray-100 rounded">
          {object.type}
        </span>
      </div>

      <div className="text-sm text-gray-500 mb-2">
        {object.relativePath}
      </div>

      {previewLines.length > 0 && (
        <div className="mt-2 text-sm text-gray-700 font-mono bg-gray-50 p-2 rounded">
          {previewLines.map((line, i) => (
            <div key={i} className="truncate">{line || '\u00A0'}</div>
          ))}
          {hasMore && <div className="text-gray-400 mt-1">...</div>}
        </div>
      )}

      <div className="mt-2 flex gap-2 text-xs">
        <span className="text-gray-500">Visibility: {object.visibility}</span>
        {object.schema && (
          <span className="text-gray-500">Schema: {object.schema.name}</span>
        )}
      </div>
    </div>
  )
})
