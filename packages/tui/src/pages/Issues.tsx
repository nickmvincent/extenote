import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import type { VaultState, VaultIssue } from '@extenote/core'
import { spawn } from 'child_process'

interface Props {
  vault: VaultState
}

type Filter = 'all' | 'error' | 'warn' | 'info'
type View = 'list' | 'detail'

export function Issues({ vault }: Props) {
  const [filter, setFilter] = useState<Filter>('all')
  const [page, setPage] = useState(0)
  const [view, setView] = useState<View>('list')
  const [selectedIssue, setSelectedIssue] = useState<VaultIssue | null>(null)
  const [listIndex, setListIndex] = useState(0)
  const [detailIndex, setDetailIndex] = useState(0)
  const pageSize = 10

  const issues = vault.issues
    .filter(issue => filter === 'all' || issue.severity === filter)
    .sort((a, b) => {
      const weight = { error: 3, warn: 2, info: 1 }
      return weight[b.severity] - weight[a.severity]
    })

  const paginatedIssues = issues.slice(page * pageSize, (page + 1) * pageSize)
  const totalPages = Math.ceil(issues.length / pageSize) || 1

  useInput((input, key) => {
    if (view === 'list') {
      // Filter shortcuts
      if (input === '1') setFilter('all')
      if (input === '2') setFilter('error')
      if (input === '3') setFilter('warn')
      if (input === '4') setFilter('info')
      // Pagination
      if (input === 'n') {
        setPage(p => Math.min(p + 1, totalPages - 1))
        setListIndex(0)
      }
      if (input === 'p' && page > 0) {
        setPage(p => p - 1)
        setListIndex(0)
      }
      // Arrow navigation
      if (key.downArrow) setListIndex(i => Math.min(i + 1, paginatedIssues.length - 1))
      if (key.upArrow) setListIndex(i => Math.max(i - 1, 0))
      if (key.return && paginatedIssues[listIndex]) {
        setSelectedIssue(paginatedIssues[listIndex])
        setView('detail')
        setDetailIndex(0)
      }
    } else if (view === 'detail') {
      if (key.downArrow) setDetailIndex(i => Math.min(i + 1, 1))
      if (key.upArrow) setDetailIndex(i => Math.max(i - 1, 0))
      if (key.return) {
        if (detailIndex === 0) {
          // Open in editor
          if (selectedIssue) openInEditor(selectedIssue.filePath)
        } else {
          // Back to list
          setView('list')
          setSelectedIssue(null)
        }
      }
      if (key.escape) {
        setView('list')
        setSelectedIssue(null)
      }
    }
  })

  const openInEditor = (filePath: string) => {
    const editor = process.env.EDITOR || 'code'
    spawn(editor, [filePath], { detached: true, stdio: 'ignore' }).unref()
  }

  const severityColor = (severity: string) => {
    switch (severity) {
      case 'error': return 'red'
      case 'warn': return 'yellow'
      default: return 'blue'
    }
  }

  if (view === 'detail' && selectedIssue) {
    const detailItems = [
      { label: 'Open in editor', value: 'open' },
      { label: '← Back to list', value: 'back' }
    ]

    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold color={severityColor(selectedIssue.severity)}>
            {selectedIssue.severity.toUpperCase()}
          </Text>
          <Text bold> Issue Details</Text>
        </Box>

        <Box flexDirection="column" marginBottom={1}>
          <Box>
            <Text color="cyan">Message: </Text>
            <Text>{selectedIssue.message}</Text>
          </Box>
          {selectedIssue.field && (
            <Box>
              <Text color="cyan">Field: </Text>
              <Text>{selectedIssue.field}</Text>
            </Box>
          )}
          {selectedIssue.rule && (
            <Box>
              <Text color="cyan">Rule: </Text>
              <Text>{selectedIssue.rule}</Text>
            </Box>
          )}
          <Box>
            <Text color="cyan">Source: </Text>
            <Text dimColor>{selectedIssue.sourceId}</Text>
          </Box>
        </Box>

        <Box flexDirection="column" marginBottom={1}>
          <Text bold underline>File Path:</Text>
          <Text dimColor>{selectedIssue.filePath}</Text>
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

  const errorCount = vault.issues.filter(i => i.severity === 'error').length
  const warnCount = vault.issues.filter(i => i.severity === 'warn').length
  const infoCount = vault.issues.filter(i => i.severity === 'info').length

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text>Filter: </Text>
        <Text color={filter === 'all' ? 'cyan' : 'gray'}>[1]All({vault.issues.length}) </Text>
        <Text color={filter === 'error' ? 'red' : 'gray'} bold={errorCount > 0}>[2]Error({errorCount}) </Text>
        <Text color={filter === 'warn' ? 'yellow' : 'gray'}>[3]Warn({warnCount}) </Text>
        <Text color={filter === 'info' ? 'blue' : 'gray'}>[4]Info({infoCount})</Text>
      </Box>

      {issues.length === 0 ? (
        <Box>
          <Text color="green">✓ No {filter === 'all' ? '' : filter + ' '}issues</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          <Box flexDirection="column">
            {paginatedIssues.map((issue, idx) => {
              const fileName = issue.filePath.split('/').pop() || issue.filePath
              const isSelected = idx === listIndex
              return (
                <Text key={`${issue.filePath}-${idx}`} color={isSelected ? 'cyan' : undefined}>
                  {isSelected ? '❯ ' : '  '}
                  <Text color={severityColor(issue.severity)}>{issue.severity.toUpperCase().padEnd(5)}</Text>
                  {' '}{fileName.slice(0, 25).padEnd(25)} {issue.message.slice(0, 40)}
                </Text>
              )
            })}
          </Box>

          <Box marginTop={1}>
            <Text dimColor>
              {issues.length > pageSize ? (
                `Showing ${page * pageSize + 1}-${Math.min((page + 1) * pageSize, issues.length)} of ${issues.length}`
              ) : (
                `${issues.length} issue${issues.length === 1 ? '' : 's'}`
              )}
              {totalPages > 1 && ` | Page ${page + 1}/${totalPages} | [n]ext [p]rev`}
            </Text>
          </Box>
          <Box marginTop={1}>
            <Text dimColor>↑↓ navigate, Enter select</Text>
          </Box>
        </Box>
      )}
    </Box>
  )
}
