import { useState, useEffect, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useVault } from '../hooks/useVault'
import { LoadingSpinner } from '../components/LoadingSpinner'
import { API_ROUTES } from '../api/routes'
import type { VaultObject, CheckLog, FieldCheck } from '@extenote/core'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ReviewRecord {
  lastReviewed: string
  reviewCount: number
}

type ReviewHistory = Record<string, ReviewRecord>

// ─── LocalStorage Helpers ────────────────────────────────────────────────────

const STORAGE_KEY = 'extenote-review-history'

function loadReviewHistory(): ReviewHistory {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return {}
    return JSON.parse(stored) as ReviewHistory
  } catch {
    return {}
  }
}

function saveReviewHistory(history: ReviewHistory) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history))
}

// ─── URL Extraction ──────────────────────────────────────────────────────────

interface ExtractedLink {
  label: string
  url: string
}

function extractLinks(frontmatter: Record<string, unknown>): ExtractedLink[] {
  const links: ExtractedLink[] = []
  const urlFields = ['url', 'link', 'homepage', 'website', 'source', 'pdf', 'arxiv']

  for (const field of urlFields) {
    const value = frontmatter[field]
    if (typeof value === 'string' && value.trim()) {
      links.push({ label: field, url: value.trim() })
    }
  }

  // Handle DOI specially - format as URL
  const doi = frontmatter.doi
  if (typeof doi === 'string' && doi.trim()) {
    const doiValue = doi.trim()
    const doiUrl = doiValue.startsWith('http') ? doiValue : `https://doi.org/${doiValue}`
    links.push({ label: 'DOI', url: doiUrl })
  }

  return links
}

// ─── Tag Helpers ─────────────────────────────────────────────────────────────

function getObjectTags(object: VaultObject): string[] {
  const tags = object.frontmatter.tags
  if (!tags) return []
  if (Array.isArray(tags)) return tags.map(String)
  if (typeof tags === 'string') return [tags]
  return []
}

function toFieldChecks(checkLog?: CheckLog): FieldCheck[] {
  if (!checkLog?.fields) return []
  const fieldChecks: FieldCheck[] = []
  const fields = checkLog.fields

  if (fields.title) {
    fieldChecks.push({
      field: 'title',
      local: fields.title.local ?? undefined,
      remote: fields.title.remote ?? undefined,
      match: fields.title.match,
      charDiff: fields.title.edit_distance,
    })
  }

  if (fields.authors) {
    const details = fields.authors.details?.map((d) => ({
      index: d.index,
      firstMatch: d.first_match,
      lastMatch: d.last_match,
      localName: d.local ?? '',
      remoteName: d.remote ?? '',
    }))
    const local = details?.map((d) => d.localName).filter(Boolean).join('; ')
    const remote = details?.map((d) => d.remoteName).filter(Boolean).join('; ')
    const allMatch = details?.every((d) => d.firstMatch && d.lastMatch) ?? true
    fieldChecks.push({
      field: 'authors',
      local: local || undefined,
      remote: remote || undefined,
      match: fields.authors.count_match && allMatch,
      authorCountMatch: fields.authors.count_match,
      authorDetails: details,
    })
  }

  if (fields.year) {
    fieldChecks.push({
      field: 'year',
      local: fields.year.local ?? undefined,
      remote: fields.year.remote ?? undefined,
      match: fields.year.match,
      yearDiff: fields.year.year_diff,
    })
  }

  if (fields.venue) {
    fieldChecks.push({
      field: 'venue',
      local: fields.venue.local ?? undefined,
      remote: fields.venue.remote ?? undefined,
      match: fields.venue.match,
      charDiff: fields.venue.edit_distance,
    })
  }

  if (fields.doi) {
    fieldChecks.push({
      field: 'doi',
      local: fields.doi.local ?? undefined,
      remote: fields.doi.remote ?? undefined,
      match: fields.doi.match,
    })
  }

  return fieldChecks
}

