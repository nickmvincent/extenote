import { useState, useMemo } from 'react'
import { useSettings } from '../hooks/useSettings'
import type { ExtenoteSettings, PartialSettings } from '@extenote/core'

type SettingsTab = 'refcheck' | 'graph' | 'display' | 'system'

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'refcheck', label: 'Refcheck' },
  { id: 'graph', label: 'Graph' },
  { id: 'display', label: 'Display' },
  { id: 'system', label: 'System' },
]

export function Settings() {
  const { settings, defaults, loading, error, saving, saveError, updateSettings, resetSettings } = useSettings()
  const [activeTab, setActiveTab] = useState<SettingsTab>('refcheck')
  const [localSettings, setLocalSettings] = useState<PartialSettings>({})
  const [saveResult, setSaveResult] = useState<{ success: boolean; message: string } | null>(null)

  // Merge local changes with loaded settings for display
  const displaySettings = useMemo(() => {
    if (!settings) return null
    return {
      refcheck: { ...settings.refcheck, ...localSettings.refcheck },
      graph: { ...settings.graph, ...localSettings.graph },
      display: { ...settings.display, ...localSettings.display },
      backup: { ...settings.backup, ...localSettings.backup },
      cache: { ...settings.cache, ...localSettings.cache },
      ftp: { ...settings.ftp, ...localSettings.ftp },
      editor: { ...settings.editor, ...localSettings.editor },
      api: { ...settings.api, ...localSettings.api },
    } as ExtenoteSettings
  }, [settings, localSettings])

  const hasChanges = Object.keys(localSettings).length > 0

  if (loading) {
    return <div className="text-gray-500 dark:text-gray-400">Loading settings...</div>
  }

  if (error || !settings || !defaults) {
    return <div className="text-red-600 dark:text-red-400">Error loading settings: {error}</div>
  }

  const handleChange = <K extends keyof ExtenoteSettings>(
    section: K,
    field: keyof ExtenoteSettings[K],
    value: number | string | boolean
  ) => {
    setLocalSettings(prev => ({
      ...prev,
      [section]: {
        ...(prev[section] as object || {}),
        [field]: value,
      },
    }))
    setSaveResult(null)
  }

  const handleSave = async () => {
    if (!hasChanges) return

    const success = await updateSettings(localSettings)
    if (success) {
      setLocalSettings({})
      setSaveResult({ success: true, message: 'Settings saved successfully' })
    } else {
      setSaveResult({ success: false, message: saveError || 'Failed to save settings' })
    }
  }

  const handleReset = async (section?: keyof ExtenoteSettings) => {
    const success = await resetSettings(section)
    if (success) {
      setLocalSettings({})
      setSaveResult({ success: true, message: section ? `${section} settings reset to defaults` : 'All settings reset to defaults' })
    } else {
      setSaveResult({ success: false, message: saveError || 'Failed to reset settings' })
    }
  }

  const handleDiscard = () => {
    setLocalSettings({})
    setSaveResult(null)
  }

  const renderThresholdSlider = (
    section: keyof ExtenoteSettings,
    field: string,
    label: string,
    description: string,
    min = 0,
    max = 1,
    step = 0.01
  ) => {
    const sectionSettings = displaySettings?.[section] as unknown as Record<string, number>
    const defaultSettings = defaults[section] as unknown as Record<string, number>
    const value = sectionSettings?.[field] ?? defaultSettings[field]
    const defaultValue = defaultSettings[field]
    const isModified = value !== defaultValue

    return (
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {label}
            {isModified && <span className="ml-2 text-xs text-indigo-600 dark:text-indigo-400">(modified)</span>}
          </label>
          <span className="text-sm font-mono text-gray-600 dark:text-gray-400">{value.toFixed(2)}</span>
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => handleChange(section, field as keyof ExtenoteSettings[typeof section], parseFloat(e.target.value))}
          className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-indigo-600"
        />
        <p className="text-xs text-gray-500 dark:text-gray-400">{description} (default: {defaultValue})</p>
      </div>
    )
  }

  const renderNumberInput = (
    section: keyof ExtenoteSettings,
    field: string,
    label: string,
    description: string,
    min = 0,
    max?: number,
    step = 1
  ) => {
    const sectionSettings = displaySettings?.[section] as unknown as Record<string, number>
    const defaultSettings = defaults[section] as unknown as Record<string, number>
    const value = sectionSettings?.[field] ?? defaultSettings[field]
    const defaultValue = defaultSettings[field]
    const isModified = value !== defaultValue

    return (
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          {label}
          {isModified && <span className="ml-2 text-xs text-indigo-600 dark:text-indigo-400">(modified)</span>}
        </label>
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => handleChange(section, field as keyof ExtenoteSettings[typeof section], parseFloat(e.target.value))}
          className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
        />
        <p className="text-xs text-gray-500 dark:text-gray-400">{description} (default: {defaultValue})</p>
      </div>
    )
  }

  const renderTextInput = (
    section: keyof ExtenoteSettings,
    field: string,
    label: string,
    description: string,
    placeholder?: string
  ) => {
    const sectionSettings = displaySettings?.[section] as unknown as Record<string, string>
    const defaultSettings = defaults[section] as unknown as Record<string, string>
    const value = sectionSettings?.[field] ?? defaultSettings[field]
    const defaultValue = defaultSettings[field]
    const isModified = value !== defaultValue

    return (
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          {label}
          {isModified && <span className="ml-2 text-xs text-indigo-600 dark:text-indigo-400">(modified)</span>}
        </label>
        <input
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(e) => handleChange(section, field as keyof ExtenoteSettings[typeof section], e.target.value)}
          className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
        />
        <p className="text-xs text-gray-500 dark:text-gray-400">{description} (default: {defaultValue})</p>
      </div>
    )
  }

  const renderToggle = (
    section: keyof ExtenoteSettings,
    field: string,
    label: string,
    description: string
  ) => {
    const sectionSettings = displaySettings?.[section] as unknown as Record<string, boolean>
    const defaultSettings = defaults[section] as unknown as Record<string, boolean>
    const value = sectionSettings?.[field] ?? defaultSettings[field]
    const defaultValue = defaultSettings[field]
    const isModified = value !== defaultValue

    return (
      <div className="flex items-center justify-between py-2">
        <div>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {label}
            {isModified && <span className="ml-2 text-xs text-indigo-600 dark:text-indigo-400">(modified)</span>}
          </label>
          <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
        </div>
        <button
          type="button"
          onClick={() => handleChange(section, field as keyof ExtenoteSettings[typeof section], !value)}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
            value ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-600'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
              value ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>
    )
  }

  const renderRefcheckTab = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Title Matching</h3>
        <div className="space-y-6">
          {renderThresholdSlider('refcheck', 'titleMatchThreshold', 'Title Match (Compare)', 'Threshold for title comparison in compare.ts')}
          {renderThresholdSlider('refcheck', 'titleMatchThresholdMatcher', 'Title Match (Matcher)', 'Threshold for title comparison in matcher.ts')}
          {renderThresholdSlider('refcheck', 'minTitleSimilarity', 'Min Title Similarity', 'Minimum title similarity for partial match')}
        </div>
      </div>
      <div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Other Thresholds</h3>
        <div className="space-y-6">
          {renderThresholdSlider('refcheck', 'venueMatchThreshold', 'Venue Match', 'Threshold for venue similarity comparison')}
          {renderThresholdSlider('refcheck', 'searchSimilarityThreshold', 'Search Similarity', 'Threshold for search result matching')}
          {renderThresholdSlider('refcheck', 'authorCountRatioThreshold', 'Author Count Ratio', 'Threshold for author count comparison')}
        </div>
      </div>
      <button
        onClick={() => handleReset('refcheck')}
        className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
      >
        Reset refcheck settings to defaults
      </button>
    </div>
  )

  const renderGraphTab = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Force Simulation</h3>
        <div className="space-y-6">
          {renderNumberInput('graph', 'repulsionStrength', 'Repulsion Strength', 'Force that pushes nodes apart', 0, 20000, 100)}
          {renderThresholdSlider('graph', 'attractionStrength', 'Attraction Strength', 'Force that pulls connected nodes together', 0, 0.1, 0.001)}
          {renderThresholdSlider('graph', 'centeringStrength', 'Centering Strength', 'Force that pulls nodes toward center', 0, 0.05, 0.001)}
          {renderThresholdSlider('graph', 'damping', 'Damping', 'Velocity reduction per frame', 0, 1, 0.01)}
          {renderThresholdSlider('graph', 'minVelocity', 'Min Velocity', 'Stop simulation below this velocity', 0, 1, 0.01)}
        </div>
      </div>
      <div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Zoom</h3>
        <div className="space-y-6">
          {renderThresholdSlider('graph', 'minZoom', 'Min Zoom', 'Minimum zoom level', 0.05, 1, 0.05)}
          {renderNumberInput('graph', 'maxZoom', 'Max Zoom', 'Maximum zoom level', 1, 10, 0.5)}
        </div>
      </div>
      <div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Node Sizing</h3>
        <div className="space-y-6">
          {renderNumberInput('graph', 'baseNodeSize', 'Base Node Size', 'Minimum node size', 1, 50, 1)}
          {renderNumberInput('graph', 'maxNodeSize', 'Max Node Size', 'Maximum node size', 10, 100, 1)}
          {renderThresholdSlider('graph', 'nodeSizeGrowth', 'Node Size Growth', 'How much node size grows per connection', 0, 1, 0.01)}
        </div>
      </div>
      <button
        onClick={() => handleReset('graph')}
        className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
      >
        Reset graph settings to defaults
      </button>
    </div>
  )

  const renderDisplayTab = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Limits</h3>
        <div className="space-y-6">
          {renderNumberInput('display', 'listLimit', 'List Limit', 'Default limit for list/search results', 1, 100)}
          {renderNumberInput('display', 'issuesLimit', 'Issues Limit', 'Default limit for issue display', 1, 100)}
          {renderNumberInput('display', 'validationQueueLimit', 'Validation Queue Limit', 'Maximum items in validation queue', 1, 200)}
          {renderNumberInput('display', 'searchResultsLimit', 'Search Results Limit', 'Maximum search results to show', 1, 200)}
        </div>
      </div>
      <div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">UI</h3>
        <div className="space-y-6">
          {renderNumberInput('display', 'maxRecentItems', 'Max Recent Items', 'Maximum recent items to track', 1, 50)}
          {renderNumberInput('display', 'pageSize', 'Page Size (TUI)', 'Items per page in TUI pagination', 5, 50)}
          {renderNumberInput('display', 'previewLineLimit', 'Preview Line Limit', 'Lines to show in object previews', 1, 20)}
        </div>
      </div>
      <button
        onClick={() => handleReset('display')}
        className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
      >
        Reset display settings to defaults
      </button>
    </div>
  )

  const renderSystemTab = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Cache</h3>
        <div className="space-y-6">
          {renderToggle('cache', 'enabled', 'Enable Cache', 'Cache vault data for faster loads')}
          {renderNumberInput('cache', 'ttl', 'Cache TTL (ms)', 'Time-to-live for cached data in milliseconds', 0, 300000, 1000)}
        </div>
      </div>
      <div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Backup</h3>
        <div className="space-y-6">
          {renderNumberInput('backup', 'maxBackups', 'Max Backups', 'Maximum number of backup copies to keep', 1, 50)}
          {renderTextInput('backup', 'backupDir', 'Backup Directory', 'Directory name for backups', '.extenote-backup')}
        </div>
      </div>
      <div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">FTP Deployment</h3>
        <div className="space-y-6">
          {renderNumberInput('ftp', 'timeout', 'Timeout (seconds)', 'FTP connection timeout', 1, 120)}
          {renderNumberInput('ftp', 'parallelThreads', 'Parallel Threads', 'Number of parallel upload threads', 1, 10)}
        </div>
      </div>
      <div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Editor</h3>
        <div className="space-y-6">
          {renderTextInput('editor', 'command', 'Editor Command', 'Command to open files in editor', 'code')}
        </div>
      </div>
      <div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">API</h3>
        <div className="space-y-6">
          {renderNumberInput('api', 'rateLimitDelay', 'Rate Limit Delay (ms)', 'Delay between API requests', 0, 5000)}
          {renderNumberInput('api', 'maxResults', 'Max API Results', 'Maximum results from external APIs', 1, 20)}
        </div>
      </div>
      <button
        onClick={() => handleReset()}
        className="text-sm text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-200"
      >
        Reset all settings to defaults
      </button>
    </div>
  )

  return (
    <div className="px-4 sm:px-0">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Settings</h1>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        Configure Extenote behavior. Changes take effect immediately.
      </p>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
        <nav className="-mb-px flex space-x-8">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 max-w-3xl">
        {activeTab === 'refcheck' && renderRefcheckTab()}
        {activeTab === 'graph' && renderGraphTab()}
        {activeTab === 'display' && renderDisplayTab()}
        {activeTab === 'system' && renderSystemTab()}

        {/* Save/Discard Buttons */}
        {hasChanges && (
          <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700 flex gap-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                saving
                  ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
              }`}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              onClick={handleDiscard}
              disabled={saving}
              className="px-6 py-2 rounded-lg font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              Discard Changes
            </button>
          </div>
        )}

        {/* Result Message */}
        {saveResult && (
          <div
            className={`mt-4 p-4 rounded-lg ${
              saveResult.success
                ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
            }`}
          >
            <p
              className={`text-sm ${
                saveResult.success ? 'text-green-800 dark:text-green-400' : 'text-red-800 dark:text-red-400'
              }`}
            >
              {saveResult.success ? '\u2713 ' : '\u2717 '}
              {saveResult.message}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
