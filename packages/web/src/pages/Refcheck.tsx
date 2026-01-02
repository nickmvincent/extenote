import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import type { CheckReport, CheckResult, FieldCheck } from '@extenote/core'
import { LoadingSpinner } from '../components/LoadingSpinner'
import { API_ROUTES } from '../api/routes'

interface CheckStats {
  total: number
  checked: number
  unchecked: number
  confirmed: number
  mismatch: number
  notFound: number
  error: number
}

interface ProvidersResponse {
  providers: string[]
}

export function Refcheck() {
  const [stats, setStats] = useState<CheckStats | null>(null)
  const [providers, setProviders] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  // Check form state
  const [selectedProject, setSelectedProject] = useState<string>('')
  const [selectedProvider, setSelectedProvider] = useState<string>('auto')
  const [limit, setLimit] = useState<number>(10)
  const [dryRun, setDryRun] = useState<boolean>(true)
  const [force, setForce] = useState<boolean>(false)
  const [filter, setFilter] = useState<string>('')

  // Check results
  const [checking, setChecking] = useState<boolean>(false)
  const [report, setReport] = useState<CheckReport | null>(null)

  // Projects list (extracted from stats or could be loaded separately)
  const [projects, setProjects] = useState<string[]>([])

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      // Load stats and providers in parallel
      const [statsRes, providersRes, vaultRes] = await Promise.all([
        fetch(API_ROUTES.REFCHECK_STATS),
        fetch(API_ROUTES.REFCHECK_PROVIDERS),
        fetch(API_ROUTES.VAULT),
      ])

      if (!statsRes.ok) throw new Error('Failed to load check stats')
      if (!providersRes.ok) throw new Error('Failed to load providers')
      if (!vaultRes.ok) throw new Error('Failed to load vault')

      const statsData = await statsRes.json() as CheckStats
      const providersData = await providersRes.json() as ProvidersResponse
      const vaultData = await vaultRes.json() as { config: { projectProfiles?: Array<{ name: string }> } }

      setStats(statsData)
      setProviders(providersData.providers)

      // Extract project names
      const projectNames = vaultData.config.projectProfiles?.map(p => p.name) ?? []
      setProjects(projectNames)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load data'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const runCheck = async () => {
    setChecking(true)
    setError(null)
    setReport(null)

    try {
      const response = await fetch(API_ROUTES.REFCHECK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: selectedProject || undefined,
          provider: selectedProvider,
          limit: limit || undefined,
          filter: filter || undefined,
          dryRun,
          force,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json() as { error?: string }
        throw new Error(errorData.error || 'Check failed')
      }

      const reportData = await response.json() as CheckReport
      setReport(reportData)

      // Reload stats after check
      if (!dryRun) {
        const statsRes = await fetch(API_ROUTES.REFCHECK_STATS)
        if (statsRes.ok) {
          const statsData = await statsRes.json() as CheckStats
          setStats(statsData)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Check failed'))
    } finally {
      setChecking(false)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'confirmed':
        return <span className="text-green-500">&#10004;</span>
      case 'mismatch':
        return <span className="text-yellow-500">&#9888;</span>
      case 'not_found':
        return <span className="text-red-500">&#10008;</span>
      case 'error':
        return <span className="text-red-500">&#10008;</span>
      case 'skipped':
        return <span className="text-gray-400">&#8709;</span>
      default:
        return null
    }
  }

  const getStatusClass = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
      case 'mismatch':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
      case 'not_found':
      case 'error':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
      case 'skipped':
        return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
    }
  }

  const renderFieldCheck = (check: FieldCheck) => {
    const matchClass = check.match
      ? 'text-green-600 dark:text-green-400'
      : 'text-red-600 dark:text-red-400'

    // Special handling for authors field
    if (check.field === 'authors') {
      const localCount = check.local?.split(';').length ?? 0
      const remoteCount = check.remote?.split(';').length ?? 0
      const mismatchedAuthors = check.authorDetails?.filter(d => !d.firstMatch || !d.lastMatch) ?? []

      return (
        <div key={check.field} className="text-sm py-1 border-t border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <span className={`font-medium ${matchClass}`}>
              {check.match ? '✓' : '✗'} {check.field}
            </span>
            {check.match && check.authorDetails && (
              <span className="text-xs text-gray-500">({check.authorDetails.length} authors match)</span>
            )}
            {!check.match && check.authorCountMatch === false && (
              <span className="text-xs text-gray-500">(count: {localCount} local vs {remoteCount} remote)</span>
            )}
            {!check.match && check.authorCountMatch !== false && mismatchedAuthors.length > 0 && (
              <span className="text-xs text-gray-500">({mismatchedAuthors.length}/{localCount} authors differ)</span>
            )}
          </div>
          {!check.match && check.authorDetails && check.authorDetails.length > 0 && (
            <div className="ml-4 text-xs text-gray-500 dark:text-gray-400 space-y-1 mt-1">
              {check.authorDetails.map((detail) => {
                if (!detail.firstMatch || !detail.lastMatch) {
                  const issues = []
                  if (!detail.firstMatch) issues.push('first')
                  if (!detail.lastMatch) issues.push('last')
                  return (
                    <div key={detail.index} className="border-l-2 border-yellow-400 pl-2">
                      <div className="text-yellow-600 dark:text-yellow-400">
                        [{detail.index}] {issues.join('+')} name differs
                      </div>
                      <div>Local: {detail.localName || '(empty)'}</div>
                      <div>Remote: {detail.remoteName || '(empty)'}</div>
                    </div>
                  )
                }
                return null
              })}
            </div>
          )}
          {!check.match && (!check.authorDetails || check.authorDetails.length === 0) && (
            <div className="ml-4 text-xs text-gray-500 dark:text-gray-400">
              <div>Local: {check.local || '(empty)'}</div>
              <div>Remote: {check.remote || '(empty)'}</div>
            </div>
          )}
        </div>
      )
    }

    return (
      <div key={check.field} className="text-sm py-1 border-t border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <span className={`font-medium ${matchClass}`}>
            {check.match ? '✓' : '✗'} {check.field}
          </span>
          {!check.match && check.charDiff !== undefined && (
            <span className="text-xs text-gray-500">({check.charDiff} chars diff)</span>
          )}
          {!check.match && check.yearDiff !== undefined && (
            <span className="text-xs text-gray-500">({check.yearDiff > 0 ? '+' : ''}{check.yearDiff} years)</span>
          )}
        </div>
        {!check.match && (
          <div className="ml-4 text-xs text-gray-500 dark:text-gray-400">
            <div>Local: {check.local || '(empty)'}</div>
            <div>Remote: {check.remote || '(empty)'}</div>
          </div>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" message="Loading check data..." />
      </div>
    )
  }

  if (error && !report) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
        <h2 className="text-red-800 dark:text-red-400 font-semibold">Error</h2>
        <p className="text-red-600 dark:text-red-300 mt-2">{error.message}</p>
        <button
          onClick={loadData}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="px-4 sm:px-0">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Reference Check</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Verify bibliographic references against DBLP, Crossref, Semantic Scholar, and OpenAlex
        </p>
        <details className="mt-3 text-sm text-gray-600 dark:text-gray-400">
          <summary className="cursor-pointer hover:text-gray-900 dark:hover:text-gray-200 font-medium">
            About checking methods
          </summary>
          <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-3">
            <div>
              <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">How "auto" provider works:</p>
              <p>When provider is set to "auto", the system queries APIs in order: <strong>DBLP</strong> → <strong>Crossref</strong> → <strong>Semantic Scholar</strong> → <strong>OpenAlex</strong>, stopping at the first provider that finds a match. This prioritizes DBLP's curated CS metadata, then Crossref for DOI-based works, S2 for broad academic coverage, and finally OpenAlex's comprehensive catalog.</p>
            </div>
            <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
              <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">Checking methods:</p>
              <ul className="space-y-2 ml-4 list-disc">
                <li><strong>This page (batch check)</strong>: Run automated checks on multiple entries. Results saved to <code className="px-1 bg-gray-200 dark:bg-gray-700 rounded">check_log</code> in frontmatter (unless dry-run).</li>
                <li><strong>CLI</strong>: <code className="px-1 bg-gray-200 dark:bg-gray-700 rounded">extenote refcheck</code> with <code className="px-1 bg-gray-200 dark:bg-gray-700 rounded">--dry-run</code> to preview or <code className="px-1 bg-gray-200 dark:bg-gray-700 rounded">--force</code> to re-check.</li>
                <li><strong>Review tab + Browser Extension</strong>: For manual verification, use the <a href="/review" className="text-indigo-600 dark:text-indigo-400 hover:underline">Review tab</a> to browse entries one-by-one, then click the external links to verify on the publisher's page. The browser extension can auto-detect matching entries and let you compare/update values in real-time.</li>
              </ul>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-500 pt-2 border-t border-gray-200 dark:border-gray-700">
              All methods use the same comparison logic and save compatible <code className="px-1 bg-gray-200 dark:bg-gray-700 rounded">check_log</code> format.
            </p>
          </div>
        </details>
      </div>

      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-8">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Total Entries</div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.checked}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Checked</div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <div className="text-2xl font-bold text-gray-500">{stats.unchecked}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Unchecked</div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <div className="text-2xl font-bold text-green-600">{stats.confirmed}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Confirmed</div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <div className="text-2xl font-bold text-yellow-600">{stats.mismatch}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Mismatch</div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <div className="text-2xl font-bold text-red-600">{stats.notFound}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Not Found</div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <div className="text-2xl font-bold text-red-600">{stats.error}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Errors</div>
          </div>
        </div>
      )}

      {/* Check Form */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Run Check</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Project
            </label>
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Provider
            </label>
            <select
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              {providers.map((p) => (
                <option key={p} value={p}>
                  {p}{p === 'auto' ? ' (DBLP → Crossref → S2 → OpenAlex)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Limit
            </label>
            <input
              type="number"
              value={limit}
              onChange={(e) => setLimit(parseInt(e.target.value) || 0)}
              min={0}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder="0 = no limit"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Path Filter (regex)
            </label>
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder="e.g. references/2024/*"
            />
          </div>

          <div className="flex items-end gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              Dry run (preview only)
            </label>
          </div>

          <div className="flex items-end gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={force}
                onChange={(e) => setForce(e.target.checked)}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              Force re-check
            </label>
          </div>
        </div>

        <button
          onClick={runCheck}
          disabled={checking}
          className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
        >
          {checking && <LoadingSpinner size="sm" />}
          {checking ? 'Checking references...' : 'Run Check'}
        </button>

        {dryRun && (
          <span className="ml-4 text-sm text-gray-500 dark:text-gray-400">
            Preview mode - no files will be modified
          </span>
        )}
      </div>

      {/* Error during check */}
      {error && report === null && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-8">
          <p className="text-red-600 dark:text-red-300">{error.message}</p>
        </div>
      )}

      {/* Check Results */}
      {report && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Results: {report.total} entries checked with {report.provider}
            </h2>
            <div className="flex gap-4 mt-2 text-sm">
              <span className="text-green-600">{report.confirmed} confirmed</span>
              <span className="text-yellow-600">{report.mismatches} mismatches</span>
              <span className="text-red-600">{report.notFound} not found</span>
              <span className="text-red-600">{report.errors} errors</span>
              <span className="text-gray-500">{report.skipped} skipped</span>
            </div>
          </div>

          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {report.results.map((result: CheckResult) => (
              <div key={result.objectId} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(result.status)}
                    <Link
                      to={`/object/${encodeURIComponent(result.filePath.replace(/^.*\//, '').replace(/\.md$/, ''))}`}
                      className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                    >
                      {result.title || result.objectId}
                    </Link>
                    <span className={`text-xs px-2 py-0.5 rounded ${getStatusClass(result.status)}`}>
                      {result.status}
                    </span>
                  </div>
                  {result.paperId && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {result.paperId}
                    </span>
                  )}
                </div>

                {result.message && (
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{result.message}</p>
                )}

                {result.fieldChecks.length > 0 && (
                  <div className="mt-2 ml-6">
                    {result.fieldChecks.map(renderFieldCheck)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
