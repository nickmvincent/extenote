import React, { useState, useMemo } from 'react'
import { Box, Text, useInput } from 'ink'
import {
  loadSettings,
  saveSettings,
  resetSettingsSection,
  DEFAULT_SETTINGS,
  type ExtenoteSettings,
} from '@extenote/core'

type SettingsSection = 'refcheck' | 'graph' | 'display' | 'system'

interface SettingItem {
  key: string
  label: string
  section: keyof ExtenoteSettings
  field: string
  type: 'number' | 'boolean' | 'string'
  min?: number
  max?: number
  step?: number
  description: string
}

const SECTIONS: { id: SettingsSection; label: string }[] = [
  { id: 'refcheck', label: 'Refcheck' },
  { id: 'graph', label: 'Graph' },
  { id: 'display', label: 'Display' },
  { id: 'system', label: 'System' },
]

const SETTINGS_ITEMS: SettingItem[] = [
  // Refcheck
  { key: 'refcheck.titleMatchThreshold', label: 'Title Match (Compare)', section: 'refcheck', field: 'titleMatchThreshold', type: 'number', min: 0, max: 1, step: 0.05, description: 'Title similarity threshold for compare.ts' },
  { key: 'refcheck.titleMatchThresholdMatcher', label: 'Title Match (Matcher)', section: 'refcheck', field: 'titleMatchThresholdMatcher', type: 'number', min: 0, max: 1, step: 0.05, description: 'Title similarity threshold for matcher.ts' },
  { key: 'refcheck.venueMatchThreshold', label: 'Venue Match', section: 'refcheck', field: 'venueMatchThreshold', type: 'number', min: 0, max: 1, step: 0.05, description: 'Venue similarity threshold' },
  { key: 'refcheck.searchSimilarityThreshold', label: 'Search Similarity', section: 'refcheck', field: 'searchSimilarityThreshold', type: 'number', min: 0, max: 1, step: 0.05, description: 'Search result matching threshold' },
  { key: 'refcheck.authorCountRatioThreshold', label: 'Author Count Ratio', section: 'refcheck', field: 'authorCountRatioThreshold', type: 'number', min: 0, max: 1, step: 0.05, description: 'Author count comparison threshold' },
  { key: 'refcheck.minTitleSimilarity', label: 'Min Title Similarity', section: 'refcheck', field: 'minTitleSimilarity', type: 'number', min: 0, max: 1, step: 0.05, description: 'Minimum for partial match' },

  // Graph
  { key: 'graph.repulsionStrength', label: 'Repulsion Strength', section: 'graph', field: 'repulsionStrength', type: 'number', min: 0, max: 20000, step: 500, description: 'Force pushing nodes apart' },
  { key: 'graph.attractionStrength', label: 'Attraction Strength', section: 'graph', field: 'attractionStrength', type: 'number', min: 0, max: 0.1, step: 0.005, description: 'Force pulling connected nodes' },
  { key: 'graph.centeringStrength', label: 'Centering Strength', section: 'graph', field: 'centeringStrength', type: 'number', min: 0, max: 0.05, step: 0.001, description: 'Force toward center' },
  { key: 'graph.damping', label: 'Damping', section: 'graph', field: 'damping', type: 'number', min: 0, max: 1, step: 0.05, description: 'Velocity reduction' },
  { key: 'graph.minVelocity', label: 'Min Velocity', section: 'graph', field: 'minVelocity', type: 'number', min: 0, max: 1, step: 0.05, description: 'Stop threshold' },
  { key: 'graph.minZoom', label: 'Min Zoom', section: 'graph', field: 'minZoom', type: 'number', min: 0.05, max: 1, step: 0.05, description: 'Minimum zoom level' },
  { key: 'graph.maxZoom', label: 'Max Zoom', section: 'graph', field: 'maxZoom', type: 'number', min: 1, max: 10, step: 0.5, description: 'Maximum zoom level' },

  // Display
  { key: 'display.listLimit', label: 'List Limit', section: 'display', field: 'listLimit', type: 'number', min: 5, max: 100, step: 5, description: 'Default list results' },
  { key: 'display.issuesLimit', label: 'Issues Limit', section: 'display', field: 'issuesLimit', type: 'number', min: 5, max: 100, step: 5, description: 'Issues to display' },
  { key: 'display.validationQueueLimit', label: 'Validation Queue', section: 'display', field: 'validationQueueLimit', type: 'number', min: 10, max: 200, step: 10, description: 'Validation queue size' },
  { key: 'display.maxRecentItems', label: 'Max Recent Items', section: 'display', field: 'maxRecentItems', type: 'number', min: 5, max: 50, step: 5, description: 'Recent items tracked' },
  { key: 'display.pageSize', label: 'Page Size', section: 'display', field: 'pageSize', type: 'number', min: 5, max: 50, step: 5, description: 'Items per page' },
  { key: 'display.searchResultsLimit', label: 'Search Results', section: 'display', field: 'searchResultsLimit', type: 'number', min: 10, max: 200, step: 10, description: 'Max search results' },

  // System (cache, backup, ftp, editor, api)
  { key: 'cache.enabled', label: 'Cache Enabled', section: 'cache', field: 'enabled', type: 'boolean', description: 'Enable vault caching' },
  { key: 'cache.ttl', label: 'Cache TTL (ms)', section: 'cache', field: 'ttl', type: 'number', min: 0, max: 300000, step: 5000, description: 'Cache time-to-live' },
  { key: 'backup.maxBackups', label: 'Max Backups', section: 'backup', field: 'maxBackups', type: 'number', min: 1, max: 50, step: 1, description: 'Backup copies to keep' },
  { key: 'ftp.timeout', label: 'FTP Timeout (s)', section: 'ftp', field: 'timeout', type: 'number', min: 5, max: 120, step: 5, description: 'FTP connection timeout' },
  { key: 'ftp.parallelThreads', label: 'FTP Threads', section: 'ftp', field: 'parallelThreads', type: 'number', min: 1, max: 10, step: 1, description: 'Parallel upload threads' },
  { key: 'editor.command', label: 'Editor Command', section: 'editor', field: 'command', type: 'string', description: 'Editor to open files' },
  { key: 'api.rateLimitDelay', label: 'Rate Limit (ms)', section: 'api', field: 'rateLimitDelay', type: 'number', min: 0, max: 5000, step: 50, description: 'Delay between API calls' },
  { key: 'api.maxResults', label: 'Max API Results', section: 'api', field: 'maxResults', type: 'number', min: 1, max: 20, step: 1, description: 'Results from external APIs' },
]

