import { useState, useEffect } from 'react'
import { API_ROUTES } from '../api/routes'

interface ProjectWebsite {
  name: string
  title: string
  url: string | null
  domain: string | null
  platformUrl: string | null
  platform: string
  github: string | null
  websiteDir: string | null
  buildType: string | null
}

export function Websites() {
  const [websites, setWebsites] = useState<ProjectWebsite[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchWebsites() {
      try {
        const response = await fetch(API_ROUTES.WEBSITES)
        if (!response.ok) {
          throw new Error('Failed to load websites')
        }
        const data = await response.json()
        setWebsites(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }
    fetchWebsites()
  }, [])

  if (loading) {
    return <div className="text-gray-500">Loading...</div>
  }

  if (error) {
    return <div className="text-red-600">Error: {error}</div>
  }

  const formatPlatform = (platform: string): string => {
    switch (platform) {
      case 'cloudflare-pages': return 'Cloudflare Pages'
      case 'github-pages': return 'GitHub Pages'
      case 'vercel': return 'Vercel'
      case 'netlify': return 'Netlify'
      default: return platform
    }
  }

  const getPlatformColor = (platform: string): string => {
    switch (platform) {
      case 'cloudflare-pages': return 'bg-orange-100 text-orange-800'
      case 'github-pages': return 'bg-gray-100 text-gray-800'
      case 'vercel': return 'bg-black text-white'
      case 'netlify': return 'bg-teal-100 text-teal-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="px-4 sm:px-0">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Public Websites</h1>
        <p className="mt-2 text-gray-600">
          All projects with deploy configurations and their live URLs.
        </p>
      </div>

      {websites.length === 0 ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
          <p className="text-yellow-800">No projects with deploy configuration found.</p>
          <p className="text-yellow-600 text-sm mt-2">
            Add a <code className="bg-yellow-100 px-1 rounded">deploy</code> block to your project YAML to enable deployment.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {websites.map((site) => (
              <div
                key={site.name}
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">{site.title}</h2>
                    <p className="text-sm text-gray-500">{site.name}</p>
                  </div>
                  <span className={`text-xs font-medium px-2 py-1 rounded ${getPlatformColor(site.platform)}`}>
                    {formatPlatform(site.platform)}
                  </span>
                </div>

                {site.url ? (
                  <a
                    href={site.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-indigo-600 hover:text-indigo-800 text-sm font-medium mb-1 truncate"
                  >
                    {site.url}
                    <span className="ml-1">↗</span>
                  </a>
                ) : (
                  <p className="text-gray-400 text-sm mb-1 italic">URL not available</p>
                )}
                {site.domain && site.platformUrl && (
                  <p className="text-xs text-gray-400 mb-3 truncate">
                    Platform: {site.platformUrl}
                  </p>
                )}
                {!site.domain && <div className="mb-2" />}

                <div className="flex flex-wrap gap-2 text-xs">
                  {site.buildType && (
                    <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded">
                      {site.buildType}
                    </span>
                  )}
                  {site.github && (
                    <a
                      href={site.github}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-gray-50 text-gray-700 px-2 py-1 rounded hover:bg-gray-100"
                    >
                      GitHub
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 text-sm text-gray-500">
            {websites.length} website{websites.length !== 1 ? 's' : ''} total
          </div>

          {/* CLI Command */}
          <div className="mt-6 bg-gray-900 text-green-400 rounded-lg p-4 font-mono text-sm">
            <div className="text-gray-400 mb-1">CLI equivalent:</div>
            <code>bun run cli -- websites</code>
          </div>
        </>
      )}
    </div>
  )
}
