import React, { useState, useEffect, useCallback } from 'react'
import { Box, Text, useInput, useApp } from 'ink'
import { loadVault, type VaultState } from '@extenote/core'
import { Dashboard } from './pages/Dashboard.js'
import { Issues } from './pages/Issues.js'
import { CreatePage } from './pages/CreatePage.js'
import { ExportPage } from './pages/ExportPage.js'
import { LintPage } from './pages/LintPage.js'
import { GuidePage } from './pages/GuidePage.js'
import { ObjectsPage } from './pages/ObjectsPage.js'
import { SettingsPage } from './pages/SettingsPage.js'
import { listProjects } from './util/projects.js'

type Page = 'dashboard' | 'issues' | 'create' | 'export' | 'lint' | 'guide' | 'objects' | 'settings'

interface AppState {
  vault: VaultState | null
  loading: boolean
  error: string | null
}

export function App() {
  const [page, setPage] = useState<Page>('dashboard')
  const [state, setState] = useState<AppState>({ vault: null, loading: true, error: null })
  const [showHelp, setShowHelp] = useState(false)
  const [projectFilter, setProjectFilter] = useState<string | null>(null)
  const [projectFilterIdx, setProjectFilterIdx] = useState(0)
  const [watchMode, setWatchMode] = useState(false)
  const [inputMode, setInputMode] = useState(false)
  const { exit } = useApp()

  const loadData = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }))
    try {
      const cwd = process.cwd()
      const vault = await loadVault({ cwd })
      setState({ vault, loading: false, error: null })
    } catch (err) {
      setState({
        vault: null,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load vault'
      })
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Watch mode: auto-reload every 3 seconds
  useEffect(() => {
    if (!watchMode) return
    const interval = setInterval(() => {
      loadData()
    }, 3000)
    return () => clearInterval(interval)
  }, [watchMode, loadData])

  const projects = state.vault
    ? listProjects(state.vault.objects, state.vault.config.projectProfiles).sort()
    : []

  useInput((input, key) => {
    // Help overlay toggle (always available)
    if (input === '?') {
      setShowHelp(h => !h)
      return
    }

    // Close help with any key
    if (showHelp) {
      setShowHelp(false)
      return
    }

    // Escape exits input mode or goes to dashboard
    if (key.escape) {
      if (inputMode) {
        setInputMode(false)
      } else {
        setPage('dashboard')
      }
      return
    }

    // Skip navigation shortcuts when in input mode (typing in TextInput)
    if (inputMode) {
      return
    }

    if (input === 'q') {
      exit()
    }
    if (input === 'r') {
      loadData()
    }
    if (input === 'h') {
      setPage('dashboard')
    }

    // Project filter toggle
    if (input === 'f') {
      if (projects.length > 0) {
        if (projectFilter === null) {
          setProjectFilter(projects[0])
          setProjectFilterIdx(0)
        } else {
          const nextIdx = (projectFilterIdx + 1) % (projects.length + 1)
          if (nextIdx === projects.length) {
            setProjectFilter(null)
          } else {
            setProjectFilter(projects[nextIdx])
            setProjectFilterIdx(nextIdx)
          }
        }
      }
    }

    // Watch mode toggle
    if (input === 'w') {
      setWatchMode(w => !w)
    }

    // Page navigation
    if (input === 'd') setPage('dashboard')
    if (input === 'i') setPage('issues')
    if (input === 'c') setPage('create')
    if (input === 'e') setPage('export')
    if (input === 'l') setPage('lint')
    if (input === 'g') setPage('guide')
    if (input === 'o') setPage('objects')
    if (input === 's') setPage('settings')
  })

  if (state.loading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">Loading vault...</Text>
      </Box>
    )
  }

  if (state.error || !state.vault) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">Error: {state.error || 'No vault data'}</Text>
        <Text dimColor>Press 'r' to reload, 'q' to quit</Text>
      </Box>
    )
  }

  // Help overlay
  if (showHelp) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box borderStyle="round" borderColor="cyan" padding={1} flexDirection="column">
          <Text bold color="cyan">Keyboard Shortcuts</Text>
          <Box marginTop={1} flexDirection="column">
            <Text><Text bold>d</Text> - Dashboard</Text>
            <Text><Text bold>i</Text> - Issues</Text>
            <Text><Text bold>c</Text> - Create object</Text>
            <Text><Text bold>e</Text> - Export</Text>
            <Text><Text bold>l</Text> - Lint</Text>
            <Text><Text bold>o</Text> - Objects browser</Text>
            <Text><Text bold>g</Text> - Guide</Text>
            <Text><Text bold>s</Text> - Settings</Text>
            <Box marginTop={1} />
            <Text><Text bold>f</Text> - Cycle project filter</Text>
            <Text><Text bold>w</Text> - Toggle watch mode (auto-reload)</Text>
            <Text><Text bold>r</Text> - Reload vault</Text>
            <Text><Text bold>ESC</Text> - Exit search / go to dashboard</Text>
            <Text><Text bold>q</Text> - Quit</Text>
            <Text><Text bold>?</Text> - Toggle this help</Text>
          </Box>
        </Box>
        <Box marginTop={1}><Text dimColor>Press any key to close</Text></Box>
      </Box>
    )
  }

  const errorCount = state.vault.issues.filter(i => i.severity === 'error').length
  const warnCount = state.vault.issues.filter(i => i.severity === 'warn').length

  return (
    <Box flexDirection="column" padding={1}>
      <Header page={page} errorCount={errorCount} warnCount={warnCount} projectFilter={projectFilter} watchMode={watchMode} inputMode={inputMode} />
      <Box marginTop={1}>
        {page === 'dashboard' && <Dashboard vault={state.vault} onSelectProject={(project) => {
          setProjectFilter(project)
          setPage('objects')
        }} />}
        {page === 'issues' && <Issues vault={state.vault} />}
        {page === 'create' && <CreatePage vault={state.vault} onInputModeChange={setInputMode} />}
        {page === 'export' && <ExportPage vault={state.vault} />}
        {page === 'lint' && <LintPage vault={state.vault} onReload={loadData} />}
        {page === 'guide' && <GuidePage vault={state.vault} />}
        {page === 'objects' && <ObjectsPage vault={state.vault} projectFilter={projectFilter} onInputModeChange={setInputMode} />}
        {page === 'settings' && <SettingsPage onInputModeChange={setInputMode} />}
      </Box>
      <Footer />
    </Box>
  )
}