interface Props {
  onInputModeChange?: (active: boolean) => void
}

export function SettingsPage({ onInputModeChange }: Props) {
  const [settings, setSettings] = useState<ExtenoteSettings>(() => loadSettings())
  const [sectionIndex, setSectionIndex] = useState(0)
  const [itemIndex, setItemIndex] = useState(0)
  const [editingString, setEditingString] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const currentSection = SECTIONS[sectionIndex].id

  // Filter items for current section (system = cache, backup, ftp, editor, api)
  const sectionItems = useMemo(() => {
    if (currentSection === 'system') {
      return SETTINGS_ITEMS.filter(item =>
        ['cache', 'backup', 'ftp', 'editor', 'api'].includes(item.section)
      )
    }
    return SETTINGS_ITEMS.filter(item => item.section === currentSection)
  }, [currentSection])

  const currentItem = sectionItems[itemIndex]

  const getValue = (item: SettingItem): number | boolean | string => {
    const section = settings[item.section] as unknown as Record<string, number | boolean | string>
    return section[item.field]
  }

  const getDefaultValue = (item: SettingItem): number | boolean | string => {
    const section = DEFAULT_SETTINGS[item.section] as unknown as Record<string, number | boolean | string>
    return section[item.field]
  }

  const isModified = (item: SettingItem): boolean => {
    return getValue(item) !== getDefaultValue(item)
  }

  const updateValue = (item: SettingItem, newValue: number | boolean | string) => {
    const newSettings = {
      ...settings,
      [item.section]: {
        ...settings[item.section],
        [item.field]: newValue,
      },
    }
    setSettings(newSettings as ExtenoteSettings)
  }

  const handleSave = () => {
    try {
      saveSettings(settings)
      setMessage({ type: 'success', text: 'Settings saved' })
      setTimeout(() => setMessage(null), 2000)
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Save failed' })
    }
  }

  const handleReset = () => {
    if (currentSection === 'system') {
      // Reset all system sections
      resetSettingsSection('cache')
      resetSettingsSection('backup')
      resetSettingsSection('ftp')
      resetSettingsSection('editor')
      resetSettingsSection('api')
    } else {
      resetSettingsSection(currentSection)
    }
    setSettings(loadSettings())
    setMessage({ type: 'success', text: `${SECTIONS[sectionIndex].label} reset to defaults` })
    setTimeout(() => setMessage(null), 2000)
  }

  useInput((input, key) => {
    // Handle string editing mode
    if (editingString !== null) {
      if (key.return || key.escape) {
        if (key.return && currentItem) {
          updateValue(currentItem, editingString)
        }
        setEditingString(null)
        onInputModeChange?.(false)
        return
      }
      if (key.backspace || key.delete) {
        setEditingString(prev => (prev || '').slice(0, -1))
        return
      }
      if (input && !key.ctrl && !key.meta) {
        setEditingString(prev => (prev || '') + input)
        return
      }
      return
    }

    // Tab to cycle sections
    if (key.tab) {
      setSectionIndex(i => (i + 1) % SECTIONS.length)
      setItemIndex(0)
      return
    }

    // Up/Down to navigate items
    if (key.downArrow) {
      setItemIndex(i => Math.min(i + 1, sectionItems.length - 1))
      return
    }
    if (key.upArrow) {
      setItemIndex(i => Math.max(i - 1, 0))
      return
    }

    // Left/Right to adjust values
    if (currentItem && (key.leftArrow || key.rightArrow)) {
      const value = getValue(currentItem)

      if (currentItem.type === 'boolean') {
        updateValue(currentItem, !value)
        return
      }

      if (currentItem.type === 'number') {
        const step = currentItem.step || 1
        const min = currentItem.min ?? 0
        const max = currentItem.max ?? Infinity
        const numValue = value as number
        const newValue = key.rightArrow
          ? Math.min(numValue + step, max)
          : Math.max(numValue - step, min)
        updateValue(currentItem, Math.round(newValue * 1000) / 1000) // Handle float precision
        return
      }

      if (currentItem.type === 'string') {
        setEditingString(value as string)
        onInputModeChange?.(true)
        return
      }
    }

    // Enter to edit string or toggle boolean
    if (key.return && currentItem) {
      if (currentItem.type === 'string') {
        setEditingString(getValue(currentItem) as string)
        onInputModeChange?.(true)
      } else if (currentItem.type === 'boolean') {
        updateValue(currentItem, !getValue(currentItem))
      }
      return
    }

    // Save
    if (input === 's') {
      handleSave()
      return
    }

    // Reset section
    if (input === 'r') {
      handleReset()
      return
    }
  })

  return (
    <Box flexDirection="column">
      {/* Section tabs */}
      <Box borderStyle="round" borderColor="cyan" paddingX={1} marginBottom={1}>
        <Text bold color="cyan">Settings</Text>
        <Text>  </Text>
        {SECTIONS.map((section, idx) => (
          <React.Fragment key={section.id}>
            <Text
              color={idx === sectionIndex ? 'cyan' : undefined}
              bold={idx === sectionIndex}
            >
              [{section.label}]
            </Text>
            <Text> </Text>
          </React.Fragment>
        ))}
        <Text dimColor>Tab to switch</Text>
      </Box>

      {/* Settings list */}
      <Box flexDirection="column" marginLeft={1}>
        {sectionItems.map((item, idx) => {
          const value = getValue(item)
          const modified = isModified(item)
          const isActive = idx === itemIndex

          return (
            <Box key={item.key}>
              <Text color={isActive ? 'cyan' : undefined}>
                {isActive ? '> ' : '  '}
              </Text>
              <Text
                color={isActive ? 'cyan' : undefined}
                bold={isActive}
              >
                {item.label.padEnd(22)}
              </Text>
              <Text> </Text>
              {item.type === 'boolean' ? (
                <Text color={value ? 'green' : 'red'}>
                  {value ? 'ON' : 'OFF'}
                </Text>
              ) : item.type === 'string' && editingString !== null && isActive ? (
                <Text color="yellow">{editingString}_</Text>
              ) : (
                <Text color={modified ? 'yellow' : undefined}>
                  {typeof value === 'number' && value % 1 !== 0
                    ? value.toFixed(3)
                    : String(value)}
                </Text>
              )}
              {modified && <Text color="magenta"> *</Text>}
            </Box>
          )
        })}
      </Box>

      {/* Current item description */}
      {currentItem && (
        <Box marginTop={1} marginLeft={1}>
          <Text dimColor>{currentItem.description}</Text>
        </Box>
      )}

      {/* Message */}
      {message && (
        <Box marginTop={1} marginLeft={1}>
          <Text color={message.type === 'success' ? 'green' : 'red'}>
            {message.text}
          </Text>
        </Box>
      )}

      {/* Controls */}
      <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
        <Text dimColor>
          [Tab] section  [Up/Down] navigate  [Left/Right] adjust  [s] save  [r] reset section
        </Text>
      </Box>
    </Box>
  )
}