function DiffHighlight({ local, remote }: { local?: string, remote?: string }) {
  if (!local || !remote) {
    return (
      <div className="ml-4 text-xs text-gray-600 dark:text-gray-400">
        <div><span className="font-semibold">Local:</span> {local || '(empty)'}</div>
        <div><span className="font-semibold">Remote:</span> {remote || '(empty)'}</div>
      </div>
    )
  }

  let firstDiff = 0;
  while (firstDiff < local.length && firstDiff < remote.length && local[firstDiff] === remote[firstDiff]) {
    firstDiff++;
  }

  const prefix = local.substring(0, firstDiff);
  const localSuffix = local.substring(firstDiff);
  const remoteSuffix = remote.substring(firstDiff);

  return (
    <div className="ml-4 text-xs font-mono bg-gray-50 dark:bg-gray-900/50 p-2 rounded mt-1 overflow-x-auto">
      <div className="mb-1 whitespace-pre">
        <span className="text-gray-500 select-none w-16 inline-block">Local:</span>
        <span className="text-gray-600 dark:text-gray-400">{prefix}</span>
        <span className="bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200 px-0.5 rounded-sm">{localSuffix}</span>
      </div>
      <div className="whitespace-pre">
        <span className="text-gray-500 select-none w-16 inline-block">Remote:</span>
        <span className="text-gray-600 dark:text-gray-400">{prefix}</span>
        <span className="bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200 px-0.5 rounded-sm">{remoteSuffix}</span>
      </div>
    </div>
  )
}

function renderMismatchCheck(check: FieldCheck) {
  const matchClass = check.match
    ? 'text-green-600 dark:text-green-400'
    : 'text-red-600 dark:text-red-400'

  if (check.field === 'authors') {
    const localCount = check.local?.split(';').length ?? 0
    const remoteCount = check.remote?.split(';').length ?? 0
    const mismatchedAuthors = check.authorDetails?.filter(d => !d.firstMatch || !d.lastMatch) ?? []

    return (
      <div key={check.field} className="text-sm py-2 border-t border-yellow-200 dark:border-yellow-800/60">
        <div className="flex items-center gap-2">
          <span className={`font-medium ${matchClass}`}>
            {check.match ? '✓' : '✗'} {check.field}
          </span>
          {!check.match && check.authorCountMatch === false && (
            <span className="text-xs text-gray-500">(count: {localCount} local vs {remoteCount} remote)</span>
          )}
          {!check.match && check.authorCountMatch !== false && mismatchedAuthors.length > 0 && (
            <span className="text-xs text-gray-500">({mismatchedAuthors.length}/{localCount} authors differ)</span>
          )}
        </div>
        {!check.match && check.authorDetails && check.authorDetails.length > 0 && (
          <div className="ml-4 text-xs text-gray-600 dark:text-gray-400 space-y-2 mt-1">
            {check.authorDetails.map((detail) => {
              if (!detail.firstMatch || !detail.lastMatch) {
                const issues = []
                if (!detail.firstMatch) issues.push('first')
                if (!detail.lastMatch) issues.push('last')
                return (
                  <div key={detail.index} className="border-l-2 border-yellow-400 pl-2">
                    <div className="text-yellow-700 dark:text-yellow-400 mb-0.5">
                      [{detail.index}] Author name mismatch ({issues.join('+')})
                    </div>
                    <DiffHighlight local={detail.localName} remote={detail.remoteName} />
                  </div>
                )
              }
              return null
            })}
          </div>
        )}
        {!check.match && (!check.authorDetails || check.authorDetails.length === 0) && (
          <DiffHighlight local={check.local} remote={check.remote} />
        )}
      </div>
    )
  }

  return (
    <div key={check.field} className="text-sm py-2 border-t border-yellow-200 dark:border-yellow-800/60">
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
        <DiffHighlight local={check.local} remote={check.remote} />
      )}
    </div>
  )
}

