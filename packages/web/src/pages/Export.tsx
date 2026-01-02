import { useState, useMemo } from 'react'
import { useVault } from '../hooks/useVault'
import { API_ROUTES } from '../api/routes'

type ExportFormat = 'json' | 'markdown' | 'html' | 'atproto'

export function Export() {
  const { data, loading, error } = useVault()
  const [selectedProject, setSelectedProject] = useState<string>('')
  const [format, setFormat] = useState<ExportFormat>('json')
  const [outputDir, setOutputDir] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportResult, setExportResult] = useState<{ success: boolean; message: string } | null>(null)

  // Memoize projects list - must be before conditional returns
  const projects = useMemo(() => {
    if (!data) return []
    return [...new Set(
      data.vault.objects.map(obj => obj.project).filter(Boolean)
    )].sort()
  }, [data])

  if (loading) {
    return <div className="text-gray-500">Loading...</div>
  }

  if (error || !data) {
    return <div className="text-red-600">Error loading vault</div>
  }

  const handleExport = async () => {
    if (!selectedProject) {
      setExportResult({ success: false, message: 'Please select a project' })
      return
    }

    setExporting(true)
    setExportResult(null)

    try {
      const response = await fetch(API_ROUTES.EXPORT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: selectedProject,
          format,
          outputDir: outputDir || undefined
        })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Export failed')
      }

      setExportResult({
        success: true,
        message: `Exported ${result.count} objects to ${result.outputDir}`
      })
    } catch (err) {
      setExportResult({
        success: false,
        message: err instanceof Error ? err.message : 'Export failed'
      })
    } finally {
      setExporting(false)
    }
  }

  const getDefaultOutputDir = () => {
    if (!selectedProject) return ''
    return `dist/export/${selectedProject}/${format}`
  }

  return (
    <div className="px-4 sm:px-0">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Export Project</h1>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 max-w-2xl">
        <div className="space-y-6">
          {/* Project Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Project
            </label>
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="">Select a project...</option>
              {projects.map(project => (
                <option key={project} value={project}>{project}</option>
              ))}
            </select>
            {selectedProject && (
              <p className="mt-1 text-sm text-gray-500">
                {data.vault.objects.filter(obj => obj.project === selectedProject).length} objects
              </p>
            )}
          </div>

          {/* Format Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Export Format
            </label>
            <div className="grid grid-cols-2 gap-3">
              {(['json', 'markdown', 'html', 'atproto'] as ExportFormat[]).map(fmt => (
                <button
                  key={fmt}
                  onClick={() => setFormat(fmt)}
                  className={`px-4 py-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                    format === fmt
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {fmt.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Output Directory */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Output Directory (optional)
            </label>
            <input
              type="text"
              value={outputDir}
              onChange={(e) => setOutputDir(e.target.value)}
              placeholder={getDefaultOutputDir()}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              Leave blank to use default: {getDefaultOutputDir()}
            </p>
          </div>

          {/* Export Button */}
          <button
            onClick={handleExport}
            disabled={!selectedProject || exporting}
            className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${
              !selectedProject || exporting
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-indigo-600 text-white hover:bg-indigo-700'
            }`}
          >
            {exporting ? 'Exporting...' : 'Export Project'}
          </button>

          {/* Result Message */}
          {exportResult && (
            <div
              className={`p-4 rounded-lg ${
                exportResult.success
                  ? 'bg-green-50 border border-green-200'
                  : 'bg-red-50 border border-red-200'
              }`}
            >
              <p
                className={`text-sm ${
                  exportResult.success ? 'text-green-800' : 'text-red-800'
                }`}
              >
                {exportResult.success ? '✓ ' : '✗ '}
                {exportResult.message}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Command Preview */}
      {selectedProject && (
        <div className="mt-6 bg-gray-900 text-green-400 rounded-lg p-4 font-mono text-sm">
          <div className="text-gray-400 mb-1">Equivalent CLI command:</div>
          <code>
            bun run cli -- export-project {selectedProject} --format {format}
            {outputDir && ` --output ${outputDir}`}
          </code>
        </div>
      )}
    </div>
  )
}
