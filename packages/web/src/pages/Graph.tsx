import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { loadGraph, loadTagExplorer, loadTagTaxonomyGraph, type GraphData, type ProjectGraphNode, type TagExplorerTree, type TagExplorerNode, type TagExplorerObject, type TagTaxonomyGraph, type TagTaxonomyNode } from '../api/vault'
import { useSettings } from '../hooks/useSettings'

interface NodePosition {
  x: number
  y: number
  vx: number
  vy: number
  fx: number | null
  fy: number | null
}

interface Transform {
  x: number
  y: number
  scale: number
}

type TabType = 'project-deps' | 'tag-taxonomy' | 'tag-explorer'

const GRAPH_TABS: { type: TabType; label: string; description: string }[] = [
  {
    type: 'project-deps',
    label: 'Project Dependencies',
    description: 'Projects connected by includes relationships',
  },
  {
    type: 'tag-taxonomy',
    label: 'Tag Taxonomy',
    description: 'Broad tags connected to their specific tags',
  },
  {
    type: 'tag-explorer',
    label: 'Tag Explorer',
    description: 'Browse objects organized by tag hierarchy',
  },
]

// Type colors for object badges
const typeColors: Record<string, string> = {
  paper: '#3b82f6',
  dataset: '#10b981',
  project: '#f59e0b',
  note: '#8b5cf6',
  blog: '#ec4899',
  bibtex_entry: '#3b82f6',
  default: '#6b7280'
}

