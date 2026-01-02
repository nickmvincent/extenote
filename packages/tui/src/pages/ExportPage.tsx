import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import type { VaultState } from '@extenote/core'
import { spawn } from 'child_process'
import { listProjects, countObjectsByProject } from '../util/projects.js'

interface Props {
  vault: VaultState
}

type Step = 'select-project' | 'select-format' | 'confirm' | 'done'

export function ExportPage({ vault }: Props) {
  const [step, setStep] = useState<Step>('select-project')
  const [project, setProject] = useState('')
  const [format, setFormat] = useState<'json' | 'markdown' | 'html' | 'atproto'>('json')
  const [result, setResult] = useState('')
  const [projectIndex, setProjectIndex] = useState(0)
  const [formatIndex, setFormatIndex] = useState(0)
  const [confirmIndex, setConfirmIndex] = useState(0)

  const projects: string[] = listProjects(vault.objects, vault.config.projectProfiles).sort()
  const projectCounts = countObjectsByProject(vault.objects)

  const projectItems = projects.map((p: string) => ({
    label: `${p} (${projectCounts.get(p) || 0} objects)`,
    value: p
  }))

  const formatItems = [
    { label: 'JSON', value: 'json' as const },
    { label: 'Markdown', value: 'markdown' as const },
    { label: 'HTML', value: 'html' as const },
    { label: 'ATProto', value: 'atproto' as const }
  ]

  const confirmItems = [
    { label: 'Export', value: 'export' },
    { label: 'Cancel', value: 'cancel' }
  ]

  const handleExport = () => {
    const args = ['run', 'cli', '--', 'export-project', project, '--format', format]

    const proc = spawn('bun', args, { stdio: 'inherit' })
    proc.on('close', (code) => {
      setResult(code === 0 ? 'Exported successfully!' : 'Export failed')
      setStep('done')
    })
  }

  const resetForm = () => {
    setStep('select-project')
    setProject('')
    setFormat('json')
    setResult('')
    setProjectIndex(0)
    setFormatIndex(0)
    setConfirmIndex(0)
  }

  useInput((input, key) => {
    if (step === 'select-project') {
      if (key.downArrow) setProjectIndex(i => Math.min(i + 1, projectItems.length - 1))
      if (key.upArrow) setProjectIndex(i => Math.max(i - 1, 0))
      if (key.return && projectItems[projectIndex]) {
        setProject(projectItems[projectIndex].value)
        setStep('select-format')
      }
    } else if (step === 'select-format') {
      if (key.downArrow) setFormatIndex(i => Math.min(i + 1, formatItems.length - 1))
      if (key.upArrow) setFormatIndex(i => Math.max(i - 1, 0))
      if (key.return) {
        setFormat(formatItems[formatIndex].value)
        setStep('confirm')
      }
      if (key.escape) {
        setStep('select-project')
      }
    } else if (step === 'confirm') {
      if (key.downArrow) setConfirmIndex(i => Math.min(i + 1, confirmItems.length - 1))
      if (key.upArrow) setConfirmIndex(i => Math.max(i - 1, 0))
      if (key.return) {
        if (confirmItems[confirmIndex].value === 'export') {
          handleExport()
        } else {
          resetForm()
        }
      }
      if (key.escape) {
        setStep('select-format')
      }
    } else if (step === 'done' && input === 'e') {
      resetForm()
    }
  })

  if (step === 'select-project') {
    return (
      <Box flexDirection="column">
        <Text bold>Select Project to Export:</Text>
        <Box flexDirection="column" marginTop={1}>
          {projectItems.map((item, index) => (
            <Text key={item.value} color={index === projectIndex ? 'cyan' : undefined}>
              {index === projectIndex ? '❯ ' : '  '}{item.label}
            </Text>
          ))}
        </Box>
        <Box marginTop={1}>
          <Text dimColor>↑↓ navigate, Enter select</Text>
        </Box>
      </Box>
    )
  }

  if (step === 'select-format') {
    return (
      <Box flexDirection="column">
        <Text bold>Select Export Format:</Text>
        <Box flexDirection="column" marginTop={1}>
          {formatItems.map((item, index) => (
            <Text key={item.value} color={index === formatIndex ? 'cyan' : undefined}>
              {index === formatIndex ? '❯ ' : '  '}{item.label}
            </Text>
          ))}
        </Box>
        <Box marginTop={1}>
          <Text dimColor>↑↓ navigate, Enter select, Escape back</Text>
        </Box>
      </Box>
    )
  }

  if (step === 'confirm') {
    return (
      <Box flexDirection="column">
        <Text bold>Confirm Export:</Text>
        <Box marginY={1} flexDirection="column">
          <Text>Project: <Text color="cyan">{project}</Text></Text>
          <Text>Format: <Text color="cyan">{format}</Text></Text>
          <Text>Output: <Text dimColor>dist/export/{project}/{format}</Text></Text>
        </Box>
        <Box flexDirection="column">
          {confirmItems.map((item, index) => (
            <Text key={item.value} color={index === confirmIndex ? 'cyan' : undefined}>
              {index === confirmIndex ? '❯ ' : '  '}{item.label}
            </Text>
          ))}
        </Box>
        <Box marginTop={1}>
          <Text dimColor>↑↓ navigate, Enter select, Escape back</Text>
        </Box>
      </Box>
    )
  }

  if (step === 'done') {
    return (
      <Box flexDirection="column">
        <Text color={result.includes('success') ? 'green' : 'red'}>{result}</Text>
        <Box marginTop={1}>
          <Text dimColor>Press [e] to export another, [h] to go home</Text>
        </Box>
      </Box>
    )
  }

  return null
}
