import React, { useState, useMemo, useEffect } from 'react'
import { Box, Text, useInput } from 'ink'
import type { VaultState, VaultObject } from '@extenote/core'
import { spawn } from 'child_process'

interface Props {
  vault: VaultState
  projectFilter: string | null
  onInputModeChange: (active: boolean) => void
}

type View = 'list' | 'detail'

export function ObjectsPage({ vault, projectFilter, onInputModeChange }: Props) {
  const [search, setSearch] = useState('')
  const [view, setView] = useState<View>('list')
  const [selectedObject, setSelectedObject] = useState<VaultObject | null>(null)
  const [page, setPage] = useState(0)
  const [searchFocused, setSearchFocused] = useState(false)
  const [listIndex, setListIndex] = useState(0)
  const [detailIndex, setDetailIndex] = useState(0)
  const pageSize = 12

  // Enable input mode only when search is focused
  useEffect(() => {
    onInputModeChange(searchFocused)
    return () => onInputModeChange(false)
  }, [searchFocused, onInputModeChange])

  const filteredObjects = useMemo(() => {
    let objects = vault.objects

    // Apply project filter if set
    if (projectFilter) {
      const profile = vault.config.projectProfiles?.find(p => p.name === projectFilter)
      const includes = profile?.includes ?? []
      objects = objects.filter(o => {
        // Direct ownership or included via project includes
        return o.project === projectFilter || includes.includes(o.project)
      })
    }

    // Apply search filter
    if (search.trim()) {
      const query = search.toLowerCase()
      objects = objects.filter(o =>
        o.id.toLowerCase().includes(query) ||
        o.title?.toLowerCase().includes(query) ||
        o.type.toLowerCase().includes(query) ||
        o.relativePath.toLowerCase().includes(query)
      )
    }

    return objects
  }, [vault.objects, search, projectFilter])

  const totalPages = Math.ceil(filteredObjects.length / pageSize) || 1
  const pageObjects = filteredObjects.slice(page * pageSize, (page + 1) * pageSize)

  const detailItems = [
    { label: 'Open in editor', value: 'open' },
    { label: '← Back to list', value: 'back' }
  ]

  const openInEditor = (obj: VaultObject) => {
    const editor = process.env.EDITOR || 'code'
    spawn(editor, [obj.filePath], { detached: true, stdio: 'ignore' }).unref()
  }

  useInput((input, key) => {
    if (view === 'list') {
      // Tab or / to toggle search focus (/ only when not in search mode)
      if (key.tab || (!searchFocused && input === '/')) {
        setSearchFocused(f => !f)
        return
      }
      // Escape exits search mode
      if (key.escape && searchFocused) {
        setSearchFocused(false)
        return
      }

      if (searchFocused) {
        // Manual text input handling
        if (key.backspace || key.delete) {
          setSearch(s => s.slice(0, -1))
        } else if (input && !key.ctrl && !key.meta) {
          setSearch(s => s + input)
        }
        // Reset list index when search changes
        setListIndex(0)
        setPage(0)
      } else {
        // Arrow navigation in list
        if (key.downArrow) setListIndex(i => Math.min(i + 1, pageObjects.length - 1))
        if (key.upArrow) setListIndex(i => Math.max(i - 1, 0))
        if (key.return && pageObjects[listIndex]) {
          setSelectedObject(pageObjects[listIndex])
          setView('detail')
          setDetailIndex(0)
        }
        // Pagination
        if (input === 'n') {
          setPage(p => Math.min(p + 1, totalPages - 1))
          setListIndex(0)
        }
        if (input === 'p' && page > 0) {
          setPage(p => p - 1)
          setListIndex(0)
        }
      }
    } else if (view === 'detail') {
      if (key.downArrow) setDetailIndex(i => Math.min(i + 1, detailItems.length - 1))
      if (key.upArrow) setDetailIndex(i => Math.max(i - 1, 0))
      if (key.return) {
        if (detailItems[detailIndex].value === 'open' && selectedObject) {
          openInEditor(selectedObject)
        } else {
          setView('list')
          setSelectedObject(null)
        }
      }
      if (key.escape) {
        setView('list')
        setSelectedObject(null)
      }
    }
  })

  if (view === 'detail' && selectedObject) {
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold color="cyan">{selectedObject.title || selectedObject.id}</Text>
        </Box>

        <Box flexDirection="column" marginBottom={1}>
          <Text>Type: <Text color="green">{selectedObject.type}</Text></Text>
          <Text>ID: <Text dimColor>{selectedObject.id}</Text></Text>
          <Text>Visibility: <Text color={selectedObject.visibility === 'public' ? 'green' : 'yellow'}>{selectedObject.visibility}</Text></Text>
          <Text>Source: <Text dimColor>{selectedObject.sourceId}</Text></Text>
        </Box>

        <Box flexDirection="column" marginBottom={1}>
          <Text bold underline>Path:</Text>
          <Text dimColor>{selectedObject.filePath}</Text>
        </Box>

        <Box flexDirection="column" marginBottom={1}>
          <Text bold underline>Frontmatter:</Text>
          {Object.entries(selectedObject.frontmatter).slice(0, 10).map(([key, value]) => (
            <Text key={key} dimColor>
              {key}: {typeof value === 'string' ? value.slice(0, 50) : JSON.stringify(value).slice(0, 50)}
            </Text>
          ))}
        </Box>

        <Box flexDirection="column">
          {detailItems.map((item, index) => (
            <Text key={item.value} color={index === detailIndex ? 'cyan' : undefined}>
              {index === detailIndex ? '❯ ' : '  '}{item.label}
            </Text>
          ))}
        </Box>
        <Box marginTop={1}>
          <Text dimColor>↑↓ navigate, Enter select, Escape back</Text>
        </Box>
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Objects </Text>
        <Text dimColor>({filteredObjects.length} of {vault.objects.length})</Text>
        {projectFilter && <Text color="cyan"> [{projectFilter}]</Text>}
      </Box>

      <Box marginBottom={1}>
        <Text>Search: </Text>
        {searchFocused ? (
          <>
            <Text color="cyan">{search}</Text>
            <Text color="cyan">▋</Text>
          </>
        ) : (
          <>
            <Text dimColor>{search || 'Type to filter...'}</Text>
            <Text dimColor> (press / or Tab to search)</Text>
          </>
        )}
      </Box>

      {pageObjects.length > 0 ? (
        <Box flexDirection="column">
          <Box flexDirection="column">
            {pageObjects.map((o, index) => (
              <Text key={o.id} color={index === listIndex && !searchFocused ? 'cyan' : undefined}>
                {index === listIndex && !searchFocused ? '❯ ' : '  '}{o.title || o.id} [{o.type}]
              </Text>
            ))}
          </Box>

          <Box marginTop={1}>
            <Text dimColor>
              {filteredObjects.length > pageSize ? (
                `Showing ${page * pageSize + 1}-${Math.min((page + 1) * pageSize, filteredObjects.length)} of ${filteredObjects.length}`
              ) : (
                `${filteredObjects.length} object${filteredObjects.length === 1 ? '' : 's'}`
              )}
              {totalPages > 1 && ` | Page ${page + 1}/${totalPages} • [n]ext [p]rev`}
            </Text>
          </Box>
          <Box marginTop={1}>
            <Text dimColor>↑↓ navigate, Enter select{searchFocused ? ', Escape exit search' : ''}</Text>
          </Box>
        </Box>
      ) : (
        <Text dimColor>No objects match your search.</Text>
      )}
    </Box>
  )
}