export function Graph() {
  const navigate = useNavigate()
  const { settings } = useSettings()
  const [activeTab, setActiveTab] = useState<TabType>('project-deps')

  // Project graph state
  const [graph, setGraph] = useState<GraphData | null>(null)
  const [positions, setPositions] = useState<Map<string, NodePosition>>(new Map())
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: 1 })
  const [draggingNode, setDraggingNode] = useState<string | null>(null)
  const [isPanning, setIsPanning] = useState(false)
  const [isSimulating, setIsSimulating] = useState(true)
  const [showLabels, setShowLabels] = useState(true)

  // Tag explorer state
  const [tagTree, setTagTree] = useState<TagExplorerTree | null>(null)
  const [expandedTags, setExpandedTags] = useState<Set<string>>(new Set())
  const [expandedObjects, setExpandedObjects] = useState<Set<string>>(new Set())
  const [tagSearchQuery, setTagSearchQuery] = useState('')

  // Tag taxonomy graph state
  const [taxonomyGraph, setTaxonomyGraph] = useState<TagTaxonomyGraph | null>(null)
  const [taxonomyPositions, setTaxonomyPositions] = useState<Map<string, NodePosition>>(new Map())
  const [taxonomyHoveredNode, setTaxonomyHoveredNode] = useState<string | null>(null)
  const [taxonomyTransform, setTaxonomyTransform] = useState<Transform>({ x: 0, y: 0, scale: 1 })
  const [taxonomyDraggingNode, setTaxonomyDraggingNode] = useState<string | null>(null)
  const [taxonomyIsPanning, setTaxonomyIsPanning] = useState(false)
  const [taxonomyIsSimulating, setTaxonomyIsSimulating] = useState(true)

  // Shared state
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const animationRef = useRef<number | null>(null)
  const lastMousePos = useRef({ x: 0, y: 0 })
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })

  // Load data when tab changes
  useEffect(() => {
    setLoading(true)
    setError(null)

    if (activeTab === 'project-deps') {
      loadGraph('project-deps')
        .then((data) => {
          setGraph(data)
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false))
    } else if (activeTab === 'tag-taxonomy') {
      loadTagTaxonomyGraph()
        .then((data) => {
          setTaxonomyGraph(data)
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false))
    } else if (activeTab === 'tag-explorer') {
      loadTagExplorer()
        .then((data) => {
          setTagTree(data)
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false))
    }
  }, [activeTab])

  // Update dimensions on resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight
        })
      }
    }

    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [])

  // Initialize positions when graph loads
  useEffect(() => {
    if (!graph || activeTab !== 'project-deps') return

    const newPositions = new Map<string, NodePosition>()
    const centerX = dimensions.width / 2
    const centerY = dimensions.height / 2

    graph.nodes.forEach((node, i) => {
      const angle = (i / graph.nodes.length) * 2 * Math.PI
      const radius = Math.min(dimensions.width, dimensions.height) * 0.3
      newPositions.set(node.id, {
        x: centerX + Math.cos(angle) * radius + (Math.random() - 0.5) * 50,
        y: centerY + Math.sin(angle) * radius + (Math.random() - 0.5) * 50,
        vx: 0,
        vy: 0,
        fx: null,
        fy: null
      })
    })

    setPositions(newPositions)
    setIsSimulating(true)
    setTransform({ x: 0, y: 0, scale: 1 })
  }, [graph, dimensions.width, dimensions.height, activeTab])

  // Initialize positions when taxonomy graph loads
  useEffect(() => {
    if (!taxonomyGraph || activeTab !== 'tag-taxonomy') return

    const newPositions = new Map<string, NodePosition>()
    const centerX = dimensions.width / 2
    const centerY = dimensions.height / 2

    taxonomyGraph.nodes.forEach((node, i) => {
      const angle = (i / taxonomyGraph.nodes.length) * 2 * Math.PI
      const radius = Math.min(dimensions.width, dimensions.height) * 0.3
      newPositions.set(node.id, {
        x: centerX + Math.cos(angle) * radius + (Math.random() - 0.5) * 50,
        y: centerY + Math.sin(angle) * radius + (Math.random() - 0.5) * 50,
        vx: 0,
        vy: 0,
        fx: null,
        fy: null
      })
    })

    setTaxonomyPositions(newPositions)
    setTaxonomyIsSimulating(true)
    setTaxonomyTransform({ x: 0, y: 0, scale: 1 })
  }, [taxonomyGraph, dimensions.width, dimensions.height, activeTab])

  // Force simulation
  const runSimulation = useCallback(() => {
    if (!graph || !isSimulating || activeTab !== 'project-deps') return

    setPositions((prev) => {
      if (prev.size === 0) return prev
      const newPositions = new Map(prev)
      const centerX = dimensions.width / 2
      const centerY = dimensions.height / 2

      // Use settings with fallback defaults
      const repulsionStrength = settings?.graph.repulsionStrength ?? 8000
      const attractionStrength = settings?.graph.attractionStrength ?? 0.01
      const centeringStrength = settings?.graph.centeringStrength ?? 0.003
      const damping = settings?.graph.damping ?? 0.85
      const minVelocity = settings?.graph.minVelocity ?? 0.1

      let totalMovement = 0

      // Build adjacency
      const adjacency = new Map<string, Set<string>>()
      for (const edge of graph.edges) {
        if (!adjacency.has(edge.source)) adjacency.set(edge.source, new Set())
        if (!adjacency.has(edge.target)) adjacency.set(edge.target, new Set())
        adjacency.get(edge.source)!.add(edge.target)
        adjacency.get(edge.target)!.add(edge.source)
      }

      for (const [id, pos] of newPositions) {
        if (pos.fx !== null && pos.fy !== null) {
          pos.x = pos.fx
          pos.y = pos.fy
          pos.vx = 0
          pos.vy = 0
          continue
        }

        let fx = 0
        let fy = 0

        // Repulsion
        for (const [otherId, otherPos] of newPositions) {
          if (id === otherId) continue
          const dx = pos.x - otherPos.x
          const dy = pos.y - otherPos.y
          const distSq = dx * dx + dy * dy
          const dist = Math.sqrt(distSq) || 1
          const force = repulsionStrength / distSq
          fx += (dx / dist) * force
          fy += (dy / dist) * force
        }

        // Attraction
        const neighbors = adjacency.get(id)
        if (neighbors) {
          for (const otherId of neighbors) {
            const otherPos = newPositions.get(otherId)
            if (otherPos) {
              const dx = otherPos.x - pos.x
              const dy = otherPos.y - pos.y
              fx += dx * attractionStrength
              fy += dy * attractionStrength
            }
          }
        }

        // Centering
        fx += (centerX - pos.x) * centeringStrength
        fy += (centerY - pos.y) * centeringStrength

        pos.vx = (pos.vx + fx) * damping
        pos.vy = (pos.vy + fy) * damping
        pos.x += pos.vx
        pos.y += pos.vy

        totalMovement += Math.abs(pos.vx) + Math.abs(pos.vy)
      }

      const avgMovement = totalMovement / newPositions.size
      if (avgMovement < minVelocity && !draggingNode) {
        setIsSimulating(false)
      }

      return newPositions
    })

    animationRef.current = requestAnimationFrame(runSimulation)
  }, [graph, dimensions, isSimulating, draggingNode, activeTab, settings])

  useEffect(() => {
    if (isSimulating && positions.size > 0 && activeTab === 'project-deps') {
      animationRef.current = requestAnimationFrame(runSimulation)
    }
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [runSimulation, isSimulating, positions.size, activeTab])

  // Taxonomy graph force simulation
  const runTaxonomySimulation = useCallback(() => {
    if (!taxonomyGraph || !taxonomyIsSimulating || activeTab !== 'tag-taxonomy') return

    setTaxonomyPositions((prev) => {
      if (prev.size === 0) return prev
      const newPositions = new Map(prev)
      const centerX = dimensions.width / 2
      const centerY = dimensions.height / 2

      // Use settings with fallback defaults (slightly different defaults for taxonomy graph)
      const repulsionStrength = (settings?.graph.repulsionStrength ?? 8000) * 0.625 // 5000 default
      const attractionStrength = (settings?.graph.attractionStrength ?? 0.01) * 2 // 0.02 default
      const centeringStrength = (settings?.graph.centeringStrength ?? 0.003) * 1.67 // 0.005 default
      const damping = settings?.graph.damping ?? 0.85
      const minVelocity = settings?.graph.minVelocity ?? 0.1

      let totalMovement = 0

      // Build adjacency
      const adjacency = new Map<string, Set<string>>()
      for (const edge of taxonomyGraph.edges) {
        if (!adjacency.has(edge.source)) adjacency.set(edge.source, new Set())
        if (!adjacency.has(edge.target)) adjacency.set(edge.target, new Set())
        adjacency.get(edge.source)!.add(edge.target)
        adjacency.get(edge.target)!.add(edge.source)
      }

      for (const [id, pos] of newPositions) {
        if (pos.fx !== null && pos.fy !== null) {
          pos.x = pos.fx
          pos.y = pos.fy
          pos.vx = 0
          pos.vy = 0
          continue
        }

        let fx = 0
        let fy = 0

        // Repulsion
        for (const [otherId, otherPos] of newPositions) {
          if (id === otherId) continue
          const dx = pos.x - otherPos.x
          const dy = pos.y - otherPos.y
          const distSq = dx * dx + dy * dy
          const dist = Math.sqrt(distSq) || 1
          const force = repulsionStrength / distSq
          fx += (dx / dist) * force
          fy += (dy / dist) * force
        }

        // Attraction
        const neighbors = adjacency.get(id)
        if (neighbors) {
          for (const otherId of neighbors) {
            const otherPos = newPositions.get(otherId)
            if (otherPos) {
              const dx = otherPos.x - pos.x
              const dy = otherPos.y - pos.y
              fx += dx * attractionStrength
              fy += dy * attractionStrength
            }
          }
        }

        // Centering
        fx += (centerX - pos.x) * centeringStrength
        fy += (centerY - pos.y) * centeringStrength

        pos.vx = (pos.vx + fx) * damping
        pos.vy = (pos.vy + fy) * damping
        pos.x += pos.vx
        pos.y += pos.vy

        totalMovement += Math.abs(pos.vx) + Math.abs(pos.vy)
      }

      const avgMovement = totalMovement / newPositions.size
      if (avgMovement < minVelocity && !taxonomyDraggingNode) {
        setTaxonomyIsSimulating(false)
      }

      return newPositions
    })

    animationRef.current = requestAnimationFrame(runTaxonomySimulation)
  }, [taxonomyGraph, dimensions, taxonomyIsSimulating, taxonomyDraggingNode, activeTab, settings])

  useEffect(() => {
    if (taxonomyIsSimulating && taxonomyPositions.size > 0 && activeTab === 'tag-taxonomy') {
      animationRef.current = requestAnimationFrame(runTaxonomySimulation)
    }
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [runTaxonomySimulation, taxonomyIsSimulating, taxonomyPositions.size, activeTab])

  const screenToGraph = useCallback((screenX: number, screenY: number) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return { x: screenX, y: screenY }
    return {
      x: (screenX - rect.left - transform.x) / transform.scale,
      y: (screenY - rect.top - transform.y) / transform.scale
    }
  }, [transform])

  const handleMouseDown = useCallback((e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation()
    setDraggingNode(nodeId)
    const pos = screenToGraph(e.clientX, e.clientY)
    lastMousePos.current = pos

    setPositions(prev => {
      const newPositions = new Map(prev)
      const nodePos = newPositions.get(nodeId)
      if (nodePos) {
        nodePos.fx = nodePos.x
        nodePos.fy = nodePos.y
      }
      return newPositions
    })
    setIsSimulating(true)
  }, [screenToGraph])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const pos = screenToGraph(e.clientX, e.clientY)

    if (draggingNode) {
      setPositions(prev => {
        const newPositions = new Map(prev)
        const nodePos = newPositions.get(draggingNode)
        if (nodePos) {
          nodePos.fx = pos.x
          nodePos.fy = pos.y
          nodePos.x = pos.x
          nodePos.y = pos.y
        }
        return newPositions
      })
    } else if (isPanning) {
      const dx = e.clientX - lastMousePos.current.x
      const dy = e.clientY - lastMousePos.current.y
      lastMousePos.current = { x: e.clientX, y: e.clientY }
      setTransform(t => ({ ...t, x: t.x + dx, y: t.y + dy }))
    }
  }, [draggingNode, isPanning, screenToGraph])

  const handleMouseUp = useCallback(() => {
    if (draggingNode) {
      setPositions(prev => {
        const newPositions = new Map(prev)
        const nodePos = newPositions.get(draggingNode)
        if (nodePos) {
          nodePos.fx = null
          nodePos.fy = null
        }
        return newPositions
      })
      setDraggingNode(null)
    }
    setIsPanning(false)
  }, [draggingNode])

  const handleBackgroundMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.target === svgRef.current || (e.target as Element).tagName === 'svg') {
      setIsPanning(true)
      lastMousePos.current = { x: e.clientX, y: e.clientY }
    }
  }, [])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return

    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    const newScale = Math.max(0.1, Math.min(4, transform.scale * delta))

    setTransform(t => ({
      scale: newScale,
      x: mouseX - (mouseX - t.x) * (newScale / t.scale),
      y: mouseY - (mouseY - t.y) * (newScale / t.scale)
    }))
  }, [transform.scale])

  const resetView = useCallback(() => {
    setTransform({ x: 0, y: 0, scale: 1 })
  }, [])

  const reheat = useCallback(() => {
    setPositions(prev => {
      const newPositions = new Map(prev)
      for (const pos of newPositions.values()) {
        pos.vx = (Math.random() - 0.5) * 10
        pos.vy = (Math.random() - 0.5) * 10
      }
      return newPositions
    })
    setIsSimulating(true)
  }, [])

  const getNodeRadius = (node: ProjectGraphNode) => {
    return Math.min(15 + node.objectCount * 0.3, 40)
  }

  // Taxonomy graph handlers
  const screenToTaxonomyGraph = useCallback((screenX: number, screenY: number) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return { x: screenX, y: screenY }
    return {
      x: (screenX - rect.left - taxonomyTransform.x) / taxonomyTransform.scale,
      y: (screenY - rect.top - taxonomyTransform.y) / taxonomyTransform.scale
    }
  }, [taxonomyTransform])

  const handleTaxonomyMouseDown = useCallback((e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation()
    setTaxonomyDraggingNode(nodeId)
    const pos = screenToTaxonomyGraph(e.clientX, e.clientY)
    lastMousePos.current = pos

    setTaxonomyPositions(prev => {
      const newPositions = new Map(prev)
      const nodePos = newPositions.get(nodeId)
      if (nodePos) {
        nodePos.fx = nodePos.x
        nodePos.fy = nodePos.y
      }
      return newPositions
    })
    setTaxonomyIsSimulating(true)
  }, [screenToTaxonomyGraph])

  const handleTaxonomyMouseMove = useCallback((e: React.MouseEvent) => {
    const pos = screenToTaxonomyGraph(e.clientX, e.clientY)

    if (taxonomyDraggingNode) {
      setTaxonomyPositions(prev => {
        const newPositions = new Map(prev)
        const nodePos = newPositions.get(taxonomyDraggingNode)
        if (nodePos) {
          nodePos.fx = pos.x
          nodePos.fy = pos.y
          nodePos.x = pos.x
          nodePos.y = pos.y
        }
        return newPositions
      })
    } else if (taxonomyIsPanning) {
      const dx = e.clientX - lastMousePos.current.x
      const dy = e.clientY - lastMousePos.current.y
      lastMousePos.current = { x: e.clientX, y: e.clientY }
      setTaxonomyTransform(t => ({ ...t, x: t.x + dx, y: t.y + dy }))
    }
  }, [taxonomyDraggingNode, taxonomyIsPanning, screenToTaxonomyGraph])

  const handleTaxonomyMouseUp = useCallback(() => {
    if (taxonomyDraggingNode) {
      setTaxonomyPositions(prev => {
        const newPositions = new Map(prev)
        const nodePos = newPositions.get(taxonomyDraggingNode)
        if (nodePos) {
          nodePos.fx = null
          nodePos.fy = null
        }
        return newPositions
      })
      setTaxonomyDraggingNode(null)
    }
    setTaxonomyIsPanning(false)
  }, [taxonomyDraggingNode])

  const handleTaxonomyBackgroundMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.target === svgRef.current || (e.target as Element).tagName === 'svg') {
      setTaxonomyIsPanning(true)
      lastMousePos.current = { x: e.clientX, y: e.clientY }
    }
  }, [])

  const handleTaxonomyWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return

    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    const newScale = Math.max(0.1, Math.min(4, taxonomyTransform.scale * delta))

    setTaxonomyTransform(t => ({
      scale: newScale,
      x: mouseX - (mouseX - t.x) * (newScale / t.scale),
      y: mouseY - (mouseY - t.y) * (newScale / t.scale)
    }))
  }, [taxonomyTransform.scale])

  const resetTaxonomyView = useCallback(() => {
    setTaxonomyTransform({ x: 0, y: 0, scale: 1 })
  }, [])

  const reheatTaxonomy = useCallback(() => {
    setTaxonomyPositions(prev => {
      const newPositions = new Map(prev)
      for (const pos of newPositions.values()) {
        pos.vx = (Math.random() - 0.5) * 10
        pos.vy = (Math.random() - 0.5) * 10
      }
      return newPositions
    })
    setTaxonomyIsSimulating(true)
  }, [])

  const getTaxonomyNodeRadius = (node: TagTaxonomyNode) => {
    const baseSize = node.type === 'broad' ? 18 : 12
    return Math.min(baseSize + node.objectCount * 0.5, 35)
  }

  const getTaxonomyNodeColor = (node: TagTaxonomyNode) => {
    return node.type === 'broad' ? '#6366f1' : '#10b981'
  }

  // Tag Explorer: toggle tag expansion
  const toggleTagExpand = useCallback((tagPath: string) => {
    setExpandedTags(prev => {
      const next = new Set(prev)
      if (next.has(tagPath)) {
        next.delete(tagPath)
      } else {
        next.add(tagPath)
      }
      return next
    })
  }, [])

  // Tag Explorer: toggle objects within a tag
  const toggleObjectsExpand = useCallback((tagPath: string) => {
    setExpandedObjects(prev => {
      const next = new Set(prev)
      if (next.has(tagPath)) {
        next.delete(tagPath)
      } else {
        next.add(tagPath)
      }
      return next
    })
  }, [])

  // Tag Explorer: filter tags by search
  const filteredRoots = useMemo(() => {
    if (!tagTree || !tagSearchQuery) return tagTree?.roots ?? []
    const query = tagSearchQuery.toLowerCase()
    return tagTree.roots.filter(root => {
      if (root.name.toLowerCase().includes(query)) return true
      return root.children.some(child =>
        child.name.toLowerCase().includes(query) ||
        child.fullPath.toLowerCase().includes(query)
      )
    }).map(root => ({
      ...root,
      children: root.children.filter(child =>
        child.name.toLowerCase().includes(query) ||
        child.fullPath.toLowerCase().includes(query) ||
        root.name.toLowerCase().includes(query)
      )
    }))
  }, [tagTree, tagSearchQuery])

  // Render object item
  const renderObjectItem = (obj: TagExplorerObject) => {
    const color = typeColors[obj.type] || typeColors.default
    return (
      <button
        key={obj.relativePath}
        onClick={() => navigate(`/object/${encodeURIComponent(obj.relativePath)}`)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
      >
        <span
          className="flex-shrink-0 px-1.5 py-0.5 text-xs font-medium rounded"
          style={{ backgroundColor: `${color}20`, color }}
        >
          {obj.type}
        </span>
        <span className="truncate text-sm text-gray-700 dark:text-gray-300">
          {obj.title}
        </span>
      </button>
    )
  }

  // Render tag node recursively
  const renderTagNode = (node: TagExplorerNode, depth: number = 0) => {
    const hasChildren = node.children.length > 0
    const hasObjects = node.objects.length > 0
    const isExpanded = expandedTags.has(node.fullPath)
    const showObjects = expandedObjects.has(node.fullPath)

    return (
      <div key={node.fullPath} style={{ marginLeft: depth * 16 }}>
        <div className="flex items-center gap-1">
          {/* Expand/collapse for children */}
          {hasChildren ? (
            <button
              onClick={() => toggleTagExpand(node.fullPath)}
              className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              {isExpanded ? '▾' : '▸'}
            </button>
          ) : (
            <span className="w-5" />
          )}

          {/* Tag name and count */}
          <button
            onClick={() => hasObjects ? toggleObjectsExpand(node.fullPath) : (hasChildren && toggleTagExpand(node.fullPath))}
            className={`flex-1 flex items-center justify-between px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 ${
              showObjects ? 'bg-indigo-50 dark:bg-indigo-900/30' : ''
            }`}
          >
            <span className="font-medium text-gray-800 dark:text-gray-200">
              {node.name}
            </span>
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300">
              {node.count}
            </span>
          </button>
        </div>

        {/* Show objects when expanded */}
        {showObjects && hasObjects && (
          <div className="ml-6 mt-1 mb-2 pl-2 border-l-2 border-indigo-200 dark:border-indigo-800">
            {node.objects.map(renderObjectItem)}
          </div>
        )}

        {/* Show children when expanded */}
        {isExpanded && hasChildren && (
          <div className="mt-1">
            {node.children.map(child => renderTagNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-500 dark:text-gray-400">Loading...</div>
  }

  if (error) {
    return <div className="text-red-600 dark:text-red-400">Error: {error}</div>
  }

  return (
    <div className="px-4 sm:px-0 h-full flex flex-col">
      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 mb-4">
        {GRAPH_TABS.map((tab) => (
          <button
            key={tab.type}
            onClick={() => setActiveTab(tab.type)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab.type
                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
            title={tab.description}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Description */}
      <div className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        {GRAPH_TABS.find(t => t.type === activeTab)?.description}
      </div>

      {/* Project Dependencies Graph */}
      {activeTab === 'project-deps' && graph && (
        <>
          <div className="flex flex-wrap items-center gap-4 mb-4">
            <div className="flex-1" />
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <input
                type="checkbox"
                checked={showLabels}
                onChange={(e) => setShowLabels(e.target.checked)}
                className="rounded"
              />
              Labels
            </label>
            <button
              onClick={reheat}
              className="px-3 py-1 text-sm bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              Shake
            </button>
            <button
              onClick={resetView}
              className="px-3 py-1 text-sm bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              Reset View
            </button>
            <span className="text-xs text-gray-400">
              {Math.round(transform.scale * 100)}%
            </span>
          </div>

          <div className="flex items-center gap-3 mb-4">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {graph.nodes.length} nodes, {graph.edges.length} edges
              {!isSimulating && <span className="ml-2 text-green-600 dark:text-green-400">● stable</span>}
            </span>
          </div>

          {/* Graph container */}
          <div
            ref={containerRef}
            className="flex-1 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden cursor-grab active:cursor-grabbing"
            style={{ minHeight: '500px' }}
          >
            <svg
              ref={svgRef}
              width={dimensions.width}
              height={dimensions.height}
              onMouseDown={handleBackgroundMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onWheel={handleWheel}
              style={{ userSelect: 'none' }}
            >
              {/* Arrow marker for directed edges */}
              <defs>
                <marker
                  id="arrowhead"
                  markerWidth="10"
                  markerHeight="7"
                  refX="9"
                  refY="3.5"
                  orient="auto"
                >
                  <polygon points="0 0, 10 3.5, 0 7" fill="#94a3b8" />
                </marker>
                <marker
                  id="arrowhead-highlighted"
                  markerWidth="10"
                  markerHeight="7"
                  refX="9"
                  refY="3.5"
                  orient="auto"
                >
                  <polygon points="0 0, 10 3.5, 0 7" fill="#6366f1" />
                </marker>
              </defs>

              <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}>
                {/* Edges */}
                {graph.edges.map((edge, idx) => {
                  const source = positions.get(edge.source)
                  const target = positions.get(edge.target)
                  if (!source || !target) return null

                  const isHighlighted = hoveredNode === edge.source || hoveredNode === edge.target

                  // Shorten the line to not overlap with the target node
                  let x2 = target.x
                  let y2 = target.y
                  if (edge.directed) {
                    const dx = target.x - source.x
                    const dy = target.y - source.y
                    const dist = Math.sqrt(dx * dx + dy * dy) || 1
                    const targetNode = graph.nodes.find(n => n.id === edge.target) as ProjectGraphNode | undefined
                    const targetRadius = targetNode ? getNodeRadius(targetNode) : 10
                    x2 = target.x - (dx / dist) * (targetRadius + 5)
                    y2 = target.y - (dy / dist) * (targetRadius + 5)
                  }

                  return (
                    <line
                      key={idx}
                      x1={source.x}
                      y1={source.y}
                      x2={x2}
                      y2={y2}
                      stroke={isHighlighted ? '#6366f1' : '#94a3b8'}
                      strokeWidth={(isHighlighted ? 2 : 1) / transform.scale}
                      strokeOpacity={isHighlighted ? 1 : 0.4}
                      markerEnd={edge.directed ? (isHighlighted ? 'url(#arrowhead-highlighted)' : 'url(#arrowhead)') : undefined}
                    />
                  )
                })}

                {/* Nodes */}
                {(graph.nodes as ProjectGraphNode[]).map((node) => {
                  const pos = positions.get(node.id)
                  if (!pos) return null

                  const isHovered = hoveredNode === node.id
                  const isDragging = draggingNode === node.id
                  const baseRadius = getNodeRadius(node)
                  const radius = baseRadius / transform.scale

                  return (
                    <g key={node.id}>
                      <circle
                        cx={pos.x}
                        cy={pos.y}
                        r={radius}
                        fill="#6366f1"
                        stroke={isDragging ? '#f59e0b' : isHovered ? '#1f2937' : 'white'}
                        strokeWidth={(isDragging ? 3 : isHovered ? 2 : 1.5) / transform.scale}
                        className="cursor-pointer"
                        onMouseDown={(e) => handleMouseDown(e, node.id)}
                        onMouseEnter={() => setHoveredNode(node.id)}
                        onMouseLeave={() => setHoveredNode(null)}
                      />
                      {(showLabels || isHovered) && (
                        <text
                          x={pos.x}
                          y={pos.y - radius - 4 / transform.scale}
                          textAnchor="middle"
                          fontSize={13 / transform.scale}
                          className="fill-gray-700 dark:fill-gray-300 pointer-events-none"
                          fontWeight={isHovered ? 600 : 400}
                        >
                          {node.title.length > 25 ? node.title.slice(0, 25) + '…' : node.title}
                        </text>
                      )}
                    </g>
                  )
                })}
              </g>
            </svg>
          </div>

          {/* Hovered node info */}
          {hoveredNode && graph && (
            <div className="mt-3 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              {(() => {
                const node = graph.nodes.find(n => n.id === hoveredNode) as ProjectGraphNode | undefined
                if (!node) return null

                return (
                  <div className="flex items-center gap-3">
                    <div
                      className="w-4 h-4 rounded-full flex-shrink-0"
                      style={{ backgroundColor: '#6366f1' }}
                    />
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900 dark:text-white">{node.title}</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {node.objectCount} object{node.objectCount !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>
                )
              })()}
            </div>
          )}

          {/* Help text */}
          <div className="mt-2 text-xs text-gray-400 dark:text-gray-500">
            Drag nodes to reposition · Scroll to zoom · Drag background to pan
          </div>
        </>
      )}

      {/* Tag Taxonomy Graph */}
      {activeTab === 'tag-taxonomy' && taxonomyGraph && (
        <>
          <div className="flex flex-wrap items-center gap-4 mb-4">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#6366f1' }} />
                <span className="text-xs text-gray-600 dark:text-gray-400">broad</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#10b981' }} />
                <span className="text-xs text-gray-600 dark:text-gray-400">specific</span>
              </div>
            </div>
            <div className="flex-1" />
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <input
                type="checkbox"
                checked={showLabels}
                onChange={(e) => setShowLabels(e.target.checked)}
                className="rounded"
              />
              Labels
            </label>
            <button
              onClick={reheatTaxonomy}
              className="px-3 py-1 text-sm bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              Shake
            </button>
            <button
              onClick={resetTaxonomyView}
              className="px-3 py-1 text-sm bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              Reset View
            </button>
            <span className="text-xs text-gray-400">
              {Math.round(taxonomyTransform.scale * 100)}%
            </span>
          </div>

          <div className="flex items-center gap-3 mb-4">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {taxonomyGraph.nodes.length} tags, {taxonomyGraph.edges.length} relationships
              {!taxonomyIsSimulating && <span className="ml-2 text-green-600 dark:text-green-400">● stable</span>}
            </span>
          </div>

          {taxonomyGraph.nodes.length === 0 ? (
            <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
              <p className="text-gray-500 dark:text-gray-400">No taxonomy defined. Create a _taxonomy.md file to visualize tag relationships.</p>
            </div>
          ) : (
            <>
              {/* Graph container */}
              <div
                ref={containerRef}
                className="flex-1 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden cursor-grab active:cursor-grabbing"
                style={{ minHeight: '500px' }}
              >
                <svg
                  ref={svgRef}
                  width={dimensions.width}
                  height={dimensions.height}
                  onMouseDown={handleTaxonomyBackgroundMouseDown}
                  onMouseMove={handleTaxonomyMouseMove}
                  onMouseUp={handleTaxonomyMouseUp}
                  onMouseLeave={handleTaxonomyMouseUp}
                  onWheel={handleTaxonomyWheel}
                  style={{ userSelect: 'none' }}
                >
                  {/* Arrow marker for directed edges */}
                  <defs>
                    <marker
                      id="taxonomy-arrowhead"
                      markerWidth="10"
                      markerHeight="7"
                      refX="9"
                      refY="3.5"
                      orient="auto"
                    >
                      <polygon points="0 0, 10 3.5, 0 7" fill="#94a3b8" />
                    </marker>
                    <marker
                      id="taxonomy-arrowhead-highlighted"
                      markerWidth="10"
                      markerHeight="7"
                      refX="9"
                      refY="3.5"
                      orient="auto"
                    >
                      <polygon points="0 0, 10 3.5, 0 7" fill="#6366f1" />
                    </marker>
                  </defs>

                  <g transform={`translate(${taxonomyTransform.x}, ${taxonomyTransform.y}) scale(${taxonomyTransform.scale})`}>
                    {/* Edges */}
                    {taxonomyGraph.edges.map((edge, idx) => {
                      const source = taxonomyPositions.get(edge.source)
                      const target = taxonomyPositions.get(edge.target)
                      if (!source || !target) return null

                      const isHighlighted = taxonomyHoveredNode === edge.source || taxonomyHoveredNode === edge.target

                      // Shorten the line to not overlap with the target node
                      let x2 = target.x
                      let y2 = target.y
                      if (edge.directed) {
                        const dx = target.x - source.x
                        const dy = target.y - source.y
                        const dist = Math.sqrt(dx * dx + dy * dy) || 1
                        const targetNode = taxonomyGraph.nodes.find(n => n.id === edge.target)
                        const targetRadius = targetNode ? getTaxonomyNodeRadius(targetNode) : 10
                        x2 = target.x - (dx / dist) * (targetRadius + 5)
                        y2 = target.y - (dy / dist) * (targetRadius + 5)
                      }

                      return (
                        <line
                          key={idx}
                          x1={source.x}
                          y1={source.y}
                          x2={x2}
                          y2={y2}
                          stroke={isHighlighted ? '#6366f1' : '#94a3b8'}
                          strokeWidth={(isHighlighted ? 2 : 1) / taxonomyTransform.scale}
                          strokeOpacity={isHighlighted ? 1 : 0.4}
                          markerEnd={edge.directed ? (isHighlighted ? 'url(#taxonomy-arrowhead-highlighted)' : 'url(#taxonomy-arrowhead)') : undefined}
                        />
                      )
                    })}

                    {/* Nodes */}
                    {taxonomyGraph.nodes.map((node) => {
                      const pos = taxonomyPositions.get(node.id)
                      if (!pos) return null

                      const isHovered = taxonomyHoveredNode === node.id
                      const isDragging = taxonomyDraggingNode === node.id
                      const baseRadius = getTaxonomyNodeRadius(node)
                      const radius = baseRadius / taxonomyTransform.scale

                      return (
                        <g key={node.id}>
                          <circle
                            cx={pos.x}
                            cy={pos.y}
                            r={radius}
                            fill={getTaxonomyNodeColor(node)}
                            stroke={isDragging ? '#f59e0b' : isHovered ? '#1f2937' : 'white'}
                            strokeWidth={(isDragging ? 3 : isHovered ? 2 : 1.5) / taxonomyTransform.scale}
                            className="cursor-pointer"
                            onMouseDown={(e) => handleTaxonomyMouseDown(e, node.id)}
                            onMouseEnter={() => setTaxonomyHoveredNode(node.id)}
                            onMouseLeave={() => setTaxonomyHoveredNode(null)}
                          />
                          {(showLabels || isHovered) && (
                            <text
                              x={pos.x}
                              y={pos.y - radius - 4 / taxonomyTransform.scale}
                              textAnchor="middle"
                              fontSize={12 / taxonomyTransform.scale}
                              className="fill-gray-700 dark:fill-gray-300 pointer-events-none"
                              fontWeight={isHovered ? 600 : 400}
                            >
                              {node.label.length > 20 ? node.label.slice(0, 20) + '…' : node.label}
                            </text>
                          )}
                        </g>
                      )
                    })}
                  </g>
                </svg>
              </div>

              {/* Hovered node info */}
              {taxonomyHoveredNode && taxonomyGraph && (
                <div className="mt-3 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                  {(() => {
                    const node = taxonomyGraph.nodes.find(n => n.id === taxonomyHoveredNode)
                    if (!node) return null

                    return (
                      <div className="flex items-center gap-3">
                        <div
                          className="w-4 h-4 rounded-full flex-shrink-0"
                          style={{ backgroundColor: getTaxonomyNodeColor(node) }}
                        />
                        <div className="min-w-0">
                          <div className="font-medium text-gray-900 dark:text-white">{node.label}</div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {node.type === 'broad' ? 'Broad tag' : 'Specific tag'}
                            {node.objectCount > 0 && ` · ${node.objectCount} object${node.objectCount !== 1 ? 's' : ''}`}
                            {node.description && ` · ${node.description}`}
                          </div>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )}

              {/* Help text */}
              <div className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                Drag nodes to reposition · Scroll to zoom · Drag background to pan
              </div>
            </>
          )}
        </>
      )}

      {/* Tag Explorer */}
      {activeTab === 'tag-explorer' && tagTree && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Search and stats */}
          <div className="flex items-center gap-4 mb-4">
            <input
              type="text"
              placeholder="Filter tags..."
              value={tagSearchQuery}
              onChange={(e) => setTagSearchQuery(e.target.value)}
              className="flex-1 max-w-xs px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400"
            />
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {tagTree.totalTags} tags, {tagTree.totalTaggedObjects} tagged objects
            </span>
          </div>

          {/* Tag tree */}
          <div className="flex-1 overflow-y-auto bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            {filteredRoots.length === 0 ? (
              <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                {tagSearchQuery ? 'No tags match your filter' : 'No tagged objects found'}
              </div>
            ) : (
              <div className="space-y-1">
                {filteredRoots.map(root => renderTagNode(root, 0))}
              </div>
            )}
          </div>

          {/* Help text */}
          <div className="mt-2 text-xs text-gray-400 dark:text-gray-500">
            Click tag name to show objects · Click arrow to expand children
          </div>
        </div>
      )}
    </div>
  )
}
