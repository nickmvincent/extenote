import type { VaultIssue } from '@extenote/core'

export interface IssueSeverityCounts {
  error: number
  warn: number
  info: number
}

export function countIssueSeverities(issues: VaultIssue[]): IssueSeverityCounts {
  const counts = { error: 0, warn: 0, info: 0 }
  for (const issue of issues) {
    if (issue.severity in counts) {
      counts[issue.severity]++
    }
  }
  return counts
}

export function countObjectTypes(objects: { type: string }[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const obj of objects) {
    counts[obj.type] = (counts[obj.type] || 0) + 1
  }
  return counts
}

export function countVisibility(objects: { visibility: string }[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const obj of objects) {
    counts[obj.visibility] = (counts[obj.visibility] || 0) + 1
  }
  return counts
}
