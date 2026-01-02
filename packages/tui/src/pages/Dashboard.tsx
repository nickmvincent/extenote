import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import type { VaultState } from '@extenote/core'
import { listProjects, countObjectsByProject } from '../util/projects.js'
import { countIssueSeverities, countObjectTypes, countVisibility } from '../util/stats.js'

interface Props {
  vault: VaultState
  onSelectProject?: (project: string) => void
}

export function Dashboard({ vault, onSelectProject }: Props) {
  const projects = listProjects(vault.objects, vault.config.projectProfiles).sort()
  const projectCounts = countObjectsByProject(vault.objects)
  
  const typeCounts = countObjectTypes(vault.objects)
  const visibilityCounts = countVisibility(vault.objects)
  const issueSeverityCounts = countIssueSeverities(vault.issues)

  const [selectedIndex, setSelectedIndex] = useState(0)

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex(i => Math.max(0, i - 1))
    }
    if (key.downArrow) {
      setSelectedIndex(i => Math.min(projects.length - 1, i + 1))
    }
    if (key.return && projects[selectedIndex] && onSelectProject) {
      onSelectProject(projects[selectedIndex])
    }
  })

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Vault Summary</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text color="cyan">Total Objects: </Text>
          <Text bold>{vault.objects.length}</Text>
        </Box>
        <Box>
          <Text color="cyan">Projects: </Text>
          <Text bold>{projects.length}</Text>
        </Box>
        <Box>
          <Text color="cyan">Issues: </Text>
          <Text bold>{vault.issues.length}</Text>
          <Text dimColor> (</Text>
          <Text color="red">{issueSeverityCounts.error}err</Text>
          <Text dimColor> </Text>
          <Text color="yellow">{issueSeverityCounts.warn}warn</Text>
          <Text dimColor> </Text>
          <Text color="blue">{issueSeverityCounts.info}info</Text>
          <Text dimColor>)</Text>
        </Box>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text bold underline>Projects: <Text dimColor>(↑↓ navigate, Enter to browse)</Text></Text>
        {projects.map((project: string, idx: number) => (
          <Box key={project}>
            <Text color={idx === selectedIndex ? 'cyan' : undefined}>
              {idx === selectedIndex ? '❯ ' : '  '}
            </Text>
            <Text color={idx === selectedIndex ? 'cyan' : 'green'}>{project}</Text>
            <Text dimColor> ({projectCounts.get(project) || 0})</Text>
          </Box>
        ))}
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text bold underline>Types:</Text>
        {Object.entries(typeCounts).slice(0, 8).map(([type, count]) => (
          <Box key={type}>
            <Text>  {type}: </Text>
            <Text bold>{count}</Text>
          </Box>
        ))}
        {Object.keys(typeCounts).length > 8 && (
          <Text dimColor>  ... and {Object.keys(typeCounts).length - 8} more</Text>
        )}
      </Box>

      <Box flexDirection="column">
        <Text bold underline>Visibility:</Text>
        {Object.entries(visibilityCounts).map(([vis, count]) => (
          <Box key={vis}>
            <Text>  {vis}: </Text>
            <Text bold>{count}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  )
}
