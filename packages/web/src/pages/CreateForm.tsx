import { useState, useMemo } from 'react'
import { useVault } from '../hooks/useVault'
import type { LoadedSchema } from '@extenote/core'
import { API_ROUTES } from '../api/routes'

interface ValidationErrors {
  schema?: string
  project?: string
  slug?: string
}

export function CreateForm() {
  const { data, loading, error } = useVault()
  const [selectedSchema, setSelectedSchema] = useState<LoadedSchema | null>(null)
  const [project, setProject] = useState('')
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [visibility, setVisibility] = useState('private')
  const [dir, setDir] = useState('')
  const [creating, setCreating] = useState(false)
  const [createResult, setCreateResult] = useState<{ success: boolean; message: string } | null>(null)
  const [touched, setTouched] = useState<Record<string, boolean>>({})

  // Real-time validation
  const validationErrors = useMemo<ValidationErrors>(() => {
    const errors: ValidationErrors = {}

    if (!selectedSchema && touched.schema) {
      errors.schema = 'Schema is required'
    }

    if (selectedSchema?.projects && selectedSchema.projects.length > 1 && !project && touched.project) {
      errors.project = 'Project is required when schema has multiple projects'
    }

    if (touched.slug) {
      if (!slug) {
        errors.slug = 'Slug is required'
      } else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
        errors.slug = 'Slug must be lowercase letters, numbers, and hyphens (e.g., my-object-name)'
      } else if (slug.length < 3) {
        errors.slug = 'Slug must be at least 3 characters'
      }
    }

    return errors
  }, [selectedSchema, project, slug, touched])

  const isValid = selectedSchema && slug && !validationErrors.slug && (
    !selectedSchema.projects || selectedSchema.projects.length <= 1 || project
  )

  if (loading) {
    return <div className="text-gray-500 dark:text-gray-400">Loading...</div>
  }

  if (error || !data) {
    return <div className="text-red-600 dark:text-red-400">Error loading schemas</div>
  }

  const handleSchemaSelect = (schemaName: string) => {
    const schema = data.schemas.find(s => s.name === schemaName)
    setSelectedSchema(schema || null)
    setTouched(prev => ({ ...prev, schema: true }))
    if (schema?.projects?.length === 1) {
      setProject(schema.projects[0])
    } else {
      setProject('')
    }
  }

  const handleBlur = (field: string) => {
    setTouched(prev => ({ ...prev, [field]: true }))
  }

  const handleCreate = async () => {
    if (!selectedSchema || !slug) {
      setCreateResult({ success: false, message: 'Schema and slug are required' })
      return
    }

    setCreating(true)
    setCreateResult(null)

    try {
      const response = await fetch(API_ROUTES.CREATE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schema: selectedSchema.name,
          slug,
          title: title || undefined,
          visibility: visibility || undefined,
          dir: dir || undefined,
          project: project || undefined
        })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Create failed')
      }

      setCreateResult({
        success: true,
        message: `Created ${result.filePath}`
      })

      // Reset form
      setTitle('')
      setSlug('')
      setDir('')
    } catch (err) {
      setCreateResult({
        success: false,
        message: err instanceof Error ? err.message : 'Create failed'
      })
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="px-4 sm:px-0">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Create New Object</h1>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        Fill in the form below to create a new object. Need CLI commands instead? See the{' '}
        <a href="/schemas" className="text-indigo-600 dark:text-indigo-400 hover:underline">Schema Reference</a>.
      </p>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 max-w-2xl">
        <div className="space-y-6">
          {/* Schema Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Schema *
            </label>
            <select
              value={selectedSchema?.name || ''}
              onChange={(e) => handleSchemaSelect(e.target.value)}
              onBlur={() => handleBlur('schema')}
              className={`block w-full px-3 py-2 bg-white dark:bg-gray-700 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white ${
                validationErrors.schema
                  ? 'border-red-300 dark:border-red-600'
                  : 'border-gray-300 dark:border-gray-600'
              }`}
            >
              <option value="">Select a schema...</option>
              {data.schemas.map(schema => (
                <option key={schema.name} value={schema.name}>
                  {schema.name}
                  {schema.description && ` - ${schema.description}`}
                </option>
              ))}
            </select>
            {validationErrors.schema && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{validationErrors.schema}</p>
            )}
          </div>

          {/* Project Selection (if schema has multiple projects) */}
          {selectedSchema && selectedSchema.projects && selectedSchema.projects.length > 1 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Project *
              </label>
              <select
                value={project}
                onChange={(e) => setProject(e.target.value)}
                onBlur={() => handleBlur('project')}
                className={`block w-full px-3 py-2 bg-white dark:bg-gray-700 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white ${
                  validationErrors.project
                    ? 'border-red-300 dark:border-red-600'
                    : 'border-gray-300 dark:border-gray-600'
                }`}
              >
                <option value="">Select a project...</option>
                {selectedSchema.projects.map(proj => (
                  <option key={proj} value={proj}>{proj}</option>
                ))}
              </select>
              {validationErrors.project && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{validationErrors.project}</p>
              )}
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter title..."
              className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white dark:placeholder-gray-400"
            />
          </div>

          {/* Slug */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Slug (filename) *
            </label>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
              onBlur={() => handleBlur('slug')}
              placeholder="my-object-name"
              className={`block w-full px-3 py-2 border bg-white dark:bg-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white dark:placeholder-gray-400 ${
                validationErrors.slug
                  ? 'border-red-300 dark:border-red-600'
                  : 'border-gray-300 dark:border-gray-600'
              }`}
            />
            {validationErrors.slug ? (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{validationErrors.slug}</p>
            ) : (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Will become: {slug || 'my-object-name'}.md
              </p>
            )}
          </div>

          {/* Visibility */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Visibility
            </label>
            <div className="flex gap-3">
              {['public', 'private', 'unlisted'].map(vis => (
                <button
                  key={vis}
                  type="button"
                  onClick={() => setVisibility(vis)}
                  className={`px-4 py-2 rounded-lg border-2 text-sm font-medium transition-colors ${
                    visibility === vis
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                      : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-500'
                  }`}
                >
                  {vis}
                </button>
              ))}
            </div>
          </div>

          {/* Directory Override */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Directory Override (optional)
            </label>
            <input
              type="text"
              value={dir}
              onChange={(e) => setDir(e.target.value)}
              placeholder="Leave blank for default"
              className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white dark:placeholder-gray-400"
            />
          </div>

          {/* Create Button */}
          <button
            onClick={handleCreate}
            disabled={!isValid || creating}
            className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${
              !isValid || creating
                ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                : 'bg-indigo-600 text-white hover:bg-indigo-700'
            }`}
          >
            {creating ? 'Creating...' : 'Create Object'}
          </button>

          {/* Result Message */}
          {createResult && (
            <div
              className={`p-4 rounded-lg ${
                createResult.success
                  ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                  : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
              }`}
            >
              <p
                className={`text-sm ${
                  createResult.success ? 'text-green-800 dark:text-green-400' : 'text-red-800 dark:text-red-400'
                }`}
              >
                {createResult.success ? '✓ ' : '✗ '}
                {createResult.message}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Command Preview */}
      {selectedSchema && slug && !validationErrors.slug && (
        <div className="mt-6 bg-gray-900 text-green-400 rounded-lg p-4 font-mono text-sm">
          <div className="text-gray-400 mb-1">Equivalent CLI command:</div>
          <code>
            bun run cli -- create {selectedSchema.name} {slug}
            {title && ` --title "${title}"`}
            {visibility && ` --visibility ${visibility}`}
            {dir && ` --dir ${dir}`}
            {project && ` --project ${project}`}
          </code>
        </div>
      )}
    </div>
  )
}