// ─── Component ───────────────────────────────────────────────────────────────

export function Review() {
  const { data, loading, error, reload } = useVault()

  // State
  const [selectedType, setSelectedType] = useState<string>('all')
  const [checkLogFilter, setCheckLogFilter] = useState<'all' | 'mismatch' | 'mismatch_major' | 'mismatch_minor' | 'not_found' | 'unchecked'>('all')
  const [includeReviewed, setIncludeReviewed] = useState(false)
  const [reviewHistory, setReviewHistory] = useState<ReviewHistory>(() => loadReviewHistory())
  const [currentObject, setCurrentObject] = useState<VaultObject | null>(null)
  const [currentIndex, setCurrentIndex] = useState<number>(0)
  const [navigationMode, setNavigationMode] = useState<'random' | 'sequential'>('random')
  const [newTag, setNewTag] = useState('')
  const [saving, setSaving] = useState(false)
  const [showTagSuggestions, setShowTagSuggestions] = useState(false)
  const [verificationNotes, setVerificationNotes] = useState('')
  const [showVerifyDialog, setShowVerifyDialog] = useState(false)

  // Get unique types from objects
  const objectTypes = useMemo(() => {
    if (!data) return []
    const types = new Set(data.vault.objects.map(o => o.type))
    return Array.from(types).sort()
  }, [data])

  // Get all unique tags from vault for autocomplete
  const allTags = useMemo(() => {
    if (!data) return []
    const tagSet = new Set<string>()
    for (const obj of data.vault.objects) {
      const tags = getObjectTags(obj)
      for (const tag of tags) {
        tagSet.add(tag)
      }
    }
    return Array.from(tagSet).sort()
  }, [data])

  // Filter tag suggestions based on input
  const tagSuggestions = useMemo(() => {
    if (!newTag.trim() || !currentObject) return []
    const currentTags = getObjectTags(currentObject)
    const query = newTag.toLowerCase()
    return allTags
      .filter(tag =>
        tag.toLowerCase().includes(query) &&
        !currentTags.includes(tag)
      )
      .slice(0, 8) // Limit to 8 suggestions
  }, [newTag, allTags, currentObject])

  // Filter objects based on type, check_log status, and review status
  const filteredObjects = useMemo(() => {
    if (!data) return []
    let objects = data.vault.objects

    if (selectedType !== 'all') {
      objects = objects.filter(o => o.type === selectedType)
    }

    // Filter by check_log status
    if (checkLogFilter !== 'all') {
      objects = objects.filter(o => {
        const checkLog = o.frontmatter.check_log as { status?: string; mismatch_severity?: string } | undefined
        if (checkLogFilter === 'unchecked') {
          return !checkLog
        }
        if (checkLogFilter === 'mismatch_major') {
          return checkLog?.status === 'mismatch' && checkLog?.mismatch_severity === 'major'
        }
        if (checkLogFilter === 'mismatch_minor') {
          return checkLog?.status === 'mismatch' && checkLog?.mismatch_severity === 'minor'
        }
        return checkLog?.status === checkLogFilter
      })
    }

    if (!includeReviewed) {
      objects = objects.filter(o => !reviewHistory[o.relativePath])
    }

    return objects
  }, [data, selectedType, checkLogFilter, includeReviewed, reviewHistory])

  // Stats
  const stats = useMemo(() => {
    if (!data) return { total: 0, reviewed: 0, remaining: 0 }

    let objects = data.vault.objects
    if (selectedType !== 'all') {
      objects = objects.filter(o => o.type === selectedType)
    }

    // Apply check_log filter to stats too
    if (checkLogFilter !== 'all') {
      objects = objects.filter(o => {
        const checkLog = o.frontmatter.check_log as { status?: string; mismatch_severity?: string } | undefined
        if (checkLogFilter === 'unchecked') {
          return !checkLog
        }
        if (checkLogFilter === 'mismatch_major') {
          return checkLog?.status === 'mismatch' && checkLog?.mismatch_severity === 'major'
        }
        if (checkLogFilter === 'mismatch_minor') {
          return checkLog?.status === 'mismatch' && checkLog?.mismatch_severity === 'minor'
        }
        return checkLog?.status === checkLogFilter
      })
    }

    const total = objects.length
    const reviewed = objects.filter(o => reviewHistory[o.relativePath]).length
    return { total, reviewed, remaining: total - reviewed }
  }, [data, selectedType, checkLogFilter, reviewHistory])

  // Select a random object
  const selectRandomObject = useCallback(() => {
    if (filteredObjects.length === 0) {
      setCurrentObject(null)
      setCurrentIndex(0)
      return
    }
    const randomIndex = Math.floor(Math.random() * filteredObjects.length)
    setCurrentIndex(randomIndex)
    setCurrentObject(filteredObjects[randomIndex])
  }, [filteredObjects])

  // Select object by index (for sequential navigation)
  const selectObjectByIndex = useCallback((index: number) => {
    if (filteredObjects.length === 0) {
      setCurrentObject(null)
      setCurrentIndex(0)
      return
    }
    // Wrap around
    const wrappedIndex = ((index % filteredObjects.length) + filteredObjects.length) % filteredObjects.length
    setCurrentIndex(wrappedIndex)
    setCurrentObject(filteredObjects[wrappedIndex])
  }, [filteredObjects])

  // Navigate to next object
  const selectNextObject = useCallback(() => {
    if (navigationMode === 'random') {
      selectRandomObject()
    } else {
      selectObjectByIndex(currentIndex + 1)
    }
  }, [navigationMode, currentIndex, selectRandomObject, selectObjectByIndex])

  // Navigate to previous object
  const selectPrevObject = useCallback(() => {
    selectObjectByIndex(currentIndex - 1)
  }, [currentIndex, selectObjectByIndex])

  // Initial selection
  useEffect(() => {
    if (data && !currentObject) {
      if (navigationMode === 'random') {
        selectRandomObject()
      } else {
        selectObjectByIndex(0)
      }
    }
  }, [data, currentObject, navigationMode, selectRandomObject, selectObjectByIndex])

  // Mark object as reviewed
  const markReviewed = () => {
    if (!currentObject) return

    const path = currentObject.relativePath
    const existing = reviewHistory[path]
    const newHistory = {
      ...reviewHistory,
      [path]: {
        lastReviewed: new Date().toISOString(),
        reviewCount: (existing?.reviewCount ?? 0) + 1
      }
    }
    setReviewHistory(newHistory)
    saveReviewHistory(newHistory)
    selectNextObject()
  }

  // Skip to next object
  const skip = () => {
    selectNextObject()
  }

  // Reset review history
  const resetHistory = () => {
    if (confirm('Are you sure you want to reset all review history?')) {
      setReviewHistory({})
      saveReviewHistory({})
    }
  }

  // Update tags via API
  const updateTags = async (newTags: string[]) => {
    if (!currentObject) return

    setSaving(true)
    try {
      const response = await fetch(API_ROUTES.WRITE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath: currentObject.relativePath,
          frontmatter: { tags: newTags },
          merge: true
        })
      })

      if (!response.ok) {
        throw new Error('Failed to update tags')
      }

      // Reload vault data to reflect changes
      await reload()

      // Update current object's tags locally for immediate UI feedback
      setCurrentObject(prev => {
        if (!prev) return null
        return {
          ...prev,
          frontmatter: { ...prev.frontmatter, tags: newTags }
        }
      })
    } catch (err) {
      console.error('Failed to update tags:', err)
      alert('Failed to update tags. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // Remove a tag
  const removeTag = (tagToRemove: string) => {
    if (!currentObject) return
    const currentTags = getObjectTags(currentObject)
    const newTags = currentTags.filter(t => t !== tagToRemove)
    updateTags(newTags)
  }

  // Add a tag
  const addTag = (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentObject || !newTag.trim()) return
    addTagByName(newTag.trim())
  }

  // Add a tag by name (used by form submit and suggestion click)
  const addTagByName = (tagToAdd: string) => {
    if (!currentObject) return

    const currentTags = getObjectTags(currentObject)

    if (currentTags.includes(tagToAdd)) {
      setNewTag('')
      setShowTagSuggestions(false)
      return
    }

    updateTags([...currentTags, tagToAdd])
    setNewTag('')
    setShowTagSuggestions(false)
  }

  // Mark reference as manually verified
  const submitVerification = async () => {
    if (!currentObject) return

    setSaving(true)
    try {
      // Build the manually_verified record
      const manuallyVerified = {
        verified_at: new Date().toISOString(),
        verified_by: 'human',
        ...(verificationNotes.trim() && { notes: verificationNotes.trim() })
      }

      // Get existing check_log or create new one
      const existingCheckLog = currentObject.frontmatter.check_log as Record<string, unknown> | undefined

      const response = await fetch(API_ROUTES.WRITE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath: currentObject.relativePath,
          frontmatter: {
            check_log: {
              ...existingCheckLog,
              manually_verified: manuallyVerified
            }
          },
          merge: true
        })
      })

      if (!response.ok) {
        throw new Error('Failed to save verification')
      }

      // Reload vault data
      await reload()

      // Update local state
      setCurrentObject(prev => {
        if (!prev) return null
        return {
          ...prev,
          frontmatter: {
            ...prev.frontmatter,
            check_log: {
              ...(prev.frontmatter.check_log as Record<string, unknown> || {}),
              manually_verified: manuallyVerified
            }
          }
        }
      })

      setShowVerifyDialog(false)
      setVerificationNotes('')
    } catch (err) {
      console.error('Failed to save verification:', err)
      alert('Failed to save verification. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // Get check_log info
  const getCheckLogInfo = (obj: VaultObject) => {
    const checkLog = obj.frontmatter.check_log as Record<string, unknown> | undefined
    if (!checkLog) return null
    return {
      status: checkLog.status as string | undefined,
      checkedWith: checkLog.checked_with as string | undefined,
      checkedAt: checkLog.checked_at as string | undefined,
      manuallyVerified: checkLog.manually_verified as { verified_at: string; verified_by: string; notes?: string } | undefined
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" message="Loading vault..." />
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
        <h2 className="text-red-800 dark:text-red-400 font-semibold">Error</h2>
        <p className="text-red-600 dark:text-red-300 mt-2">{error.message}</p>
        <button
          onClick={() => reload()}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    )
  }

  if (!data) return null

  const currentTags = currentObject ? getObjectTags(currentObject) : []
  const links = currentObject ? extractLinks(currentObject.frontmatter) : []
  const reviewRecord = currentObject ? reviewHistory[currentObject.relativePath] : null
  const checkLog = currentObject ? currentObject.frontmatter.check_log as CheckLog | undefined : undefined
  const mismatchChecks = checkLog ? toFieldChecks(checkLog).filter((check) => !check.match) : []

  return (
    <div className="px-4 sm:px-0">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              {navigationMode === 'random' ? 'Random Review' : 'Sequential Review'}
            </h1>
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              Review objects one at a time
              {navigationMode === 'sequential' && filteredObjects.length > 0 && (
                <span className="ml-2 text-indigo-600 dark:text-indigo-400">
                  ({currentIndex + 1} of {filteredObjects.length})
                </span>
              )}
            </p>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {stats.reviewed} of {stats.total} reviewed
            </div>
            <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              {stats.remaining} remaining
            </div>
            <button
              onClick={resetHistory}
              className="mt-2 text-xs text-red-600 dark:text-red-400 hover:underline"
            >
              Reset history
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Type:
          </label>
          <select
            value={selectedType}
            onChange={(e) => {
              setSelectedType(e.target.value)
              setCurrentObject(null)
            }}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
          >
            <option value="all">All types ({data.vault.objects.length})</option>
            {objectTypes.map(type => {
              const count = data.vault.objects.filter(o => o.type === type).length
              return (
                <option key={type} value={type}>
                  {type} ({count})
                </option>
              )
            })}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Status:
          </label>
          <select
            value={checkLogFilter}
            onChange={(e) => {
              setCheckLogFilter(e.target.value as typeof checkLogFilter)
              setCurrentObject(null)
            }}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
          >
            <option value="all">All statuses</option>
            <option value="mismatch">All mismatches</option>
            <option value="mismatch_major">Mismatches (major - needs review)</option>
            <option value="mismatch_minor">Mismatches (minor - likely ok)</option>
            <option value="not_found">Not found only</option>
            <option value="unchecked">Unchecked only</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Order:
          </label>
          <select
            value={navigationMode}
            onChange={(e) => {
              const mode = e.target.value as 'random' | 'sequential'
              setNavigationMode(mode)
              if (mode === 'sequential') {
                setCurrentIndex(0)
                if (filteredObjects.length > 0) {
                  setCurrentObject(filteredObjects[0])
                }
              }
            }}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
          >
            <option value="random">Random</option>
            <option value="sequential">Sequential</option>
          </select>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={includeReviewed}
            onChange={(e) => {
              setIncludeReviewed(e.target.checked)
              setCurrentObject(null)
            }}
            className="rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500"
          />
          <span className="text-gray-700 dark:text-gray-300">Include already reviewed</span>
        </label>
      </div>

      {/* Main Content */}
      {filteredObjects.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
          <p className="text-gray-500 dark:text-gray-400 text-lg">
            {stats.total === 0
              ? 'No objects match the selected type.'
              : 'All objects have been reviewed!'}
          </p>
          {stats.total > 0 && (
            <button
              onClick={() => setIncludeReviewed(true)}
              className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
            >
              Review again
            </button>
          )}
        </div>
      ) : currentObject ? (
        <div className="space-y-6">
          {/* Object Card */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            {/* Title and badges */}
            <div className="mb-4">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                {String(currentObject.title || currentObject.frontmatter.title || currentObject.id || 'Untitled')}
              </h2>
              <div className="flex flex-wrap gap-2 mt-2">
                <span className="px-2 py-1 text-xs font-medium bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200 rounded">
                  {currentObject.type}
                </span>
                <span className={`px-2 py-1 text-xs font-medium rounded ${
                  currentObject.visibility === 'public'
                    ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                    : currentObject.visibility === 'private'
                    ? 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
                    : 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200'
                }`}>
                  {currentObject.visibility}
                </span>
                {reviewRecord && (
                  <span className="px-2 py-1 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded">
                    Reviewed {reviewRecord.reviewCount}x
                  </span>
                )}
              </div>
            </div>

            {/* Metadata grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 p-4 bg-gray-50 dark:bg-gray-700/50 rounded">
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400">ID</div>
                <div className="font-medium text-gray-900 dark:text-white text-sm truncate">
                  {currentObject.id || 'N/A'}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Project</div>
                <div className="font-medium text-gray-900 dark:text-white text-sm">
                  {currentObject.project}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Schema</div>
                <div className="font-medium text-gray-900 dark:text-white text-sm">
                  {currentObject.schema?.name || 'None'}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Path</div>
                <div className="font-medium text-gray-900 dark:text-white text-sm truncate" title={currentObject.relativePath}>
                  {currentObject.relativePath}
                </div>
              </div>
            </div>

            {/* Author/Venue for bibtex entries */}
            {currentObject.type === 'bibtex_entry' && (() => {
              const checkLogInfo = getCheckLogInfo(currentObject)
              return (
                <div className="mb-6 space-y-4">
                  {/* Verification Status */}
                  <div className={`p-4 rounded border ${
                    checkLogInfo?.manuallyVerified
                      ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                      : checkLogInfo?.status === 'confirmed'
                      ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                      : checkLogInfo?.status === 'not_found'
                      ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                      : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600'
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-medium text-gray-800 dark:text-gray-200">
                        Verification Status
                      </h3>
                      {!checkLogInfo?.manuallyVerified && (
                        <button
                          onClick={() => setShowVerifyDialog(true)}
                          className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                        >
                          Mark as Verified
                        </button>
                      )}
                    </div>
                    <div className="space-y-1 text-sm">
                      {checkLogInfo?.manuallyVerified ? (
                        <>
                          <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            <span className="font-medium">Manually Verified</span>
                          </div>
                          <div className="text-gray-600 dark:text-gray-400 pl-7">
                            by {checkLogInfo.manuallyVerified.verified_by} on {new Date(checkLogInfo.manuallyVerified.verified_at).toLocaleDateString()}
                          </div>
                          {checkLogInfo.manuallyVerified.notes && (
                            <div className="text-gray-600 dark:text-gray-400 pl-7 italic">
                              "{checkLogInfo.manuallyVerified.notes}"
                            </div>
                          )}
                        </>
                      ) : checkLogInfo?.status ? (
                        <>
                          <div className={`font-medium ${
                            checkLogInfo.status === 'confirmed' ? 'text-blue-700 dark:text-blue-300' :
                            checkLogInfo.status === 'not_found' ? 'text-yellow-700 dark:text-yellow-300' :
                            'text-gray-700 dark:text-gray-300'
                          }`}>
                            Auto-check: {checkLogInfo.status}
                          </div>
                          {checkLogInfo.checkedWith && (
                            <div className="text-gray-500 dark:text-gray-400">
                              via {checkLogInfo.checkedWith}
                              {checkLogInfo.checkedAt && ` on ${new Date(checkLogInfo.checkedAt).toLocaleDateString()}`}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-gray-500 dark:text-gray-400">
                          Not yet checked. Run <code className="px-1 bg-gray-200 dark:bg-gray-600 rounded">extenote check</code> or verify manually.
                        </div>
                      )}
                    </div>
                    {checkLogInfo?.status === 'mismatch' && (
                      <div className="mt-3 pt-3 border-t border-yellow-200 dark:border-yellow-800/60">
                        <div className="text-xs font-semibold uppercase tracking-wide text-yellow-700 dark:text-yellow-300 mb-1">
                          Mismatches found
                        </div>
                        {mismatchChecks.length > 0 ? (
                          <div className="space-y-1">
                            {mismatchChecks.map(renderMismatchCheck)}
                          </div>
                        ) : (
                          <div className="text-xs text-gray-600 dark:text-gray-400">
                            No field-level mismatch details were saved. Re-run the check to capture field diffs.
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Bibliographic Info */}
                  <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded">
                    <h3 className="text-sm font-medium text-amber-800 dark:text-amber-300 mb-2">
                      Bibliographic Info (verify these!)
                    </h3>
                    <div className="space-y-2">
                      {(currentObject.frontmatter.authors || currentObject.frontmatter.author) && (
                        <div>
                          <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">Authors: </span>
                          <span className="text-sm text-gray-900 dark:text-white">
                            {Array.isArray(currentObject.frontmatter.authors)
                              ? (currentObject.frontmatter.authors as string[]).join('; ')
                              : String(currentObject.frontmatter.authors || currentObject.frontmatter.author)}
                          </span>
                        </div>
                      )}
                      {currentObject.frontmatter.venue && (
                        <div>
                          <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">Venue: </span>
                          <span className="text-sm text-gray-900 dark:text-white">
                            {String(currentObject.frontmatter.venue)}
                          </span>
                        </div>
                      )}
                      {currentObject.frontmatter.year && (
                        <div>
                          <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">Year: </span>
                          <span className="text-sm text-gray-900 dark:text-white">
                            {String(currentObject.frontmatter.year)}
                          </span>
                        </div>
                      )}
                      {!currentObject.frontmatter.authors && !currentObject.frontmatter.author && !currentObject.frontmatter.venue && (
                        <p className="text-sm text-amber-600 dark:text-amber-400 italic">
                          No author or venue information found
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* Links section */}
            {links.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Links for Verification
                </h3>
                <div className="flex flex-wrap gap-2">
                  {links.map((link, idx) => (
                    <a
                      key={idx}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/50 text-sm transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      {link.label}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Tags section */}
            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Tags
              </h3>
              <div className="flex flex-wrap gap-2 mb-3">
                {currentTags.length === 0 ? (
                  <span className="text-sm text-gray-400 dark:text-gray-500 italic">No tags</span>
                ) : (
                  currentTags.map(tag => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-sm"
                    >
                      {tag}
                      <button
                        onClick={() => removeTag(tag)}
                        disabled={saving}
                        className="ml-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400 disabled:opacity-50"
                        title="Remove tag"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </span>
                  ))
                )}
              </div>
              <form onSubmit={addTag} className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={newTag}
                    onChange={(e) => {
                      setNewTag(e.target.value)
                      setShowTagSuggestions(true)
                    }}
                    onFocus={() => setShowTagSuggestions(true)}
                    onBlur={() => {
                      // Delay hiding to allow click on suggestion
                      setTimeout(() => setShowTagSuggestions(false), 150)
                    }}
                    placeholder="Add new tag..."
                    className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  />
                  {showTagSuggestions && tagSuggestions.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-48 overflow-y-auto">
                      {tagSuggestions.map(tag => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => addTagByName(tag)}
                          className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30"
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={saving || !newTag.trim()}
                  className="px-3 py-1.5 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:opacity-50"
                >
                  Add
                </button>
              </form>
            </div>

            {/* Edit hint */}
            <div className="text-sm text-gray-500 dark:text-gray-400 p-3 bg-gray-50 dark:bg-gray-700/50 rounded">
              For more complex edits, open in editor:
              <code className="ml-2 px-2 py-1 bg-gray-200 dark:bg-gray-600 rounded text-xs">
                {currentObject.relativePath}
              </code>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-3">
            {navigationMode === 'sequential' && (
              <button
                onClick={selectPrevObject}
                className="px-6 py-2.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 font-medium transition-colors"
              >
                ← Previous
              </button>
            )}
            <button
              onClick={markReviewed}
              className="px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors"
            >
              Mark Reviewed & {navigationMode === 'random' ? 'Next' : 'Next →'}
            </button>
            <button
              onClick={skip}
              className="px-6 py-2.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 font-medium transition-colors"
            >
              {navigationMode === 'random' ? 'Skip' : 'Next →'}
            </button>
            <Link
              to={`/object/${encodeURIComponent(currentObject.relativePath)}`}
              state={{ from: '/review', label: 'Review' }}
              className="px-6 py-2.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-lg hover:bg-indigo-200 dark:hover:bg-indigo-900/50 font-medium transition-colors"
            >
              View Full Details
            </Link>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center h-64">
          <LoadingSpinner size="lg" message="Selecting object..." />
        </div>
      )}

      {/* Verification Dialog */}
      {showVerifyDialog && currentObject && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Verify Reference
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Confirm that you have verified this reference against an authoritative source
              (publisher page, DOI, arXiv, etc.)
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Notes (optional)
              </label>
              <textarea
                value={verificationNotes}
                onChange={(e) => setVerificationNotes(e.target.value)}
                placeholder="e.g., Verified against ACM DL, authors confirmed..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowVerifyDialog(false)
                  setVerificationNotes('')
                }}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitVerification}
                disabled={saving}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving...' : 'Confirm Verification'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
