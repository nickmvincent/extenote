import type { VaultObject } from '@extenote/core'

export interface ProjectProfile {
  name: string
  sourceIds?: string[]
  includes?: string[]
}

/**
 * Get the project name for a vault object.
 * Objects now have a direct `project` property set during vault loading.
 */
export function getObjectProject(object: VaultObject): string {
  return object.project || 'unknown'
}

/**
 * Check if an object belongs to a target project (directly or via includes).
 */
export function objectBelongsToProject(
  object: VaultObject,
  targetProject: string,
  projectProfiles?: ProjectProfile[]
): boolean {
  // Direct ownership
  if (object.project === targetProject) return true

  // Check if target project includes object's project
  const profile = projectProfiles?.find(p => p.name === targetProject)
  return profile?.includes?.includes(object.project) ?? false
}

/**
 * Build the list of project names to display: prefer explicit projectProfiles, otherwise
 * derive from objects present in the vault.
 */
export function listProjects(objects: VaultObject[], projectProfiles?: ProjectProfile[]): string[] {
  if (projectProfiles?.length) {
    const names = projectProfiles.map((p) => p.name)
    const extras = new Set(
      objects
        .map((obj) => getObjectProject(obj))
        .filter((name) => name && name !== 'unknown' && !names.includes(name))
    )
    return [...names, ...Array.from(extras)]
  }
  return Array.from(new Set(objects.map((obj) => getObjectProject(obj)))).filter(name => name !== 'unknown')
}

/**
 * Count objects per project.
 */
export function countObjectsByProject(objects: VaultObject[]): Map<string, number> {
  const counts = new Map<string, number>()

  for (const obj of objects) {
    const project = getObjectProject(obj)
    counts.set(project, (counts.get(project) || 0) + 1)
  }

  return counts
}
