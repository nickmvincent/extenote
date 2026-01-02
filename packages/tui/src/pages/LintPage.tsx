import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { lintObjects, type VaultState, type VaultIssue } from '@extenote/core'

interface Props {
  vault: VaultState
  onReload: () => void
}

type Step = 'overview' | 'fixing' | 'done'

export function LintPage({ vault, onReload }: Props) {
  const [step, setStep] = useState<Step>('overview')
  const [fixResult, setFixResult] = useState<{ fixed: number; errors: string[] }>({ fixed: 0, errors: [] })
  const [actionIndex, setActionIndex] = useState(0)

  // Get lint-specific issues (those with rule field)
  const lintIssues = vault.issues.filter(i => i.rule || i.message.includes('Visibility'))
  const fixableCount = lintIssues.filter(i =>
    i.message.includes('Visibility') || i.message.includes('visibility')
  ).length

  const actionItems = [
    { label: `Fix all ${fixableCount} auto-fixable issues`, value: 'fix' },
    { label: 'Cancel', value: 'cancel' }
  ]

  const handleFix = async () => {
    setStep('fixing')
    try {
      const result = await lintObjects(vault.objects, vault.config, { fix: true })
      setFixResult({ fixed: result.updatedFiles.length, errors: [] })
      setStep('done')
      if (result.updatedFiles.length > 0) {
        onReload()
      }
    } catch (err) {
      setFixResult({
        fixed: 0,
        errors: [err instanceof Error ? err.message : 'Unknown error']
      })
      setStep('done')
    }
  }

  useInput((input, key) => {
    if (step === 'overview' && fixableCount > 0) {
      if (key.downArrow) setActionIndex(i => Math.min(i + 1, actionItems.length - 1))
      if (key.upArrow) setActionIndex(i => Math.max(i - 1, 0))
      if (key.return) {
        if (actionItems[actionIndex].value === 'fix') {
          handleFix()
        } else {
          setStep('overview')
        }
      }
    } else if (step === 'done' && input === 'l') {
      setStep('overview')
      setFixResult({ fixed: 0, errors: [] })
      setActionIndex(0)
      onReload()
    }
  })

  if (step === 'fixing') {
    return (
      <Box flexDirection="column">
        <Text color="cyan">Fixing lint issues...</Text>
      </Box>
    )
  }

  if (step === 'done') {
    return (
      <Box flexDirection="column">
        {fixResult.errors.length > 0 ? (
          <Text color="red">Error: {fixResult.errors[0]}</Text>
        ) : (
          <Text color="green">✔ Fixed {fixResult.fixed} files</Text>
        )}
        <Box marginTop={1}>
          <Text dimColor>Press [l] to refresh, [d] for dashboard</Text>
        </Box>
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Lint Summary</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text color="cyan">Total lint issues: </Text>
          <Text bold>{lintIssues.length}</Text>
        </Box>
        <Box>
          <Text color="cyan">Auto-fixable: </Text>
          <Text bold color="green">{fixableCount}</Text>
        </Box>
      </Box>

      {lintIssues.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold underline>Issues by rule:</Text>
          {Object.entries(groupByRule(lintIssues)).map(([rule, issues]) => (
            <Box key={rule}>
              <Text>• </Text>
              <Text color="yellow">{rule || 'validation'}</Text>
              <Text dimColor>: {issues.length}</Text>
            </Box>
          ))}
        </Box>
      )}

      {fixableCount > 0 ? (
        <Box flexDirection="column">
          <Text bold>Actions:</Text>
          <Box flexDirection="column" marginTop={1}>
            {actionItems.map((item, index) => (
              <Text key={item.value} color={index === actionIndex ? 'cyan' : undefined}>
                {index === actionIndex ? '❯ ' : '  '}{item.label}
              </Text>
            ))}
          </Box>
          <Box marginTop={1}>
            <Text dimColor>↑↓ navigate, Enter select</Text>
          </Box>
        </Box>
      ) : (
        <Text color="green">✔ No auto-fixable issues</Text>
      )}
    </Box>
  )
}

function groupByRule(issues: VaultIssue[]): Record<string, VaultIssue[]> {
  const groups: Record<string, VaultIssue[]> = {}
  for (const issue of issues) {
    const rule = issue.rule || 'validation'
    if (!groups[rule]) groups[rule] = []
    groups[rule].push(issue)
  }
  return groups
}
