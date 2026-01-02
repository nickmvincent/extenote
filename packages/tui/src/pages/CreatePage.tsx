import React, { useState, useEffect } from 'react'
import { Box, Text, useInput } from 'ink'
import type { VaultState } from '@extenote/core'
import { spawn } from 'child_process'

interface Props {
  vault: VaultState
  onInputModeChange: (active: boolean) => void
}

type Step = 'select-schema' | 'input-slug' | 'input-title' | 'select-visibility' | 'confirm' | 'done'

export function CreatePage({ vault, onInputModeChange }: Props) {
  const [step, setStep] = useState<Step>('select-schema')
  const [schema, setSchema] = useState('')
  const [slug, setSlug] = useState('')
  const [title, setTitle] = useState('')
  const [visibility, setVisibility] = useState('private')
  const [result, setResult] = useState('')
  const [schemaIndex, setSchemaIndex] = useState(0)
  const [visibilityIndex, setVisibilityIndex] = useState(0)
  const [confirmIndex, setConfirmIndex] = useState(0)

  const schemaItems = vault.schemas.map(s => ({
    label: s.name + (s.description ? ` - ${s.description}` : ''),
    value: s.name
  }))

  const visibilityItems = [
    { label: 'private', value: 'private' },
    { label: 'public', value: 'public' },
    { label: 'unlisted', value: 'unlisted' }
  ]

  const confirmItems = [
    { label: 'Create', value: 'create' },
    { label: 'Cancel', value: 'cancel' }
  ]

  // Enable input mode when in text input steps
  useEffect(() => {
    const isInputStep = step === 'input-slug' || step === 'input-title'
    onInputModeChange(isInputStep)
    return () => onInputModeChange(false)
  }, [step, onInputModeChange])

  const handleCreate = () => {
    const args = ['run', 'cli', '--', 'create', schema, slug]
    if (title) args.push('--title', title)
    args.push('--visibility', visibility)

    const proc = spawn('bun', args, { stdio: 'inherit' })
    proc.on('close', (code) => {
      setResult(code === 0 ? 'Created successfully!' : 'Failed to create')
      setStep('done')
    })
  }

  const resetForm = () => {
    setStep('select-schema')
    setSchema('')
    setSlug('')
    setTitle('')
    setVisibility('private')
    setResult('')
    setSchemaIndex(0)
    setVisibilityIndex(0)
    setConfirmIndex(0)
  }

  useInput((input, key) => {
    if (step === 'select-schema') {
      if (key.downArrow) setSchemaIndex(i => Math.min(i + 1, schemaItems.length - 1))
      if (key.upArrow) setSchemaIndex(i => Math.max(i - 1, 0))
      if (key.return && schemaItems[schemaIndex]) {
        setSchema(schemaItems[schemaIndex].value)
        setStep('input-slug')
      }
    } else if (step === 'input-slug') {
      if (key.backspace || key.delete) {
        setSlug(s => s.slice(0, -1))
      } else if (key.return) {
        setStep('input-title')
      } else if (input && !key.ctrl && !key.meta) {
        setSlug(s => s + input)
      }
    } else if (step === 'input-title') {
      if (key.backspace || key.delete) {
        setTitle(s => s.slice(0, -1))
      } else if (key.return) {
        setStep('select-visibility')
      } else if (input && !key.ctrl && !key.meta) {
        setTitle(s => s + input)
      }
    } else if (step === 'select-visibility') {
      if (key.downArrow) setVisibilityIndex(i => Math.min(i + 1, visibilityItems.length - 1))
      if (key.upArrow) setVisibilityIndex(i => Math.max(i - 1, 0))
      if (key.return) {
        setVisibility(visibilityItems[visibilityIndex].value)
        setStep('confirm')
      }
    } else if (step === 'confirm') {
      if (key.downArrow) setConfirmIndex(i => Math.min(i + 1, confirmItems.length - 1))
      if (key.upArrow) setConfirmIndex(i => Math.max(i - 1, 0))
      if (key.return) {
        if (confirmItems[confirmIndex].value === 'create') {
          handleCreate()
        } else {
          resetForm()
        }
      }
    } else if (step === 'done' && input === 'c') {
      resetForm()
    }
  })

  if (step === 'select-schema') {
    return (
      <Box flexDirection="column">
        <Text bold>Select Schema:</Text>
        <Box flexDirection="column" marginTop={1}>
          {schemaItems.map((item, index) => (
            <Text key={item.value} color={index === schemaIndex ? 'cyan' : undefined}>
              {index === schemaIndex ? '❯ ' : '  '}{item.label}
            </Text>
          ))}
        </Box>
        <Box marginTop={1}>
          <Text dimColor>↑↓ navigate, Enter select</Text>
        </Box>
      </Box>
    )
  }

  if (step === 'input-slug') {
    return (
      <Box flexDirection="column">
        <Text bold>Slug (filename):</Text>
        <Box>
          <Text color="cyan">{slug}</Text>
          <Text color="cyan">▋</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Type slug, Enter to continue</Text>
        </Box>
      </Box>
    )
  }

  if (step === 'input-title') {
    return (
      <Box flexDirection="column">
        <Text bold>Title (optional, press Enter to skip):</Text>
        <Box>
          <Text color="cyan">{title}</Text>
          <Text color="cyan">▋</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Type title, Enter to continue</Text>
        </Box>
      </Box>
    )
  }

  if (step === 'select-visibility') {
    return (
      <Box flexDirection="column">
        <Text bold>Select Visibility:</Text>
        <Box flexDirection="column" marginTop={1}>
          {visibilityItems.map((item, index) => (
            <Text key={item.value} color={index === visibilityIndex ? 'cyan' : undefined}>
              {index === visibilityIndex ? '❯ ' : '  '}{item.label}
            </Text>
          ))}
        </Box>
        <Box marginTop={1}>
          <Text dimColor>↑↓ navigate, Enter select</Text>
        </Box>
      </Box>
    )
  }

  if (step === 'confirm') {
    return (
      <Box flexDirection="column">
        <Text bold>Confirm Creation:</Text>
        <Box marginY={1} flexDirection="column">
          <Text>Schema: <Text color="cyan">{schema}</Text></Text>
          <Text>Slug: <Text color="cyan">{slug}</Text></Text>
          {title && <Text>Title: <Text color="cyan">{title}</Text></Text>}
          <Text>Visibility: <Text color="cyan">{visibility}</Text></Text>
        </Box>
        <Box flexDirection="column">
          {confirmItems.map((item, index) => (
            <Text key={item.value} color={index === confirmIndex ? 'cyan' : undefined}>
              {index === confirmIndex ? '❯ ' : '  '}{item.label}
            </Text>
          ))}
        </Box>
        <Box marginTop={1}>
          <Text dimColor>↑↓ navigate, Enter select</Text>
        </Box>
      </Box>
    )
  }

  if (step === 'done') {
    return (
      <Box flexDirection="column">
        <Text color={result.includes('success') ? 'green' : 'red'}>{result}</Text>
        <Box marginTop={1}>
          <Text dimColor>Press [c] to create another, [h] to go home</Text>
        </Box>
      </Box>
    )
  }

  return null
}
