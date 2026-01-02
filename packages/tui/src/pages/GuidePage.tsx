import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import SelectInput from 'ink-select-input'
import type { VaultState, LoadedSchema } from '@extenote/core'
import { listProjects } from '../util/projects.js'

interface Props {
  vault: VaultState
}

export function GuidePage({ vault }: Props) {
  const [selectedProject, setSelectedProject] = useState<string | null>(null)
  const [highlightedIndex, setHighlightedIndex] = useState(0)

  const projects = listProjects(vault.objects, vault.config.projectProfiles).sort()

  // Manual arrow key handling since SelectInput's focus system may not work
  useInput((input, key) => {
    if (!selectedProject) {
      if (key.downArrow) {
        setHighlightedIndex(i => Math.min(i + 1, projects.length - 1))
      }
      if (key.upArrow) {
        setHighlightedIndex(i => Math.max(i - 1, 0))
      }
      if (key.return) {
        setSelectedProject(projects[highlightedIndex] || null)
      }
    } else {
      // In detail view, Enter goes back
      if (key.return) {
        setSelectedProject(null)
        setHighlightedIndex(0)
      }
    }
  })

  // Group schemas by project
  const schemasByProject = new Map<string, LoadedSchema[]>()
  for (const schema of vault.schemas) {
    for (const project of schema.projects ?? []) {
      if (!schemasByProject.has(project)) {
        schemasByProject.set(project, [])
      }
      schemasByProject.get(project)!.push(schema)
    }
  }

  if (!selectedProject) {
    const items = projects.map(p => ({
      label: `${p} (${schemasByProject.get(p)?.length || 0} schemas)`,
      value: p
    }))

    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold>Select a project to see suggested commands:</Text>
        </Box>
        {items.length > 0 ? (
          <Box flexDirection="column">
            {items.map((item, index) => (
              <Text key={item.value} color={index === highlightedIndex ? 'cyan' : undefined}>
                {index === highlightedIndex ? '❯ ' : '  '}{item.label}
              </Text>
            ))}
          </Box>
        ) : (
          <Text dimColor>No projects found</Text>
        )}
        <Box marginTop={1}>
          <Text dimColor>Use ↑↓ arrows to navigate, Enter to select</Text>
        </Box>
      </Box>
    )
  }

  const projectSchemas = schemasByProject.get(selectedProject) || []
  const profile = vault.config.projectProfiles?.find(p => p.name === selectedProject)
  const defaultVisibility = profile?.defaultVisibility ?? vault.config.defaultVisibility ?? 'private'

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Commands for </Text>
        <Text bold color="cyan">{selectedProject}</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text bold underline color="green">Create commands:</Text>
        {projectSchemas.slice(0, 8).map(schema => {
          const subdir = schema.subdirectory && schema.subdirectory !== '.' ? schema.subdirectory : schema.name
          return (
            <Box key={schema.name} flexDirection="column">
              <Text dimColor>bun run cli -- create {schema.name} {'<slug>'} \</Text>
              <Text dimColor>  --title "Title" --visibility {defaultVisibility}</Text>
            </Box>
          )
        })}
        {projectSchemas.length > 8 && (
          <Text dimColor>... and {projectSchemas.length - 8} more schemas</Text>
        )}
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text bold underline color="green">Export commands:</Text>
        <Text dimColor>bun run cli -- export-project {selectedProject} --format json</Text>
        <Text dimColor>bun run cli -- export-project {selectedProject} --format markdown</Text>
        <Text dimColor>bun run cli -- export-project {selectedProject} --format bibtex --detect-citations</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text bold underline color="green">Other commands:</Text>
        <Text dimColor>bun run cli -- lint --fix</Text>
        <Text dimColor>bun run cli -- issues --limit 50</Text>
        <Text dimColor>bun run cli -- status</Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Press Enter to go back to project list</Text>
      </Box>
    </Box>
  )
}
