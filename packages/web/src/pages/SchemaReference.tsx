import { useState } from 'react'
import type { ExtenoteConfig, LoadedSchema } from '@extenote/core'
import { useVault } from '../hooks/useVault'

export function SchemaReference() {
  const { data, loading, error } = useVault()
  const [selectedProject, setSelectedProject] = useState<string>('all')

  if (loading) {
    return <div className="text-gray-500 dark:text-gray-400">Loading...</div>
  }

  if (error || !data) {
    return <div className="text-red-600 dark:text-red-400">Error loading schemas</div>
  }

  const projects = ['all', ...new Set(data.schemas.flatMap(s => s.projects || ['unknown']))]
  const filteredSchemas = selectedProject === 'all'
    ? data.schemas
    : data.schemas.filter(s => s.projects?.includes(selectedProject))

  return (
    <div className="px-4 sm:px-0">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Schema Reference</h1>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        Browse available schemas and their CLI commands. To create objects interactively, use the{' '}
        <a href="/create-form" className="text-indigo-600 dark:text-indigo-400 hover:underline">Create form</a>.
      </p>

      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Filter by Project
        </label>
        <select
          value={selectedProject}
          onChange={(e) => setSelectedProject(e.target.value)}
          className="block w-full max-w-xs px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 dark:text-white"
        >
          {projects.map(project => (
            <option key={project} value={project}>
              {project === 'all' ? 'All Projects' : project}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-6">
        {filteredSchemas.length === 0 ? (
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-8 text-center text-gray-500 dark:text-gray-400">
            No schemas found for this project
          </div>
        ) : (
          filteredSchemas.map(schema => (
            <SchemaCard key={schema.name} schema={schema} config={data.config} />
          ))
        )}
      </div>
    </div>
  )
}

function SchemaCard({ schema, config }: { schema: LoadedSchema; config: ExtenoteConfig }) {
  const [copied, setCopied] = useState(false)

  const projects = schema.projects || ['unknown']
  const defaultVisibility = config.defaultVisibility || 'private'
  const requiredFields = schema.required ?? []

  const generateCommand = (project: string) => {
    const projectFlag = projects.length > 1 ? ` --project ${project}` : ''
    const dir = schema.subdirectory || schema.name
    return `bun run cli -- create ${schema.name} <slug> --title "Your Title" --dir ${project}/${dir} --visibility ${defaultVisibility}${projectFlag}`
  }

  const copyCommand = (cmd: string) => {
    navigator.clipboard.writeText(cmd)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{schema.name}</h3>
          {schema.description && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{schema.description}</p>
          )}
        </div>
        <div className="flex gap-2 text-xs">
          {projects.map((project: string) => (
            <span key={project} className="px-2 py-1 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-300 rounded">
              {project}
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {projects.map((project: string) => (
          <div key={project} className="bg-gray-50 dark:bg-gray-900 rounded p-3">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
              Create command for {project}:
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-gray-900 dark:bg-gray-950 text-green-400 p-2 rounded overflow-x-auto">
                {generateCommand(project)}
              </code>
              <button
                onClick={() => copyCommand(generateCommand(project))}
                className="px-3 py-1 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700 transition-colors"
              >
                {copied ? '✓' : 'Copy'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {requiredFields.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Required Fields:</div>
          <div className="flex flex-wrap gap-2">
            {requiredFields.map((field) => (
              <span key={field} className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded">
                {field}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