interface HeaderProps {
  page: Page
  errorCount: number
  warnCount: number
  projectFilter: string | null
  watchMode: boolean
  inputMode: boolean
}

function Header({ page, errorCount, warnCount, projectFilter, watchMode, inputMode }: HeaderProps) {
  return (
    <Box borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text bold color="cyan">Extenote</Text>
      <Text> </Text>
      <Text>{page.charAt(0).toUpperCase() + page.slice(1)}</Text>
      {projectFilter && (
        <>
          <Text> </Text>
          <Text color="magenta">[{projectFilter}]</Text>
        </>
      )}
      {watchMode && <Text color="green"> [watching]</Text>}
      {inputMode && <Text color="yellow"> [typing - ESC to exit]</Text>}
      <Text>  </Text>
      {errorCount > 0 && <Text color="red" bold>{errorCount}E </Text>}
      {warnCount > 0 && <Text color="yellow">{warnCount}W </Text>}
      {errorCount === 0 && warnCount === 0 && <Text color="green">✓ </Text>}
      <Text dimColor>[?] help</Text>
    </Box>
  )
}

function Footer() {
  return (
    <Box borderStyle="single" borderColor="gray" marginTop={1} paddingX={1}>
      <Text dimColor>
        [d]ash [i]ssues [c]reate [e]xport [l]int [o]bjects [s]ettings | [g]uide | [f]ilter [r]eload [q]uit
      </Text>
    </Box>
  )
}
