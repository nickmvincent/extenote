import type {
  VaultState,
  ExtenoteConfig,
  LoadedSchema,
  VaultObject,
  VaultIssue
} from '@extenote/core'
import { API_ROUTES } from './routes'

export interface VaultData {
  vault: VaultState
  config: ExtenoteConfig
  schemas: LoadedSchema[]
}

export interface VaultStats {
  totalObjects: number
  totalIssues: number
  projects: string[]
  projectCounts: Record<string, number>
  typeCounts: Record<string, number>
  visibilityCounts: Record<string, number>
  issueSeverityCounts: { error: number; warn: number; info: number }
}

export async function loadVaultData(): Promise<VaultData> {
  try {
    const response = await fetch(API_ROUTES.VAULT)

    if (!response.ok) {
      const text = await response.text()
      console.error('API error response:', text)
      throw new Error(`Failed to load vault: ${response.statusText} - ${text.substring(0, 200)}`)
    }

    const contentType = response.headers.get('content-type')
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text()
      console.error('Non-JSON response:', text)
      throw new Error(`API returned non-JSON response (${contentType}): ${text.substring(0, 200)}`)
    }

    return response.json()
  } catch (err) {
    console.error('Failed to load vault data:', err)
    throw err
  }
}

export function getVaultStats(vault: VaultState): VaultStats {
  const projects = new Set<string>()
  const projectCounts: Record<string, number> = {}
  const typeCounts: Record<string, number> = {}
  const visibilityCounts: Record<string, number> = {}
  const issueSeverityCounts = { error: 0, warn: 0, info: 0 }

  for (const obj of vault.objects) {
    for (const project of getObjectProjects(obj)) {
      projects.add(project)
      projectCounts[project] = (projectCounts[project] || 0) + 1
    }

    typeCounts[obj.type] = (typeCounts[obj.type] || 0) + 1
    visibilityCounts[obj.visibility] = (visibilityCounts[obj.visibility] || 0) + 1
  }

  for (const issue of vault.issues) {
    issueSeverityCounts[issue.severity]++
  }

  return {
    totalObjects: vault.objects.length,
    totalIssues: vault.issues.length,
    projects: Array.from(projects).sort(),
    projectCounts,
    typeCounts,
    visibilityCounts,
    issueSeverityCounts
  }
}

export function getProjectObjects(vault: VaultState, targetProject: string): VaultObject[] {
  const profile = vault.config.projectProfiles?.find(p => p.name === targetProject)
  const includes = profile?.includes ?? []

  return vault.objects.filter(obj => {
    // Direct ownership
    if (obj.project === targetProject) return true
    // Included via project includes
    return includes.includes(obj.project)
  })
}

export function getObjectIssues(vault: VaultState, objectPath: string): VaultIssue[] {
  return vault.issues.filter(issue => issue.filePath === objectPath)
}

function getObjectProjects(object: VaultObject): string[] {
  // Objects now belong to exactly one project
  return object.project ? [object.project] : ['unknown']
}

// Cross-reference types
export type LinkType = 'wikilink' | 'citation'

export interface ResolvedLink {
  targetId: string
  displayText?: string
  context?: string
  linkType: LinkType
  resolved: {
    id: string
    title?: string
    path: string
    type: string
  } | null
}

export interface Backlink {
  sourceId: string
  sourceTitle?: string
  sourcePath: string
  context?: string
  linkType?: LinkType
}

export interface CrossRefs {
  id: string
  outgoingLinks: ResolvedLink[]
  backlinks: Backlink[]
}

export interface GraphNode {
  id: string
  title: string
  type: string
  project: string
  path: string
  linkCount: number
}

export interface ProjectGraphNode {
  id: string
  title: string
  objectCount: number
}

export interface GraphEdge {
  source: string
  target: string
  weight?: number
  directed?: boolean
}

export type GraphType = 'project-deps' | 'tag-explorer' | 'objects-by-project' | 'tag-cooccurrence'

export interface ProjectGraph {
  type: 'project-deps'
  nodes: ProjectGraphNode[]
  edges: GraphEdge[]
}

export interface TypedObjectGraph {
  type: 'objects-by-project' | 'tag-cooccurrence'
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export type GraphData = ProjectGraph | TypedObjectGraph

export interface ObjectGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export async function loadCrossRefs(objectPath: string): Promise<CrossRefs> {
  const response = await fetch(API_ROUTES.CROSSREFS(objectPath))

  if (!response.ok) {
    throw new Error(`Failed to load cross-refs: ${response.statusText}`)
  }

  return response.json()
}

export async function loadGraph(type: GraphType = 'project-deps'): Promise<GraphData> {
  const response = await fetch(API_ROUTES.GRAPH(type))

  if (!response.ok) {
    throw new Error(`Failed to load graph: ${response.statusText}`)
  }

  return response.json()
}

// Tag Explorer types
export interface TagExplorerObject {
  relativePath: string
  title: string
  type: string
}

export interface TagExplorerNode {
  name: string
  fullPath: string
  count: number
  children: TagExplorerNode[]
  objects: TagExplorerObject[]
}

export interface TagExplorerTree {
  roots: TagExplorerNode[]
  totalTags: number
  totalTaggedObjects: number
}

export async function loadTagExplorer(): Promise<TagExplorerTree> {
  const response = await fetch(API_ROUTES.GRAPH_TAG_EXPLORER)

  if (!response.ok) {
    throw new Error(`Failed to load tag explorer: ${response.statusText}`)
  }

  return response.json()
}

// Tag Taxonomy Graph types
export interface TagTaxonomyNode {
  id: string
  label: string
  type: 'broad' | 'specific'
  description?: string
  objectCount: number
}

export interface TagTaxonomyEdge {
  source: string
  target: string
  directed: boolean
}

export interface TagTaxonomyGraph {
  type: 'tag-taxonomy'
  nodes: TagTaxonomyNode[]
  edges: TagTaxonomyEdge[]
}

export async function loadTagTaxonomyGraph(): Promise<TagTaxonomyGraph> {
  const response = await fetch(API_ROUTES.GRAPH_TAG_TAXONOMY)

  if (!response.ok) {
    throw new Error(`Failed to load tag taxonomy graph: ${response.statusText}`)
  }

  return response.json()
}
